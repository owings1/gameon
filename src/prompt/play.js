const {Match, Game, Opponent, Red, White} = require('../lib/game')

const Client = require('../lib/client')
const Draw   = require('./draw')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const chalk       = require('chalk')
const inquirer    = require('inquirer')
const sp          = Util.joinSpace

class PromptPlayer extends Logger {

    constructor() {
        super()
    }

    async playMatch(match) {
        this.match = match
        this.info('Starting match')
        try {
            while (true) {
                var game = await this.nextGame()
                await this.playGame(game)
                await this.updateScore()
                if (match.hasWinner()) {
                    break
                }
            }
            const winner = match.getWinner()
            this.info(winner, 'wins the match', match.scores[winner], 'to', match.scores[Opponent[winner]])
        } catch (err) {
            this.error(err)
            this.warn('An error occurred, the match is canceled')
            await this.abortMatch()
        }
        
        delete this.match
    }

    async abortMatch() {
        
    }

    async nextGame() {
        return this.match.nextGame()
    }

    async updateScore() {
        this.match.updateScore()
    }

    drawBoard(...args) {
        return PromptPlayer.drawBoard(...args)
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    static validator(name, params) {
        switch (name) {
            case 'face':
                var {faces} = params
                return value => (faces.indexOf(+value) > -1) || 'Please enter one of ' + faces.join()
            case 'origin':
                var {choices} = params
                return value => (choices.indexOf(value) > -1) || 'Please enter one of ' + choices.join()
        }
    }

    static describeMove(move) {
        const origin = move.isComeIn ? 'bar' : move.origin + 1
        const dest = move.isBearoff ? 'home' : move.dest + 1
        return sp(move.color, 'moves from', origin, 'to', dest)
    }
}

class LocalPlayer extends PromptPlayer {

    constructor() {
        super()
    }

    async playGame(game) {

        this.info('Starting game')
        const firstTurn = await this.firstTurn(game)
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())
        await this.playRoll(firstTurn, game)

        while (true) {

            var turn = await this.nextTurn(game)
            this.info(turn.color + "'s turn")

            var action = game.canDouble(turn.color) ? await this.promptAction() : 'roll'

            if (action == 'double') {
                this.info(turn.color, 'wants to double the stakes to', game.cubeValue * 2)
                turn.setDoubleOffered()
                var accept = await this.promptAcceptDouble(turn)
                if (accept) {
                    game.double()
                    this.log(Opponent[turn.color], 'accepts the double')
                    this.log(game.cubeOwner, 'owns the cube at', game.cubeValue)
                } else {
                    turn.setDoubleDeclined()
                    game.checkFinished()
                    break
                }
            }

            this._rollForTurn(turn, game.turns.length)

            await this.playRoll(turn, game)

            if (game.checkFinished()) {
                break
            }
        }

        this.writeStdout(this.drawBoard(game, this.match))
        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async firstTurn(game) {
        return game.firstTurn()
    }

    async nextTurn(game) {
        return game.nextTurn()
    }

    async playRoll(turn, game) {
        if (turn.isCantMove) {
            this.info(turn.color, 'rolls', turn.dice.join())
            this.info(turn.color, 'cannot move')
            await this.finishTurn(turn, game)
            return
        }
        const drawBoard = () => this.writeStdout(this.drawBoard(game, this.match))
        drawBoard()
        while (true) {
            this.info(turn.color, 'rolled', turn.diceSorted.join(), 'with', turn.remainingFaces.join(), 'remaining')
            var moves = turn.getNextAvailableMoves()
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0)
            if (origin == 'undo') {
                turn.unmove()
                drawBoard()
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face))
            var move = turn.move(origin, face)
            this.info(PromptPlayer.describeMove(move))
            drawBoard()
            if (turn.getNextAvailableMoves().length == 0) {
                var finish = await this.promptFinishOrUndo()
                if (finish == 'undo') {
                    turn.unmove()
                    drawBoard()
                    continue
                } else {
                    await this.finishTurn(turn, game)
                    break
                }
            }
        }
    }

    async finishTurn(turn, game) {
        turn.finish()
    }

    async promptAction() {
        const choices = ['r', 'd']
        const answers = await this.prompt({
            name     : 'action'
          , message  : '(r)oll or (d)ouble'
          , default  : () => 'r'
          , type     : 'input'
          , validate : value => choices.indexOf(value.toLowerCase()) > -1 || sp('Please enter one of', choices.join())
        })
        if (answers.action.toLowerCase() == 'd') {
            return 'double'
        }
        return 'roll'
    }

    async promptAcceptDouble(turn) {
        const answers = await this.prompt({
            name    : 'accept'
          , type    : 'confirm'
          , message : sp('Does', Opponent[turn.color], 'accept the double?')
        })
        return answers.accept
    }

    async promptOrigin(origins, canUndo) {
        origins = Util.uniqueInts(origins).sort(Util.sortNumericAsc).map(i => i > -1 ? i + 1 : i)
        const choices = origins.map(i => '' + i)
        var message = 'Origin '
        if (origins[0] == -1) {
            message += ' [(b)ar]'
            choices[0] = 'b'
        } else {
            message += '[' + choices.join() + ']'
        }
        if (canUndo) {
            choices.push('u')
            message += ' or (u)ndo'
        }
        const question = {
            name     : 'origin'
          , type     : 'input'
          , message
          , validate : PromptPlayer.validator('origin', {choices})
        }
        if (origins.length == 1) {
            question.default = '' + choices[0]
        }
        const answers = await this.prompt(question)
        if (answers.origin == 'u') {
            return 'undo'
        } else if (answers.origin == 'b') {
            return -1
        }
        return +answers.origin - 1
    }

    async promptFace(faces) {
        faces = Util.uniqueInts(faces).sort(Util.sortNumericDesc)
        if (faces.length == 1) {
            return faces[0]
        }
        const answers = await this.prompt({
            name     : 'face'
          , type     : 'input'
          , message  : 'Die [' + faces.join() + ']'
          , validate : PromptPlayer.validator('face', {faces})
          , default  : '' + faces[0]
        })
        return +answers.face
    }

    async promptFinishOrUndo() {
        const choices = ['f', 'u']
        const answers = await this.prompt({
            name     : 'finish'
          , message  : '(f)inish or (u)ndo'
          , default  : () => 'f'
          , type     : 'input'
          , validate : value => choices.indexOf(value.toLowerCase()) > -1 || sp('Please enter one of', choices.join())
        })
        if (answers.finish.toLowerCase() == 'u') {
            return 'undo'
        }
        return 'finish'
    }

    // allow override for testing
    _rollForTurn(turn, i) {
        turn.roll()
    }
}

class SocketPlayer extends LocalPlayer {

    constructor(serverUrl) {
        super()
        this.serverUrl = serverUrl
        this.client = new Client(serverUrl)
        this.color = null
        this.match = null
    }

    async startMatch(matchOpts) {
        this.color = White
        const match = await this.client.startMatch(matchOpts)
        await this.playMatch(match)
    }

    async joinMatch(matchId) {
        this.color = Red
        const match = await this.client.joinMatch(matchId)
        await this.playMatch(match)
    }

    async nextGame() {
        return await this.client.nextGame()
    }

    async playGame(game) {

        const drawBoard = () => this.writeStdout(this.drawBoard(game, this.match))

        this.info('Starting game')
        const firstTurn = await this.client.firstTurn(game)
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())
        if (firstTurn.color == this.color) {
            await this.playRoll(firstTurn, game)
            drawBoard()
        } else {
            drawBoard()
            this.info(firstTurn.color, 'rolled', firstTurn.dice.join())
            await this.waitForOpponentMoves(firstTurn, game)
        }

        while (true) {

            drawBoard()

            var turn = await this.nextTurn(game)
            this.info(turn.color + "'s turn")

            if (turn.color == this.color) {
                await this.playTurn(turn, game)
            } else {
                await this.waitForOpponentTurn(turn, game)
            }

            if (game.checkFinished()) {
                break
            }
        }

        this.writeStdout(this.drawBoard(game, this.match))
        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async nextTurn(game) {
        return await this.client.nextTurn(game)
    }

    async playTurn(turn, game) {
        if (game.canDouble(turn.color)) {
            var action = await this.promptAction()
        }
        if (action == 'double') {
            await this.offerDouble(turn, game)
            if (turn.isDoubleDeclined) {
                return
            }
            this.info('Opponent accepted the double')
        }
        await this.rollTurn(turn, game)
        await this.playRoll(turn, game)
    }

    async offerDouble(turn, game) {
        this.info('Offering double to opponent for', game.cubeValue * 2, 'points')
        this.info('Waiting for opponent response')
        await this.client.offerDouble(turn, game)
    }

    async acceptDouble(turn, game) {
        await this.client.acceptDouble(turn, game)
        this.info('You have accepted the double')
        const drawBoard = () => this.writeStdout(this.drawBoard(game, this.match))
        drawBoard()
    }

    async declineDouble(turn, game) {
        await this.client.declineDouble(turn, game)
    }

    async rollTurn(turn, game) {
        await this.client.rollTurn(turn, game)
    }

    async finishTurn(turn, game) {
        this.info('Finishing turn')
        await this.client.finishMoves(turn, game)
    }

    async waitForOpponentTurn(turn, game) {
        this.info('Waiting for opponent action')
        await this.client.waitForOpponentOption(turn, game)
        if (turn.isDoubleOffered) {
            this.info(turn.color, 'wants to double the stakes to', game.cubeValue * 2)
            const isAccept = await this.promptAcceptDouble(turn, game)
            if (isAccept) {
                await this.acceptDouble(turn, game)
                await this.client.waitForOpponentOption(turn, game)
            } else {
                await this.declineDouble(turn, game)
                return
            }
        }
        this.info(turn.color, 'rolled', turn.diceSorted.join())
        await this.waitForOpponentMoves(turn, game)
        if (turn.isCantMove) {
            this.info(turn.color, 'has no moves')
        } else {
            turn.moves.forEach(move => this.info(PromptPlayer.describeMove(move)))
        }
    }

    async waitForOpponentMoves(turn, game) {
        this.info('Waiting for opponent to move')
        await this.client.waitForOpponentMoves(turn, game)
    }

    async abortMatch() {
        await this.client.close()
    }
}

PromptPlayer.drawBoard = Draw.drawBoard
PromptPlayer.LocalPlayer = LocalPlayer
PromptPlayer.SocketPlayer = SocketPlayer
module.exports = PromptPlayer