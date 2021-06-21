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
const Constants    = require('../lib/constants')
const Coordinator  = require('../lib/coordinator')
const Core         = require('../lib/core')
const {DrawHelper} = require('./draw')
const Logger       = require('../lib/logger')
const Robot        = require('../robot/player')
const Util         = require('../lib/util')
const {Table}      = require('./tables')
const Themes       = require('./themes')

const chalk        = require('chalk')
const fs           = require('fs')
const fse          = require('fs-extra')
const inquirer     = require('inquirer')
const path         = require('path')

const {RobotDelegator} = Robot
const {StringBuilder}  = Util

const {homeTilde, nchars, sp, tildeHome, ucfirst} = Util

const {
    Board
  , Dice
  , Match
  , Turn
} = Core

const {
    ArrowChars
  , BoardStrings
  , ColorAbbr
  , ColorNorm
  , Opponent
  , OriginPoints
  , PointOrigins
  , Red
  , TableChars
  , White
} = Constants

function stringify(data, indent = 2) {
    return JSON.stringify(data, null, indent)
}

class LabHelper {

    constructor(opts = {}) {

        this.board  = opts.board
        this.persp  = opts.persp || White
        this.opts   = opts

        this.logs   = []
        this.logger = new Logger
        if (!this.opts.theme) {
            this.opts.theme = 'Default'
        }
        try {
            this.theme = Themes.getInstance(this.opts.theme)
        } catch (err) {
            if (!err.isThemeError) {
                throw err
            }
            this.logger.error(err.name, err.message)
            this.logger.warn('Using default theme')
            this.opts.theme = 'Default'
            this.theme = Themes.getDefaultInstance()
        }
        this.drawer = DrawHelper.forBoard(this.board, this.persp, this.logs, this.opts.theme)
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
                    await this.diceCommand(false, params.join(' ').trim())
                    break

                case 'D':
                    await this.diceCommand(true, params.join(' ').trim())
                    break

                case 'f':
                    this.persp = Opponent[this.persp]
                    this.logs.push(sp('Perspective', this.ccolor(this.persp)))
                    this.drawer.persp = this.persp
                    this.draw(true)
                    break

                case 'F':
                    this.board.setStateString(this.board.inverted().state28())
                    this.logs.push('Invert board')
                    this.draw(true)
                    break

                case 'p':
                    await this.placeCommand()
                    this.draw(true)
                    break

                case 'r':
                    await this.rolloutCommand(params.join(' ').trim())
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

        if (isRobot) {
            await this.showRobotTurn(turn)
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

        const b = new StringBuilder
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            cons.log(...args)
        }

        const hr = nchars(39, TableChars.dash)

        log(hr)

        log(info)

        log('  Move Series:')
        series.forEach((moves, i) =>
            log('   ', (i+1) + ':', moves.map(move => this.moveDesc(move)))
        )

        log(hr)

        const turnData = turn.serialize()

        this.fetchLastRecords = () => {
            return {
                'series.json' : stringify({info, series})
              , 'series.txt'  : b.toString()
              , 'turn.json'   : stringify({turn: turnData})
            }
        }
    }

    async showRobotTurn(turn) {

        const cons = this.logger.console
        const robot = this.newRobot(turn.color)

        robot.isStoreLastResult = true

        const robotMeta = robot.meta()
        const delegateWidth = Math.max(...robot.delegates.map(it => it.robot.name.length))

        try {
            var robotMoves = await robot.getMoves(turn)
            var result = robot.lastResult
            var explain = robot.explainResult(robot.lastResult)
        } finally {
            await robot.destroy()
        }

        const {rankList, delegateList} = explain

        const b_rankList  = this.showRobotTurnRankList(rankList, delegateWidth)
        const b_delegates = this.showRobotTurnDelegates(delegateList)

        const turnData = turn.serialize()

        this.fetchLastRecords = () => {
            return {
                'explain.json'      : stringify(explain)
              , 'ranklist.ans.txt'  : b_rankList.toString()
              , 'ranklist.txt'      : Util.stripAnsi(b_rankList.toString())
              , 'delegates.ans.txt' : b_delegates.toString()
              , 'delegates.txt'     : Util.stripAnsi(b_delegates.toString())
              , 'results.json'      : stringify({results: result.results})
              , 'robot.json'        : stringify({robot: robotMeta})
              , 'turn.json'         : stringify({turn: turnData})
            }
        }
    }

    showRobotTurnRankList(rankList, delegateWidth) {

        const cons = this.logger.console

        var indent = 0
        var count = 0
        var hasDotDotDotted = false

        const b_log = new StringBuilder
        const log = (...args) => {
            b_log.sp(...args)
            b_log.add('\n')
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

        const hr = nchars(49, TableChars.dash)

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
                b.add(chalk.bold.cyan(info.rank), chalk.grey('/'), chalk.yellow(rankList.length))
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

            log(''.padEnd(delegateWidth + 3, ' '), chalk.grey('weighted'), chalk.grey('myScore'.padStart(9, ' ')), ' ', chalk.grey('myRank'))

            info.delegates.forEach(it => {

                if (it.myScore + it.weightedScore == 0) {
                    return
                }

                const bd = new StringBuilder

                bd.add(
                    it.name.padEnd(delegateWidth + 6, ' ')
                  , chalk.cyan(it.weightedScore.toFixed(4).padEnd(7, ' '))
                  , chalk.grey(TableChars.pipe) + '  '
                  , chalk.yellow(it.myScore.toFixed(4).padEnd(6, ' '))
                  , ' ' + chalk.grey(TableChars.pipe) + ' '
                  , chalk.yellow(it.myRank.toString().padStart(rankList.length.toString().length, ' '))
                )

                log(bd.toString())
            })

            log()

            log(''.padEnd(16, ' '), chalk.grey(info.endState))
        })

        log()

        return b_log
    }

    showRobotTurnDelegates(delegateList) {

        const {theme} = this
        const ch = theme.table
        const cons = this.logger.console

        var indent = 0

        const b = new StringBuilder
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            cons.log(''.padEnd(indent - 1, ' '), ...args)
        }

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
              , format: moves => ch.dim('[') + moves.map(move =>
                    this.moveDesc(move, true).padEnd(5, ' ')
                ).join(ch.dim(',') + ' ') + ch.dim(']')
            }
        ]

        const tables = delegateList.filter(it =>
            it.rankings[0] && it.rankings[0].myRank != null
        ).map(({name, rankings}) =>
            new Table(columns, rankings, {name, theme}).build()
        )

        const maxTableWidth = Math.max(...tables.map(table => table.outerWidth))
        const hr = theme.hr(nchars(maxTableWidth, TableChars.dash))

        tables.forEach(table => {
            indent = 2
            log(hr)
            log()
            log(ch.title(table.name))
            log()
            table.lines.forEach(line => log(line))
            log()
        })

        return b
    }

    async rolloutCommand(param) {
        const numMatches = parseInt(param) || 100
        const matchOpts = {
            forceFirst : this.persp
          , startState : this.board.state28()
        }
        const answers = await this.prompt([
            {
                name    : 'rollsFile'
              , message : 'Rolls File'
              , type    : 'input'
              , default  : () => homeTilde(this.opts.rollsFile)
              , validate : value => {
                    if (!value.length) {
                        return true
                    }
                    value = tildeHome(value)
                    return Dice.rollsFileError(value)
                }
            }
        ])
        if (answers.rollsFile) {
            this.logger.info('Using custom rolls file')
            this.opts.rollsFile = path.resolve(tildeHome(answers.rollsFile))
            const {rolls} = JSON.parse(fs.readFileSync(this.opts.rollsFile))
            var rollIndex = 0
            var maxIndex = rolls.length - 1
            matchOpts.roller = () => {
                if (rollIndex > maxIndex) {
                    rollIndex = 0
                }
                return rolls[rollIndex++]
            }
        } else {
            this.opts.rollsFile = null
        }

        const players = {}
        players[this.persp] = this.newRobot(this.persp)
        players[Opponent[this.persp]] = RobotDelegator.forDefaults(Opponent[this.persp])

        const coordinator = new Coordinator
        const matches = []
        try {
            this.logger.info('Running', numMatches, 'matches', this.persp, 'goes first')
            for (var i = 0; i < numMatches; ++i) {
                var match = new Match(1, matchOpts)
                await coordinator.runMatch(match, players.White, players.Red)
                matches.push(match.meta())
            }
        } finally {
            await Util.destroyAll(players)
        }

        const scores = {Red: 0, White: 0}
        matches.forEach(meta => {
            scores.Red += meta.scores.Red
            scores.White += meta.scores.White
        })

        this.logger.info('scores', scores)
        const diff = scores[this.persp] - scores[Opponent[this.persp]]
        if (diff > 0) {
            var diffStr = chalk.green('+' + diff.toString())
        } else if (diff < 0) {
            var diffStr = chalk.red(diff.toString())
        } else {
            var diffStr = chalk.yellow(diff.toString())
        }
        this.logger.info('diff:', diffStr)
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

        const b = new StringBuilder

        b.add('Place')

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
          , 'F' : 'flip (invert) board'
          , 'p' : 'place piece'
          , 'r' : 'rollout'
          , 'u' : 'undo move'
          , 'w' : 'write last results'
          , 'x' : 'toggle tree mode'
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
        const ch = this.theme.board
        return ch.piece[color.toLowerCase()](color)
    }

    draw(isPrint) {
        const {drawer} = this
        const output = drawer.getString()
        if (isPrint) {
            this.logger.writeStdout(output)
        }
        return output
    }

    newRobot(...args) {
        if (!this.opts.isCustomRobot || Util.isEmptyObject(this.opts.robots)) {
            var robot = RobotDelegator.forDefaults(...args)
        } else {
            const configs = Object.entries(this.opts.robots).map(([name, config]) => {
                return {name, ...config}
            })
            var robot = RobotDelegator.forConfigs(configs, ...args)
        }
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

        this.logger.info('Saving to', homeTilde(path.join(this.opts.recordDir, subDir, prefix)))

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