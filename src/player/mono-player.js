const {Match, Red, White} = require('../lib/core')

const Base   = require('./base-player')
const Client = require('../lib/client')
const Draw   = require('../term/draw')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const chalk           = require('chalk')
const inquirer        = require('inquirer')
const sp              = Util.joinSpace
const {randomElement} = Util

class MonoPlayer extends Base {

    //// @implement
    //async playTurn(turn, game) {
    //    if (game.canDouble(turn.color)) {
    //        var action = await this.turnOption(turn, game)
    //    }
    //    if (action == 'double') {
    //        await this.offerDouble(turn, game)
    //        await this.decideDouble(turn, game)
    //        //await this.waitForDoubleResponse(turn, game)
    //        if (turn.isDoubleDeclined) {
    //            return
    //        } else {
    //            game.double()
    //        }
    //        this.info('Opponent accepted the double')
    //    }
    //    await this.rollTurn(turn, game)
    //    await this.playRoll(turn, game)
    //}
    //
    //// @default
    //async rollTurn(turn, game) {
    //    turn.roll()
    //}
    //
    //// @abstract
    //async turnOption(turn, game) {
    //    throw new Error('NotImplemented')
    //}
    //
    //// @abstract
    //async offerDouble(turn, game) {
    //    throw new Error('NotImplemented')
    //}
    //
    //// @abstract
    //async decideDouble(turn, game) {
    //    throw new Error('NotImplemented')
    //}
    //async waitForDoubleResponse(turn, game) {
    //    throw new Error('NotImplemented')
    //}

    // @abstract BasePlayer
    // async playRoll(turn, game)
}

class PromptPlayer extends MonoPlayer {

    constructor() {
        super()
    }

    // @implement
    async turnOption(turn, game) {
        return await this.promptAction()
    }

    // @implement
    async offerDouble(turn, game) {
        this.info(turn.color, 'wants to double the stakes to', game.cubeValue * 2)
        turn.setDoubleOffered()
    }

    // @implement
    async decideDouble(turn, game) {
        const accept = await this.promptAcceptDouble(turn, game)
        if (!accept) {
            turn.setDoubleDeclined()
        }
    }

    // @implement
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
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0, turn, game)
            if (origin == 'undo') {
                turn.unmove()
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face), turn, game)
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

    // @override
    async endGame(game) {
        this.drawBoard(game)
    }

    // @default
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

    async promptAcceptDouble(turn, game) {
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

    async promptFace(faces, turn, game) {
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

}

class RandomPlayer extends PromptPlayer {

    constructor(delay) {
        super()
        this.delay = delay == 0 ? delay : delay || 0.5
    }

    async pauseSeconds(seconds) {
        if (seconds > 0) {
            await new Promise(resolve => setTimeout(resolve, seconds * 1000))
        }
    }

    async promptFinishOrUndo() {
        return 'finish'
    }

    async promptFace(faces, turn, game) {
        return randomElement(faces)
    }

    async promptOrigin(origins, canUndo, turn, game) {
        await this.pauseSeconds(this.delay)
        return randomElement(origins)
    }

    async decideDouble(turn, game) {
        
    }

    async promptAcceptDouble(turn, game) {
        return true
    }

    async promptAction() {
        return 'roll'
    }
}

class SocketPlayer extends PromptPlayer {

    constructor(serverUrl) {
        super()
        this.client = new Client(serverUrl)
        this.color = null
    }

    // @override PromptPlayer
    async playRoll(turn, game) {
        if (turn.color == this.color) {
            await super.playRoll(turn, game)
        } else {
            this.info(turn.color, 'rolled', turn.diceSorted.join())
            await this.waitForOpponentMoves(turn, game)
        }
    }

    // @override PromptPlayer
    async playTurn(turn, game) {
        if (turn.color == this.color) {
            await super.playTurn(turn, game)
        } else {
            await this.waitForOpponentTurn(turn, game)
        }
    }

    // @override BasePlayer
    async nextGame() {
        await this.client.nextGame()
        return this.thisMatch.thisGame
    }

    // @override MonoPlayer
    async firstTurn(game) {
        await this.client.firstTurn(game)
        if (game.thisTurn.color != this.color) {
            this.drawBoard(game)
        }
        return game.thisTurn
    }

    // @override MonoPlayer
    async nextTurn(game) {
        await this.client.nextTurn(game)
        return game.thisTurn
    }

    // @override PromptPlayer
    async offerDouble(turn, game) {
        this.info('Offering double to opponent for', game.cubeValue * 2, 'points')
        await this.client.offerDouble(turn, game)
    }

    // @override PromptPlayer
    async decideDouble(turn, game) {
        this.info('Waiting for opponent response')
        await this.client.waitForDoubleResponse(turn, game)
    }

    // @override BasePlayer
    async endMatch() {
        await super.endMatch()
        await this.client.close()
    }

    // @override BasePlayer
    async abortMatch() {
        await super.abortMatch()
        await this.client.close()
    }

    // @override MonoPlayer
    async rollTurn(turn, game) {
        await this.client.rollTurn(turn, game)
    }

    // @override PromptPlayer
    async finishTurn(turn, game) {
        this.info('Finishing turn')
        await this.client.finishMoves(turn, game)
    }

    async acceptDouble(turn, game) {
        await this.client.acceptDouble(turn, game)
        this.info('You have accepted the double')
    }

    async declineDouble(turn, game) {
        await this.client.declineDouble(turn, game)
    }

    async startMatch(matchOpts) {
        this.color = White
        return await this.client.startMatch(matchOpts)
    }

    async joinMatch(matchId) {
        this.color = Red
        return await this.client.joinMatch(matchId)
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
}

MonoPlayer.RandomPlayer = RandomPlayer
MonoPlayer.PromptPlayer = PromptPlayer
MonoPlayer.SocketPlayer = SocketPlayer

module.exports = MonoPlayer