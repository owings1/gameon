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

const chalk    = require('chalk')
const inquirer = require('inquirer')

const {RobotDelegator} = Robot
const {StringBuilder}  = Util

const {nchars, sp, ucfirst} = Util

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
  , TableChars
  , TopPoints
  , White
} = Constants

const Chars = {
    empty : ''
  , sp    : ' '
  , dblSp : '  '
  , br    : '\n'
}

class DrawHelper {

    static forBoard(board, persp, logs, themeName) {
        return new DrawHelper(board, null, null, persp, logs, themeName)
    }

    static forGame(game, match, persp, logs, themeName) {
        return new DrawHelper(game.board, game, match, persp, logs, themeName)
    }

    constructor(board, game, match, persp, logs, themeName) {

        themeName = themeName || 'Default'

        this.board = board
        this.game  = game
        this.match = match
        this.persp = persp || White
        this.logs  = logs || []

        this.logger = new Logger
        try {
            this.theme = Themes.getInstance(themeName)
        } catch (err) {
            if (!err.isThemeError) {
                throw err
            }
            this.logger.error(err.name, err.message)
            this.logger.warn('Using default theme')
            this.theme = Themes.getDefaultInstance()
        }
        
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
        const b = new StringBuilder
        b.add(
            this.numbers(points)
          , ch(nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
        return b
    }

    borderRow(border) {
        const {theme} = this
        const b = new StringBuilder
        b.add(
            theme.board.border(border)
          , theme.text(nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
        return b
    }

    pieceRow(depth, points, cubePart, owner) {

        const ch = this.theme.board
        const b = new StringBuilder

        b.add(ch.border(TableChars.pipe))

        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    ch(Chars.dblSp)
                  , ch.border(TableChars.dblPipe)
                )
            }
        })
        b.add(ch(Chars.dblSp))

        b.add(ch.border(TableChars.pipe))

        const afterStr = this.afterPieceRowString(depth, cubePart, owner)
        const pad = this.AfterWidth - this.len(afterStr)

        b.add(afterStr)

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    overflowRow(points) {

        const ch = this.theme.board
        const b = new StringBuilder

        b.add(ch.border(TableChars.pipe))

        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    ch(Chars.dblSp)
                  , ch.border(TableChars.dblPipe)
                )
            }
        })
        b.add(ch(Chars.dblSp))

        b.add(ch.border(TableChars.pipe))

        const pad = this.AfterWidth

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    barRow(color, cubePart) {

        const b = new StringBuilder

        const count = this.barCounts[color]

        b.add(this.barRowStr(color, count))

        if (this.cubeValue && !this.cubeOwner) {
            var cubeStr = this.cubePartStr(cubePart, this.cubeValue, this.isCrawford)            
        } else {
            var cubeStr = Chars.empty
        }

        b.add(cubeStr)

        const pad = this.AfterWidth - this.len(cubeStr)

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    middleRow() {

        const ch = this.theme.board
        const b = new StringBuilder

        b.add(
            ch.border(TableChars.pipe)
          , ch(nchars(6 * this.PiecePad + 1, Chars.sp))
          , ch.border(TableChars.dblPipe)
          , ch(nchars(6 * this.PiecePad, Chars.sp))
          , ch(Chars.sp)
          , ch.border(TableChars.pipe)
        )

        if (this.cubeValue && !this.cubeOwner) {
            var cubeStr = this.cubePartStr(1, this.cubeValue, this.isCrawford)
        } else {
            var cubeStr = Chars.empty
        }

        b.add(cubeStr)

        const pad = this.AfterWidth - this.len(cubeStr)

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    sideLog(pad) {

        const ch = this.theme.text
        const n = this.logIndex--

        const b = new StringBuilder

        var maxWidth = this.maxLogWidth
        if (this.columns > 97) {
            pad += 1
            maxWidth -= 1
        }

        b.add(ch(nchars(pad, Chars.sp)))

        if (this.logs[n]) {
            var message = this.logs[this.logs.length - n - 1]
            if (this.len(message) > this.maxLogWidth) {
                message = ch(
                    Util.stripAnsi(message).substring(0, this.maxLogWidth)
                )
            }
        } else {
            var message = Chars.empty
        }

        b.add(message)
        b.add(ch(nchars(maxWidth - this.len(message), Chars.sp)))

        return b
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

        const {theme} = this

        const ch = theme.board
        const b = new StringBuilder

        b.add(
            ch.border(TableChars.pipe)
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
                ch.border(TableChars.dblPipe)
              , ch(Chars.sp)
            )
        }

        b.add(
            ch(nchars(6 * this.PiecePad, Chars.sp))
          , ch.border(TableChars.pipe)
        )

        return b
    }

    overflowStr(count, isFirst = false) {

        const ch = this.theme.board
        const b = new StringBuilder

        const countStr = count > 6 ? '' + count : Chars.empty

        b.add(
            ch(nchars(this.PiecePad - isFirst - countStr.length, Chars.sp))
          , ch.dim(countStr)
        )

        return b
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
                    return this.cubePartStr(cubePart, this.cubeValue, this.isCrawford)
                }
                return Chars.empty
        }
    }

    homeCountStr(color, count) {

        const {theme} = this

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
        const b = new StringBuilder
        b.add(ch(Chars.sp), ch.pipCount(count))
        b.add(ch(Chars.sp), ch.dim('PIP'))
        return b
    }

    matchScoreStr(score, total) {
        const ch = this.theme.text
        const b = new StringBuilder
        b.add(ch(Chars.sp))
        b.add(ch(score + '/' + total + 'pts'))
        return b
    }

    cubePartStr(partIndex, cubeValue, isCrawford) {

        const {theme} = this

        const b = new StringBuilder

        const ch = isCrawford ? theme.cube.inactive : theme.cube.active

        switch (partIndex) {
            case 0:
                b.add(ch(this.CubeTopBorder))
                break
            case 1:
                b.add(
                    ch(TableChars.pipe + Chars.sp)
                )
                const valueStr = isCrawford ? 'CR' : cubeValue.toString()
                b.add(
                    ch(valueStr)
                  , ch(nchars(2 - valueStr.length, Chars.sp))
                  , ch(TableChars.pipe)
                )
                break
            case 2:
                b.add(ch(this.CubeBottomBorder))
                break
        }

        return theme.text(Chars.sp) + b.toString()
    }

    len(str) {
        return Util.stripAnsi(str.toString()).length
    }

    report(method, ...args) {
        const res = this.reporter[method](...args)
        this.logs.push(res.toString())
    }

    buildBorders() {

        const quadWidth = Math.floor(this.BoardWidth / 2 - 1)
        const quadChars = nchars(quadWidth, TableChars.dash)

        this.TopBorder = new StringBuilder(
            TableChars.topLeft
          , quadChars
          , TableChars.topMiddle
          , TableChars.topMiddle
          , quadChars
          , TableChars.topRight
        ).toString()

        this.BottomBorder = new StringBuilder(
            TableChars.footerLeft
          , quadChars
          , TableChars.bottomMiddle
          , TableChars.bottomMiddle
          , quadChars
          , TableChars.footerRight
        ).toString()

        this.CubeTopBorder = new StringBuilder(
            TableChars.topLeft
          , nchars(3, TableChars.dash)
          , TableChars.topRight
        ).toString()

        this.CubeBottomBorder = new StringBuilder(
            TableChars.footerLeft
          , nchars(3, TableChars.dash)
          , TableChars.footerRight
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
        const b = new StringBuilder

        b.add(
            ch.piece[color.toLowerCase()](color)
          , ch(' goes first with ')
          , ch.piece.white(dice[0])
          , ch(',')
          , ch.piece.red(dice[1])
        )

        return b
    }

    turnStart(color) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.dim('---')
          , ch(Chars.sp)
          , ch.piece[color.toLowerCase()](color)
          , ch("'s turn")
        )

        return b
    }

    playerRoll(color, dice) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.piece[color.toLowerCase()](color)
          , ch(' rolls ')
          , ch.dice(dice[0])
          , ch(',')
          , ch.dice(dice[1])
        )

        return b
    }

    cantMove(color) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.piece[color.toLowerCase()](color)
          , ch(Chars.sp)
          , ch.notice('cannot move')
        )

        return b
    }

    forceMove(color, dice) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.notice('Force move')
          , ch(' for ')
          , ch.piece[color.toLowerCase()](color)
          , ch(' with ')
          , ch.dice(dice[0])
          , ch(',')
          , ch.dice(dice[1])
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

        const ch = this.inst.theme.text
        const {persp} = this.inst

        return this._move(
            color
          , ch('bar')
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

        const ch = this.inst.theme.text
        const {persp} = this.inst

        return this._move(
            color
          , OriginPoints[persp][origin]
          , ch('home')
        )
    }

    _move(color, from, to, isHit) {

        const ch = this.inst.theme.text
        const {persp} = this.inst
        const b = new StringBuilder

        b.add(
            ch.piece[color.toLowerCase()](color)
          , ch(' moves ')
          , ch(from)
          , ch(' > ')
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
        const b = new StringBuilder

        b.add(
            ch.piece[color.toLowerCase()](color)
          , ch(Chars.sp)
          , ch('doubles')
        )

        return b
    }

    doubleDeclined(color) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.piece[color.toLowerCase()](color)
          , ch(Chars.sp)
          , ch('declines the double')
        )

        return b
    }

    gameDoubled(cubeOwner, cubeValue) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.piece[cubeOwner.toLowerCase()](cubeOwner)
          , ch(' owns the cube at ')
          , ch(cubeValue)
          , ch(' points')
        )

        return b
    }

    gameEnd(winner, finalValue) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.piece[winner.toLowerCase()](winner)
          , ch.gameStatus(' wins game for ')
          , ch.bold(finalValue)
          , ch.gameStatus(' points')
        )

        return b
    }

    matchEnd(winner, winnerPoints, loserPoints) {

        const ch = this.inst.theme.text
        const b = new StringBuilder

        b.add(
            ch.piece[winner.toLowerCase()](winner)
          , ch.gameStatus(' wins the match ')
          , ch.bold(winnerPoints)
          , ch(' to ')
          , ch.bold(loserPoints)
        )

        return b
    }

    hr() {

        const ch = this.inst.theme.hr
        const b = new StringBuilder

        b.add(ch('-----------'))

        return b
    }
}


module.exports = {
    DrawHelper
  , Reporter
}