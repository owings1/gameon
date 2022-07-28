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
import Screen from '@quale/core/screen.js'
import {stringWidth, stripAnsi} from '@quale/core/strings.js'

import {Board, Game, Match} from '../lib/core.js'
import {Move} from '../lib/moves.js'
import Player from '../lib/player.js'
import Themes  from './themes.js'
import IntlHelper from '../lib/util/intl.js'
import StringBuilder from '../lib/util/string-builder.js'
import {nchars} from '../lib/util.js'
import {
    BottomPoints,
    Chars,
    ColorAbbr,
    Colors,
    DefaultAnsiEnabled,
    Opponent,
    OriginPoints,
    TopPoints,
    White,
} from '../lib/constants.js'

const DefaultScreen = new Screen({isAnsi: DefaultAnsiEnabled})

export class DrawHelper {

    /**
     * @param {Player} player
     * @return {DrawHelper}
     */
    static forTermPlayer(player) {
        const {persp, logs, theme, screen, intl} = player
        return new DrawHelper({persp, logs, theme, screen, intl})
    }

    /**
     * @param {object} params
     * @param {Game} params.game
     * @param {Board} params.board
     * @param {Match} params.match
     * @param {String} params.persp
     * @param {Array} params.logs
     * @param {*} params.theme
     * @param {Screen} params.screen
     * @param {IntlHelper} params.intl
     */
    constructor(params) {
        const {board, game, match, persp, logs, theme, screen, intl} = params

        this.game = game
        this.board = board || (game && game.board) || null
        this.match = match
        this.persp = persp || White
        this.logs = logs || []
        this.theme = Themes.getSemiSafe(theme)
        this.screen = screen || DefaultScreen
        this.intl = intl || IntlHelper.getGlobalInstance()

        this.chars = Chars.table
        this.reporter = new Reporter(this)

        this.BoardWidth = 53
        this.AfterWidth = 10
        this.PiecePad = 4

        this.buildBorders()
    }

    /** @type {Function} */
    get __() {
        return this.intl.__
    }

    reload() {

        const {analyzer} = this.board

        this.opersp = Opponent[this.persp]

        this.columns     = this.screen.width
        this.rows        = this.screen.height
        this.maxLogWidth = Math.max(0, this.columns - this.BoardWidth - this.AfterWidth - 1)
        this.maxLogWidth = Math.min(this.maxLogWidth, 36)

        this.pipCounts = analyzer.pipCounts()

        this.pointStats  = {}
        this.barCounts   = {}
        this.homeCounts  = {}
        this.matchScores = {}

        for (let point = 1; point < 25; ++point) {
            this.pointStats[point] = analyzer.statPoint(this.persp, point)
        }

        const {game, match} = this

        for (const color in Colors) {
            this.barCounts[color]  = analyzer.piecesOnBar(color)
            this.homeCounts[color] = analyzer.piecesHome(color)
            if (match) {
                this.matchScores[color] = match.scores[color]
            }
        }

        if (match) {
            this.matchTotal = match.total
        }

        if (game) {
            this.cubeOwner   = game.cubeOwner
            this.cubeValue   = game.cubeValue
            this.isCrawford  = game.opts.isCrawford
            this.cubeEnabled = game.opts.cubeEnabled
        }

        this.logIndex = 20
    }

    /**
     * @return {String[]}
     */
    getLines() {
        return this.getString().split('\n')
    }

    /**
     * @return {String}
     */
    getString() {
        this.reload()
        const b = new StringBuilder
        b.add(
            Chars.br,
            // Top point numbers
            this.numbersRow(TopPoints),
            // Top border
            this.borderRow(this.TopBorder),
        )
        // Top piece rows
        for (let depth = 0; depth < 6; ++depth) {
            const cubePart = depth - 3
            b.add(
                this.pieceRow(depth, TopPoints, cubePart, this.opersp)
            )
        }
        b.add(
            // Top overflow row
            this.overflowRow(TopPoints),
            // Bar row
            this.barRow(this.persp, 0),
            // Between bars blank row
            this.middleRow(),
            // Bar row
            this.barRow(this.opersp, 2),
            // Bottom overflow row
            this.overflowRow(BottomPoints),
        )
        // Bottom piece rows
        for (let depth = 5; depth >= 0; --depth) {
            const cubePart = 5 - depth
            b.add(
                this.pieceRow(depth, BottomPoints, cubePart, this.persp)
            )
        }
        b.add(
            // Bottom border
            this.borderRow(this.BottomBorder),
            // Bottom point numbers
            this.numbersRow(BottomPoints),
        )
        b.add(Chars.br)
        return b.toString()
    }

    /**
     * @param {Number[]} points
     * @return {StringBuilder}
     */
    numbersRow(points) {
        const chlk = this.theme.board
        return new StringBuilder(
            this.numbers(points),
            chlk.outside(nchars(this.AfterWidth, Chars.sp)),
            this.sideLog(0),
            Chars.br,
        )
    }

    /**
     * @param {String} border
     * @return {StringBuilder}
     */
    borderRow(border) {
        const chlk = this.theme.board
        return new StringBuilder(
            chlk.border(border),
            chlk.outside(nchars(this.AfterWidth, Chars.sp)),
            this.sideLog(0),
            Chars.br,
        )
    }

    /**
     * @param {Number} depth
     * @param {Number[]} points
     * @param {Number} cubePart
     * @param {String} owner
     * @return {StringBuilder}
     */
    pieceRow(depth, points, cubePart, owner) {
        const chlk = this.theme.board
        const {chars} = this
        const afterStr = this.afterPieceRowString(depth, cubePart, owner).toString()
        const pad = this.AfterWidth - stringWidth(afterStr)
        const b = new StringBuilder
        b.add(chlk.border(chars.pipe))
        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color, i === 0 || i === 6))
            if (i === 5) {
                b.add(
                    chlk.inside('  '),
                    chlk.border(chars.dblPipe),
                )
            }
        })
        b.add(
            chlk.inside('  '),
            chlk.border(chars.pipe),
            afterStr,
            this.sideLog(pad),
            Chars.br,
        )
        return b
    }

    /**
     * @param {Number[]} points
     * @return {StringBuilder}
     */
    overflowRow(points) {
        const chlk = this.theme.board
        const b = new StringBuilder
        const {chars} = this
        b.add(chlk.border(chars.pipe))
        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count, i === 0 || i === 6))
            if (i === 5) {
                b.add(
                    chlk.inside('  '),
                    chlk.border(chars.dblPipe),
                )
            }
        })
        b.add(
            chlk.inside('  '),
            chlk.border(chars.pipe),
            this.sideLog(this.AfterWidth),
            Chars.br,
        )
        return b
    }

    /**
     * @param {String} color
     * @param {Number} cubePart
     * @return {StringBuilder}
     */
    barRow(color, cubePart) {
        const b = new StringBuilder
        const count = this.barCounts[color]
        b.add(this.barRowStr(color, count))
        let cubeStr
        if (this.cubeValue && !this.cubeOwner) {
            cubeStr = this.cubePartStr(cubePart)
        } else {
            cubeStr = Chars.empty
        }
        b.add(cubeStr)
        const pad = this.AfterWidth - stringWidth(cubeStr.toString())
        b.add(this.sideLog(pad))
        b.add(Chars.br)
        return b
    }

    /**
     * @return {StringBuilder}
     */
    middleRow() {
        const chlk = this.theme.board
        const {chars, PiecePad} = this
        let cubeStr
        if (this.cubeValue && !this.cubeOwner) {
            cubeStr = this.cubePartStr(1)
        } else {
            cubeStr = Chars.empty
        }
        const pad = this.AfterWidth - stringWidth(cubeStr.toString())
        return new StringBuilder(
            chlk.border(chars.pipe),
            chlk.inside(nchars(6 * PiecePad + 1, Chars.sp)),
            chlk.border(chars.dblPipe),
            chlk.inside(nchars(6 * PiecePad, Chars.sp)),
            chlk.inside(Chars.sp),
            chlk.border(chars.pipe),
            cubeStr,
            this.sideLog(pad),
            Chars.br,
        )
    }

    /**
     * @param {Number} pad
     * @return {StringBuilder}
     */
    sideLog(pad) {
        const chlk = this.theme.board
        const n = this.logIndex--
        let maxWidth = this.maxLogWidth, message
        if (this.columns > 97) {
            pad += 1
            maxWidth -= 1
        }
        if (this.logs[n]) {
            message = this.logs[this.logs.length - n - 1]
            if (stringWidth(message) > this.maxLogWidth) {
                message = chlk.log(
                    stripAnsi(message).substring(0, this.maxLogWidth)
                )
            }
        } else {
            message = Chars.empty
        }
        return new StringBuilder(
            chlk.outside(nchars(pad, Chars.sp)),
            message,
            chlk.log(nchars(maxWidth - stringWidth(message), Chars.sp)),
        )
    }

    /**
     * @param {Number[]} points
     * @return {StringBuilder}
     */
    numbers(points) {
        const chlk = this.theme.board
        const b = new StringBuilder
        b.add(chlk.pointLabel(Chars.sp))
        points.forEach((point, i) => {
            let pad = this.PiecePad
            if (i === 0 || i === 6) {
                pad -= 1
            }
            b.add(
                chlk.pointLabel(point.toString().padStart(pad, Chars.sp))
            )
            if (i === 5) {
                b.add(chlk.pointLabel(nchars(4, Chars.sp)))
            }
        })
        b.add(chlk.pointLabel(nchars(3, Chars.sp)))
        return b
    }

    /**
     * @param {String} color
     * @param {Number} count
     * @return {StringBuilder}
     */
    barRowStr(color, count) {
        const chlk = this.theme.board
        const {chars} = this
        const b = new StringBuilder
        b.add(
            chlk.border(chars.pipe),
            chlk.inside(nchars(6 * this.PiecePad + 1, ' ')),
        )
        if (count) {
            b.add(
                // i18n-extract play.colorLetter.Red
                // i18n-extract play.colorLetter.White
                chlk.bar.piece[color.toLowerCase()](ColorAbbr[color]), // i18n-ignore-line
                chlk.border(' '),
                chlk.inside.dim(count),
            )
        } else {
            b.add(
                chlk.border(chars.dblPipe),
                chlk.inside(' '),
            )
        }
        b.add(
            chlk.inside(nchars(6 * this.PiecePad, ' ')),
            chlk.border(chars.pipe),
        )
        return b
    }

    /**
     * @param {Number} count
     * @param {Boolean} isFirst
     * @return {StringBuilder}
     */
    overflowStr(count, isFirst = false) {
        const chlk = this.theme.board
        const countStr = count > 6 ? '' + count : Chars.empty
        const pad = this.PiecePad - isFirst - countStr.length
        return new StringBuilder(
            chlk.inside(nchars(pad, Chars.sp)),
            chlk.inside.dim(countStr),
        )
    }

    /**
     * The string for the piece color, if any.
     * 
     * @param {String} color
     * @param {Boolean} isFirst
     * @return {StringBuilder}
     */
    pieceStr(color, isFirst = false) {
        const chlk = this.theme.board
        const b = new StringBuilder
        b.add(chlk.inside(nchars(this.PiecePad - isFirst - 1, Chars.sp)))
        if (color) {
            b.add(chlk.piece[color.toLowerCase()](ColorAbbr[color])) // i18n-ignore-line
        } else {
            b.add(chlk.inside(Chars.sp))
        }
        return b
    }

    /**
     * @param {Number} depth
     * @param {Number} cubePart
     * @param {String} owner
     * @return {StringBuilder|String}
     */
    afterPieceRowString(depth, cubePart, owner) {
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
                    return this.cubePartStr(cubePart)
                }
                return Chars.empty
        }
    }

    /**
     * @param {String} color
     * @param {Number} count
     * @return {StringBuilder}
     */
    homeCountStr(color, count) {
        const chlk = this.theme.board
        const b = new StringBuilder
        b.add(chlk.outside(Chars.dblSp))
        if (count) {
            b.add(
                chlk.outside.piece[color.toLowerCase()](ColorAbbr[color]), // i18n-ignore-line
                chlk.outside(Chars.sp),
                chlk.outside(count),
            )
        }
        return b
    }

    /**
     * @param {Number} count
     * @return {StringBuilder}
     */
    pipCountStr(count) {
        const chlk = this.theme.board
        return new StringBuilder(
            chlk.outside(Chars.sp),
            chlk.outside.pipCount.bold(count),
            chlk.outside(Chars.sp),
            chlk.outside.pipCount('PIP'),
        )
    }

    /**
     * @param {Number} score
     * @param {Number} total
     * @return {StringBuilder}
     */
    matchScoreStr(score, total) {
        const chlk = this.theme.board
        return new StringBuilder(
            chlk.outside(Chars.sp),
            chlk.outside(score + '/' + total + 'pts'),
        )
    }

    /**
     * @param {Number} cubePart
     * @return {StringBuilder|String}
     */
    cubePartStr(cubePart) {
        const chlk = this.theme.board
        const {chars, cubeValue, isCrawford, cubeEnabled} = this
        if (!cubeEnabled) {
            return chlk.outside(nchars(6, Chars.sp))
        }
        const b = new StringBuilder
        const ch = isCrawford ? chlk.cube.inactive : chlk.cube.active
        switch (cubePart) {
            case 0:
                b.add(ch(this.CubeTopBorder))
                break
            case 1:
                b.add(
                    ch(chars.pipe + Chars.sp)
                )
                const valueStr = isCrawford ? 'CR' : cubeValue.toString()
                b.add(
                    ch(valueStr),
                    ch(nchars(2 - valueStr.length, Chars.sp)),
                    ch(chars.pipe),
                )
                break
            case 2:
                b.add(ch(this.CubeBottomBorder))
                break
        }
        return chlk.outside(Chars.sp) + b.toString()
    }

    /**
     * @param {String} method
     * @param {*} args...
     */
    report(method, ...args) {
        const res = this.reporter[method](...args)
        this.logs.push(res.toString())
    }

    buildBorders() {
        const {chars} = this
        const quadWidth = Math.floor(this.BoardWidth / 2 - 1)
        const quadChars = nchars(quadWidth, chars.dash)
        this.TopBorder = new StringBuilder(
            chars.top.left,
            quadChars,
            chars.top.mid,
            chars.top.mid,
            quadChars,
            chars.top.right,
        ).toString()
        this.BottomBorder = new StringBuilder(
            chars.foot.left,
            quadChars,
            chars.bot.mid,
            chars.bot.mid,
            quadChars,
            chars.foot.right,
        ).toString()
        this.CubeTopBorder = new StringBuilder(
            chars.top.left,
            nchars(3, chars.dash),
            chars.top.right,
        ).toString()
        this.CubeBottomBorder = new StringBuilder(
            chars.foot.left,
            nchars(3, chars.dash),
            chars.foot.right,
        ).toString()
    }
}

export default DrawHelper

export class Reporter {

    /**
     * @param {DrawHelper} inst
     */
    constructor(inst) {
        this.inst = inst
    }

    /** @type {Function} */
    get chlk() {
        return this.inst.theme.board.log
    }

    /**
     * @param {Number} num
     * @return {StringBuilder}
     */
    gameStart(num) {
        const {chlk} = this
        const b = new StringBuilder
        b.add(
            chlk.gameStatus('Starting game')
        )
        if (num) {
            b.add(
                chlk(Chars.sp),
                chlk(num),
            )
        }
        return b
    }

    /**
     * @param {String} color
     * @param {Array} dice
     * @return {StringBuilder}
     */
    firstRollWinner(color, dice) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk(' goes first with '),
            chlk.piece.white(dice[0]),
            chlk(','),
            chlk.piece.red(dice[1]),
        )
    }

    /**
     * @param {String} color
     * @return {StringBuilder}
     */
    turnStart(color) {
        const {chlk} = this
        return new StringBuilder(
            chlk.dim('---'),
            chlk(Chars.sp),
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk("'s turn"),
        )
    }

    /**
     * @param {String} color
     * @param {Array} dice
     * @return {StringBuilder}
     */
    playerRoll(color, dice) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk(' rolls '),
            chlk.dice(dice[0]),
            chlk(','),
            chlk.dice(dice[1]),
        )
    }

    /**
     * @param {String} color
     * @return {StringBuilder}
     */
    cantMove(color) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk(Chars.sp),
            chlk.notice('cannot move'),
        )
    }

    /**
     * @param {String} color
     * @param {Array} dice
     * @return {StringBuilder}
     */
    forceMove(color, dice) {
        const {chlk} = this
        return new StringBuilder(
            chlk.notice('Force move'),
            chlk(' for '),
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk(' with '),
            chlk.dice(dice[0]),
            chlk(','),
            chlk.dice(dice[1]),
        )
    }

    /**
     * @param {Move} move
     * @param {Boolean} isShort
     * @return {StringBuilder}
     */
    move(move, isShort) {
        if (move.isRegular) {
            return this.regularMove(move, isShort)
        }
        if (move.isComeIn) {
            return this.comeInMove(move, isShort)
        }
        if (move.isBearoff) {
            return this.bearoffMove(move, isShort)
        }
    }

    /**
     * @param {Move} move
     * @param {Boolean} isShort
     * @return {StringBuilder}
     */
    comeInMove({color, dest, isHit}, isShort) {
        const {persp} = this.inst
        return this._move(
            color,
            'bar',
            OriginPoints[persp][dest],
            isHit,
            isShort,
        )
    }

    /**
     * @param {Move} move
     * @param {Boolean} isShort
     * @return {StringBuilder}
     */
    regularMove({color, origin, dest, isHit}, isShort) {
        const {persp} = this.inst
        return this._move(
            color,
            OriginPoints[persp][origin],
            OriginPoints[persp][dest],
            isHit,
            isShort,
        )
    }

    /**
     * @param {Move} move
     * @param {Boolean} isShort
     * @return {StringBuilder}
     */
    bearoffMove({color, origin}, isShort) {
        const {persp} = this.inst
        return this._move(
            color,
            OriginPoints[persp][origin],
            'home',
            false,
            isShort,
        )
    }

    /**
     * @param {String} color
     * @param {String|Number} from
     * @param {String|Number} to
     * @param {Boolean} isHit
     * @param {Boolean} isShort
     * @return {StringBuilder}
     */
    _move(color, from, to, isHit, isShort) {
        const {chlk} = this
        const b = new StringBuilder
        if (!isShort) {
            b.add(
                chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
                chlk(' moves '),
            )
        }
        b.add(
            chlk(from),
            chlk(Chars.sp),
            chlk(Chars.arrow.right),
            chlk(Chars.sp),
            chlk(to),
        )
        if (isHit) {
            b.add(
                chlk(Chars.sp),
                chlk.notice('HIT'),
            )
        }
        return b
    }

    /**
     * @param {String} color
     * @return {StringBuilder}
     */
    doubleOffered(color) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk(Chars.sp),
            chlk('doubles'),
        )
    }

    /**
     * @param {String} color
     * @return {StringBuilder}
     */
    doubleDeclined(color) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[color.toLowerCase()](color), // i18n-ignore-line
            chlk(Chars.sp),
            chlk('declines the double'),
        )
    }

    /**
     * @param {String} cubeOwner
     * @param {Number} cubeValue
     * @return {StringBuilder}
     */
    gameDoubled(cubeOwner, cubeValue) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[cubeOwner.toLowerCase()](cubeOwner), // i18n-ignore-line
            chlk(' owns the cube at '),
            chlk(cubeValue),
            chlk(' points'),
        )
    }

    /**
     * @param {String} winner
     * @param {Number} finalValue
     * @return {StringBuilder}
     */
    gameEnd(winner, finalValue) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[winner.toLowerCase()](winner), // i18n-ignore-line
            chlk.gameStatus(' wins game for '),
            chlk.bold(finalValue),
            chlk.gameStatus(' points'),
        )
    }

    /**
     * @param {String} winner
     * @param {Number} winnerPoints
     * @param {Number} loserPoints
     * @return {StringBuilder}
     */
    matchEnd(winner, winnerPoints, loserPoints) {
        const {chlk} = this
        return new StringBuilder(
            chlk.piece[winner.toLowerCase()](winner), // i18n-ignore-line
            chlk.gameStatus(' wins the match '),
            chlk.bold(winnerPoints),
            chlk(' to '),
            chlk.bold(loserPoints),
        )
    }

    /**
     * @return {String}
     */
    hr() {
        return this.chlk.dim('-----------')
    }
}
