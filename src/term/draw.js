/**
 * gameon - Terminal Draw class
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
const {Red, White, Opponent, ColorAbbr} = require('../lib/core')

const chalk      = require('chalk')
const Util       = require('../lib/util')
const sp         = Util.joinSpace
const {intRange} = Util

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

class Draw {

    static drawBoard(game, match, persp, logs) {

        const logsRev = (logs || []).slice(0).reverse()
        persp = persp || White
        const opersp = Opponent[persp]

        const {board, cubeOwner, cubeValue} = game
        const {analyzer} = board
        const pipCounts = analyzer.pipCounts()
        const {isCrawford} = game.opts
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
}

module.exports = Draw