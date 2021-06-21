/**
 * gameon - Terminal Player class
 *
 * Copyright (C) 2020-2021 Doug Owings
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const Base         = require('../lib/player')
const Constants    = require('../lib/constants')
const {DrawHelper} = require('./draw')
const Errors       = require('../lib/errors')
const Util         = require('../lib/util')

const chalk    = require('chalk')
const inquirer = require('inquirer')

const {
    Colors
  , Opponent
  , OriginPoints
  , PointOrigins
} = Constants

const {MatchCanceledError} = Errors

const {merge, sp} = Util

class TermPlayer extends Base {

    static defaults() {
        return {
            fastForced: false
          , theme     : 'Default'
        }
    }

    constructor(color, opts) {

        super(color)

        this.opts = Util.defaults(TermPlayer.defaults(), opts)

        this.isTerm = true
        this.logs = []

        // provide defaults in case gameStart is not called
        this.persp = color

        this.loadHandlers()
    }

    loadHandlers() {

        this.on('gameStart', (game, match, players) => {

            this.isDualTerm = this.opponent.isTerm
            this.isDualRobot = this.isRobot && this.opponent.isRobot

            this.persp = this.isRobot ? Colors.White : this.color
            this.drawer = DrawHelper.forGame(game, match, this.persp, this.logs, this.opts.theme)

            this.report('gameStart', match ? match.games.length : null)
        })

        this.on('firstRoll', (turn, game, match) => {
            this.report('firstRollWinner', turn.color, turn.dice)
            this.report('turnStart', turn.color)
        })

        this.on('afterRoll', turn => {
            this.report('playerRoll', turn.color, turn.diceSorted)
            if (turn.color != this.color) {
                // Drawing for this player happens in playRoll
                if (!this.isDualTerm) {
                    this.drawBoard()
                }
                if (this.opponent.isNet) {
                    this.logger.info('Waiting for opponent to play', turn.diceSorted.join())
                }
            }
        })

        this.on('turnStart', turn => {
            this.report('turnStart', turn.color)
            if (!this.isDualTerm || turn.color == this.color) {
                this.drawBoard()
            }
        })

        this.on('beforeOption', turn => {
            if (this.opponent.isNet && turn.color != this.color) {
                this.logger.info('Waiting for opponent option')
            }
        })

        this.on('turnEnd', turn => {
            if (turn.isCantMove) {
                this.report('cantMove', turn.color)
            }
            if (turn.isRolled) {
                if (turn.color != this.color) {
                    // Drawing for this color happens in playRoll
                    if (turn.isForceMove) {
                        this.report('forceMove', turn.color, turn.diceSorted)
                    }
                    turn.moves.forEach(move => this.report('move', move))
                }
            }
        })

        this.on('doubleOffered', (turn, game) => {
            this.report('doubleOffered', turn.color)
            if (turn.color == this.color) {
                this.logger.info('Offering double to', game.cubeValue * 2, 'points')
            }
            if (!this.isDualTerm || turn.color != this.color) {
                this.drawBoard()
            }
            if (turn.color != this.color) {
                this.logger.info(this.ccolor(turn.color), 'wants to double to', game.cubeValue * 2, 'points')
            }
            if (this.opponent.isNet && turn.color == this.color) {
                this.logger.info('Waiting for opponent to respond')
            }
        })

        this.on('doubleDeclined', turn => {
            this.report('doubleDeclined', turn.opponent)
        })

        this.on('doubleAccepted', (turn, game) => {
            this.report('gameDoubled', turn.opponent, game.cubeValue)
        })

        this.on('gameEnd', game => {
            this.report('hr')
            this.report('gameEnd', game.getWinner(), game.finalValue)
        })

        this.on('matchEnd', match => {
            const winner = match.getWinner()
            const loser = match.getLoser()
            this.report('hr')
            this.report('matchEnd', winner, match.scores[winner], match.scores[loser])
            this.report('hr')
            if (!this.isDualTerm || winner == this.color) {
                this.drawBoard()
            }
        })
    }

    // @override
    async turnOption(turn, game, match) {
        const isDouble = await this.promptTurnOption(turn, game, match)
        if (isDouble) {
            turn.setDoubleOffered()
        }
    }

    // @override
    async decideDouble(turn, game, match) {
        const isAccept = await this.promptDecideDouble(turn, game, match)
        if (!isAccept) {
            turn.setDoubleDeclined()
        }
    }

    // @implement
    async playRoll(turn, game, match) {

        if (turn.isCantMove) {
            return
        }

        if (turn.isForceMove && this.opts.fastForced) {
            this.report('forceMove', turn.color, turn.diceSorted)
            this.drawBoard()
            await this.makeForcedMoves(turn)
            this.drawBoard()
            return
        }

        while (true) {

            this.drawBoard()

            if (!this.isRobot) {
                this.logger.info(
                    this.ccolor(this.color)
                  , 'rolled'
                  , turn.diceSorted.join()
                  , 'with'
                  , turn.remainingFaces.join()
                  , 'remaining'
                )
            }

            var moves = turn.getNextAvailableMoves()
            var origins = moves.map(move => move.origin)

            var canUndo = turn.moves.length > 0

            var origin = await this.promptOrigin(turn, origins, canUndo)

            if (origin == 'undo') {
                turn.unmove()
                this.logs.pop()
                continue
            }

            var faces = moves.filter(move => move.origin == origin).map(move => move.face)
            var face = await this.promptFace(turn, faces)

            var move = turn.move(origin, face)

            this.report('move', move)

            if (turn.getNextAvailableMoves().length == 0) {

                if (!this.isRobot) {
                    this.drawBoard()
                }

                var isFinish = await this.promptFinish()

                if (isFinish) {
                    break
                }

                turn.unmove()
                this.logs.pop()
            }
        }
    }

    report(...args) {
        if (!this.drawer) {
            return
        }
        this.drawer.report(...args)
    }

    async promptTurnOption(turn) {
        const choices = ['r', 'd', 'q']
        const message = sp(this.cchalk(turn.color, turn.color + "'s"), 'turn to (r)oll or (d)ouble')
        const question = {
            name     : 'action'
          , type     : 'input'
          , message
          , default  : 'r'
          , validate : this.choicesValidator(choices, true)
        }
        while (true) {
            var {action} = await this.prompt(question)
            if (action.toLowerCase() == 'q') {
                await this.checkQuit()
                continue
            }
            if (action[0] == '_') {
                await this.doHiddenAction(action, turn)
                continue
            }
            break
        }
        return action.toLowerCase() == 'd'
    }

    async promptDecideDouble() {
        const choices = ['y', 'n']
        const message = sp('Does', this.ccolor(this.color), 'accept the double?', chalk.grey('(y/n)'))
        const answers = await this.prompt({
            name     : 'accept'
          , type     : 'input'
          , message
          , validate : this.choicesValidator(choices)
        })
        return answers.accept.toLowerCase() == 'y'
    }

    async promptOrigin(turn, origins, canUndo) {
        const question = this.getOriginQuestion(origins, canUndo)
        while (true) {
            var {origin} = await this.prompt(question)
            if (origin == 'q') {
                await this.checkQuit()
                continue
            }
            if (origin[0] == '_') {
                await this.doHiddenAction(origin, turn)
                continue
            }
            break
        }
        if (origin == 'u') {
            return 'undo'
        } else if (origin == 'b') {
            return -1
        }
        return this.pointOrigin(+origin)
    }

    async promptFace(turn, faces) {
        faces = Util.uniqueInts(faces).sort(Util.sortNumericDesc)
        if (faces.length == 1) {
            return faces[0]
        }
        const choices = faces.map(face => face.toString())
        const message = 'Die [' + choices.join() + ']'
        const answers = await this.prompt({
            name     : 'face'
          , type     : 'input'
          , message
          , default  : choices[0]
          , validate : this.choicesValidator(choices)
        })
        return +answers.face
    }

    async promptFinish() {
        const choices = ['f', 'u']
        const answers = await this.prompt({
            name     : 'finish'
          , type     : 'input'
          , message  : '(f)inish or (u)ndo'
          , default  : 'f'
          , validate : this.choicesValidator(choices)
        })
        return answers.finish.toLowerCase() == 'f'
    }

    async makeForcedMoves(turn) {
        for (var moves = turn.getNextAvailableMoves(); moves.length; moves = turn.getNextAvailableMoves()) {
            turn.move(moves[0])
        }
    }

    async checkQuit() {
        const answers = await this.prompt({
            name     : 'confirm'
          , message  : 'Are you sure you want to quit?'
          , type     : 'confirm'
          , default  : () => false
        })
        if (answers.confirm) {
            throw new MatchCanceledError(this.color + ' quit')
        }
    }

    async doHiddenAction(action, turn) {
        const {board} = turn
        if (action == '_') {
            this.logger.console.log({
                board : {
                    state28     : board.state28()
                  , stateString : board.stateString()
                }
            })
        } else if (action == '_f') {
            this.persp = Opponent[this.persp]
            if (this.drawer) {
                this.drawer.persp = this.persp
            }
            this.drawBoard()
        }
    }

    getOriginQuestion(origins, canUndo) {

        const points = Util.uniqueInts(origins).map(origin => this.originPoint(origin))
        points.sort(Util.sortNumericAsc)

        const choices = points.map(p => p.toString())

        var message = 'Origin '
        if (points[0] == -1) {
            message += ' [(b)ar]'
            choices[0] = 'b'
        } else {
            message += '[' + choices.join() + ']'
        }
        if (canUndo) {
            choices.push('u')
            message += ' or (u)ndo'
        }

        choices.push('q')

        const question = {
            name     : 'origin'
          , type     : 'input'
          , message
          , validate : this.choicesValidator(choices, true)
        }

        if (points.length == 1) {
            question.default = choices[0]
        }

        return question
    }

    drawBoard() {
        if (!this.drawer) {
            return
        }
        this.logger.writeStdout(this.drawer.getString())
    }

    originPoint(origin, color) {
        color = color || this.color
        return OriginPoints[color][origin]
    }

    pointOrigin(point, color) {
        color = color || this.color
        return PointOrigins[color][point]
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    cchalk(color, ...args) {
        if (!this.drawer) {
            return sp(...args)
        }
        return this.drawer.theme.text.piece[color.toLowerCase()](...args)
    }

    ccolor(color) {
        return this.cchalk(color, color)
    }

    choicesValidator(choices, allowHidden) {
        return value => {
            if (allowHidden && value[0] == '_') {
                return true
            }
            if (choices.indexOf(value.toLowerCase()) > -1) {
                return true
            }
            return sp('Please enter one of', choices.join())
        }
    }
}

class TermRobot extends TermPlayer {

    constructor(robot, opts) {
        super(robot.color)
        this.opts = merge({delay: 0.5}, opts)
        this.isRobot = true
        this.robot = robot
    }

    async playRoll(turn, game, match) {
        this.thisMoves = await this.robot.getMoves(turn, game, match)
        await super.playRoll(turn, game, match)
    }

    async promptTurnOption(turn, game, match) {
        await this.robot.turnOption(turn, game, match)
        return turn.isDoubleOffered
    }

    async promptDecideDouble(turn, game, match) {
        await this.robot.decideDouble(turn, game, match)
        return !turn.isDoubleDeclined
    }

    async promptOrigin(turn, origins) {
        this.thisMove = this.thisMoves.shift()
        await this.delay()
        return this.thisMove.origin
    }

    async promptFace(turn, faces) {
        await this.delay()
        return this.thisMove.face
    }

    async promptFinish() {
        return true
    }

    async delay() {
        if (this.opts.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.opts.delay * 1000))
        }
    }

    async destroy() {
        await Promise.all([this.robot.destroy(), super.destroy()])
    }

    meta() {
        return merge(super.meta(), this.robot.meta())
    }
}

TermPlayer.Robot = TermRobot

module.exports = TermPlayer