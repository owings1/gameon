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
const Constants   = require('../lib/constants')
const Coordinator = require('../lib/coordinator')
const Core        = require('../lib/core')
const Dice        = require('../lib/dice')
const Logger      = require('../lib/logger')
const Util        = require('../lib/util')
const Robot       = require('../robot/player')

const Draw    = require('./draw')
const {Table} = require('./tables')
const Themes  = require('./themes')

const chalk = require('chalk')
const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {Board, Match, Turn} = Core

const {DrawHelper, TermHelper} = Draw
const {RobotDelegator} = Robot

const {inquirer} = require('./inquirer')

const {
    BoardStrings
  , Chars
  , ColorAbbr
  , ColorNorm
  , Colors
  , DefaultThemeName
  , DefaultTermEnabled
  , Opponent
  , OriginPoints
  , PointOrigins
  , Red
  , White
} = Constants

const {
    castToArray
  , defaults
  , destroyAll
  , errMessage
  , fileDateString
  , homeTilde
  , isEmptyObject
  , nchars
  , padEnd
  , sp
  , StringBuilder
  , stripAnsi
  , tildeHome
  , ucfirst
} = Util

function stringify(data, indent = 2) {
    return JSON.stringify(data, null, indent)
}

const DefaultTerm = new TermHelper(DefaultTermEnabled)

class LabHelper {

    static defaults() {
        return {
            breadthTrees  : false
          , recordDir     : null
          , persp         : White
          , theme         : DefaultThemeName
          , term          : DefaultTerm
          , rollsFile     : null
          , isCustomRobot : false
          , robots        : {}
        }
    }

    constructor(opts = {}) {

        this.board = opts.board

        this.opts = defaults(LabHelper.defaults(), opts)
        this.persp = this.opts.persp

        this.logs   = []        
        this.stateHistory = []
        this.fetchLastRecords = null
        this.canErase = false

        this.logger = new Logger
        this.theme = Themes.getInstance(this.opts.theme)
        this.drawer = DrawHelper.forBoard(this.board, this.persp, this.logs, this.opts.theme, this.term)

        this.inquirer = inquirer.createPromptModule()
    }

    async interactive() {

        await this.draw(true)

        while (true) {

            var answers = await this.prompt({
                name    : 'input'
              , message : 'Input'
              , type    : 'input'
            })

            var {input} = answers

            var inputLc = input.toLowerCase()

            if (!input) {
                await this.draw(true)
                this.canErase = true
                continue
            }

            if (inputLc == 'q') {
                break
            }

            if (inputLc == '?') {
                this.output.write(LabHelper.commandHelp() + '\n')
                continue
            }

            await this.runCommand(input)
        }
    }

    async runCommand(input, isPrintFirst) {

        if (isPrintFirst) {
            await this.draw(true)
        }

        var inputLc = input.toLowerCase()

        var [cmd, ...params] = input.split(' ')
        var cmdLc = cmd.toLowerCase()

        switch (cmd) {

            case 'i':
                this.output.write(this.boardInfo() + '\n')
                break

            case 's':
                await this.setStateCommand(params.join(' ').trim())
                await this.draw(true)
                break

            case 'd':
                await this.diceCommand(false, params.join(' ').trim())
                this.canErase = false
                break

            case 'D':
                await this.diceCommand(true, params.join(' ').trim())
                this.canErase = false
                break

            case 'f':
                this.persp = Opponent[this.persp]
                this.logs.push(sp('Perspective', this.ccolor(this.persp)))
                this.drawer.persp = this.persp
                await this.draw(true)
                break

            case 'F':
                this.board.setStateString(this.board.inverted().state28())
                this.logs.push('Invert board')
                await this.draw(true)
                break

            case 'p':
                await this.placeCommand()
                await this.draw(true)
                break

            case 'r':
                await this.rolloutCommand(params.join(' ').trim())
                this.canErase = false
                break

            case 'u':
                await this.undoCommand()
                await this.draw(true)
                break

            case 'w':
                await this.writeLastResult()
                this.canErase = false
                break

            case 'x':
                this.opts.breadthTrees = !this.opts.breadthTrees
                var treeStyle = this.opts.breadthTrees ? 'breadth' : 'depth'
                this.logger.info('Using', treeStyle, 'trees')
                break

            default:
                this.logger.warn('Invalid command', input)
                this.output.write(LabHelper.commandHelp() + '\n')
                break
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
            this.output.write(args.join(' ') + '\n')
            //cons.log(...args)
        }

        const hr = nchars(39, Chars.table.dash)

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

        const strings = {
            rankList  : this.showRobotTurnRankList(rankList, delegateWidth).toString()
          , delegates : this.showRobotTurnDelegates(delegateList).toString()
        }

        const turnData = turn.serialize()

        this.fetchLastRecords = () => {
            return {
                'explain.json'      : stringify(explain)
              , 'ranklist.ans.txt'  : strings.rankList
              , 'ranklist.txt'      : stripAnsi(strings.rankList)
              , 'delegates.ans.txt' : strings.delegates
              , 'delegates.txt'     : stripAnsi(strings.delegates)
              , 'results.json'      : stringify({results: result.results})
              , 'robot.json'        : stringify({robot: robotMeta})
              , 'turn.json'         : stringify({turn: turnData})
            }
        }
    }

    showRobotTurnRankList(rankList, delegateWidth) {

        const {theme} = this
        const chlk = theme.table
        const cons = this.logger.console

        const indent = 2

        var count = 0
        var hasDotDotDotted = false

        const b = new StringBuilder
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            if (count < 21) {
                this.output.write(''.padEnd(indent, ' '))
                this.output.write(args.join(' ') + '\n')
                //cons.log(''.padEnd(indent - 1, ' '), ...args)
            }
            if (count == 21 && !hasDotDotDotted) {
                hasDotDotDotted = true
                this.output.write('\n\n')
                this.output.write('    ')
                this.output.write(rankList.length - 20 + ' more ...')
                this.output.write('\n\n')
                //cons.log()
                //cons.log('   ', rankList.length - 20, 'more ....')
                //cons.log()
            }
        }

        const moveDesc = move => this.moveParts(move).map(
            it => chlk.row.reset(chlk.row(it))
        ).join(chlk.row.dim(Chars.arrow.right))

        const columns = [
            {
                name  : 'name'
              , title : null
            }
          , {
                name   : 'weighted'
              , align  : 'right'
              , format : value => chlk.row.cyan(value.toFixed(4))
            }
          , {
                name   : 'myScore'
              , align  : 'right'
              , format : value => chlk.row.yellow(value.toFixed(4))
            }
          , {
                name   : 'myRank'
              , align  : 'right'
              , format : value => chlk.row.yellow(value)
            }
        ]

        var lastScore

        const tables = rankList.map((info, i) => {

            const title = new StringBuilder(
                chlk.row.dim('#')
              , chlk.row.green((i + 1).toString())
              , chlk.row.dim(' of ' + rankList.length.toString())
              , chlk.row('  ')
              , chlk.row.dim('[')
              , info.moves.map(moveDesc).join(chlk.row.dim(', '))
              , chlk.row.dim(']')
            ).toString()

            const bscore = new StringBuilder(
                chlk.foot('Score : ')
              , chlk.foot.cyan.bold(info.finalScore.toFixed(4))
            )
            if (lastScore > 0) {
                var decreasePct = Math.round(100 * (lastScore - info.finalScore) / lastScore)
                if (decreasePct) {
                    bscore.add(
                        chlk.foot(' ')
                      , chlk.foot.red.bold(Chars.arrow.down + decreasePct + '%')
                    )
                }
            }
            const footerLines = [
                new StringBuilder(
                    chlk.foot('Rank  : ')
                  , chlk.title(info.rank.toString())
                ).toString()
              , bscore.toString()
              , new StringBuilder(
                    chlk.foot('State : ')
                  , chlk.foot.dim(info.endState)
                ).toString()
            ]

            const data = info.delegates.filter(it => it.myScore + it.weighted != 0)
            const opts = {
                title
              , theme
              , footerLines
              , oddEven: false
            }
            const table = new Table(columns, data, opts).build()
            table.rank = info.rank

            lastScore = info.finalScore

            return table
        })

        const maxTableWidth = Math.max(...tables.map(table => table.outerWidth))
        const hr = theme.hr(nchars(maxTableWidth, Chars.table.dash))

        var lastRank
        tables.forEach(table => {
            count += 1
            if (lastRank != table.rank) {
                log()
                log(hr)
                log()
            }
            table.lines.forEach(line => log(line))
            lastRank = table.rank
        })

        log()

        return b
    }

    showRobotTurnDelegates(delegateList) {

        const {theme} = this
        const chlk = theme.table
        const cons = this.logger.console

        const indent = 2

        const b = new StringBuilder
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            this.output.write(''.padEnd(indent, ' '))
            this.output.write(args.join(' '))
            this.output.write('\n')
            //cons.log(''.padEnd(indent - 1, ' '), ...args)
        }

        const moveDesc = move => this.moveParts(move).join(chlk.row.dim(Chars.arrow.right))
        const movesFormat = moves => {
            return chlk.row.dim('[') + moves.map(
                move => padEnd(moveDesc(move), 5, chlk.row(' '))
            ).join(chlk.row.dim(',') + chlk.row(' ')) + chlk.row.dim(']')
        }
        const columns = [
            {
                name   : 'myRank'
              , align  : 'right'
            }
          , {
                name   : 'rank'
              , align  : 'right'
              , key    : 'actualRank'
            }
          , {
                name   : 'diff'
              , align  : 'right'
              , get    : info => this.getRankDiff(info)
              , format : value => this.formatRankDiff(value)
            }
          , {
                name   : 'myScore'
              , align  : 'right'
              , format : value => value.toFixed(4)
            }
          , {
                name   : 'moves'
              , format : movesFormat
            }
        ]

        const tables = delegateList.filter(it =>
            it.rankings[0] && it.rankings[0].myRank != null
        ).map(({name, rankings}) =>
            new Table(columns, rankings, {name, theme, title: name}).build()
        )

        const maxTableWidth = Math.max(...tables.map(table => table.outerWidth))
        const hr = theme.hr(nchars(maxTableWidth, Chars.table.dash))

        tables.forEach(table => {
            log(hr)
            log()
            table.lines.forEach(line => log(line))
            log()
        })

        return b
    }

    async rolloutCommand(param) {
        const numMatches = this.parseNumRollouts(param)
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
                    const data = fse.readJsonSync(value)
                    return errMessage(() => Dice.validateRollsData(data))
                }
            }
        ])
        if (answers.rollsFile) {
            this.logger.info('Using custom rolls file')
            this.opts.rollsFile = path.resolve(tildeHome(answers.rollsFile))
            const {rolls} = await fse.readJson(this.opts.rollsFile)
            matchOpts.roller = Dice.createRoller(rolls)
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
                await coordinator.runMatch(match, players)
                matches.push(match.meta())
            }
        } finally {
            await destroyAll(players)
        }

        const scores = {Red: 0, White: 0}
        matches.forEach(meta => {
            scores.Red += meta.scores.Red
            scores.White += meta.scores.White
        })

        const diff = scores[this.persp] - scores[Opponent[this.persp]]
        this.output.write('scores: ' + stringify(scores) + '\n')
        this.output.write('diff: ' + this.chalkDiff(diff) + '\n')
        //this.logger.info('scores', scores)
        //this.logger.info('diff:', this.chalkDiff(diff))
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

    boardInfo() {
        const {board} = this
        return {
            state28     : board.state28()
          , stateString : board.stateString()
        }
    }

    moveDesc({origin, face}) {
        return this.moveParts({origin, face}).join(Chars.arrow.right)
    }

    moveParts({origin, face}) {

        const parts = []

        if (origin == -1) {
            var startPoint = 25
            parts.push('bar')
        } else {
            var startPoint = OriginPoints[this.persp][origin]
            parts.push(startPoint)
        }

        var destPoint = startPoint - face

        if (destPoint < 1) {
            destPoint = 'home'
        }

        parts.push(destPoint)

        return parts
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
        const opts = {
            theme: this.theme
        }
        this.prompter = this.inquirer.prompt(questions, null, opts)
        return this.prompter
    }

    ccolor(color) {
        const chlk = this.theme.board
        return chlk.piece[color.toLowerCase()](color)
    }

    async draw(isPrint) {
        const output = this.drawer.getString()
        if (isPrint) {
            if (this.canErase) {
                this.term.moveTo(1, 1)
                this.term.eraseDisplayBelow()
            } else {
                this.term.clear()
            }
            this.output.write(output)
        }
        return output
    }

    newRobot(...args) {
        if (!this.opts.isCustomRobot || isEmptyObject(this.opts.robots)) {
            var robot = RobotDelegator.forDefaults(...args)
        } else {
            var robot = RobotDelegator.forSettings(this.opts.robots, ...args)
        }
        return robot
    }

    async writeLastResult() {

        if (!this.opts.recordDir) {
            this.logger.warn('No recordDir set')
            return false
        }
        this.lastOutDir = null
        if (!this.fetchLastRecords) {
            this.logger.info('No result to save')
            return false
        }

        const subDir = 'labs'
        const prefix = 'lab-' + fileDateString()

        const outDir = path.resolve(this.opts.recordDir, subDir, prefix)

        this.logger.info('Saving to', homeTilde(outDir))

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
        this.lastOutDir = outDir
        return true
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

    // abstracted for coverage only
    chalkDiff(diff) {
        if (diff > 0) {
            var diffStr = chalk.green('+' + diff.toString())
        } else if (diff < 0) {
            var diffStr = chalk.red(diff.toString())
        } else {
            var diffStr = chalk.yellow(diff.toString())
        }
        return diffStr
    }

    // abstracted for coverage only
    getRankDiff(info) {
        return info.myRank == null ? null : info.actualRank - info.myRank
    }

    // abstracted for coverage only
    formatRankDiff(value) {
        if (value == null) {
            return ''
        }
        const chlk = this.theme.table
        var str = value.toString()
        if (value == 0) {
            return chlk.row.bold.green(str)
        }
        if (value > 0) {
            str = '+' + str
        }
        if (Math.abs(value) == 1) {
            return chlk.row.green(str)
        }
        return str
    }

    // abstracted for coverage only
    parseNumRollouts(param) {
        return parseInt(param) || 100
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
    }

    get term() {
        return this.opts.term
    }

    set term(term) {
        this.opts.term = term
        this.drawer.term = term
    }

    get output() {
        return this.term.stdout
    }

    set output(strm) {
        this.term.stdout = strm
    }

    static commandHelp() {
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
}

module.exports = LabHelper