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

const chalk    = require('chalk')
const inquirer = require('inquirer')
const Core     = require('../lib/core')
const Logger   = require('../lib/logger')
const Robot    = require('../robot/player')
const Util     = require('../lib/util')
const sp       = Util.joinSpace

const {RobotDelegator} = Robot
const {StringBuilder}  = Util

const {
    Chars
  , ChalkColorFor
  , BottomBorder
  , PadFixed
  , MidFixed
  , RightFixed
  , Shorts
  , TopBorder
} = Constants.Draw

const {
    BoardStrings
  , BottomPoints
  , ColorAbbr
  , ColorNorm
  , Opponent
  , OriginPoints
  , PointOrigins
  , Red
  , TopPoints
  , White
} = Constants

const {
    Board
  , Dice
  , Turn
} = Core

class DrawHelper {

    constructor(opts) {
        opts = opts || {}
        this.board = opts.board
        this.persp = opts.persp
        this.logs = []
        this.stateHistory = []
        this.logger = new Logger
        this.opts = opts
        this.robot = RobotDelegator.forDefaults()
    }

    draw(isPrint) {
        const output = this.constructor.drawBoard(this.board, null, this.persp, this.logs)
        if (isPrint) {
            this.logger.writeStdout(output)
        }
        return output
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
                    await this.setStateCommand()
                    this.draw(true)
                    break
                case 'd':
                    await this.diceCommand(params.join(' '))
                    break
                case 'f':
                    this.persp = Opponent[this.persp]
                    this.logs.push('Change to', this.ccolor(this.persp))
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
        Object.entries(helps).forEach(it => b.sp(it[0] + ':', it[1]))
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

    async setStateCommand() {
        const {board} = this

        const getBuiltIn = name => {
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

        const answers = await this.prompt({
            name     : 'state'
          , type     : 'input'
          , message  : 'State string'
          , default  : () => board.stateString()
          , validate : value => {
              if (!value) {
                  return true
              }
              const valueLc = value.toLowerCase()
                if (valueLc == 'q' || valueLc == 'i') {
                    return true
                }
                if (getBuiltIn(value)) {
                    value = getBuiltIn(value)
                }
                try {
                    Board.fromStateString(value).analyzer.validateLegalBoard()
                } catch (err) {
                    return [err.name, ':', err.message].join(' ')
                }
                return true
            }
        })
        const valueLc = answers.state.toLowerCase()
        if (valueLc == 'q' || !answers.state.length) {
            return
        }
        if (valueLc == 'i') {
            var newState = BoardStrings.Initial
        } else if (getBuiltIn(answers.state)) {
            var newState = getBuiltIn(answers.state)
        } else {
            var newState = answers.state
        }

        newState = Board.fromStateString(newState).state28()
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

    async diceCommand(input) {
        const cons = this.logger.console
        const parseInput = value => value.split(',').map(it => parseInt(it.trim()))
        const checkDice = dice => {
            try {
                Dice.checkTwo(dice)
            } catch (err) {
                return err.message
            }
            return true
        }
        const answers = await this.prompt({
            message  : 'Dice'
          , type     : 'input'
          , name     : 'dice'
          , validate : value => checkDice(parseInput(value))
          , when     : () => !input || checkDice(parseInput(input)) !== true
        })
        input = input || answers.dice
        const dice = parseInput(input)

        const {board} = this
        const turn = new Turn(board, this.persp, this.opts).setRoll(dice)

        if (turn.isCantMove) {
            cons.log('No moves for', this.persp, 'with', dice.join())
            return
        }

        const moveDesc = move => {
            const parts = []
            if (move.origin == -1) {
                var startPoint = 25
                parts.push('bar')
            } else {
                var startPoint = OriginPoints[this.persp][move.origin]
                parts.push(startPoint)
            }
            var destPoint = startPoint - move.face
            if (destPoint < 1) {
                destPoint = 'home'
            }
            parts.push(destPoint)
            parts.push('[' + move.face + ']')
            return parts.join(':')
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

        const robotMoves = await this.robot.getMoves(turn)
        const hr = this.nchars(60, '-')
        cons.log(hr)
        cons.log(info)
        cons.log('  Move Series:')
        series.forEach((moves, i) => cons.log('   ', (i+1) + ':', moves.map(moveDesc)))
        if (robotMoves.length) {
            cons.log('  Robot Choice:')
            cons.log('   ', robotMoves.map(moveDesc))
        }

        //cons.log(turn.allowedMoveIndex)
        cons.log(hr)
        
    }

    async placeCommand(input) {
        const {board} = this
        const {analyzer} = board
        const answers = await this.prompt([
            {
                message  : 'From, point, (b)ar, or (h)ome'
              , name     : 'from'
              , type     : 'input'
              , validate : value => {
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
              , when     : answers => answers.from.toLowerCase() != 'q' && (!answers.color || answers.color.toLowerCase() != 'q')
              , validate : (value, answers) => {
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
            }
        ])

        if (answers.from.toLowerCase() == 'q') {
            return
        }
        if (answers.color && answers.color.toLowerCase() == 'q') {
            return
        }
        if (answers.dest.toLowerCase() == 'q') {
            return
        }

        var piece

        const desc = ['Place']

        this.stateHistory.push(board.state28())
        if (answers.from == 'b') {
            if (analyzer.hasBar(White) && analyzer.hasBar(Red)) {
                var color = ColorNorm[answers.color.toUpperCase()]
            } else {
                var color = analyzer.hasBar(White) ? White : Red
            }
            piece = board.popBar(color)
            desc.push(sp(this.ccolor(piece.color), 'bar'))
        } else if (answers.from == 'h') {
            if (analyzer.piecesHome(White) && analyzer.piecesHome(Red)) {
                var color = ColorNorm[answers.color.toUpperCase()]
            } else {
                var color = analyzer.piecesHome(White) ? White : Red
            }
            piece = board.popHome(color)
            desc.push(sp(piece.color, 'home'))
        } else {
            var fromPoint = parseInt(answers.from)
            var fromOrigin = PointOrigins[this.persp][fromPoint]
            piece = board.popOrigin(fromOrigin)
            desc.push(sp(piece.color, fromPoint))
        }
        desc.push(':')
        if (answers.dest == 'b') {
            board.pushBar(piece.color, piece)
            desc.push('bar')
        } else if (answers.dest == 'h') {
            board.pushHome(piece.color, piece)
            desc.push('home')
        } else {
            const destPoint = parseInt(answers.dest)
            const destOrigin = PointOrigins[this.persp][destPoint]
            board.pushOrigin(destOrigin, piece)
            desc.push(destPoint)
        }
        this.logs.push(desc.join(' '))
    }

    static drawBoard(gameOrBoard, match, persp, logs) {

        if (!persp) {
            persp = White
        }

        const opersp = Opponent[persp]

        if (gameOrBoard.constructor.name == 'Game') {
            var game = gameOrBoard
            var board = game.board
        } else {
            var game = null
            var board = gameOrBoard
        }

        const inst = new DrawInstance(board, game, match, persp, logs)

        const b = new StringBuilder

        b.add(Chars.br)

        b.add(
            // Top point numbers
            inst.numbersRow(TopPoints)
            // Top border
          , inst.borderRow(TopBorder)
        )

        // Top piece rows
        for (var d = 0; d < 6; d++) {
            b.add(inst.pieceRow(d, TopPoints, d - 3, opersp))
        }

        b.add(
            // Top overflow row
            inst.overflowRow(TopPoints)
            // Bar row
          , inst.barRow(persp, 0)
            // Between bars blank row
          , inst.middleRow()
            // Bar row
          , inst.barRow(opersp, 2)
            // Bottom overflow row
          , inst.overflowRow(BottomPoints)
        )

        // Bottom piece rows
        for (var d = 5; d >= 0; d--) {
            b.add(inst.pieceRow(d, BottomPoints, 5 - d, persp))
        }

        b.add(
            // Bottom border
            inst.borderRow(BottomBorder)
            // Bottom point numbers
          , inst.numbersRow(BottomPoints)
        )

        b.add(Chars.br)

        return b.toString()
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    ccolor(color) {
        return chalk.bold[ChalkColorFor[color]](color)
    }
}

class DrawInstance {

    constructor(board, game, match, persp, logs) {
        this.board = board
        this.game = game
        this.match = match
        this.persp = persp
        this.logs = logs
        if (this.game) {
            this.cubeOwner  = this.game.cubeOwner
            this.cubeValue  = this.game.cubeValue
            this.isCrawford = this.game.opts.isCrawford
        }
        this.analyzer = this.board.analyzer
        this.pipCounts = this.analyzer.pipCounts()
        this.pointStats = {}
        for (var point = 1; point < 25; ++point) {
            this.pointStats[point] = this.analyzer.statPoint(this.persp, point)
        }
        this.logIndex = 18
        this.logsRev = (this.logs || []).slice(0).reverse()
    }

    pieceRow(depth, points, cubePartIndex, sectionOwner) {

        const afterRowString = () => {
            switch (depth) {
                case 0:
                    // Home
                    return this.homeCountStr(sectionOwner, this.analyzer.piecesHome(sectionOwner))
                case 1:
                    // PIP
                    return this.pipCountStr(this.pipCounts[sectionOwner])
                case 2:
                    // Match score
                    if (this.match) {
                        return this.matchScoreStr(this.match.scores[sectionOwner], this.match.total)
                    }
                    return ''
                default:
                    // Cube part
                    if (this.cubeValue && this.cubeOwner == sectionOwner) {
                        return this.cubePartStr(cubePartIndex, this.cubeValue, this.isCrawford)
                    }
                    return ''
            }
        }

        const b = new StringBuilder(Chars.sep)

        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color))
            if (i == 5) {
                b.add(chalk.grey(Chars.sp, Chars.dblSep))
            }
        })
        b.add(Chars.sp, Chars.sep)

        const afterStr = afterRowString()
        var pad = RightFixed - this.len(afterStr)
        b.add(afterStr, this.sideLog(pad), Chars.br)

        return b
    }

    sideLog(pad) {
        const n = this.logIndex--
        if (!this.logsRev[n]) {
            return Chars.empty
        }
        return new StringBuilder(this.nchars(pad, Chars.sp), this.logsRev[n])
    }

    overflowRow(points) {
        const b = new StringBuilder(Chars.sep)
        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count))
            if (i == 5) {
                b.add(chalk.grey(Chars.sp, Chars.dblSep))
            }
        })
        b.add(Chars.sp, Chars.sep)
        b.add(this.sideLog(RightFixed))
        b.add(Chars.br)
        return b
    }

    middleRow() {
        const b = new StringBuilder(Chars.sep.padEnd(6 * PadFixed + 1, Chars.sp))
        b.add(chalk.grey(Chars.sp, Chars.dblSep))
        b.add(this.nchars(6 * PadFixed + 1, Chars.sp), Chars.sep)
        var pad = RightFixed
        if (this.cubeValue && !this.cubeOwner) {
            const cubeStr = this.cubePartStr(1, this.cubeValue, this.isCrawford)
            pad -= this.len(cubeStr)
            b.add(cubeStr)
        }
        b.add(this.sideLog(pad))
        b.add(Chars.br)
        return b
    }

    borderRow(border) {
        return new StringBuilder(border, this.sideLog(RightFixed), Chars.br)
    }

    barRow(color, cubePartIndex) {
        const b = new StringBuilder
        const count = this.analyzer.piecesOnBar(color)
        b.add(this.barRowStr(color, count))
        var pad = RightFixed
        if (this.cubeValue && !this.cubeOwner) {
            const cubeStr = this.cubePartStr(cubePartIndex, this.cubeValue, this.isCrawford)
            pad -= this.len(cubeStr)
            b.add(cubeStr)
        }
        b.add(this.sideLog(pad), Chars.br)
        return b
    }

    numbersRow(points) {
        return new StringBuilder(this.numbers(points), Chars.br)
    }

    // the string for the piece color, if any
    pieceStr(color) {
        const c = ColorAbbr[color] || ''
        var str = c.padStart(PadFixed, Chars.sp)
        if (color) {
            str = chalk.bold[ChalkColorFor[color]](str)
        }
        return str
    }

    barRowStr(color, count) {
        const b = new StringBuilder()
        b.add(Chars.sep.padEnd(6 * PadFixed + 1, Chars.sp))
        if (count) {
            b.sp(Chars.sp, Shorts[color], chalk.grey(count))
        } else {
            b.add(chalk.grey(Chars.sp, Chars.dblSep + Chars.sp))
        }
        b.add(this.nchars(6 * PadFixed, Chars.sp), Chars.sep)
        return b
    }

    homeCountStr(color, count) {
        var str = '  '
        if (count) {
            str += sp(Shorts[color], chalk.grey(count))
        }
        return str
    }

    overflowStr(count) {
        var str = count > 6 ? '' + count : Chars.empty
        str = chalk.grey(str.padStart(PadFixed, Chars.sp))
        return str
    }

    nchars(n, char) {
        return Chars.empty.padEnd(n, char)
    }

    cubePartStr(partIndex, cubeValue, isCrawford) {
        const b = new StringBuilder()
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
            b.replace(chalk.grey(b.toString()))
        }
        return Chars.sp + b.toString()
    }

    pipCountStr(count) {
        return new StringBuilder(Chars.sp, chalk.bold.grey(count), Chars.sp, chalk.grey(Chars.pip))
    }

    matchScoreStr(score, total) {
        return new StringBuilder(Chars.sp, score, Chars.slash, total, Chars.pts)
    }

    numbers(points) {
        const b = new StringBuilder(Chars.sp)
        points.forEach((point, i) => {
            b.add(point.toString().padStart(PadFixed, Chars.sp))
            if (i == 5) {
                b.add(this.nchars(4, Chars.sp))
            }
        })
        return b
    }

    len(str) {
        return Util.stripAnsi(str.toString()).length
    }
}

module.exports = DrawHelper