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

const chalk      = require('chalk')
const inquirer   = require('inquirer')
const Core       = require('../lib/core')
const Logger     = require('../lib/logger')
const Util       = require('../lib/util')
const sp         = Util.joinSpace
const {intRange} = Util

const {Red, White, Opponent, ColorAbbr, ColorNorm, OriginPoints, PointOrigins, BoardStrings} = Constants

const {Board, Dice, Turn} = Core

const Shorts = {
    Red   : chalk.bold.red('R')
  , White : chalk.bold.white('W')
  , R     : chalk.bold.red('R')
  , W     : chalk.bold.white('W')
}

const ChalkColorFor = {
    Red   : 'red'
 ,  White : 'white'
}

const Chars = {
    topLeft      : '\u250f'
  , topMid       : '\u2533'
  , topRight     : '\u2513'
  , midLeft      : ''  // TODO
  , sep          : '\u2503'
  , dblSep       : '\u2503\u2503'
  , midRight     : ''  // TODO
  , botLeft      : '\u2517'
  , botMiddle    : '\u253b'
  , botRight     : '\u251b'
  , dash         : '\u2501'
  , pip          : 'PIP'
  , crawford     : 'CR'
  , pts          : 'pts'
  , empty        : ''
  , slash        : '/'
  , sp           : ' '
  , dblSp        : '  '
  , br           : '\n'
  , die          :  {
        1  : '\u2680'
      , 2  : '\u2681'
      , 3  : '\u2682'
      , 4  : '\u2683'
      , 5  : '\u2684'
      , 6  : '\u2685'
    }
}

const PadFixed = 4
const MidFixed = 1
const RightFixed = 10

const TopBorder = Chars.topLeft.padEnd(12 * PadFixed + 2 + 4, Chars.dash) + Chars.topRight
const BottomBorder = Chars.botLeft.padEnd(12 * PadFixed + 2 + 4, Chars.dash) + Chars.botRight

const TopPoints = intRange(13, 24)
const BottomPoints = intRange(1, 12).reverse()

function grey(...args) {
    return chalk.grey(...args)
}
function ccolor(color) {
    return chalk.bold[ChalkColorFor[color]](color)
}
// the string for the piece color, if any
function pieceStr(color) {
    const c = ColorAbbr[color] || ''
    var str = c.padStart(PadFixed, Chars.sp)
    if (color) {
        str = chalk.bold[ChalkColorFor[color]](str)
    }
    return str
}

function barRowStr(color, count) {
    var str = Chars.sep.padEnd(6 * PadFixed + 1, Chars.sp)
    if (count) {
        str += sp(Chars.sp, Shorts[color], grey(count))
    } else {
        str += grey(Chars.sp, Chars.dblSep + Chars.sp)
    }
    str += nchars(6 * PadFixed, Chars.sp) + Chars.sep
    return str
}

function homeCountStr(color, count) {
    var str = '  '
    if (count) {
        str += sp(Shorts[color], grey(count))
    }
    return str
}

function overflowStr(count) {
    var str = count > 6 ? '' + count : Chars.empty
    str = grey(str.padStart(PadFixed, Chars.sp))
    return str
}

function nchars(n, char) {
    return Chars.empty.padEnd(n, char)
}

function cubePartStr(partIndex, cubeValue, isCrawford) {
    var cubeStr = ''
    switch (partIndex) {
        case 0:
            cubeStr = cat(Chars.topLeft, nchars(3, Chars.dash), Chars.topRight)
            break
        case 1:
            cubeStr = (Chars.sep + Chars.sp + (isCrawford ? Chars.crawford : cubeValue)).padEnd(4, Chars.sp) + Chars.sep
            break
        case 2:
            cubeStr = cat(Chars.botLeft, nchars(3, Chars.dash), Chars.botRight)
            break
    }
    if (cubeStr && isCrawford) {
        cubeStr = grey(cubeStr)
    }
    return cat(Chars.sp, cubeStr)
}

function pipCountStr(count) {
    return cat(Chars.sp, chalk.bold.grey(count), Chars.sp, grey(Chars.pip))
}

function matchScoreStr(score, total) {
    return cat(Chars.sp, score, Chars.slash, total, Chars.pts)
}

function numbers(points) {
    var str = Chars.sp
    points.forEach((point, i) => {
        str += point.toString().padStart(PadFixed, Chars.sp)
        if (i == 5) {
            str += nchars(4, Chars.sp)
        }
    })
    return str
}

function cat(...args) {
    return args.join(Chars.empty)
}

function len(str) {
    return Util.stripAnsi(str).length
}

class DrawHelper {

    constructor(opts) {
        opts = opts || {}
        this.board = opts.board || (opts.match && opts.match.thisGame && opts.match.thisGame.board) || (opts.game && opts.game.board)
        this.persp = opts.persp
        this.logs = []
        this.stateHistory = []
        this.logger = new Logger
        this.opts = opts
    }

    draw(isPrint) {
        const output = this.constructor.drawBoard(this.game || this.board, this.match, this.persp, this.logs)
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
                    this.logs.push('Change to', ccolor(this.persp))
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
        const arr = [
            'Commands:'
          , '---------'
        ]
        Object.entries(helps).forEach(it => arr.push(sp(it[0] + ':', it[1])))
        return arr.join('\n')
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
            const srch = Object.keys(BoardStrings).find(it => name.toLowerCase() == it.toLowerCase())
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
                if (value.toLowerCase() == 'q' || !value.length) {
                    return true
                }
                if (getBuiltIn(value)) {
                    value = getBuiltIn(value)
                }
                try {
                    Board.fromStateString(value).analyzer.validateLegalBoard()
                } catch (err) {
                    return sp(err.name, ':', err.message)
                }
                return true
            }
        })
        if (answers.state.toLowerCase() == 'q' || !answers.state.length) {
            return
        }

        if (getBuiltIn(answers.state)) {
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
        //const series = Object.values(turn.endStatesToSeries)
        const series = turn.builder.leaves.map(node => node.moveSeries())
        const {builder} = turn
        const info = {
            dice      : dice
          , series    : series.length
          , maxDepth  : builder.maxDepth
          , highFace  : builder.highestFace
          , hasWinner : builder.result.hasWinner
        }

        const hr = nchars(60, '-')
        cons.log(hr)
        cons.log(info)
        cons.log('  Move Series:')
        series.forEach((moves, i) => cons.log('   ', (i+1) + ':', moves.map(moveDesc)))
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
            desc.push(sp(ccolor(piece.color), 'bar'))
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

        const logsRev = (logs || []).slice(0).reverse()
        persp = persp || White
        const opersp = Opponent[persp]

        if (gameOrBoard.constructor.name == 'Game') {
            var game = gameOrBoard
            var {board, cubeOwner, cubeValue} = game
            var {isCrawford} = game.opts
        } else {
            var game = null
            var board = gameOrBoard
            var cubeOwner = null
            var cubeValue = null
            var isCrawford = null
        }
        const {analyzer} = board
        const pipCounts = analyzer.pipCounts()
        const pointStats = {}
        intRange(1, 24).forEach(point =>
            pointStats[point] = analyzer.statPoint(persp, point)
        )

        const builder = []

        var logIndex = 18

        function wr(...args) {
            builder.push(sp(...args))
        }

        function sideLog(pad) {
            const n = logIndex--
            if (!logsRev[n]) {
                return Chars.empty
            }
            return cat(nchars(pad, Chars.sp), logsRev[n])
        }

        function writePieceRow(depth, points, cubePartIndex, sectionOwner) {

            function afterRowString() {
                switch (depth) {
                    case 0:
                        // Home
                        return homeCountStr(sectionOwner, analyzer.piecesHome(sectionOwner))
                    case 1:
                        // PIP
                        return pipCountStr(pipCounts[sectionOwner])
                    case 2:
                        // Match score
                        if (match) {
                            return matchScoreStr(match.scores[sectionOwner], match.total)
                        }
                        return ''
                    default:
                        // Cube part
                        if (cubeValue && cubeOwner == sectionOwner) {
                            return cubePartStr(cubePartIndex, cubeValue, isCrawford)
                        }
                        return ''
                }
            }

            wr(Chars.sep)
            points.forEach((point, i) => {                
                const {color, count} = pointStats[point]
                wr(pieceStr(count > depth && color))
                if (i == 5) {
                    wr(grey(Chars.sp, Chars.dblSep))
                }
            })
            wr(cat(Chars.sp, Chars.sep))

            const afterStr = afterRowString()
            var pad = RightFixed - len(afterStr)
            wr(afterStr)

            wr(sideLog(pad))
            wr(Chars.br)
        }

        function writeOverflowRow(points) {
            wr(Chars.sep)
            points.forEach((point, i) => {
                const {count} = pointStats[point]
                wr(overflowStr(count))
                if (i == 5) {
                    wr(grey(Chars.sp, Chars.dblSep))
                }
            })
            wr(cat(Chars.sp, Chars.sep))
            wr(sideLog(RightFixed))
            wr(Chars.br)
        }

        function writeMiddleRow() {
            wr(Chars.sep.padEnd(6 * PadFixed + 1, Chars.sp))
            wr(chalk.grey(Chars.sp, Chars.dblSep))
            wr(nchars(6 * PadFixed + 1, Chars.sp) + Chars.sep)
            var pad = RightFixed
            if (cubeValue && !cubeOwner) {
                const cubeStr = cubePartStr(1, cubeValue, isCrawford)
                pad -= len(cubeStr)
                wr(cubeStr)
            }
            wr(sideLog(pad))
            wr(Chars.br)
        }

        function writeBorderRow(border) {
            wr(border)
            wr(sideLog(RightFixed))
            wr(Chars.br)
        }

        function writeBarRow(color, cubePartIndex) {
            const count = analyzer.piecesOnBar(color)
            wr(barRowStr(color, count))
            var pad = RightFixed
            if (cubeValue && !cubeOwner) {
                const cubeStr = cubePartStr(cubePartIndex, cubeValue, isCrawford)
                pad -= len(cubeStr)
                wr(cubeStr)
            }
            wr(sideLog(pad))
            wr(Chars.br)
        }

        function writeNumbersRow(points) {
            wr(numbers(points))
            wr(Chars.br)
        }

        wr(Chars.br)

        // Top point numbers
        writeNumbersRow(TopPoints)

        // Top border
        writeBorderRow(TopBorder)

        // Top piece rows
        for (var d = 0; d < 6; d++) {
            writePieceRow(d, TopPoints, d - 3, opersp)
        }

        // Top overflow row
        writeOverflowRow(TopPoints)

        // Bar row
        writeBarRow(persp, 0)

        // Between bars blank row
        writeMiddleRow()

        // Bar row
        writeBarRow(opersp, 2)

        // Bottom overflow row
        writeOverflowRow(BottomPoints)

        // Bottom piece rows
        for (var d = 5; d >= 0; d--) {
            writePieceRow(d, BottomPoints, 5 - d, persp)
        }

        // Bottom border
        writeBorderRow(BottomBorder)

        // Bottom point numbers
        writeNumbersRow(BottomPoints)

        wr(Chars.br)

        return builder.join('')
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }
}

module.exports = DrawHelper