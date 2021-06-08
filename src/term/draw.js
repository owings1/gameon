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

const {Red, White, Opponent, ColorAbbr, ColorNorm, PointOrigins} = Constants

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
        this.match = opts.match
        this.game = opts.game
        this.board = opts.board || (this.game && this.game.board)
        this.persp = opts.persp
        this.logs = []
        this.stateHistory = []
        this.logger = new Logger
        if (this.board) {
            this.stateHistory.push(this.board.state28())
        }
    }

    draw(isPrint) {
        const output = this.constructor.drawBoard(this.game || this.board, this.match, this.persp, this.logs)
        if (isPrint) {
            this.logger.writeStdout(output)
        }
        return output
    }

    async interactive() {
        while (true) {
            this.draw(true)
            var answers = await this.prompt({
                name    : 'input'
              , message : 'Input'
              , type    : 'input'
            })
            var {input} = answers
            var inputLc = input.toLowerCase()
            if (!input) {
                continue
            }
            if (inputLc == 'q') {
                break
            }
            if (inputLc == '?') {
                this.logger.console.log(this.commandHelp())
                continue
            }
            if (input[0] != '_') {
                try {
                    new Board(input).analyzer.validateLegalBoard()
                } catch (err) {
                    this.logger.error(err.name, ':', err.message)
                    continue
                }
                this.board.setStateString(input)
            }
            switch (inputLc) {
                case '_':
                    this.logger.console.log(this.boardInfo())
                    break
                case '_f':
                    this.persp = Opponent[this.persp]
                    this.logger.info('Perspective changed to', ccolor(this.persp))
                    break
                case '_p':
                    await this.placeCommand()
                    break
                case '_u':
                    await this.undoCommand()
                    break
                case '_d':
                    await this.diceCommand()
                    break
                default:
                    this.logger.warn('Invalid command', input)
                    this.logger.console.log(this.commandHelp())
                    break
            }
        }
    }

    commandHelp() {
        return {
            '_'  : 'board info'
          , '_f' : 'flip perspective'
          , '_p' : 'place piece'
          , '_u' : 'undo move'
          , '_d' : 'show moves for dice'
          , '?'  : 'command help'
        }
    }

    boardInfo() {
        const {board} = this
        return {
            state28     : board.state28()
          , stateString : board.stateString()
        }
    }

    async undoCommand() {
        if (this.stateHistory.length < 2) {
            this.logger.error('Nothing to undo')
            return
        }
        this.board.setStateString(this.stateHistory.pop())
    }

    async diceCommand(input) {
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
          , when     : () => !input || checkDice(input) !== true
        })
        input = input || answers.dice
        const dice = parseInput(input)

        const {board} = this
        const turn = new Turn(board, this.persp).setRoll(dice)

        this.logger.console.log(turn.allowedMoveIndex)
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
                        const fromPoint = parseInt(answers.from)
                        const fromOrigin = PointOrigins[this.persp][fromPoint]
                        var color = analyzer.originOccupier(fromOrigin)
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
        this.stateHistory.push(board.state28())
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