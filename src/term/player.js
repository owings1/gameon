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
const Base       = require('../lib/player')
const Constants = require('../lib/constants')
const Core       = require('../lib/core')
const Draw       = require('./draw')
const Util       = require('../lib/util')

const chalk    = require('chalk')
const inquirer = require('inquirer')

const {White, Red, Opponent} = Constants

const {merge}      = Util
const sp           = Util.joinSpace

const Chars = {
    rarrow : '->'
}

class TermPlayer extends Base {

    static defaults() {
        return {
            fastForced: false
        }
    }

    constructor(color, opts) {
        super(color)
        this.persp = this.isRobot ? White : this.color
        this.logs = []
        this.opts = Util.defaults(TermPlayer.defaults(), opts)
        this.isTerm = true
        this.on('gameStart', (game, match, players) => {
            this.isDualTerm = this.opponent.isTerm
            this.isDualRobot = this.isRobot && this.opponent.isRobot
            this.info(chalk.cyan('Starting game', match ? chalk.bold(match.games.length) : ''))
        })
        this.on('firstRoll', (turn, game, match) => {
            const {dice} = turn
            const diceStr = [this.cchalk(White, dice[0]), this.cchalk(Red, dice[1])].join()
            this.info(this.ccolor(turn.color), 'wins the first roll with', diceStr)
            this.info(this.cchalk(turn.color, '---', turn.color + "'s"), "turn")
        })
        this.on('afterRoll', turn => {
            this.info(this.ccolor(turn.color), 'rolls', chalk.magenta(turn.diceSorted.join()))
            if (turn.color != this.color && !this.isDualTerm) {
                this.drawBoard()
            }
            if (turn.color != this.color && this.opponent.isNet) {
                this.logger.info('Waiting for opponent to play', turn.diceSorted.join())
            }
        })
        this.on('turnStart', turn => {
            this.info(this.cchalk(turn.color, '---', turn.color + "'s"), "turn")
            this.logger.info('turnStart')
            if (turn.color == this.color || !this.isDualTerm) {
                this.drawBoard()
            }
        })
        this.on('beforeOption', turn => {
            if (turn.color != this.color && this.opponent.isNet) {
                this.logger.info('Waiting for opponent option')
            }
        })
        this.on('turnEnd', turn => {
            if (turn.isCantMove) {
                this.info(this.ccolor(turn.color), chalk.bold.yellow('cannot move'))
            }
            if (turn.isRolled) {
                if (turn.color != this.color) {
                    if (turn.allowedEndStates.length == 1) {
                        this.info(chalk.bold.yellow('Forced move'), 'for', this.ccolor(turn.color), 'with', turn.diceSorted.join())
                    }
                    turn.moves.forEach(move => this.info(this.describeMove(move)))
                }
            }
        })
        this.on('doubleOffered', (turn, game) => {
            if (turn.color == this.color) {
                this.logger.info('Offering double to', game.cubeValue * 2, 'points')
            }
            this.info(this.ccolor(turn.color), 'doubles')
            if (turn.color != this.color || !this.isDualTerm) {
                this.drawBoard()
            }
            if (turn.color != this.color) {
                this.logger.info(this.ccolor(turn.color), 'wants to double to', game.cubeValue * 2, 'points')
            }
            if (turn.color == this.color && this.opponent.isNet) {
                this.logger.info('Waiting for opponent to respond')
            }
        })
        this.on('doubleDeclined', turn => {
            this.info(this.ccolor(turn.opponent), 'has declined the double')
        })
        this.on('doubleAccepted', (turn, game) => {
            this.info(this.ccolor(turn.opponent), 'owns the cube at', game.cubeValue, 'points')
        })
        this.on('gameEnd', game => {
            this.info(chalk.grey('-----------'))
            this.info(this.ccolor(game.getWinner()), chalk.cyan('has won the game with', chalk.bold(game.finalValue), 'points'))
        })
        this.on('matchEnd', match => {
            const winner = match.getWinner()
            const loser = match.getLoser()
            this.info(chalk.grey('-----------'))
            this.info(this.ccolor(winner), chalk.cyan('wins the match', chalk.bold(match.scores[winner]), 'to', match.scores[loser]))
            this.info(chalk.grey('-----------'))
            if (winner == this.color || !this.isDualTerm) {
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
        while (true) {
            if (this.opts.fastForced && turn.allowedEndStates.length == 1) {
                this.info(chalk.bold.yellow('Forced move'), 'for', this.ccolor(turn.color), 'with', turn.diceSorted.join())

                // TODO: implement better forced move routine
                var index = turn.allowedMoveIndex
                var keys = Object.keys(index)
                while (Object.keys(index).length) {
                    turn.move(Object.values(index)[0].move)
                    index = Object.values(index)[0].index
                }

                break
            }
            this.drawBoard()
            if (!this.isRobot) {
                this.logger.info(this.ccolor(this.color), 'rolled', turn.diceSorted.join(), 'with', turn.remainingFaces.join(), 'remaining')
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
            this.info(this.describeMove(move))
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

    info(...args) {
        this.logs.push(args.join(' '))
    }

    cchalk(color, ...args) {
        return chalk.bold[color.toLowerCase()](...args)
    }

    ccolor(color) {
        return chalk.bold[color.toLowerCase()](color)
    }

    describeMove(move) {
        const {board} = move
        const me = move.color
        const them = Opponent[move.color]
        const chalkMe = str => chalk.bold[me.toLowerCase()](str)
        const chalkThem = str => chalk.bold[them.toLowerCase()](str)
        const mine = {
            origin : chalkMe(move.isComeIn ? 'bar' : board.analyzer.originPoint(me, move.origin))
          , dest   : chalkMe(move.isBearoff ? 'home' : board.analyzer.originPoint(me, move.dest))
        }
        const theirs = {
            origin : move.isComeIn ? chalkMe('bar') : chalkThem(board.analyzer.originPoint(them, move.origin))
          , dest   : move.isBearoff ? chalkMe('home') : chalkThem(board.analyzer.originPoint(them, move.dest))
        }
        const whites = me == White ? mine : theirs
        const persp = this.isRobot ? whites : (me == this.color ? mine : theirs)
        //const sargs = [chalkMe(me), 'moves', mine.origin, Chars.rarrow, mine.dest, '/', theirs.origin, Chars.rarrow, theirs.dest]
        const sargs = [chalkMe(me), 'moves', persp.origin, Chars.rarrow, persp.dest]
        if (move.isHit) {
            sargs.push(chalk.bold.yellow('HIT'))
        }
        
        return sp(...sargs)
    }

    drawBoard(isOnce, isPersp, persp) {

        //if (isOnce && this.isDualTerm && this.color == Red) {
        //    return
        //}

        if (!persp) {
            persp = this.persp
            //persp = this.isRobot ? White : this.color
            //if (isPersp && !this.isRobot && this.color == Red) {
            //    persp = Red
            //}
        }

        this.logger.writeStdout(Draw.drawBoard(this.thisGame, this.thisMatch, persp, this.logs))
    }

    async promptTurnOption(turn) {
        const choices = ['r', 'd', 'q']
        const question = {
            name     : 'action'
          , message  : sp(this.cchalk(turn.color, turn.color + "'s"), 'turn to (r)oll or (d)ouble')
          , default  : () => 'r'
          , type     : 'input'
          , validate : value => choices.indexOf(value.toLowerCase()) > -1 || value[0] == '_' || sp('Please enter one of', choices.join())
        }
        while (true) {
            var {action} = await this.prompt(question)
            if (action.toLowerCase() == 'q') {
                await this.checkQuit()
                continue
            }
            if (action[0] == '_') {
                this.doHiddenAction(action, turn)
                continue
            }
            break
        }
        return action.toLowerCase() == 'd'
    }

    async promptDecideDouble() {
        const answers = await this.prompt({
            name    : 'accept'
          , type    : 'confirm'
          , message : sp('Does', this.ccolor(this.color), 'accept the double?')
          , default : null
        })
        return answers.accept
    }

    async promptOrigin(turn, origins, canUndo) {
        const points = Util.uniqueInts(origins).map(origin => turn.board.analyzer.originPoint(turn.color, origin))
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
          , validate : value => (choices.indexOf(value) > -1 || value[0] == '_') || 'Please enter one of ' + choices.join()
        }
        if (points.length == 1) {
            question.default = choices[0]
        }
        while (true) {
            var {origin} = await this.prompt(question)
            if (origin == 'q') {
                await this.checkQuit()
                continue
            }
            if (origin[0] == '_') {
                this.doHiddenAction(origin, turn)
                continue
            }
            break
        }
        if (origin == 'u') {
            return 'undo'
        } else if (origin == 'b') {
            return -1
        }
        return turn.board.analyzer.pointOrigin(turn.color, +origin)
    }

    doHiddenAction(action, turn) {
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
            this.drawBoard()
        }
    }

    async promptFace(turn, faces) {
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

    async promptFinish() {
        const choices = ['f', 'u']
        const answers = await this.prompt({
            name     : 'finish'
          , message  : '(f)inish or (u)ndo'
          , default  : () => 'f'
          , type     : 'input'
          , validate : value => choices.indexOf(value.toLowerCase()) > -1 || sp('Please enter one of', choices.join())
        })
        return answers.finish.toLowerCase() == 'f'
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

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
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

class MatchCanceledError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}
TermPlayer.Robot = TermRobot

module.exports = TermPlayer