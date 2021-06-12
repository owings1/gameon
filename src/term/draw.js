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
const ThemeHelper = require('./themes')
const sp          = Util.joinSpace

const {RobotDelegator} = Robot
const {StringBuilder}  = Util
const {ucfirst}        = Util

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

const {Chars} = Constants.Draw



class DrawInstance {

    static forBoard(board, persp, logs, themeName) {
        return new DrawInstance(board, null, null, persp, logs, themeName)
    }

    static forGame(game, match, persp, logs, themeName) {
        return new DrawInstance(game.board, game, match, persp, logs, themeName)
    }

    constructor(board, game, match, persp, logs, themeName) {
        themeName = themeName || 'Default'
        this.board = board
        this.game  = game
        this.match = match
        this.persp = persp || White
        this.logs  = logs || []

        this.logger   = new Logger
        this.theme    = ThemeHelper.getInstance(themeName)
        this.reporter = new Reporter(this)

        this.BoardWidth = 53
        this.AfterWidth = 10
        this.PiecePad = 4

        this.buildBorders()
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

    numbersRow(points) {
        const b = new StringBuilder
        const {chalks} = this.theme
        b.add(
            this.numbers(points)
          , chalks.text(this.nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
        return b
    }

    borderRow(border) {
        const b = new StringBuilder
        const {chalks} = this.theme
        b.add(
            chalks.boardBorder(border)
          , chalks.text(this.nchars(this.AfterWidth, Chars.sp))
          , this.sideLog(0)
          , Chars.br
        )
        return b
    }

    pieceRow(depth, points, cubePart, owner) {

        const b = new StringBuilder

        const {chalks} = this.theme

        b.add(chalks.boardBorder(Chars.pipe))

        points.forEach((point, i) => {
            const {color, count} = this.pointStats[point]
            b.add(this.pieceStr(count > depth && color, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    chalks.boardSp(Chars.sp + Chars.sp)
                  , chalks.boardBorder(Chars.dblSep)
                )
            }
        })
        b.add(chalks.boardSp(Chars.sp + Chars.sp))

        b.add(chalks.boardBorder(Chars.pipe))

        const afterStr = this.afterPieceRowString(depth, cubePart, owner)
        const pad = this.AfterWidth - this.len(afterStr)

        b.add(afterStr)

        b.add(this.sideLog(pad))
        b.add(Chars.br)

        return b
    }

    overflowRow(points) {

        const b = new StringBuilder
        const {chalks} = this.theme

        b.add(chalks.boardBorder(Chars.pipe))

        points.forEach((point, i) => {
            const {count} = this.pointStats[point]
            b.add(this.overflowStr(count, i == 0 || i == 6))
            if (i == 5) {
                b.add(
                    chalks.boardSp(Chars.sp + Chars.sp)
                  , chalks.boardBorder(Chars.dblSep)
                )
            }
        })
        b.add(chalks.boardSp(Chars.sp + Chars.sp))

        b.add(chalks.boardBorder(Chars.pipe))

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
        const {chalks} = this.theme

        b.add(
            chalks.boardBorder(Chars.pipe)
          , chalks.boardSp(this.nchars(6 * this.PiecePad + 1, Chars.sp))
          , chalks.boardBorder(Chars.dblSep)
          , chalks.boardSp(this.nchars(6 * this.PiecePad, Chars.sp))
          , chalks.boardSp(Chars.sp)
          , chalks.boardBorder(Chars.pipe)
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

        const {chalks} = this.theme
        const n = this.logIndex--

        const b = new StringBuilder

        var maxWidth = this.maxLogWidth
        if (this.columns > 97) {
            pad += 1
            maxWidth -= 1
        }

        b.add(chalks.text(this.nchars(pad, Chars.sp)))

        if (this.logs[n]) {
            var message = this.logs[this.logs.length - n - 1]
            if (this.len(message) > this.maxLogWidth) {
                message = chalks.text(
                    Util.stripAnsi(message).substring(0, this.maxLogWidth)
                )
            }
        } else {
            var message = Chars.empty
        }

        b.add(message)
        b.add(chalks.text(this.nchars(maxWidth - this.len(message), Chars.sp)))

        return b
    }

    numbers(points) {

        const b = new StringBuilder
        const {chalks} = this.theme

        b.add(chalks.pointLabel(Chars.sp))

        points.forEach((point, i) => {
            var pad = this.PiecePad
            if (i == 0 || i == 6) {
                pad -= 1
            }
            b.add(
                chalks.pointLabel(point.toString().padStart(pad, Chars.sp))
            )
            if (i == 5) {
                b.add(chalks.pointLabel(this.nchars(4, Chars.sp)))
            }
        })

        b.add(chalks.pointLabel(this.nchars(3, Chars.sp)))

        return b
    }

    barRowStr(color, count) {

        const b = new StringBuilder
        const {chalks} = this.theme

        b.add(
            chalks.boardBorder(Chars.pipe)
          , chalks.boardSp(this.nchars(6 * this.PiecePad + 1, Chars.sp))
        )

        if (count) {
            b.add(
                chalks.piece[color](ColorAbbr[color])
              , chalks.boardSp(Chars.sp)
              , chalks.textDim(count)
            )
        } else {
            b.add(
                chalks.boardBorder(Chars.dblSep)
              , chalks.boardSp(Chars.sp)
            )
        }

        b.add(
            chalks.boardSp(this.nchars(6 * this.PiecePad, Chars.sp))
          , chalks.boardBorder(Chars.pipe)
        )

        return b
    }

    overflowStr(count, isFirst = false) {

        const b = new StringBuilder
        const {chalks} = this.theme

        const countStr = count > 6 ? '' + count : Chars.empty

        b.add(
            chalks.boardSp(this.nchars(this.PiecePad - isFirst - countStr.length, Chars.sp))
          , chalks.textDim(countStr)
        )

        return b
    }

    // the string for the piece color, if any
    pieceStr(color, isFirst = false) {

        const b = new StringBuilder
        const {chalks} = this.theme

        b.add(chalks.boardSp(this.nchars(this.PiecePad - isFirst - 1, Chars.sp)))

        if (color) {
            b.add(chalks.piece[color](ColorAbbr[color]))
        } else {
            b.add(chalks.boardSp(Chars.sp))
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
        const {chalks} = this.theme

        b.add(chalks.text(Chars.sp + Chars.sp))

        if (count) {
            b.add(
                chalks.piece[color](ColorAbbr[color])
              , chalks.text(Chars.sp)
              , chalks.textDim(count)
            )
        }

        return b
    }

    pipCountStr(count) {
        const b = new StringBuilder
        const {chalks} = this.theme
        b.add(chalks.text(Chars.sp), chalks.pipCount(count))
        b.add(chalks.text(Chars.sp), chalks.pipLabel('PIP'))
        return b
    }

    matchScoreStr(score, total) {
        const b = new StringBuilder
        const {chalks} = this.theme
        b.add(chalks.text(Chars.sp))
        b.add(chalks.text(score + '/' + total + 'pts'))
        return b
    }

    cubePartStr(partIndex, cubeValue, isCrawford) {

        const b = new StringBuilder
        const {chalks} = this.theme

        const cubeChalk = isCrawford ? chalks.cubeDisabled : chalks.cubeActive

        switch (partIndex) {
            case 0:
                b.add(cubeChalk(this.CubeTopBorder))
                break
            case 1:
                b.add(
                    cubeChalk(Chars.pipe + Chars.sp)
                )
                const valueStr = isCrawford ? 'CR' : cubeValue.toString()
                b.add(
                    cubeChalk(valueStr)
                  , cubeChalk(this.nchars(2 - valueStr.length, Chars.sp))
                  , cubeChalk(Chars.pipe)
                )
                break
            case 2:
                b.add(cubeChalk(this.CubeBottomBorder))
                break
        }

        return chalks.text(Chars.sp) + b.toString()
    }

    len(str) {
        return Util.stripAnsi(str.toString()).length
    }

    nchars(n, char) {
        return Chars.empty.padEnd(n, char)
    }

    report(method, ...args) {
        const res = this.reporter[method](...args)
        this.logs.push(res.toString())
    }

    buildBorders() {

        const quadWidth = Math.floor(this.BoardWidth / 2 - 1)
        const quadChars = this.nchars(quadWidth, Chars.dash)

        this.TopBorder = new StringBuilder(
            Chars.topLeft
          , quadChars
          , Chars.topMiddle
          , Chars.topMiddle
          , quadChars
          , Chars.topRight
        ).toString()

        this.BottomBorder = new StringBuilder(
            Chars.botLeft
          , quadChars
          , Chars.botMiddle
          , Chars.botMiddle
          , quadChars
          , Chars.botRight
        ).toString()

        this.CubeTopBorder = new StringBuilder(
            Chars.topLeft
          , this.nchars(3, Chars.dash)
          , Chars.topRight
        ).toString()

        this.CubeBottomBorder = new StringBuilder(
            Chars.botLeft
          , this.nchars(3, Chars.dash)
          , Chars.botRight
        ).toString()
    }
}

class Reporter {

    constructor(inst) {
        this.inst = inst
    }

    gameStart(num) {
        const {chalks} = this.inst.theme
        const b = new StringBuilder
        b.add(
            chalks.gameStatus('Starting game')
        )
        if (num) {
            b.add(
                chalks.text(Chars.sp)
              , chalks.textBold(num)
            )
        }
        return b
    }

    firstRollWinner(color, dice) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[color](color)
          , chalks.text(' goes first with ')
          , chalks.colorText.White(dice[0])
          , chalks.text(',')
          , chalks.colorText.Red(dice[1])
        )

        return b
    }

    turnStart(color) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.textDim('---')
          , chalks.text(Chars.sp)
          , chalks.colorText[color](color)
          , chalks.text("'s turn")
        )

        return b
    }

    playerRoll(color, dice) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[color](color)
          , chalks.text(' rolls ')
          , chalks.diceRolled(dice[0])
          , chalks.text(',')
          , chalks.diceRolled(dice[1])
        )

        return b
    }

    cantMove(color) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[color](color)
          , chalks.text(Chars.sp)
          , chalks.noticeText('cannot move')
        )

        return b
    }

    forceMove(color, dice) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.noticeText('Force move')
          , chalks.text(' for ')
          , chalks.colorText[color](color)
          , chalks.text(' with ')
          , chalks.diceRolled(dice[0])
          , chalks.text(',')
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
        const {chalks} = this.inst.theme

        return this._move(
            color
          , chalks.text('bar')
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
        const {chalks} = this.inst.theme

        return this._move(
            color
          , OriginPoints[persp][origin]
          , chalks.text('home')
        )
    }

    _move(color, from, to, isHit) {

        const {persp} = this.inst
        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[color](color)
          , chalks.text(' moves ')
          , chalks.text(from)
          , chalks.text(' > ')
          , chalks.text(to)
        )

        if (isHit) {
            b.add(
                chalks.text(Chars.sp)
              , chalks.noticeText('HIT')
            )
        }

        return b
    }

    doubleOffered(color) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[color](color)
          , chalks.text(Chars.sp)
          , chalks.text('doubles')
        )

        return b
    }

    doubleDeclined(color) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[color](color)
          , chalks.text(Chars.sp)
          , chalks.text('declines the double')
        )

        return b
    }

    gameDoubled(cubeOwner, cubeValue) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[cubeOwner](cubeOwner)
          , chalks.text(' owns the cube at ')
          , chalks.text(cubeValue)
          , chalks.text(' points')
        )

        return b
    }

    gameEnd(winner, finalValue) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[winner](winner)
          , chalks.gameStatus(' wins game for ')
          , chalks.textBold(finalValue)
          , chalks.gameStatus(' points')
        )

        return b
    }

    matchEnd(winner, winnerPoints, loserPoints) {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(
            chalks.colorText[winner](winner)
          , chalks.gameStatus(' wins the match ')
          , chalks.textBold(winnerPoints)
          , chalks.text(' to ')
          , chalks.textBold(loserPoints)
        )

        return b
    }

    hr() {

        const {chalks} = this.inst.theme
        const b = new StringBuilder

        b.add(chalks.hr('-----------'))

        return b
    }
}


module.exports = {
    DrawInstance
  , Reporter
}