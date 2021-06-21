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
        const b = new StringBuilder
        const {ch} = this.theme
        b.add(
            this.numbers(points)
          , ch.text(nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
        return b
    }

    borderRow(border) {
        const b = new StringBuilder
        const {ch} = this.theme
        b.add(
            ch.boardBorder(border)
          , ch.text(nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
        return b
    }

    pieceRow(depth, points, cubePart, owner) {

        const b = new StringBuilder

        const {ch} = this.theme

        b.add(ch.boardBorder(TableChars.pipe))

        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    ch.boardSp(Chars.dblSp)
                  , ch.boardBorder(TableChars.dblPipe)
                )
            }
        })
        b.add(ch.boardSp(Chars.dblSp))

        b.add(ch.boardBorder(TableChars.pipe))

        const afterStr = this.afterPieceRowString(depth, cubePart, owner)
        const pad = this.AfterWidth - this.len(afterStr)

        b.add(afterStr)

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    overflowRow(points) {

        const b = new StringBuilder
        const {ch} = this.theme

        b.add(ch.boardBorder(TableChars.pipe))

        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    ch.boardSp(Chars.dblSp)
                  , ch.boardBorder(TableChars.dblPipe)
                )
            }
        })
        b.add(ch.boardSp(Chars.dblSp))

        b.add(ch.boardBorder(TableChars.pipe))

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

        const b = new StringBuilder
        const {ch} = this.theme

        b.add(
            ch.boardBorder(TableChars.pipe)
          , ch.boardSp(nchars(6 * this.PiecePad + 1, Chars.sp))
          , ch.boardBorder(TableChars.dblPipe)
          , ch.boardSp(nchars(6 * this.PiecePad, Chars.sp))
          , ch.boardSp(Chars.sp)
          , ch.boardBorder(TableChars.pipe)
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

        const {ch} = this.theme
        const n = this.logIndex--

        const b = new StringBuilder

        var maxWidth = this.maxLogWidth
        if (this.columns > 97) {
            pad += 1
            maxWidth -= 1
        }

        b.add(ch.text(nchars(pad, Chars.sp)))

        if (this.logs[n]) {
            var message = this.logs[this.logs.length - n - 1]
            if (this.len(message) > this.maxLogWidth) {
                message = ch.text(
                    Util.stripAnsi(message).substring(0, this.maxLogWidth)
                )
            }
        } else {
            var message = Chars.empty
        }

        b.add(message)
        b.add(ch.text(nchars(maxWidth - this.len(message), Chars.sp)))

        return b
    }

    numbers(points) {

        const b = new StringBuilder
        const {ch} = this.theme

        b.add(ch.pointLabel(Chars.sp))

        points.forEach((point, i) => {
            var pad = this.PiecePad
            if (i == 0 || i == 6) {
                pad -= 1
            }
            b.add(
                ch.pointLabel(point.toString().padStart(pad, Chars.sp))
            )
            if (i == 5) {
                b.add(ch.pointLabel(nchars(4, Chars.sp)))
            }
        })

        b.add(ch.pointLabel(nchars(3, Chars.sp)))

        return b
    }

    barRowStr(color, count) {

        const b = new StringBuilder
        const {ch} = this.theme

        b.add(
            ch.boardBorder(TableChars.pipe)
          , ch.boardSp(nchars(6 * this.PiecePad + 1, Chars.sp))
        )

        if (count) {
            b.add(
                ch.piece[color](ColorAbbr[color])
              , ch.boardSp(Chars.sp)
              , ch.textDim(count)
            )
        } else {
            b.add(
                ch.boardBorder(TableChars.dblPipe)
              , ch.boardSp(Chars.sp)
            )
        }

        b.add(
            ch.boardSp(nchars(6 * this.PiecePad, Chars.sp))
          , ch.boardBorder(TableChars.pipe)
        )

        return b
    }

    overflowStr(count, isFirst = false) {

        const b = new StringBuilder
        const {ch} = this.theme

        const countStr = count > 6 ? '' + count : Chars.empty

        b.add(
            ch.boardSp(nchars(this.PiecePad - isFirst - countStr.length, Chars.sp))
          , ch.textDim(countStr)
        )

        return b
    }

    // the string for the piece color, if any
    pieceStr(color, isFirst = false) {

        const b = new StringBuilder
        const {ch} = this.theme

        b.add(ch.boardSp(nchars(this.PiecePad - isFirst - 1, Chars.sp)))

        if (color) {
            b.add(ch.piece[color](ColorAbbr[color]))
        } else {
            b.add(ch.boardSp(Chars.sp))
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

        const b = new StringBuilder
        const {ch} = this.theme

        b.add(ch.text(Chars.dblSp))

        if (count) {
            b.add(
                ch.piece[color](ColorAbbr[color])
              , ch.text(Chars.sp)
              , ch.textDim(count)
            )
        }

        return b
    }

    pipCountStr(count) {
        const b = new StringBuilder
        const {ch} = this.theme
        b.add(ch.text(Chars.sp), ch.pipCount(count))
        b.add(ch.text(Chars.sp), ch.pipLabel('PIP'))
        return b
    }

    matchScoreStr(score, total) {
        const b = new StringBuilder
        const {ch} = this.theme
        b.add(ch.text(Chars.sp))
        b.add(ch.text(score + '/' + total + 'pts'))
        return b
    }

    cubePartStr(partIndex, cubeValue, isCrawford) {

        const b = new StringBuilder
        const {ch} = this.theme

        const cubeChalk = isCrawford ? ch.cubeDisabled : ch.cubeActive

        switch (partIndex) {
            case 0:
                b.add(cubeChalk(this.CubeTopBorder))
                break
            case 1:
                b.add(
                    cubeChalk(TableChars.pipe + Chars.sp)
                )
                const valueStr = isCrawford ? 'CR' : cubeValue.toString()
                b.add(
                    cubeChalk(valueStr)
                  , cubeChalk(nchars(2 - valueStr.length, Chars.sp))
                  , cubeChalk(TableChars.pipe)
                )
                break
            case 2:
                b.add(cubeChalk(this.CubeBottomBorder))
                break
        }

        return ch.text(Chars.sp) + b.toString()
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
        const {ch} = this.inst.theme
        const b = new StringBuilder
        b.add(
            ch.gameStatus('Starting game')
        )
        if (num) {
            b.add(
                ch.text(Chars.sp)
              , ch.textBold(num)
            )
        }
        return b
    }

    firstRollWinner(color, dice) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[color](color)
          , ch.text(' goes first with ')
          , ch.colorText.White(dice[0])
          , ch.text(',')
          , ch.colorText.Red(dice[1])
        )

        return b
    }

    turnStart(color) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.textDim('---')
          , ch.text(Chars.sp)
          , ch.colorText[color](color)
          , ch.text("'s turn")
        )

        return b
    }

    playerRoll(color, dice) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[color](color)
          , ch.text(' rolls ')
          , ch.diceRolled(dice[0])
          , ch.text(',')
          , ch.diceRolled(dice[1])
        )

        return b
    }

    cantMove(color) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[color](color)
          , ch.text(Chars.sp)
          , ch.noticeText('cannot move')
        )

        return b
    }

    forceMove(color, dice) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.noticeText('Force move')
          , ch.text(' for ')
          , ch.colorText[color](color)
          , ch.text(' with ')
          , ch.diceRolled(dice[0])
          , ch.text(',')
          , ch.diceRolled(dice[1])
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
        const {ch} = this.inst.theme

        return this._move(
            color
          , ch.text('bar')
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
        const {ch} = this.inst.theme

        return this._move(
            color
          , OriginPoints[persp][origin]
          , ch.text('home')
        )
    }

    _move(color, from, to, isHit) {

        const {persp} = this.inst
        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[color](color)
          , ch.text(' moves ')
          , ch.text(from)
          , ch.text(' > ')
          , ch.text(to)
        )

        if (isHit) {
            b.add(
                ch.text(Chars.sp)
              , ch.noticeText('HIT')
            )
        }

        return b
    }

    doubleOffered(color) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[color](color)
          , ch.text(Chars.sp)
          , ch.text('doubles')
        )

        return b
    }

    doubleDeclined(color) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[color](color)
          , ch.text(Chars.sp)
          , ch.text('declines the double')
        )

        return b
    }

    gameDoubled(cubeOwner, cubeValue) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[cubeOwner](cubeOwner)
          , ch.text(' owns the cube at ')
          , ch.text(cubeValue)
          , ch.text(' points')
        )

        return b
    }

    gameEnd(winner, finalValue) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[winner](winner)
          , ch.gameStatus(' wins game for ')
          , ch.textBold(finalValue)
          , ch.gameStatus(' points')
        )

        return b
    }

    matchEnd(winner, winnerPoints, loserPoints) {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(
            ch.colorText[winner](winner)
          , ch.gameStatus(' wins the match ')
          , ch.textBold(winnerPoints)
          , ch.text(' to ')
          , ch.textBold(loserPoints)
        )

        return b
    }

    hr() {

        const {ch} = this.inst.theme
        const b = new StringBuilder

        b.add(ch.hr('-----------'))

        return b
    }
}


module.exports = {
    DrawHelper
  , Reporter
}