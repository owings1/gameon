const {Game, Opponent} = require('../lib/game')
const Util = require('../lib/util')
const Logger = require('../lib/logger')

const chalk = require('chalk')
const inquirer = require('inquirer')

class PromptPlayer extends Logger {

    constructor() {
        super()
    }

    drawBoard(board) {
        this.info(board.stateString())
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    async play() {

        const game = new Game

        const firstTurn = game.firstTurn()
        await this.playRoll(firstTurn)

        while (true) {

            var turn = game.nextTurn()
            this.info(turn.color + "'s turn")

            var action = game.canDouble(turn.color) ? await this.promptAction() : 'roll'

            if (action == 'double') {
                this.log(turn.color, 'doubles')
                turn.setDoubleOffered()
                var accept = await this.promptAcceptDouble(turn)
                if (accept) {
                    game.cubeValue *= 2
                    game.cubeOwner = Opponent[turn.color]
                    this.log(Opponent[turn.color], 'owns the cube at', game.cubeValue)
                } else {
                    turn.setDoubleDeclined()
                    game.checkFinished()
                    break
                }
            }

            turn.roll()
            this.info(turn.color, 'rolls', turn.dice.join())

            await this.playRoll(turn)

            if (game.checkFinished()) {
                break
            }
        }

        this.drawBoard(game.board)
    }

    async promptAction(turn) {
        const answers = await this.prompt({
            name    : 'action'
          , type    : 'list'
          , choices : ['roll', 'double']
        })
        return answers.action
    }

    async playRoll(turn) {
        if (turn.isCantMove) {
            this.info(turn.color, 'cannot move')
            return
        }
        while (true) {
            this.drawBoard(turn.board)
            var moves = turn.getNextAvailableMoves()
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0)
            if (origin == 'undo') {
                turn.unmove()
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face))
            turn.move(origin, face)
            if (turn.getNextAvailableMoves().length == 0) {
                var finish = await this.promptFinishOrUndo()
                if (finish == 'undo') {
                    turn.unmove()
                    continue
                } else {
                    turn.finish()
                    break
                }
            }            
        }
            
    }

    async promptOrigin(origins, canUndo) {
        const choices = Util.uniqueInts(origins).sort()
        var message =  'Origin [' + origins.join() + ']'
        if (canUndo) {
            choices.push('u')
            message += ' or (u)ndo'
        }
        const answers = await this.prompt({
            name     : 'origin'
          , type     : 'input'
          , message 
          , validate : value => (choices.indexOf(+value) > -1) || 'Please enter one of ' + choices.join()
        })
        return answers.origin == 'u' ? 'undo' : +answers.origin
    }

    async promptFace(faces) {
        const answers = await this.prompt({
            name     : 'face'
          , type     : 'input'
          , message  : 'Die [' + faces.join() + ']'
          , validate : value => (faces.indexOf(+value) > -1) || 'Please enter one of ' + faces.join()
        })
        return +answers.face
    }

    async promptFinishOrUndo() {
        const answers = await this.prompt({
            name    : 'finish'
          , type    : 'list'
          , choices : ['finish', 'undo']
        })
        return answers.finish
    }

    async promptAcceptDouble(turn) {
        const answers = await this.prompt({
            name    : 'accept'
          , type    : 'confirm'
          , message : 'Does ' + Opponent[turn.color] + ' accept?'
        })
        return answers.accept
    }
}

module.exports = PromptPlayer