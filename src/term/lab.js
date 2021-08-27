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
const {
    colors  : {Chalk},
    objects : {isNullOrEmptyObject},
    Screen,
    strings : {cat, stripAnsi, ucfirst},
    types   : {castToArray},
} = require('utils-h')
const fse = require('fs-extra')

const fs    = require('fs')
const path  = require('path')

const Dice    = require('../lib/dice.js')
const Intl    = require('../lib/util/intl.js')
const {Table} = require('./tables.js')
const Themes  = require('./themes.js')
const Coordinator = require('../lib/coordinator.js')
const {inquirer}  = require('./inquirer.js')
const {DrawHelper} = require('./draw.js')
const StringBuilder = require('../lib/util/string-builder.js')
const {RobotDelegator} = require('../robot/player.js')
const {Board, Match, Turn} = require('../lib/core.js')
const {
    Colors: {Red, White},
    BoardStrings,
    Chars,
    ColorAbbr,
    ColorNorm,
    Colors,
    DefaultAnsiEnabled,
    DefaultThemeName,
    Opponent,
    OriginPoints,
    PointOrigins,
    Version,
} = require('../lib/constants.js')
const {
    createLogger,
    defaults,
    destroyAll,
    errMessage,
    fileDateString,
    homeTilde,
    nchars,
    padEnd,
    sp,
    tildeHome,
} = require('../lib/util.js')

const chalk = new Chalk()
const DefaultScreen = new Screen({isAnsi: DefaultAnsiEnabled})

function stringify(data, indent = 2) {
    return JSON.stringify(data, null, indent)
}

class LabHelper {

    static defaults() {
        return {
            breadthTrees  : false,
            recordDir     : null,
            persp         : White,
            theme         : DefaultThemeName,
            screen        : DefaultScreen,
            rollsFile     : null,
            isCustomRobot : false,
            robots        : {},
            output        : process.stdout,
            intl          : Intl.getDefaultInstance(),
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

        this.inquirer = inquirer.createPromptModule()
        this.logger = createLogger(this, {oneout: true, stdout: this.output})
        this.theme = Themes.getInstance(this.opts.theme)
        this.drawer = new DrawHelper({
            board  : this.board,
            persp  : this.persp,
            logs   : this.logs,
            theme  : this.theme,
            screen : this.screen,
        })
    }

    get output() {
        return this.opts.output
    }

    set output(strm) {
        this.opts.output = strm
        this.screen.output = strm
        this.inquirer.opt.output = strm
        this.logger.stdout = strm
    }

    get screen() {
        return this.opts.screen
    }

    set screen(screen) {
        this.opts.screen = screen
        this.drawer.screen = screen
    }

    get intl() {
        return this.opts.intl
    }

    set intl(intl) {
        this.opts.intl = intl
    }

    get __() {
        return this.intl.__
    }

    async interactive() {
        this.draw(true)
        while (true) {
            const answers = await this.prompt({
                name    : 'input',
                message : 'Input',
                type    : 'input',
            })
            const {input} = answers
            const inputLc = input.toLowerCase()
            if (!input) {
                this.draw(true)
                this.canErase = true
                continue
            }
            if (inputLc === 'q') {
                break
            }
            if (inputLc === '?') {
                this.println(LabHelper.commandHelp())
                continue
            }
            await this.runCommand(input)
        }
    }

    async runCommand(input, isPrintFirst) {
        if (isPrintFirst) {
            this.draw(true)
        }
        const inputLc = input.toLowerCase()
        const [cmd, ...params] = input.split(' ')
        const cmdLc = cmd.toLowerCase()
        switch (cmd) {

            case 'i':
                this.println(stringify(this.boardInfo()))
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
                const treeStyle = this.opts.breadthTrees ? 'breadth' : 'depth'
                this.println(`Using ${treeStyle} trees`)
                break

            default:
                this.logger.warn(__('alerts.invalidCommand{input}', {input}))
                this.println(LabHelper.commandHelp())
                break
        }
    }

    async setStateCommand(param) {
        const {board, logger, __} = this
        const answers = await this.prompt({
            name     : 'state',
            type     : 'input',
            message  : __('menu.question.stateString'),
            when     : () => !param,
            default  : () => board.stateString(),
            validate : value => this.validateStateString(value),
        })
        const value = param || answers.state
        const valueLc = value.toLowerCase()
        if (valueLc === 'q' || !value.length) {
            return
        }
        const builtIn = this.getBuiltInStateString(value)
        let newState
        if (valueLc === 'i') {
            newState = BoardStrings.Initial
        } else if (valueLc === 'g') {
            logger.info(__('alerts.generatingState'))
            newState = await this.generateStateString()
        } else if (builtIn) {
            newState = builtIn
        } else {
            newState = value
        }
        try {
            newState = Board.fromStateString(newState).state28()
        } catch (err) {
            logger.error(__('alerts.badInput'), err.message)
            return
        }
        if (newState === board.state28()) {
            this.println(__('alerts.noChange'))
            return
        }
        this.fetchLastRecords = null
        this.stateHistory.push(board.state28())
        board.setStateString(newState)
        // TODO: report __
        this.logs.push('Set state')
    }

    async undoCommand() {
        const {__} = this
        if (this.stateHistory.length < 1) {
            this.logger.error(__('alerts.nothingToUndo'))
            return
        }
        this.board.setStateString(this.stateHistory.pop())
        this.fetchLastRecords = null
        // TODO: report __
        this.logs.push('Undo')
    }

    async diceCommand(isRobot, param) {
        const {board} = this
        const parseInput = value => {
            return value.split(',').map(it => parseInt(it.trim()))
        }
        const answers = await this.prompt({
            message  : 'Dice',
            type     : 'input',
            name     : 'dice',
            validate : value => this.validateDice(parseInput(value)),
            when     : () => !param || this.validateDice(parseInput(param)) !== true,
        })
        this.fetchLastRecords = null
        const value = param || answers.dice
        const dice = parseInput(value)
        const turn = new Turn(board, this.persp, this.opts).setRoll(dice)
        if (turn.isCantMove) {
            this.println(__('alerts.noMovesForColorWithRoll{color,roll}', {
                color : __(this.persp),
                roll  : dice.join(','),
            }))
            this.println(`No moves for ${this.persp} with ${dice.join()}`)
            return
        }
        if (isRobot) {
            await this.showRobotTurn(turn)
            return
        }
        const series = turn.builder.leaves.map(node => node.moveSeries())
        const {builder} = turn
        const info = {
            dice      : dice,
            series    : series.length,
            maxDepth  : builder.maxDepth,
            highFace  : builder.highestFace,
            hasWinner : builder.result.hasWinner,
        }
        const b = new StringBuilder
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            this.println(...args)
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
                'series.json' : stringify({info, series}),
                'series.txt'  : b.toString(),
                'turn.json'   : stringify({turn: turnData}),
            }
        }
    }

    async showRobotTurn(turn) {
        const robot = this.newRobot(turn.color)
        robot.isStoreLastResult = true
        const robotMeta = robot.meta()
        const delegateWidth = Math.max(...robot.delegates.map(it => it.robot.name.length))
        let result, explain
        try {
            await robot.getMoves(turn)
            result = robot.lastResult
            explain = robot.explainResult(robot.lastResult)
        } finally {
            await robot.destroy()
        }
        const {rankList, delegateList} = explain
        const strings = {
            rankList  : this.showRobotTurnRankList(rankList, delegateWidth).toString(),
            delegates : this.showRobotTurnDelegates(delegateList).toString(),
        }
        const turnData = turn.serialize()
        this.fetchLastRecords = () => ({
            'explain.json'      : stringify(explain),
            'ranklist.ans.txt'  : strings.rankList,
            'ranklist.txt'      : stripAnsi(strings.rankList),
            'delegates.ans.txt' : strings.delegates,
            'delegates.txt'     : stripAnsi(strings.delegates),
            'results.json'      : stringify({results: result.results}),
            'robot.json'        : stringify({robot: robotMeta}),
            'turn.json'         : stringify({turn: turnData}),
        })
    }

    showRobotTurnRankList(rankList, delegateWidth) {
        const {theme, __} = this
        const chlk = theme.table
        const indent = 2
        const b = new StringBuilder
        let count = 0
        let hasDotDotDotted = false
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            if (count < 21) {
                let str = ''.padEnd(indent, ' ')
                this.output.write(str)
                this.println(...args)
            }
            if (count === 21 && !hasDotDotDotted) {
                hasDotDotDotted = true
                this.println()
                this.output.write('    ')
                this.println('' + rankList.length - 20, ' more ...')
                this.println()
            }
        }
        const moveDesc = move => this.moveParts(move).map(
            it => chlk.row.reset(chlk.row(it))
        ).join(chlk.row.dim(Chars.arrow.right))
        const columns = [
            {
                name  : 'name',
                title : null,
            },
            {
                name   : 'weighted',
                align  : 'right',
                format : value => chlk.row.cyan(value.toFixed(4)),
            },
            {
                name   : 'myScore',
                align  : 'right',
                format : value => chlk.row.yellow(value.toFixed(4)),
            },
            {
                name   : 'myRank',
                align  : 'right',
                format : value => chlk.row.yellow(value),
            },
        ]
        let lastScore
        const tables = rankList.map((info, i) => {
            const title = cat(
                chlk.row.dim('#'),
                chlk.row.green((i + 1).toString()),
                chlk.row.dim(' of ' + rankList.length.toString()),
                chlk.row('  '),
                chlk.row.dim('['),
                info.moves.map(moveDesc).join(chlk.row.dim(', ')),
                chlk.row.dim(']'),
            )
            const bscore = new StringBuilder(
                chlk.foot('Score : '),
                chlk.foot.cyan.bold(info.finalScore.toFixed(4)),
            )
            if (lastScore > 0) {
                const decreasePct = Math.round(100 * (lastScore - info.finalScore) / lastScore)
                if (decreasePct) {
                    bscore.add(
                        chlk.foot(' '),
                        chlk.foot.red.bold(Chars.arrow.down + decreasePct + '%'),
                    )
                }
            }
            const footerLines = [
                cat(
                    chlk.foot('Rank  : '),
                    chlk.title(info.rank.toString()),
                ),
                bscore.toString(),
                cat(
                    chlk.foot('State : '),
                    chlk.foot.dim(info.endState),
                ),
            ]
            const data = info.delegates.filter(it => it.myScore + it.weighted !== 0)
            const opts = {
                title,
                theme,
                footerLines,
                oddEven: false,
            }
            const table = new Table(columns, data, opts).build()
            table.rank = info.rank
            lastScore = info.finalScore
            return table
        })
        const maxTableWidth = Math.max(...tables.map(table => table.outerWidth))
        const hr = theme.hr(nchars(maxTableWidth, Chars.table.dash))
        let lastRank
        tables.forEach(table => {
            count += 1
            if (lastRank !== table.rank) {
                log('')
                log(hr)
                log('')
            }
            table.lines.forEach(line => {
                log(line)
            })
            lastRank = table.rank
        })
        log()
        return b
    }

    showRobotTurnDelegates(delegateList) {
        const {theme} = this
        const chlk = theme.table
        const indent = 2
        const b = new StringBuilder
        const log = (...args) => {
            b.sp(...args)
            b.add('\n')
            this.output.write(''.padEnd(indent, ' '))
            this.println(...args)
        }
        const moveDesc = move => this.moveParts(move).join(chlk.row.dim(Chars.arrow.right))
        const movesFormat = moves => {
            return chlk.row.dim('[') + moves.map(
                move => padEnd(moveDesc(move), 5, chlk.row(' '))
            ).join(chlk.row.dim(',') + chlk.row(' ')) + chlk.row.dim(']')
        }
        const columns = [
            {
                name   : 'myRank',
                align  : 'right',
            },
            {
                name   : 'rank',
                align  : 'right',
                key    : 'actualRank',
            },
            {
                name   : 'diff',
                align  : 'right',
                get    : info => this.getRankDiff(info),
                format : value => this.formatRankDiff(value),
            },
            {
                name   : 'myScore',
                align  : 'right',
                format : value => value.toFixed(4),
            },
            {
                name   : 'moves',
                format : movesFormat,
            },
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
        const {logger, opts, __} = this
        const numMatches = this.parseNumRollouts(param)
        const matchOpts = {
            forceFirst : this.persp,
            startState : this.board.state28(),
        }
        const answers = await this.prompt([
            {
                name    : 'rollsFile',
                message : __('menu.question.rollsFile'),
                type    : 'input',
                default  : () => homeTilde(opts.rollsFile),
                validate : value => {
                    if (!value.length) {
                        return true
                    }
                    value = tildeHome(value)
                    const data = fse.readJsonSync(value)
                    return errMessage(() => Dice.validateRollsData(data))
                },
            },
        ])
        if (answers.rollsFile) {
            logger.info(__('alerts.usingCustomRollsFile'))
            opts.rollsFile = path.resolve(tildeHome(answers.rollsFile))
            const {rolls} = await fse.readJson(opts.rollsFile)
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
            logger.info('Running', numMatches, 'matches', this.persp, 'goes first')
            for (let i = 0; i < numMatches; ++i) {
                const match = new Match(1, matchOpts)
                await coordinator.runMatch(match, players)
                matches.push(match.meta())
            }
        } finally {
            destroyAll(players)
        }
        const scores = {Red: 0, White: 0}
        matches.forEach(meta => {
            scores.Red += meta.scores.Red
            scores.White += meta.scores.White
        })
        const diff = scores[this.persp] - scores[Opponent[this.persp]]
        this.println('scores:', stringify(scores))
        this.println('diff:', this.chalkDiff(diff))
    }

    async placeCommand() {
        const {board, __} = this
        const {analyzer} = board
        const questions = this.getPlaceQuestions()
        const answers = await this.prompt(questions)
        if (answers.from.toLowerCase() === 'q') {
            return
        }
        if (answers.color && answers.color.toLowerCase() === 'q') {
            return
        }
        if (answers.dest.toLowerCase() === 'q') {
            return
        }
        this.fetchLastRecords = null
        this.stateHistory.push(board.state28())
        const b = new StringBuilder
        b.add('Place')
        let piece
        if (answers.from === 'b') {
            let color
            if (analyzer.hasBar(White) && analyzer.hasBar(Red)) {
                color = ColorNorm[answers.color.toUpperCase()]
            } else {
                color = analyzer.hasBar(White) ? White : Red
            }
            piece = board.popBar(color)
            b.sp(this.ccolor(piece.color), 'bar')

        } else if (answers.from === 'h') {
            let color
            if (analyzer.piecesHome(White) && analyzer.piecesHome(Red)) {
                color = ColorNorm[answers.color.toUpperCase()]
            } else {
                color = analyzer.piecesHome(White) ? White : Red
            }
            piece = board.popHome(color)
            b.sp(piece.color, 'home')
        } else {
            const fromPoint = parseInt(answers.from)
            const fromOrigin = PointOrigins[this.persp][fromPoint]
            piece = board.popOrigin(fromOrigin)
            b.sp(piece.color, fromPoint)
        }
        b.add(':')
        if (answers.dest === 'b') {
            board.pushBar(piece.color, piece)
            b.add('bar')
        } else if (answers.dest === 'h') {
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
            state28     : board.state28(),
            stateString : board.stateString(),
        }
    }

    moveDesc({origin, face}) {
        return this.moveParts({origin, face}).join(Chars.arrow.right)
    }

    moveParts({origin, face}) {
        const parts = []
        let startPoint
        if (origin === -1) {
            startPoint = 25
            parts.push('bar')
        } else {
            startPoint = OriginPoints[this.persp][origin]
            parts.push(startPoint)
        }
        let destPoint = startPoint - face
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
            name.toLowerCase() === it.toLowerCase()
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
                message  : 'From, point, (b)ar, or (h)ome',
                name     : 'from',
                type     : 'input',
                validate : value => this.validatePlaceFrom(value),
            },
            {
                message : 'Color, (w)hite or (r)ed',
                name    : 'color',
                type    : 'input',
                default : () => ColorAbbr[this.persp].toLowerCase(),
                when    : answers => {
                    if (answers.from === 'b') {
                        return analyzer.hasBar(White) && analyzer.hasBar(Red)
                    }
                    if (answers.from === 'h') {
                        return analyzer.piecesHome(White) && analyzer.piecesHome(Red)
                    }
                    return false
                },
                validate : value => {
                    if (value.toLowerCase() === 'q') {
                        return true
                    }
                    return !!ColorNorm[value.toUpperCase()] || 'Invalid color'
                },
            },
            {
                message  : 'To, point, (b)ar, or (h)ome',
                name     : 'dest',
                type     : 'input',
                when     : answers => {
                    if (answers.from.toLowerCase() === 'q') {
                        return false
                    }
                    if (answers.color && answers.color.toLowerCase() === 'q') {
                        return false
                    }
                    return true
                },
                validate : (value, answers) => this.validatePlaceTo(value, answers),
            },
        ]
    }

    validatePlaceFrom(value) {
        const {analyzer} = this.board
        if (value.toLowerCase() === 'q') {
            return true
        }
        if (value === 'b') {
            if (!analyzer.hasBar(White) && !analyzer.hasBar(Red)) {
                return 'No pieces on bar'
            }
            return true
        }
        if (value === 'h') {
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
        if (value === 'b' || value === 'h' || value.toLowerCase() === 'q') {
            return true
        }
        const point = parseInt(value)
        if (isNaN(point) || point < 1 || point > 24) {
            return 'Invalid point'
        }
        const origin = PointOrigins[this.persp][point]
        const occupier = analyzer.originOccupier(origin)
        let color
        if (answers.color) {
            color = ColorNorm[answers.color.toUpperCase()]
        } else {
            if (answers.from === 'b') {
                color = analyzer.hasBar(White) ? White : Red
            } else if (answers.from === 'h') {
                color = analyzer.piecesHome(White) ? White : Red
            } else {
                const fromPoint = parseInt(answers.from)
                const fromOrigin = PointOrigins[this.persp][fromPoint]
                color = analyzer.originOccupier(fromOrigin)
            }
        }
        return !occupier || occupier === color || sp(point, 'occupied by', occupier)
    }

    validateStateString(value) {
        if (!value) {
            return true
        }
        const valueLc = value.toLowerCase()
        if (valueLc === 'q' || valueLc === 'i' || valueLc === 'g') {
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

    draw(isPrint) {
        const output = this.drawer.getString()
        if (isPrint) {
            if (this.canErase) {
                this.screen.moveTo(1, 1)
                this.screen.eraseDisplayBelow()
            } else {
                this.screen.clear()
            }
            this.output.write(output)
        }
        return output
    }

    newRobot(...args) {
        if (this.opts.isCustomRobot && !isNullOrEmptyObject(this.opts.robots)) {
            return RobotDelegator.forSettings(this.opts.robots, ...args)
        }
        return RobotDelegator.forDefaults(...args)
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
        for (const [basename, data] of Object.entries(records)) {
            const file = path.resolve(outDir, path.basename(basename))
            fs.writeFileSync(file, data)
            this.logger.info('   ', basename)
        }
        const lab = {
            date    : new Date,
            version : Version,
            board   : this.boardInfo(),
        }
        const basename = 'lab.json'
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
        let diffStr
        if (diff > 0) {
            diffStr = chalk.green('+' + diff.toString())
        } else if (diff < 0) {
            diffStr = chalk.red(diff.toString())
        } else {
            diffStr = chalk.yellow(diff.toString())
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
        let str = value.toString()
        if (value == 0) {
            return chlk.row.bold.green(str)
        }
        if (value > 0) {
            str = '+' + str
        }
        if (Math.abs(value) === 1) {
            return chlk.row.green(str)
        }
        return str
    }

    // abstracted for coverage only
    parseNumRollouts(param) {
        return parseInt(param) || 100
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
    }

    println(...args) {
        this.output.write((args.length ? args.join(' ') : '') + '\n')
    }

    static commandHelp() {
        const helps = {
            'i' : 'board info',
            's' : 'set state of board',
            'd' : 'show moves for dice',
            'D' : 'show robot info for dice',
            'f' : 'flip perspective',
            'F' : 'flip (invert) board',
            'p' : 'place piece',
            'r' : 'rollout',
            'u' : 'undo move',
            'w' : 'write last results',
            'x' : 'toggle tree mode',
            '?' : 'command help',
        }
        const b = new StringBuilder(
            'Commands:',
            '---------',
        )
        Object.entries(helps).forEach(it =>
            b.sp(it[0] + ':', it[1])
        )
        b.add('---------')
        return b.join('\n')
    }
}

module.exports = LabHelper