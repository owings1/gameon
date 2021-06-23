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
const Constants   = require('../lib/constants')
const Coordinator = require('../lib/coordinator')
const Core        = require('../lib/core')
const Logger      = require('../lib/logger')
const Robot       = require('../robot/player')
const Themes      = require('./themes')
const Util        = require('../lib/util')

const inquirer = require('inquirer')
const term     = require('terminal-kit').terminal

const {RobotDelegator} = Robot
const {StringBuilder}  = Util

const {nchars, sp, stripAnsi, strlen, ucfirst} = Util

const {
    Board
  , Dice
  , Match
  , Turn
} = Core

const {
    BoardStrings
  , BottomPoints
  , Chars
  , ColorAbbr
  , ColorNorm
  , Colors
  , DefaultThemeName
  , Direction
  , Opponent
  , OriginPoints
  , PointOrigins
  , Red
  , TopPoints
  , White
} = Constants


class DrawHelper {

    static forBoard(board, persp, logs, themeName) {
        return new DrawHelper(board, null, null, persp, logs, themeName)
    }

    static forGame(game, match, persp, logs, themeName) {
        return new DrawHelper(game.board, game, match, persp, logs, themeName)
    }

    constructor(board, game, match, persp, logs, themeName) {

        themeName = themeName || DefaultThemeName

        this.board = board
        this.game  = game
        this.match = match
        this.persp = persp || White
        this.logs  = logs || []

        this.logger   = new Logger
        this.theme    = Themes.getInstance(themeName)
        this.chars    = Chars.table
        this.reporter = new Reporter(this)

        this.BoardWidth = 53
        this.AfterWidth = 10
        this.PiecePad = 4

        this.buildBorders()
    }

    reload() {

        const {analyzer} = this.board

        this.opersp = Opponent[this.persp]

        this.columns     = Math.max(this.logger.getStdout().columns, 0)
        this.rows        = Math.max(this.logger.getStdout().rows, 0)
        this.maxLogWidth = Math.max(0, this.columns - this.BoardWidth - this.AfterWidth - 1)
        this.maxLogWidth = Math.min(this.maxLogWidth, 36)

        this.pipCounts = analyzer.pipCounts()

        this.pointStats  = {}
        this.barCounts   = {}
        this.homeCounts  = {}
        this.matchScores = {}

        for (var point = 1; point < 25; ++point) {
            this.pointStats[point] = analyzer.statPoint(this.persp, point)
        }

        const {game, match} = this

        for (var color in Colors) {
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
        )

        b.add(Chars.br)

        return b.toString()
    }

    numbersRow(points) {
        const ch = this.theme.text
        return new StringBuilder(
            this.numbers(points)
          , ch(nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
    }

    borderRow(border) {
        const ch = this.theme
        return new StringBuilder(
            ch.board.border(border)
          , ch.text(nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
    }

    pieceRow(depth, points, cubePart, owner) {

        const ch = this.theme.board
        const {chars} = this
        const pipe = ch.border(chars.pipe)
        const dlbPipe = ch.border(chars.dblPipe)

        const afterStr = this.afterPieceRowString(depth, cubePart, owner)
        const pad = this.AfterWidth - strlen(afterStr)

        const b = new StringBuilder

        b.add(pipe)

        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    ch(Chars.dblSp)
                  , dlbPipe
                )
            }
        })

        b.add(
            ch(Chars.dblSp)
          , pipe
          , afterStr
          , this.sideLog(pad)
          , Chars.br
        )

        return b
    }

    overflowRow(points) {

        const ch = this.theme.board
        const b = new StringBuilder
        const {chars} = this
        const pipe = ch.border(chars.pipe)
        const dlbPipe = ch.border(chars.dblPipe)

        b.add(pipe)

        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    ch(Chars.dblSp)
                  , dlbPipe
                )
            }
        })

        b.add(
            ch(Chars.dblSp)
          , pipe
          , this.sideLog(this.AfterWidth)
          , Chars.br
        )

        return b
    }

    barRow(color, cubePart) {

        const b = new StringBuilder

        const count = this.barCounts[color]

        b.add(this.barRowStr(color, count))

        if (this.cubeValue && !this.cubeOwner) {
            var cubeStr = this.cubePartStr(cubePart)
        } else {
            var cubeStr = Chars.empty
        }

        b.add(cubeStr)

        const pad = this.AfterWidth - strlen(cubeStr)

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    middleRow() {

        const ch = this.theme.board
        const {chars, PiecePad} = this

        if (this.cubeValue && !this.cubeOwner) {
            var cubeStr = this.cubePartStr(1)
        } else {
            var cubeStr = Chars.empty
        }

        const pad = this.AfterWidth - strlen(cubeStr)

        return new StringBuilder(
            ch.border(chars.pipe)
          , ch(nchars(6 * PiecePad + 1, Chars.sp))
          , ch.border(chars.dblPipe)
          , ch(nchars(6 * PiecePad, Chars.sp))
          , ch(Chars.sp)
          , ch.border(chars.pipe)
          , cubeStr
          , this.sideLog(pad)
          , Chars.br
        )
    }

    sideLog(pad) {

        const ch = this.theme.text
        const n = this.logIndex--

        var maxWidth = this.maxLogWidth
        if (this.columns > 97) {
            pad += 1
            maxWidth -= 1
        }
        if (this.logs[n]) {
            var message = this.logs[this.logs.length - n - 1]
            if (strlen(message) > this.maxLogWidth) {
                message = ch(
                    stripAnsi(message).substring(0, this.maxLogWidth)
                )
            }
        } else {
            var message = Chars.empty
        }

        return new StringBuilder(
            ch(nchars(pad, Chars.sp))
          , message
          , ch(nchars(maxWidth - strlen(message), Chars.sp))
        )
    }

    numbers(points) {

        const ch = this.theme.board.pointLabel
        const b = new StringBuilder

        b.add(ch(Chars.sp))

        points.forEach((point, i) => {
            var pad = this.PiecePad
            if (i == 0 || i == 6) {
                pad -= 1
            }
            b.add(
                ch(point.toString().padStart(pad, Chars.sp))
            )
            if (i == 5) {
                b.add(ch(nchars(4, Chars.sp)))
            }
        })

        b.add(ch(nchars(3, Chars.sp)))

        return b
    }

    barRowStr(color, count) {

        const ch = this.theme.board
        const {chars} = this
        const pipe = ch.border(chars.pipe)
        const dlbPipe = ch.border(chars.dblPipe)

        const b = new StringBuilder

        b.add(
            pipe
          , ch(nchars(6 * this.PiecePad + 1, Chars.sp))
        )

        if (count) {
            b.add(
                ch.piece[color.toLowerCase()](ColorAbbr[color])
              , ch(Chars.sp)
              , ch.dim(count)
            )
        } else {
            b.add(
                dlbPipe
              , ch(Chars.sp)
            )
        }

        b.add(
            ch(nchars(6 * this.PiecePad, Chars.sp))
          , pipe
        )

        return b
    }

    overflowStr(count, isFirst = false) {

        const ch = this.theme.board

        const countStr = count > 6 ? '' + count : Chars.empty
        const pad = this.PiecePad - isFirst - countStr.length

        return new StringBuilder(
            ch(nchars(pad, Chars.sp))
          , ch.dim(countStr)
        )
    }

    // the string for the piece color, if any
    pieceStr(color, isFirst = false) {

        const ch = this.theme.board
        const b = new StringBuilder

        b.add(ch(nchars(this.PiecePad - isFirst - 1, Chars.sp)))

        if (color) {
            b.add(ch.piece[color.toLowerCase()](ColorAbbr[color]))
        } else {
            b.add(ch(Chars.sp))
        }

        return b
    }

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

    homeCountStr(color, count) {

        const ch = this.theme.text
        const b = new StringBuilder

        b.add(ch(Chars.dblSp))

        if (count) {
            b.add(
                ch.piece[color.toLowerCase()](ColorAbbr[color])
              , ch(Chars.sp)
              , ch(count)
            )
        }

        return b
    }

    pipCountStr(count) {
        const ch = this.theme.text
        return new StringBuilder(
            ch(Chars.sp)
          , ch.pipCount(count)
          , ch(Chars.sp)
          , ch.dim('PIP')
        )
    }

    matchScoreStr(score, total) {
        const ch = this.theme.text
        return new StringBuilder(
            ch(Chars.sp)
          , ch(score + '/' + total + 'pts')
        )
    }

    cubePartStr(cubePart) {

        const {chars, theme, cubeValue, isCrawford, cubeEnabled} = this

        if (!cubeEnabled) {
            return theme.text(nchars(6, Chars.sp))
        }

        const b = new StringBuilder

        const ch = isCrawford ? theme.cube.inactive : theme.cube.active

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
                    ch(valueStr)
                  , ch(nchars(2 - valueStr.length, Chars.sp))
                  , ch(chars.pipe)
                )
                break
            case 2:
                b.add(ch(this.CubeBottomBorder))
                break
        }

        return theme.text(Chars.sp) + b.toString()
    }

    report(method, ...args) {
        const res = this.reporter[method](...args)
        this.logs.push(res.toString())
    }

    buildBorders() {

        const {chars} = this
        const quadWidth = Math.floor(this.BoardWidth / 2 - 1)
        const quadChars = nchars(quadWidth, chars.dash)

        this.TopBorder = new StringBuilder(
            chars.top.left
          , quadChars
          , chars.top.mid
          , chars.top.mid
          , quadChars
          , chars.top.right
        ).toString()

        this.BottomBorder = new StringBuilder(
            chars.foot.left
          , quadChars
          , chars.bot.mid
          , chars.bot.mid
          , quadChars
          , chars.foot.right
        ).toString()

        this.CubeTopBorder = new StringBuilder(
            chars.top.left
          , nchars(3, chars.dash)
          , chars.top.right
        ).toString()

        this.CubeBottomBorder = new StringBuilder(
            chars.foot.left
          , nchars(3, chars.dash)
          , chars.foot.right
        ).toString()
    }
}

class Reporter {

    constructor(inst) {
        this.inst = inst
    }

    gameStart(num) {
        const ch = this.inst.theme.text
        const b = new StringBuilder
        b.add(
            ch.gameStatus('Starting game')
        )
        if (num) {
            b.add(
                ch(Chars.sp)
              , ch(num)
            )
        }
        return b
    }

    firstRollWinner(color, dice) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[color.toLowerCase()](color)
          , ch(' goes first with ')
          , ch.piece.white(dice[0])
          , ch(',')
          , ch.piece.red(dice[1])
        )
    }

    turnStart(color) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.dim('---')
          , ch(Chars.sp)
          , ch.piece[color.toLowerCase()](color)
          , ch("'s turn")
        )
    }

    playerRoll(color, dice) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[color.toLowerCase()](color)
          , ch(' rolls ')
          , ch.dice(dice[0])
          , ch(',')
          , ch.dice(dice[1])
        )
    }

    cantMove(color) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[color.toLowerCase()](color)
          , ch(Chars.sp)
          , ch.notice('cannot move')
        )
    }

    forceMove(color, dice) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.notice('Force move')
          , ch(' for ')
          , ch.piece[color.toLowerCase()](color)
          , ch(' with ')
          , ch.dice(dice[0])
          , ch(',')
          , ch.dice(dice[1])
        )
    }

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

    comeInMove({color, dest, isHit}, isShort) {

        const {persp} = this.inst

        return this._move(
            color
          , 'bar'
          , OriginPoints[persp][dest]
          , isHit
          , isShort
        )
    }

    regularMove({color, origin, dest, isHit}, isShort) {

        const {persp} = this.inst

        return this._move(
            color
          , OriginPoints[persp][origin]
          , OriginPoints[persp][dest]
          , isHit
          , isShort
        )
    }

    bearoffMove({color, origin}, isShort) {

        const {persp} = this.inst

        return this._move(
            color
          , OriginPoints[persp][origin]
          , 'home'
          , false
          , isShort
        )
    }

    _move(color, from, to, isHit, isShort) {

        const ch = this.inst.theme.text
        const {persp} = this.inst
        const b = new StringBuilder

        if (!isShort) {
            b.add(
                ch.piece[color.toLowerCase()](color)
              , ch(' moves ')
            )
        }

        b.add(
            ch(from)
          , ch(Chars.sp)
          , ch(Chars.arrow.right)
          , ch(Chars.sp)
          , ch(to)
        )

        if (isHit) {
            b.add(
                ch(Chars.sp)
              , ch.notice('HIT')
            )
        }

        return b
    }

    doubleOffered(color) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[color.toLowerCase()](color)
          , ch(Chars.sp)
          , ch('doubles')
        )
    }

    doubleDeclined(color) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[color.toLowerCase()](color)
          , ch(Chars.sp)
          , ch('declines the double')
        )
    }

    gameDoubled(cubeOwner, cubeValue) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[cubeOwner.toLowerCase()](cubeOwner)
          , ch(' owns the cube at ')
          , ch(cubeValue)
          , ch(' points')
        )
    }

    gameEnd(winner, finalValue) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[winner.toLowerCase()](winner)
          , ch.gameStatus(' wins game for ')
          , ch.bold(finalValue)
          , ch.gameStatus(' points')
        )
    }

    matchEnd(winner, winnerPoints, loserPoints) {

        const ch = this.inst.theme.text

        return new StringBuilder(
            ch.piece[winner.toLowerCase()](winner)
          , ch.gameStatus(' wins the match ')
          , ch.bold(winnerPoints)
          , ch(' to ')
          , ch.bold(loserPoints)
        )
    }

    hr() {

        const ch = this.inst.theme.hr

        return new StringBuilder(
            ch('-----------')
        )
    }
}

class TermHelper {

    constructor(enabled) {
        this.enabled = enabled
        this.term = term
    }

    clear(...args) {
        if (!this.enabled) {
            return
        }
        this.term.clear(...args)
    }

    eraseDisplayBelow(...args) {
        if (!this.enabled) {
            return
        }
        this.term.eraseDisplayBelow(...args)
    }

    moveTo(...args) {
        if (!this.enabled) {
            return
        }
        this.term.moveTo(...args)
    }

    /*
    async getCursorLocation(...args) {
        if (!this.enabled) {
            return {x: 1, y: 1}
        }
        return this.term.getCursorLocation(...args)
    }

    column(...args) {
        if (!this.enabled) {
            return
        }
        this.term.column(...args)
    }

    up(...args) {
        if (!this.enabled) {
            return
        }
        this.term.up(...args)
    }
    */
}

module.exports = {
    DrawHelper
  , Reporter
  , TermHelper
}