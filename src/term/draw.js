/**
 * gameon - Terminal Draw Helper class
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
const Logger      = require('../lib/logger')
const Robot       = require('../robot/player')
const Util        = require('../lib/util')
const sp          = Util.joinSpace

const {RobotDelegator} = Robot
const {StringBuilder}  = Util

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

const {
    Chars
//  , ChalkColorFor
//  , BottomBorder
  , PadFixed
  , MidFixed
//  , TopBorder
} = Constants.Draw

class DrawHelper {

    constructor(opts = {}) {

        this.board  = opts.board
        this.persp  = opts.persp
        this.opts   = opts
        this.logs   = []
        this.logger = new Logger
        this.inst = DrawInstance.forBoard(this.board, this.persp, this.logs)
        this.stateHistory = []
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

            switch (cmdLc) {

                case 'i':
                    this.logger.console.log(this.boardInfo())
                    break

                case 's':
                    await this.setStateCommand(params.join(' ').trim())
                    this.draw(true)
                    break

                case 'd':
                    await this.diceCommand(params.join(' '))
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

    async diceCommand(param) {

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

        const robot = RobotDelegator.forDefaults(turn.color)

        var robotMoves
        try {
            robotMoves = await robot.getMoves(turn)
        } finally {
            await robot.destroy()
        }

        const hr = this.nchars(60, '-')

        cons.log(hr)
        cons.log(info)
        cons.log('  Move Series:')
        series.forEach((moves, i) =>
            cons.log('   ', (i+1) + ':', moves.map(move => this.moveDesc(move)))
        )
        if (robotMoves.length) {
            cons.log('  Robot Choice:')
            cons.log('   ', robotMoves.map(move => this.moveDesc(move)))
        }

        //cons.log(turn.allowedMoveIndex)
        cons.log(hr)
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

    moveDesc(move) {

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
        b.add('[' + move.face + ']')

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
        const {chalks} = this.inst.painter
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

    /*
    static drawBoard(gameOrBoard, match, persp, logs) {

        if (!persp) {
            persp = White
        }

        if (gameOrBoard.constructor.name == 'Game') {
            var game = gameOrBoard
            var board = game.board
        } else {
            var game = null
            var board = gameOrBoard
        }

        const inst = new DrawInstance(board, game, match, persp, logs)

        return inst.getString()
    }
    */
}

class Painter {

    setChalks(chalks) {
        this.chalks = chalks
        this.induce()
    }

    induce() {
        this.chalks.centerStripe  = this.chalks.boardBorder
        this.chalks.pipCount      = this.chalks.dimCount.bold
        this.chalks.homeCount     = this.chalks.dimCount
        this.chalks.barCount      = this.chalks.dimCount
        this.chalks.overflowCount = this.chalks.dimCount
        this.chalks.gameEnd       = this.chalks.gameStart
        this.chalks.matchEnd      = this.chalks.gameEnd.bold
    }
}

class DefaultPainter extends Painter {

    constructor() {
        super()
        this.setChalks({
            boardBorder  : chalk.white
          , bold         : chalk.bold
          , cantMove     : chalk.yellow
          , cubeDisabled : chalk.grey
          , diceRolled   : chalk.magenta
          , dim          : chalk.grey
          , dimCount     : chalk.grey
          , forceMove    : chalk.bold.yellow
          , gameStart    : chalk.cyan
          , hit          : chalk.bold.yellow
          , hr           : chalk.grey
          , pipLabel     : chalk.grey
          , pointLabel   : chalk.white
          , piece : {
                Red   : chalk.red.bold
              , White : chalk.white.bold
            }
        })
    }
}

class Painter2 extends DefaultPainter {
    constructor() {
        super()
        this.chalks = {
            ...this.chalks
          , boardBorder : chalk.dim.red
          , pointLabel  : chalk.bgRedBright
          , piece : {
                Red   : chalk.keyword('orange').bold
              , White : chalk.hex('#0080ff').bold
            }
        }
        this.induce()
    }
}

class DrawInstance {

    static forBoard(board, persp, logs) {
        return new DrawInstance(board, null, null, persp, logs)
    }

    static forGame(game, match, persp, logs) {
        return new DrawInstance(game.board, game, match, persp, logs)
    }

    static forColor(color, logs) {
        
    }

    constructor(board, game, match, persp, logs) {
        this.board = board
        this.game  = game
        this.match = match
        this.persp = persp || White
        this.logs  = logs || []
        this.logger = new Logger
        this.boardWidth = 55
        this.afterBoardWidth = 10
        this.painter = new Painter2//DefaultPainter
        this.reporter = new Reporter(this)
        this.TopBorder   = new StringBuilder(
            Chars.topLeft
          , this.nchars(this.boardWidth - 1, Chars.dash)
          , Chars.topRight
        )
        this.BottomBorder = new StringBuilder(
            Chars.botLeft
          , this.nchars(this.boardWidth - 1, Chars.dash)
          , Chars.botRight
        )
    }

    getString() {

        this.reload()

        const b = new StringBuilder

        b.add(
            Chars.br
            // Top point numbers
          , this.numbersRow(TopPoints)
            // Top border
          , this.borderRow(this.TopBorder)
        )

        // Top piece rows
        for (var depth = 0; depth < 6; ++depth) {
            var cubePart = depth - 3
            b.add(
                this.pieceRow(depth, TopPoints, cubePart, this.opersp)
            )
        }

        b.add(
            // Top overflow row
            this.overflowRow(TopPoints)
            // Bar row
          , this.barRow(this.persp, 0)
            // Between bars blank row
          , this.middleRow()
            // Bar row
          , this.barRow(this.opersp, 2)
            // Bottom overflow row
          , this.overflowRow(BottomPoints)
        )

        // Bottom piece rows
        for (var depth = 5; depth >= 0; --depth) {
            var cubePart = 5 - depth
            b.add(
                this.pieceRow(depth, BottomPoints, cubePart, this.persp)
            )
        }

        b.add(
            // Bottom border
            this.borderRow(this.BottomBorder)
            // Bottom point numbers
          , this.numbersRow(BottomPoints)
          , Chars.br
        )

        return b.toString()
    }

    reload() {

        const {analyzer} = this.board
        this.opersp = Opponent[this.persp]

        this.columns     = Math.max(this.logger.getStdout().columns, 0)
        this.maxLogWidth = Math.max(0, this.columns - this.boardWidth - this.afterBoardWidth - 1)

        this.pipCounts = analyzer.pipCounts()

        this.pointStats  = {}
        this.barCounts   = {}
        this.homeCounts  = {}
        this.matchScores = {}

        for (var point = 1; point < 25; ++point) {
            this.pointStats[point] = analyzer.statPoint(this.persp, point)
        }

        for (var color in Colors) {
            this.barCounts[color]  = analyzer.piecesOnBar(color)
            this.homeCounts[color] = analyzer.piecesHome(color)
            if (this.match) {
                this.matchScores[color] = this.match.scores[color]
            }
        }

        if (this.match) {
            this.matchTotal = this.match.total
        }

        if (this.game) {
            this.cubeOwner  = this.game.cubeOwner
            this.cubeValue  = this.game.cubeValue
            this.isCrawford = this.game.opts.isCrawford
        }

        this.logIndex = 18
    }

    numbersRow(points) {
        return new StringBuilder(this.numbers(points), Chars.br)
    }

    borderRow(border) {
        const b = new StringBuilder
        const {chalks} = this.painter
        b.add(
            chalks.boardBorder(border)
          , this.sideLog(this.afterBoardWidth)
          , Chars.br
        )
        return b
    }

    pieceRow(depth, points, cubePart, owner) {

        const b = new StringBuilder

        const {chalks} = this.painter

        b.add(chalks.boardBorder(Chars.sep))

        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color))
            if (i == 5) {
                b.sp(Chars.sp, chalks.centerStripe(Chars.dblSep))
            }
        })
        b.add(Chars.sp, Chars.sp)

        b.add(chalks.boardBorder(Chars.sep))

        const afterStr = this.afterRowString(depth, cubePart, owner)

        const pad = this.afterBoardWidth - this.len(afterStr)

        b.add(afterStr, this.sideLog(pad), Chars.br)

        return b
    }

    overflowRow(points) {

        const b = new StringBuilder
        const {chalks} = this.painter

        b.add(chalks.boardBorder(Chars.sep))

        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count))
            if (i == 5) {
                b.sp(Chars.sp, chalks.centerStripe(Chars.dblSep))
            }
        })
        b.add(Chars.sp, Chars.sp)

        b.add(chalks.boardBorder(Chars.sep))

        b.add(this.sideLog(this.afterBoardWidth))
        b.add(Chars.br)

        return b
    }

    middleRow() {

        const b = new StringBuilder
        const {chalks} = this.painter

        b.add(
            chalks.boardBorder(Chars.sep)
          , this.nchars(6 * PadFixed + 2, Chars.sp)
          , chalks.centerStripe(Chars.dblSep)
          , this.nchars(6 * PadFixed + 1, Chars.sp)
          , Chars.sp
          , chalks.boardBorder(Chars.sep)
        )

        var pad = this.afterBoardWidth
        if (this.cubeValue && !this.cubeOwner) {
            const cubeStr = this.cubePartStr(1, this.cubeValue, this.isCrawford)
            pad -= this.len(cubeStr)
            b.add(cubeStr)
        }

        b.add(this.sideLog(pad))

        b.add(Chars.br)

        return b
    }

    barRow(color, cubePart) {

        const b = new StringBuilder

        const count = this.barCounts[color]

        b.add(this.barRowStr(color, count))

        var pad = this.afterBoardWidth
        if (this.cubeValue && !this.cubeOwner) {
            const cubeStr = this.cubePartStr(cubePart, this.cubeValue, this.isCrawford)
            pad -= this.len(cubeStr)
            b.add(cubeStr)
        }

        b.add(this.sideLog(pad))

        b.add(Chars.br)

        return b
    }

    sideLog(pad) {
        const n = this.logIndex--
        if (!this.logs[n]) {
            return Chars.empty
        }
        var message = this.logs[this.logs.length - n - 1]
        if (this.len(message) > this.maxLogWidth) {
            message = Util.stripAnsi(message).substring(0, this.maxLogWidth)
        }

        return new StringBuilder(this.nchars(pad, Chars.sp), message)
    }

    afterRowString(depth, cubePart, owner) {

        switch (depth) {
            case 0:
                // Home
                return this.homeCountStr(owner, this.homeCounts[owner])
            case 1:
                // PIP
                return this.pipCountStr(this.pipCounts[owner])
            case 2:
                // Match score
                if (this.matchTotal) {
                    return this.matchScoreStr(this.matchScores[owner], this.matchTotal)
                }
                return Chars.empty
            default:
                // Cube part
                if (this.cubeValue && this.cubeOwner == owner) {
                    return this.cubePartStr(cubePart, this.cubeValue, this.isCrawford)
                }
                return Chars.empty
        }
    }

    // the string for the piece color, if any
    pieceStr(color) {
        const {chalks} = this.painter
        const c = ColorAbbr[color] || Chars.empty
        var str = c.padStart(PadFixed, Chars.sp)
        if (color) {
            str = chalks.piece[color](str)
        }
        return str
    }

    barRowStr(color, count) {

        const b = new StringBuilder
        const {chalks} = this.painter

        b.add(
            chalks.boardBorder(Chars.sep)
          , this.nchars(6 * PadFixed, Chars.sp)
        )

        if (count) {
            b.sp(Chars.sp, chalks.piece[color](ColorAbbr[color]), chalks.barCount(count))
        } else {
            b.add(Chars.sp, Chars.sp, chalks.centerStripe(Chars.dblSep), Chars.sp)
        }

        b.add(
            this.nchars(6 * PadFixed + 1, Chars.sp)
          , chalks.boardBorder(Chars.sep)
        )

        return b
    }

    homeCountStr(color, count) {

        const b = new StringBuilder
        const {chalks} = this.painter

        b.add(Chars.sp, Chars.sp)

        if (count) {
            b.sp(chalks.piece[color](ColorAbbr[color]), chalks.homeCount(count))
        }

        return b
    }

    overflowStr(count) {

        const b = new StringBuilder
        const {chalks} = this.painter

        const countStr = count > 6 ? '' + count : Chars.empty

        b.add(
            chalks.overflowCount(countStr.padStart(PadFixed, Chars.sp))
        )

        return b
    }

    nchars(n, char) {
        return Chars.empty.padEnd(n, char)
    }

    cubePartStr(partIndex, cubeValue, isCrawford) {

        const b = new StringBuilder
        const {chalks} = this.painter

        switch (partIndex) {
            case 0:
                b.add(Chars.topLeft, this.nchars(3, Chars.dash), Chars.topRight)
                break
            case 1:
                b.add(
                    (Chars.sep + Chars.sp + (isCrawford ? Chars.crawford : cubeValue)).padEnd(4, Chars.sp)
                  , Chars.sep
                )
                break
            case 2:
                b.add(Chars.botLeft, this.nchars(3, Chars.dash), Chars.botRight)
                break
        }

        if (b.length() && isCrawford) {
            b.replace(chalks.cubeDisabled(b.toString()))
        }

        return Chars.sp + b.toString()
    }

    pipCountStr(count) {
        const b = new StringBuilder
        const {chalks} = this.painter
        b.add(Chars.sp, chalks.pipCount(count))
        b.add(Chars.sp, chalks.pipLabel(Chars.pip))
        return b
    }

    matchScoreStr(score, total) {
        return new StringBuilder(
            Chars.sp, score, Chars.slash, total, Chars.pts
        )
    }

    numbers(points) {

        const b = new StringBuilder
        const {chalks} = this.painter

        b.add(chalks.pointLabel(Chars.sp))

        points.forEach((point, i) => {
            b.add(
                chalks.pointLabel(point.toString().padStart(PadFixed, Chars.sp))
            )
            if (i == 5) {
                b.add(chalks.pointLabel(this.nchars(4, Chars.sp)))
            }
        })

        b.add(chalks.pointLabel(Chars.sp))
        b.add(chalks.pointLabel(Chars.sp))

        return b
    }

    len(str) {
        return Util.stripAnsi(str.toString()).length
    }

    report(method, ...args) {
        const res = this.reporter[method](...args)
        this.logs.push(res.toString())
    }
}


class Reporter {

    constructor(inst) {
        this.inst = inst
    }

    gameStart(num) {
        const {chalks} = this.inst.painter
        const b = new StringBuilder
        b.add(
            chalks.gameStart('Starting game')
        )
        if (num) {
            b.add(
                Chars.sp
              , chalks.bold(num)
            )
        }
        return b
    }

    firstRollWinner(color, dice) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.sp(
            chalks.piece[color](color)
          , 'goes first with'
        )
        b.add(Chars.sp)
        b.add(
            chalks.piece.White(dice[0])
          , ','
          , chalks.piece.Red(dice[1])
        )

        return b
    }

    turnStart(color) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.dim('---')
          , Chars.sp
          , chalks.piece[color](color)
          , "'s"
          , Chars.sp
          , 'turn'
        )

        return b
    }

    playerRoll(color, dice) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[color](color)
          , Chars.sp
          , 'rolls'
          , Chars.sp
          , chalks.diceRolled(dice[0])
          , ','
          , chalks.diceRolled(dice[1])
        )

        return b
    }

    cantMove(color) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[color](color)
          , Chars.sp
          , chalks.cantMove('cannot move')
        )

        return b
    }

    forceMove(color, dice) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.forceMove('Forced move')
          , Chars.sp
          , 'for'
          , Chars.sp
          , chalks.piece[color](color)
          , Chars.sp
          , 'with'
          , Chars.sp
          , chalks.diceRolled(dice[0])
          , ','
          , chalks.diceRolled(dice[1])
        )

        return b
    }

    move(move) {
        if (move.isRegular) {
            return this.regularMove(move)
        }
        if (move.isComeIn) {
            return this.comeInMove(move)
        }
        if (move.isBearoff) {
            return this.bearoffMove(move)
        }
    }

    comeInMove({color, face, isHit}) {

        const {persp} = this.inst

        return this._move(
            color
          , 'bar'
          , face
          , isHit
        )
    }

    regularMove({color, origin, face, isHit}) {

        const {persp} = this.inst

        return this._move(
            color
          , OriginPoints[persp][origin]
          , OriginPoints[persp][origin] + face
          , isHit
        )
    }

    bearoffMove({color, origin}) {

        const {persp} = this.inst

        return this._move(
            color
          , OriginPoints[persp][origin]
          , 'home'
        )
    }

    _move(color, from, to, isHit) {

        const {persp} = this.inst
        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[color](color)
          , Chars.sp
          , 'moves'
          , Chars.sp
          , from
          , Chars.sp
          , '>'
          , Chars.sp
          , to
        )

        if (isHit) {
            b.add(
                Chars.sp
              , chalks.hit('HIT')
            )
        }

        return b
    }

    doubleOffered(color) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[color](color)
          , Chars.sp
          , 'doubles'
        )

        return b
    }

    doubleDeclined(color) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[color](color)
          , Chars.sp
          , 'declines the double'
        )

        return b
    }

    gameDoubled(cubeOwner, cubeValue) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[cubeOwner](cubeOwner)
          , Chars.sp
          , 'owns the cube at'
          , Chars.sp
          , cubeValue
          , Chars.sp
          , 'points'
        )

        return b
    }

    gameEnd(winner, finalValue) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[winner](winner)
          , Chars.sp
          , chalks.gameEnd('wins game for')
          , Chars.sp
          , chalks.bold(finalValue)
          , Chars.sp
          , chalks.gameEnd('points')
        )

        return b
    }

    matchEnd(winner, winnerPoints, loserPoints) {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(
            chalks.piece[winner](winner)
          , Chars.sp
          , chalks.matchEnd('wins the match')
          , Chars.sp
          , chalks.bold(winnerPoints)
          , Chars.sp
          , 'to'
          , Chars.sp
          , chalks.bold(loserPoints)
        )

        return b
    }

    hr() {

        const {chalks} = this.inst.painter
        const b = new StringBuilder

        b.add(chalks.hr('-----------'))

        return b
    }
}
DrawInstance.Reporter = Reporter
DrawHelper.DrawInstance = DrawInstance
module.exports = DrawHelper