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
    strings : {cat, stringWidth, stripAnsi, ucfirst},
    types   : {castToArray},
    Screen,
} = require('utils-h')
const fse = require('fs-extra')

const fs    = require('fs')
const path  = require('path')

const Dice    = require('../lib/dice.js')
const {Table} = require('./tables.js')
const Themes  = require('./themes.js')
const {inquirer}  = require('./inquirer.js')
const IntlHelper  = require('../lib/util/intl.js')
const Coordinator = require('../lib/coordinator.js')
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
            intl          : IntlHelper.getGlobalInstance(),
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
        const {__} = this
        while (true) {
            const answers = await this.prompt({
                name    : 'input',
                message : __('lab.question.command'),
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
                this.println(this.commandHelp())
                continue
            }
            await this.runCommand(input)
        }
    }

    async runCommand(input, isPrintFirst) {
        if (isPrintFirst) {
            this.draw(true)
        }
        const {__} = this
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
                this.logs.push(__('play.log.setPerspective{color}', {
                    color: this.ccolor(this.persp, __(`play.color.${this.persp}`)),
                }))
                this.drawer.persp = this.persp
                await this.draw(true)
                break

            case 'F':
                this.board.setStateString(this.board.inverted().state28())
                this.logs.push(__('play.log.invertBoard'))
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
                const treeStyle = this.opts.breadthTrees
                    ? __('core.treeStyle.breadth')
                    : __('core.treeStyle.depth')
                this.println(
                    __('alerts.usingTreeStyleTrees{treeStyle}', {treeStyle})
                )
                break

            default:
                this.logger.warn(__('alerts.invalidCommand{input}', {input}))
                this.println(this.commandHelp())
                break
        }
    }

    async setStateCommand(param) {
        const {board, logger, __} = this
        const answers = await this.prompt({
            name     : 'state',
            type     : 'input',
            message  : __('lab.question.stateString'),
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
        this.logs.push(__('play.log.setState'))
    }

    async undoCommand() {
        const {__} = this
        if (this.stateHistory.length < 1) {
            this.logger.error(__('alerts.nothingToUndo'))
            return
        }
        this.board.setStateString(this.stateHistory.pop())
        this.fetchLastRecords = null
        this.logs.push(__('play.log.undo'))
    }

    async diceCommand(isRobot, param) {
        const {board, __} = this
        const parseInput = value => {
            return value.split(',').map(it => parseInt(it.trim()))
        }
        const answers = await this.prompt({
            message  : __('lab.question.dice'),
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
                color : __(`play.color.${this.persp}`),
                roll  : dice.join(','),
            }))
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
        log('  ' + __('lab.title.moveSeries') + ':')
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
        const {nf} = this.intl
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
            const footTitles = {
                score: __('lab.title.score'),
                rank : __('lab.title.rank'),
                state: __('lab.title.state'),
            }
            const footTitleWidth = Math.max(...Object.values(footTitles).map(stringWidth))
            Object.keys(footTitles).forEach(key => {
                footTitles[key] = footTitles[key].padEnd(footTitleWidth, ' ') + ' : '
            })
            const bscore = new StringBuilder(
                chlk.foot(footTitles.score),
                chlk.foot.cyan.bold(info.finalScore.toFixed(4)),
            )
            if (lastScore > 0) {
                const decrease = (lastScore - info.finalScore) / lastScore
                if (decrease >= 0.01) {
                    bscore.add(
                        chlk.foot(' '),
                        chlk.foot.red.bold(
                            Chars.arrow.down + nf(decrease, {style: 'percent'})
                        ),
                    )
                }
            }
            const footerLines = [
                cat(
                    chlk.foot(footTitles.rank),
                    chlk.title(info.rank.toString()),
                ),
                bscore.toString(),
                cat(
                    chlk.foot(footTitles.state),
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
            const params = {
                color: __(`play.color.${this.persp}`),
                count: numMatches,
            }
            logger.info(__('alerts.runningCountMatchesColorGoesFirst{count,color}', params))
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
        const scoresTran = {}
        for (const color in scores) {
            scoresTran[__(`play.color.${color}`)] = scores[color]
        }
        this.println(__('lab.attr.scores') + ':', stringify(scoresTran))
        this.println(__('lab.attr.diff') + ':', this.chalkDiff(diff))
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
        const params = {}
        let piece
        if (answers.from === 'b') {
            let color
            if (analyzer.hasBar(White) && analyzer.hasBar(Red)) {
                color = ColorNorm[answers.color.toUpperCase()]
            } else {
                color = analyzer.hasBar(White) ? White : Red
            }
            piece = board.popBar(color)
            params.origin = __('play.board.bar')
        } else if (answers.from === 'h') {
            let color
            if (analyzer.piecesHome(White) && analyzer.piecesHome(Red)) {
                color = ColorNorm[answers.color.toUpperCase()]
            } else {
                color = analyzer.piecesHome(White) ? White : Red
            }
            piece = board.popHome(color)
            params.origin = __('play.board.home')
        } else {
            const fromPoint = parseInt(answers.from)
            const fromOrigin = PointOrigins[this.persp][fromPoint]
            piece = board.popOrigin(fromOrigin)
            params.origin = String(fromPoint)
        }
        params.color = this.ccolor(piece.color, __(`play.color.${piece.color}`))
        if (answers.dest === 'b') {
            board.pushBar(piece.color, piece)
            params.dest = __('play.board.bar')
        } else if (answers.dest === 'h') {
            board.pushHome(piece.color, piece)
            params.dest = __('play.board.home')
        } else {
            const destPoint = parseInt(answers.dest)
            const destOrigin = PointOrigins[this.persp][destPoint]
            board.pushOrigin(destOrigin, piece)
            params.dest = String(destPoint)
        }
        this.logs.push(__('play.log.place{color,origin,dest}', params))
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
        const {__} = this
        const parts = []
        let startPoint
        if (origin === -1) {
            startPoint = 25
            parts.push(__('play.board.bar'))
        } else {
            startPoint = OriginPoints[this.persp][origin]
            parts.push(startPoint)
        }
        let destPoint = startPoint - face
        if (destPoint < 1) {
            destPoint = __('play.board.home')
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

        const {board, __} = this
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
        const {__} = this
        const {analyzer} = this.board
        if (value.toLowerCase() === 'q') {
            return true
        }
        if (value === 'b') {
            if (!analyzer.hasBar(White) && !analyzer.hasBar(Red)) {
                return __('alerts.noPieceOnBar')
            }
            return true
        }
        if (value === 'h') {
            if (!analyzer.piecesHome(White) && !analyzer.piecesHome(Red)) {
                return __('alerts.noPieceOnHome')
            }
            return true
        }
        const point = parseInt(value)
        if (isNaN(point) || point < 1 || point > 24) {
            return __('alerts.invalidPoint')
        }
        const origin = PointOrigins[this.persp][point]
        return (
            Boolean(analyzer.originOccupier(origin)) ||
            __('alerts.noPieceOnPoint{point}', {point})
        )
    }

    validatePlaceTo(value, answers) {
        const {__} = this
        const {analyzer} = this.board
        if (value === 'b' || value === 'h' || value.toLowerCase() === 'q') {
            return true
        }
        const point = parseInt(value)
        if (isNaN(point) || point < 1 || point > 24) {
            return __('alerts.invalidPoint')
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
        return (
            !occupier ||
            occupier === color ||
            __('alerts.pointOccupiedByColor{point,color}', {
                color: __(`play.color.${occupier}`),
                point,
            })
        )
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

    ccolor(color, str = null) {
        if (str === null) {
            str = color
        }
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
        const {logger, __} = this
        if (!this.opts.recordDir) {
            logger.warn(__('alerts.noRecordDirSet'))
            return false
        }
        this.lastOutDir = null
        if (!this.fetchLastRecords) {
            logger.info(__('alerts.noResultToSave'))
            return false
        }
        const subDir = 'labs'
        const prefix = 'lab-' + fileDateString()
        const outDir = path.resolve(this.opts.recordDir, subDir, prefix)
        logger.info(__('alerts.savingTo{path}', {path: homeTilde(outDir)}))
        await fse.ensureDir(outDir)
        const records = await this.fetchLastRecords()
        this.fetchLastRecords = null
        for (const [basename, data] of Object.entries(records)) {
            const file = path.resolve(outDir, path.basename(basename))
            fs.writeFileSync(file, data)
            logger.info('   ', basename)
        }
        const lab = {
            date    : new Date,
            version : Version,
            board   : this.boardInfo(),
        }
        const basename = 'lab.json'
        const labFile = path.resolve(outDir, basename)
        await fse.writeJson(labFile, lab, {spaces: 2})
        logger.info('   ', basename)
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

    commandHelp() {
        const {__} = this
        const helps = {
            'i' : __('lab.commandHelp.boardInfo'),
            's' : __('lab.commandHelp.setBoardState'),
            'd' : __('lab.commandHelp.showMovesForDice'),
            'D' : __('lab.commandHelp.showRobotInfoForDice'),
            'f' : __('lab.commandHelp.flipPerspective'),
            'F' : __('lab.commandHelp.invertBoard'),
            'p' : __('lab.commandHelp.placePiece'),
            'r' : __('lab.commandHelp.rollout'),
            'u' : __('lab.commandHelp.undoMove'),
            'w' : __('lab.commandHelp.writeLastResults'),
            'x' : __('lab.commandHelp.toggleTreeMode'),
            '?' : __('lab.commandHelp.commandHelp'),
        }
        const b = new StringBuilder(
            __('lab.title.commands') + ':',
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