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
const fs          = require('fs')
const fse         = require('fs-extra')
const inquirer    = require('inquirer')
const path        = require('path')
const Coordinator = require('../lib/coordinator')
const Core        = require('../lib/core')
const {DrawInstance} = require('./draw')
const Logger      = require('../lib/logger')
const Robot       = require('../robot/player')
const Util        = require('../lib/util')
const {Table}     = require('./tables')
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
    ArrowChars
  , BoardStrings
  , BottomPoints
  , ColorAbbr
  , ColorNorm
  , Colors
  , Opponent
  , OriginPoints
  , PointOrigins
  , Red
  , TableChars
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
        this.fetchLastRecords = null
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

                case 'w':
                    await this.writeLastResult()
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

        this.fetchLastRecords = null
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
        this.fetchLastRecords = null
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

        this.fetchLastRecords = null

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

        const wb = new StringBuilder
        const log = (...args) => {
            wb.sp(...args)
            wb.add('\n')
            cons.log(...args)
        }

        const hr = this.nchars(39, TableChars.dash)

        log(hr)

        log(info)

        log('  Move Series:')
        series.forEach((moves, i) =>
            log('   ', (i+1) + ':', moves.map(move => this.moveDesc(move)))
        )

        log(hr)

        this.fetchLastRecords = () => {
            return {
                'moves.json' : Buffer.from(JSON.stringify({info, moves}, null, 2))
              , 'moves.txt'  : Buffer.from(wb.toString())
            }
        }
    }

    async showRobotTurn(turn) {

        const cons = this.logger.console
        const robot = this.newRobot(turn.color)

        const robotMeta = robot.meta()
        const delegateWidth = Math.max(...robot.delegates.map(it => it.robot.name.length))

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

        const {rankList, delegateList} = explain

        const wb = this.showRobotTurnRankList(rankList, delegateWidth)
        const wb2 = this.showRobotTurnDelegates(delegateList)

        const turnMeta = turn.meta()

        this.fetchLastRecords = () => {
            return {
                'explain.json'      : JSON.stringify(explain, null, 2)
              , 'ranklist.ans.txt'  : wb.toString()
              , 'ranklist.txt'      : Util.stripAnsi(wb.toString())
              , 'delegates.ans.txt' : wb2.toString()
              , 'delegates.txt'     : Util.stripAnsi(wb2.toString())
              , 'results.json'      : JSON.stringify({results: result.results}, null, 2)
              , 'robot.json'        : JSON.stringify({robot: robotMeta}, null, 2)
              , 'turn.json'         : JSON.stringify({turn: turnMeta}, null, 2)
            }
        }
    }

    showRobotTurnRankList(rankList, delegateWidth) {

        const cons = this.logger.console

        var indent = 0
        var count = 0
        var hasDotDotDotted = false

        const wb = new StringBuilder
        const log = (...args) => {
            wb.sp(...args)
            wb.add('\n')
            if (count < 21) {
                cons.log(''.padEnd(indent - 1, ' '), ...args)
            }
            if (count == 21 && !hasDotDotDotted) {
                hasDotDotDotted = true
                cons.log()
                cons.log('   ', rankList.length - 20, 'more ....')
                cons.log()
            }
        }

        const hr = this.nchars(39, TableChars.dash)

        var lastScore

        rankList.forEach((info, i) => {

            count += 1
            indent = 2

            log()
            log(hr)
            log()

            const mstr = new StringBuilder(
                chalk.grey('['), info.moves.map(move => this.moveDesc(move, true)).join(', '), chalk.grey(']')
            ).toString()

            const b = new StringBuilder

            var decreasePct = 0
            if (info.isChosen) {
                b.add(chalk.bold.green('#1 Winner'), '  ', chalk.bold(mstr))
            } else {
                if (lastScore > 0) {
                    decreasePct = Math.round(100 * (lastScore - info.finalScore) / lastScore)
                }
                b.add(chalk.yellow(i + 1), chalk.grey('/'), chalk.yellow(rankList.length))
                b.add('  ', mstr)
            }
            lastScore = info.finalScore
            log(b.toString())
            log()

            indent += 2

            const sb = new StringBuilder
            sb.sp(chalk.bold('Score'), chalk.bold.cyan(info.finalScore.toFixed(4)))
            if (decreasePct) {
                sb.add(''.padEnd(3, ' '), chalk.red(ArrowChars.down + decreasePct + '%'))
            }
            log(sb.toString())

            indent += 2

            log(''.padEnd(delegateWidth + 3, ' '), chalk.grey('weighted'), chalk.grey('raw'.padStart(8, ' ')))

            info.delegates.forEach(it => {

                if (it.rawScore + it.weightedScore == 0) {
                    return
                }

                const bd = new StringBuilder

                bd.add(
                    it.name.padEnd(delegateWidth + 6, ' ')
                  , chalk.cyan(it.weightedScore.toFixed(4).padEnd(7, ' '))
                  , chalk.grey(TableChars.pipe) + ' '
                  , chalk.yellow(it.rawScore.toFixed(4).padEnd(6, ' '))
                )

                log(bd.toString())
            })

            log()

            log(''.padEnd(6, ' '), chalk.grey(info.endState))
        })

        log()

        return wb
    }

    showRobotTurnDelegates(delegateList) {

        const cons = this.logger.console

        var indent = 0

        const wb2 = new StringBuilder
        const log = (...args) => {
            wb2.sp(...args)
            wb2.add('\n')
            cons.log(''.padEnd(indent - 1, ' '), ...args)
        }

        //const len = str => Util.stripAnsi(str).length

        const columns = [
            {
                name   : 'myRank'
              , align  : 'right'
              , format : value => value == null ? '' : value.toString()
            }
          , {
                name   : 'rank'
              , align  : 'right'
              , key    : 'actualRank'
              , format : value => value == null ? '' : value.toString()
            }
          , {
                name   : 'diff'
              , align  : 'right'
              , get    : info => info.myRank == null ? null : info.actualRank - info.myRank
              , format : value => {
                    if (value == null) {
                        return ''
                    }
                    var str = value.toString()
                    if (value == 0) {
                        return chalk.bold.green(str)
                    }
                    if (value > 0) {
                        str = '+' + str
                    }
                    if (Math.abs(value) == 1) {
                        return chalk.green(str)
                    }
                    return str
                }
            }
          , {
                name   : 'myScore'
              , align  : 'right'
              , format : value => value.toFixed(4)
            }
          , {
                name: 'moves'
              , format: moves => moves.map(move => 
                    ('[' + this.moveDesc(move, true) + ']').padEnd(7, ' ')
                ).join(' ')
            }
        ]

        const tables = delegateList.map(delegate => {
            const opts = {
                //colorEven: 'cyan'
            }
            const table = new Table(columns, delegate.rankings, opts)
            table.build()
            table.name = delegate.name
            table.width = Util.sumArray(table.columns.map(it => it.width)) + Math.max(table.columns.length - 1, 0) * 3
            table.hasRank = delegate.rankings[0] && delegate.rankings[0].myRank != null
            return table
        })

        const maxTableWidth = Math.max(...tables.map(table => table.width)) + 2
        const hr = chalk.bgGrey.white(this.nchars(maxTableWidth + 2, TableChars.dash))

        tables.forEach(table => {
            if (!table.hasRank) {
                return
            }
            indent = 2
            log(hr)
            log()
            log(chalk.cyan.bold(table.name))
            log()
            table.lines.forEach(line => log(line))
            log()
        })

        return wb2
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

        this.fetchLastRecords = null

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
          , 'w' : 'write last results'
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

    async writeLastResult() {

        if (!this.opts.recordDir) {
            this.logger.warn('No recordDir set')
            return
        }
        if (!this.fetchLastRecords) {
            this.logger.info('No result to save')
            return
        }

        const subDir = 'labs'
        const prefix = 'lab-' + Util.fileDateString()

        const outDir = path.resolve(this.opts.recordDir, subDir, prefix)

        this.logger.info('Saving to', path.join(this.opts.recordDir, subDir, prefix))

        await fse.ensureDir(outDir)
        
        const records = await this.fetchLastRecords()

        this.fetchLastRecords = null

        for (var [basename, data] of Object.entries(records)) {
            var file = path.resolve(outDir, path.basename(basename))
            fs.writeFileSync(file, data)
            this.logger.info('   ', basename)
        }

        const lab = {
            date    : new Date
          , version : Constants.Version
          , board   : this.boardInfo()
        }

        var basename = 'lab.json'
        const labFile = path.resolve(outDir, basename)
        await fse.writeJson(labFile, lab, {spaces: 2})
        this.logger.info('   ', basename)
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