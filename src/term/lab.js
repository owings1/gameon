/**
 * gameon - Lab Helper class
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
const Constants = require('../lib/constants')

const chalk       = require('chalk')
const inquirer    = require('inquirer')
const Coordinator = require('../lib/coordinator')
const Core        = require('../lib/core')
const {DrawInstance} = require('./draw')
const Logger      = require('../lib/logger')
const Robot       = require('../robot/player')
const Util        = require('../lib/util')
const ThemeHelper = require('./themes')
const sp          = Util.joinSpace

const {RobotDelegator} = Robot
const {StringBuilder}  = Util
const {ucfirst}        = Util

const {
    Board
  , Dice
  , Match
  , Turn
} = Core

const {
    BoardStrings
  , BottomPoints
  , ColorAbbr
  , ColorNorm
  , Colors
  , Opponent
  , OriginPoints
  , PointOrigins
  , Red
  , TopPoints
  , White
} = Constants

const {Chars} = Constants.Draw

class LabHelper {

    constructor(opts = {}) {

        this.board  = opts.board
        this.persp  = opts.persp || White
        this.opts   = opts
        this.logs   = []
        this.logger = new Logger
        this.inst = DrawInstance.forBoard(this.board, this.persp, this.logs, this.opts.theme)
        this.stateHistory = []
        this.hr = this.nchars(60, '-')
    }

    async interactive() {

        this.draw(true)

        while (true) {

            var answers = await this.prompt({
                name    : 'input'
              , message : 'Input'
              , type    : 'input'
            })

            var {input} = answers
            var inputLc = input.toLowerCase()

            if (!input) {
                this.draw(true)
                continue
            }

            if (inputLc == 'q') {
                break
            }

            if (inputLc == '?') {
                this.logger.console.log(this.commandHelp())
                continue
            }

            var [cmd, ...params] = input.split(' ')
            var cmdLc = cmd.toLowerCase()

            switch (cmd) {

                case 'i':
                    this.logger.console.log(this.boardInfo())
                    break

                case 's':
                    await this.setStateCommand(params.join(' ').trim())
                    this.draw(true)
                    break

                case 'd':
                    await this.diceCommand(false, params.join(' '))
                    break
                case 'D':
                    await this.diceCommand(true, params.join(' '))
                    break

                case 'f':
                    this.persp = Opponent[this.persp]
                    this.logs.push(sp('Change to', this.ccolor(this.persp)))
                    this.inst.persp = this.persp
                    this.draw(true)
                    break

                case 'p':
                    await this.placeCommand()
                    this.draw(true)
                    break

                case 'u':
                    await this.undoCommand()
                    this.draw(true)
                    break

                case 'x':
                    this.opts.breadthTrees = !this.opts.breadthTrees
                    var treeStyle = this.opts.breadthTrees ? 'breadth' : 'depth'
                    this.logger.info('Using', treeStyle, 'trees')
                    break

                default:
                    this.logger.warn('Invalid command', input)
                    this.logger.console.log(this.commandHelp())
                    break
            }
        }
    }

    async setStateCommand(param) {

        const {board} = this

        const answers = await this.prompt({
            name     : 'state'
          , type     : 'input'
          , message  : 'State string'
          , when     : () => !param
          , default  : () => board.stateString()
          , validate : value => this.validateStateString(value)
        })

        const value = param || answers.state

        const valueLc = value.toLowerCase()

        if (valueLc == 'q' || !value.length) {
            return
        }

        const builtIn = this.getBuiltInStateString(value)

        if (valueLc == 'i') {
            var newState = BoardStrings.Initial
        } else if (valueLc == 'g') {
            this.logger.info('Generating state')
            var newState = await this.generateStateString()
        } else if (builtIn) {
            var newState = builtIn
        } else {
            var newState = value
        }

        try {
            newState = Board.fromStateString(newState).state28()
        } catch (err) {
            this.logger.error('Bad input', err.message)
            return
        }

        if (newState == board.state28()) {
            this.logger.info('No change')
            return
        }

        this.stateHistory.push(board.state28())

        board.setStateString(newState)

        this.logs.push('Set state')
    }

    async undoCommand() {
        if (this.stateHistory.length < 1) {
            this.logger.error('Nothing to undo')
            return
        }
        this.board.setStateString(this.stateHistory.pop())
        this.logs.push('Undo')
    }

    async diceCommand(isRobot, param) {

        const {board} = this
        const cons = this.logger.console

        const parseInput = value => {
            return value.split(',').map(it => parseInt(it.trim()))
        }

        const answers = await this.prompt({
            message  : 'Dice'
          , type     : 'input'
          , name     : 'dice'
          , validate : value => this.validateDice(parseInput(value))
          , when     : () => !param || this.validateDice(parseInput(param)) !== true
        })

        const value = param || answers.dice

        const dice = parseInput(value)

        const turn = new Turn(board, this.persp, this.opts).setRoll(dice)

        if (turn.isCantMove) {
            cons.log('No moves for', this.persp, 'with', dice.join())
            return
        }

        const series = turn.builder.leaves.map(node => node.moveSeries())
        const {builder} = turn
        const info = {
            dice      : dice
          , series    : series.length
          , maxDepth  : builder.maxDepth
          , highFace  : builder.highestFace
          , hasWinner : builder.result.hasWinner
        }

        if (isRobot) {
            await this.showRobotTurn(turn)
            return
        }

        cons.log(this.hr)

        cons.log(info)

        cons.log('  Move Series:')
        series.forEach((moves, i) =>
            cons.log('   ', (i+1) + ':', moves.map(move => this.moveDesc(move)))
        )

        cons.log(this.hr)
    }

    async showRobotTurn(turn) {

        const cons = this.logger.console
        const robot = this.newRobot(turn.color)

        var robotMoves
        var explain
        var result
        try {
            robotMoves = await robot.getMoves(turn)
            result = robot.lastResult
            explain = robot.explainResult(robot.lastResult)
        } finally {
            await robot.destroy()
        }

        const delegateWidth = Math.max(...explain[0].delegates.map(it => it.name.length))

        const summary = explain.map(it => {
            const info = {
                moves      : it.moves.map(move => this.moveDesc(move, true))
              , finalScore : parseFloat(it.finalScore.toFixed(4))
              , endState   : it.endState
            }
            if (it.isChosen) {
                info.isChosen = true
            }
            info.delegates = {}
            it.delegates.forEach(it => {
                info.delegates[it.name] = {
                    weighted: parseFloat(it.weightedScore.toFixed(4))
                  , raw     : parseFloat(it.rawScore.toFixed(4))
                }
            })
            return info
        })
        
        summary.forEach((info, i) => {

            cons.log()
            cons.log(this.hr)
            cons.log()

            const b = new StringBuilder

            const mstr = '[' + info.moves.join(', ') + ']'
            if (info.isChosen) {
                b.add(chalk.bold.green('#1 Winner'), '  ', chalk.bold(mstr))
            } else {
                b.add(chalk.yellow(i + 1), chalk.grey('/'), chalk.yellow(summary.length), '  ', mstr)
            }
            cons.log(b.toString())

            cons.log()
            cons.log('  ', chalk.bold('TotalScore'), chalk.bold.cyan(info.finalScore.toString()))
            cons.log()

            Object.entries(info.delegates).forEach(([name, scores]) => {
                if (scores.raw + scores.weighted == 0) {
                    return
                }
                const b = new StringBuilder
                b.add(chalk.grey('weighted: '), chalk.cyan(scores.weighted.toString().padEnd(6, ' ')), ' | ')
                b.add(chalk.grey('raw: '), chalk.yellow(scores.raw.toString().padEnd(6, ' ')))
                cons.log('    ', name.padEnd(delegateWidth, ' ') + ' |', b.toString())
            })
            cons.log()
            cons.log(''.padEnd(25, ' '), chalk.grey(info.endState))
        })
        cons.log()
    }

    async placeCommand() {

        const {board} = this
        const {analyzer} = board

        const questions = this.getPlaceQuestions()
        const answers = await this.prompt(questions)

        if (answers.from.toLowerCase() == 'q') {
            return
        }
        if (answers.color && answers.color.toLowerCase() == 'q') {
            return
        }
        if (answers.dest.toLowerCase() == 'q') {
            return
        }

        this.stateHistory.push(board.state28())

        const b = new StringBuilder('Place')
        
        var piece

        if (answers.from == 'b') {

            if (analyzer.hasBar(White) && analyzer.hasBar(Red)) {
                var color = ColorNorm[answers.color.toUpperCase()]
            } else {
                var color = analyzer.hasBar(White) ? White : Red
            }

            piece = board.popBar(color)
            b.sp(this.ccolor(piece.color), 'bar')

        } else if (answers.from == 'h') {

            if (analyzer.piecesHome(White) && analyzer.piecesHome(Red)) {
                var color = ColorNorm[answers.color.toUpperCase()]
            } else {
                var color = analyzer.piecesHome(White) ? White : Red
            }

            piece = board.popHome(color)
            b.sp(piece.color, 'home')

        } else {

            var fromPoint = parseInt(answers.from)
            var fromOrigin = PointOrigins[this.persp][fromPoint]

            piece = board.popOrigin(fromOrigin)
            b.sp(piece.color, fromPoint)
        }

        b.add(':')

        if (answers.dest == 'b') {

            board.pushBar(piece.color, piece)
            b.add('bar')

        } else if (answers.dest == 'h') {

            board.pushHome(piece.color, piece)
            b.add('home')

        } else {

            const destPoint = parseInt(answers.dest)
            const destOrigin = PointOrigins[this.persp][destPoint]

            board.pushOrigin(destOrigin, piece)
            b.add(destPoint)
        }

        this.logs.push(b.join(' '))
    }

    commandHelp() {
        const helps = {
            'i' : 'board info'
          , 's' : 'set state of board'
          , 'd' : 'show moves for dice'
          , 'D' : 'show robot info for dice'
          , 'f' : 'flip perspective'
          , 'p' : 'place piece'
          , 'u' : 'undo move'
          , 'x' : 'toggler tree mode'
          , '?' : 'command help'
        }
        const b = new StringBuilder(
            'Commands:'
          , '---------'
        )
        Object.entries(helps).forEach(it =>
            b.sp(it[0] + ':', it[1])
        )
        b.add('---------')
        return b.join('\n')
    }

    boardInfo() {
        const {board} = this
        return {
            state28     : board.state28()
          , stateString : board.stateString()
        }
    }

    moveDesc(move, isShort) {

        const b = new StringBuilder

        if (move.origin == -1) {
            var startPoint = 25
            b.add('bar')
        } else {
            var startPoint = OriginPoints[this.persp][move.origin]
            b.add(startPoint)
        }

        var destPoint = startPoint - move.face

        if (destPoint < 1) {
            destPoint = 'home'
        }

        b.add(destPoint)
        if (!isShort) {
            b.add('[' + move.face + ']')
        }

        return b.join(':')
    }

    getBuiltInStateString(name) {
        if (BoardStrings[name]) {
            return BoardStrings[name]
        }
        const srch = Object.keys(BoardStrings).find(it =>
            name.toLowerCase() == it.toLowerCase()
        )
        if (srch) {
            return BoardStrings[srch]
        }
    }

    getPlaceQuestions() {

        const {board} = this
        const {analyzer} = board

        return [
            {
                message  : 'From, point, (b)ar, or (h)ome'
              , name     : 'from'
              , type     : 'input'
              , validate : value => this.validatePlaceFrom(value)
            }
          , {
                message : 'Color, (w)hite or (r)ed'
              , name    : 'color'
              , type    : 'input'
              , default : () => ColorAbbr[this.persp].toLowerCase()
              , when    : answers => {
                    if (answers.from == 'b') {
                        return analyzer.hasBar(White) && analyzer.hasBar(Red)
                    }
                    if (answers.from == 'h') {
                        return analyzer.piecesHome(White) && analyzer.piecesHome(Red)
                    }
                    return false
                }
              , validate : value => {
                    if (value.toLowerCase() == 'q') {
                        return true
                    }
                    return !!ColorNorm[value.toUpperCase()] || 'Invalid color'
                }
            }
          , {
                message  : 'To, point, (b)ar, or (h)ome'
              , name     : 'dest'
              , type     : 'input'
              , when     : answers => {
                    if (answers.from.toLowerCase() == 'q') {
                        return false
                    }
                    if (answers.color && answers.color.toLowerCase() == 'q') {
                        return false
                    }
                    return true
                }
              , validate : (value, answers) => this.validatePlaceTo(value, answers)
            }
        ]
    }

    validatePlaceFrom(value) {
        const {analyzer} = this.board
        if (value.toLowerCase() == 'q') {
            return true
        }
        if (value == 'b') {
            if (!analyzer.hasBar(White) && !analyzer.hasBar(Red)) {
                return 'No pieces on bar'
            }
            return true
        }
        if (value == 'h') {
            if (!analyzer.piecesHome(White) && !analyzer.piecesHome(Red)) {
                return 'No pieces on hom'
            }
            return true
        }
        const point = parseInt(value)
        if (isNaN(point) || point < 1 || point > 24) {
            return 'Invalid point'
        }
        const origin = PointOrigins[this.persp][point]
        return !!analyzer.originOccupier(origin) || sp('No piece on point', point)
    }

    validatePlaceTo(value, answers) {

        const {analyzer} = this.board

        if (value == 'b' || value == 'h' || value.toLowerCase() == 'q') {
            return true
        }

        const point = parseInt(value)
        if (isNaN(point) || point < 1 || point > 24) {
            return 'Invalid point'
        }

        const origin = PointOrigins[this.persp][point]
        const occupier = analyzer.originOccupier(origin)

        if (answers.color) {
            var color = ColorNorm[answers.color.toUpperCase()]
        } else {
            if (answers.from == 'b') {
                var color = analyzer.hasBar(White) ? White : Red
            } else if (answers.from == 'h') {
                var color = analyzer.piecesHome(White) ? White : Red
            } else {
                const fromPoint = parseInt(answers.from)
                const fromOrigin = PointOrigins[this.persp][fromPoint]
                var color = analyzer.originOccupier(fromOrigin)
            }
        }

        return !occupier || occupier == color || sp(point, 'occupied by', occupier)
    }

    validateStateString(value) {

        if (!value) {
            return true
        }

        const valueLc = value.toLowerCase()

        if (valueLc == 'q' || valueLc == 'i' || valueLc == 'g') {
            return true
        }

        const builtIn = this.getBuiltInStateString(value)

        if (builtIn) {
            value = builtIn
        }

        try {
            Board.fromStateString(value).analyzer.validateLegalBoard()
        } catch (err) {
            return [err.name, ':', err.message].join(' ')
        }

        return true
    }

    validateDice(dice) {
        try {
            Dice.checkTwo(dice)
        } catch (err) {
            return err.message
        }
        return true
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    ccolor(color) {
        const {chalks} = this.inst.theme
        return chalks.piece[color](color)
    }

    nchars(n, char) {
        return Chars.empty.padEnd(n, char)
    }

    draw(isPrint) {
        const {inst} = this
        const output = inst.getString()
        if (isPrint) {
            this.logger.writeStdout(output)
        }
        return output
    }

    newRobot(...args) {
        if (!this.opts.isCustomRobot) {
            var robot = RobotDelegator.forDefaults(...args)
        } else {
            const configs = Object.entries(this.opts.robots).map(([name, config]) => {
                return {name, ...config}
            })
            var robot = RobotDelegator.forConfigs(configs, ...args)
        }
        robot.isStoreLastResult = true
        return robot
    }

    async generateStateString() {

        const match = new Match(1)

        const red   = RobotDelegator.forDefaults(Red)
        const white = RobotDelegator.forDefaults(White)

        try {
            await new Coordinator().runMatch(match, white, red)
        } finally {
            await Promise.all([white.destroy(), red.destroy()])
        }

        const game       = match.games[0]
        const turnCount  = game.getTurnCount()
        const minTurn    = Math.min(turnCount, 8)
        const maxTurn    = Math.floor(turnCount * 0.4)
        const turnNumber = Math.floor(Math.random() * (maxTurn - minTurn) + minTurn)
        const turnMeta   = game.turnHistory[turnNumber]

        return turnMeta.endState
    }

}

module.exports = LabHelper