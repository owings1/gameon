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

function slotRow(slot, d) {
    const short = slot[d] ? slot[d].c : ''
    var str = short.padStart(PadFixed, Chars.sp)
    if (short == ColorAbbr.Red) {
        str = chalk.bold.red(str)
    } else if (short == ColorAbbr.White) {
        str = chalk.bold.white(str)
    }
    return str
}

function barRow(bar) {
    var color = bar[0] && bar[0].color
    var str = Chars.sep.padEnd(6 * PadFixed + 1, Chars.sp)
    if (color) {
        str += sp(Chars.sp, Shorts[color], grey(bar.length))
    } else {
        str += grey(Chars.sp, Chars.dblSep + Chars.sp)
    }
    str += nchars(6 * PadFixed, Chars.sp) + Chars.sep
    return str
}

function homie(home) {
    var str = '  '
    if (home.length) {
        const color = home[0].color
        str += sp(Shorts[color], grey(home.length))
    }
    return str
}

function nchars(n, char) {
    return Chars.empty.padEnd(n, char)
}

function cubePart(partIndex, cubeValue, isCrawford) {
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
    return cubeStr
}

function pipCount(count) {
    return cat(Chars.sp, chalk.bold.grey(count), Chars.sp, grey(Chars.pip))
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
        const pipCounts = board.analyzer.pipCounts()
        const {isCrawford} = game.opts

        const builder = []

        var li = 18

        function wr(...args) {
            builder.push(sp(...args))
        }

        function sideLog(pad) {
            const n = li--
            if (!logsRev[n]) {
                return Chars.empty
            }
            return cat(nchars(pad, Chars.sp), logsRev[n])
        }

        function writePieceRow(depth, points, cubePartIndex, sectionOwner) {
            wr(Chars.sep)
            points.forEach((point, i) => {
                const slot = board.slots[board.analyzer.pointOrigin(persp, point)]
                wr(slotRow(slot, depth))
                if (i == 5) {
                    wr(grey(Chars.sp, Chars.dblSep))
                }
            })
            wr(cat(Chars.sp, Chars.sep))
            var pad = RightFixed
            switch (depth) {
                case 0:
                    // Home
                    const homeStr = homie(board.homes[sectionOwner])
                    pad -= len(homeStr)
                    wr(homeStr)
                    break
                case 1:
                    // PIP
                    const pipStr = pipCount(pipCounts[sectionOwner])
                    pad -= len(pipStr)
                    wr(pipStr)
                    break
                case 2:
                    // Match score
                    if (match) {
                        const scoreStr = cat(Chars.sp, match.scores[sectionOwner], Chars.slash, match.total, Chars.pts)
                        pad -= len(scoreStr)
                        wr(scoreStr)
                    }
                    break
                default:
                    // Cube part
                    if (cubeValue && cubeOwner == sectionOwner) {
                        const cubeStr = cat(Chars.sp, cubePart(cubePartIndex, cubeValue, isCrawford))
                        pad -= len(cubeStr)
                        wr(cubeStr)
                    }
                    break
            }
            wr(sideLog(pad))
            wr(Chars.br)
        }

        function writeOverflowRow(points) {
            wr(Chars.sep)
            points.forEach((point, i) => {
                const slot = board.slots[board.analyzer.pointOrigin(persp, point)]
                const n = slot.length > 6 ? slot.length : Chars.empty
                wr(grey(n.toString().padStart(PadFixed, Chars.sp)))
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
                const cubeStr = cat(Chars.sp, cubePart(1, cubeValue, isCrawford))
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
            wr(barRow(board.bars[color]))
            var pad = RightFixed
            if (cubeValue && !cubeOwner) {
                const cubeStr = cat(Chars.sp, cubePart(cubePartIndex, cubeValue, isCrawford))
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