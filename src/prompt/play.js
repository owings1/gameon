const {Match, Red, White} = require('../lib/game')

const Client = require('../lib/client')
const Draw   = require('./draw')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const chalk       = require('chalk')
const inquirer    = require('inquirer')
const sp          = Util.joinSpace

class Player extends Logger {

    constructor() {
        super()
        this.thisMatch = null
    }

    async playMatch(match) {
        this.thisMatch = match
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
            const loser = match.getLoser()
            this.info(winner, 'wins the match', match.scores[winner], 'to', match.scores[loser])
            await this.endMatch()
        } catch (err) {
            this.error(err)
            this.warn('An error occurred, the match is canceled')
            await this.abortMatch()
        }
        
    }

    async endMatch() {
        
    }

    async abortMatch() {
        
    }

    async nextGame() {
        return this.thisMatch.nextGame()
    }

    async updateScore() {
        this.thisMatch.updateScore()
    }

    async playGame(game) {
        throw new Error('NotImplemented')
    }
}

class PromptPlayer extends Player {

    constructor() {
        super()
    }

    async playGame(game) {

        this.info('Starting game')
        const firstTurn = await this.firstTurn(game)
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())

        if (firstTurn.color == this.color) {
            await this.playRoll(firstTurn, game)
        } else {
            this.info(firstTurn.color, 'rolled', firstTurn.diceSorted.join())
            await this.waitForOpponentMoves(firstTurn, game)
        }

        while (true) {

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

        this.drawBoard(game)
        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async playTurn(turn, game) {
        if (game.canDouble(turn.color)) {
            var action = await this.promptAction()
        }
        if (action == 'double') {
            await this.offerDouble(turn, game)
            await this.waitForDoubleResponse(turn, game)
            if (turn.isDoubleDeclined) {
                return
            } else {
                game.double()
            }
            this.info('Opponent accepted the double')
        }
        await this.rollTurn(turn, game)
        await this.playRoll(turn, game)
    }

    async playRoll(turn, game) {
        if (turn.isCantMove) {
            this.info(turn.color, 'rolls', turn.dice.join())
            this.info(turn.color, 'cannot move')
            await this.finishTurn(turn, game)
            return
        }
        while (true) {
            this.drawBoard(game)
            this.info(turn.color, 'rolled', turn.diceSorted.join(), 'with', turn.remainingFaces.join(), 'remaining')
            var moves = turn.getNextAvailableMoves()
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0)
            if (origin == 'undo') {
                turn.unmove()
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face))
            var move = turn.move(origin, face)
            this.info(this.describeMove(move))
            if (turn.getNextAvailableMoves().length == 0) {
                this.drawBoard(game)
                var finish = await this.promptFinishOrUndo()
                if (finish == 'undo') {
                    turn.unmove()
                    continue
                } else {
                    await this.finishTurn(turn, game)
                    this.drawBoard(game)
                    break
                }
            }
        }
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
          , message : sp('Does', turn.opponent, 'accept the double?')
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
          , validate : value => (choices.indexOf(value) > -1) || 'Please enter one of ' + choices.join()
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
          , validate : value => (faces.indexOf(+value) > -1) || 'Please enter one of ' + faces.join()
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

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    describeMove(move) {
        const origin = move.isComeIn ? 'bar' : move.origin + 1
        const dest = move.isBearoff ? 'home' : move.dest + 1
        return sp(move.color, 'moves from', origin, 'to', dest)
    }

    drawBoard(game) {
        this.writeStdout(Draw.drawBoard(game, this.thisMatch))
    }

    async finishTurn(turn, game) {
        turn.finish()
    }

    async firstTurn(game) {
        return game.firstTurn()
    }

    async nextTurn(game) {
        return game.nextTurn()
    }

    async rollTurn(turn, game) {
        turn.roll()
    }

    async offerDouble(turn, game) {
        this.info(turn.color, 'wants to double the stakes to', game.cubeValue * 2)
        turn.setDoubleOffered()
    }

    async waitForOpponentTurn(turn, game) {
        throw new Error('NotImplemented')
    }

    async waitForOpponentMoves(turn, game) {
        throw new Error('NotImplemented')
    }

    async waitForDoubleResponse(turn, game) {
        throw new Error('NotImplemented')
    }
}

class LocalPlayer extends PromptPlayer {

    constructor() {
        super()
        this.color = White
    }

    async waitForOpponentMoves(turn, game) {
        await this.playRoll(turn, game)
    }

    async waitForOpponentTurn(turn, game) {
        await this.playTurn(turn, game)
    }

    async waitForDoubleResponse(turn, game) {
        const accept = await this.promptAcceptDouble(turn)
        if (!accept) {
            turn.setDoubleDeclined()
        }
    }
}

class SocketPlayer extends PromptPlayer {

    constructor(serverUrl) {
        super()
        this.serverUrl = serverUrl
        this.client = new Client(serverUrl)
        this.color = null
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
        await this.client.nextGame()
        return this.thisMatch.thisGame
    }

    async firstTurn(game) {
        await this.client.firstTurn(game)
        if (game.thisTurn.color != this.color) {
            this.drawBoard(game)
        }
        return game.thisTurn
    }

    async nextTurn(game) {
        await this.client.nextTurn(game)
        return game.thisTurn
    }

    async offerDouble(turn, game) {
        this.info('Offering double to opponent for', game.cubeValue * 2, 'points')
        await this.client.offerDouble(turn, game)
    }

    async waitForDoubleResponse(turn, game) {
        this.info('Waiting for opponent response')
        await this.client.waitForDoubleResponse(turn, game)
    }

    async acceptDouble(turn, game) {
        await this.client.acceptDouble(turn, game)
        this.info('You have accepted the double')
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
        this.drawBoard(game)
        this.info(turn.color, 'rolled', turn.diceSorted.join())
        await this.waitForOpponentMoves(turn, game)   
    }

    async waitForOpponentMoves(turn, game) {
        this.info('Waiting for opponent to move')
        await this.client.waitForOpponentMoves(turn, game)
        this.drawBoard(game)
        if (turn.isCantMove) {
            this.info(turn.color, 'has no moves')
        } else {
            turn.moves.forEach(move => this.info(this.describeMove(move)))
        }
    }

    async endMatch() {
        await this.client.close()
    }

    async abortMatch() {
        await this.client.close()
    }
}

PromptPlayer.LocalPlayer = LocalPlayer
PromptPlayer.SocketPlayer = SocketPlayer
module.exports = PromptPlayer