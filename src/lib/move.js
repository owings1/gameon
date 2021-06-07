/**
 * gameon - Move classes
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
const Constants = require('./constants')
const Core      = require('./core')
const Errors    = require('./errors')

const {
    Direction
 ,  MoveHashes
 ,  MoveCoords
 ,  Opponent
 ,  OriginPoints
} = Constants

const {Dice, Profiler} = Core

class Move {

    // Returns an object with two keys:
    //
    //    check: true iff the move is valid, else an error object {class, message}
    //    build: an object for constructing the move {class, args}
    //
    // The caller must test whether check === true, else construct and throw the
    // error. The build object may still populated even if there is an error.
    static check(board, color, origin, face) {
        Profiler.start('Move.check')
        try {
            Dice.checkOne(face)
            var check
            var build
            if (origin == -1) {
                check = ComeInMove.check(board, color, face)
                build = {class: ComeInMove, args: [board, color, face, check === true]}
                return {check, build}
            }
            if (board.analyzer.hasBar(color)) {
                check = {class: PieceOnBarError, message: [color, 'has a piece on the bar']}
            } else {
                if (!board.analyzer.occupiesOrigin(color, origin)) {
                    check = {class: NoPieceOnSlotError, message: [color, 'does not have a piece on slot', origin + 1]}
                } else {
                    const dest = origin + face * Direction[color]
                    const isBearoff = dest < 0 || dest > 23
                    if (isBearoff) {
                        check = BearoffMove.check(board, color, origin, face)
                        build = {class: BearoffMove, args: [board, color, origin, face, check === true]}
                    } else {
                        check = RegularMove.check(board, color, origin, face)
                        build = {class: RegularMove, args: [board, color, origin, face, check === true]}
                    }
                }
            }
            return {check, build}
        } finally {
            Profiler.stop('Move.check')
        }
        
    }

    constructor(board, color, origin, face) {
        this.board = board
        this.color = color
        this.origin = origin
        this.face = face
        this.hash = MoveHashes[origin][face]
        this.coords = MoveCoords[origin][face]
        this.flag = -1
        Profiler.inc('move.create')
    }

    copy() {
        return new this.constructor(...this._constructArgs)
    }

    check(...args) {
        const check = this.constructor.check(...args)
        if (check !== true) {
            throw new check.class(check.message)
        }
    }

    copyForBoard(board) {
        return new this.constructor(board, ...this._constructArgs.slice(1))
    }

    // NB: implementations should use board push/pop methods, and not directly
    //     modify board internals.
    do() {
        throw new NotImplementedError('Not Implemented')
    }

    // NB: implementations should use board push/pop methods, and not directly
    //     modify board internals.
    undo() {
        throw new NotImplementedError('Not Implemented')
    }
}

class ComeInMove extends Move {

    // Returns true or error object
    static check(board, color, face) {
        if (!board.analyzer.hasBar(color)) {
            return {class: NoPieceOnBarError, message: [color, 'does not have a piece on the bar']}
        }
        const {dest} = ComeInMove.getDestInfo(board, color, face)
        if (!board.analyzer.canOccupyOrigin(color, dest)) {
            return {class: OccupiedSlotError, message: [color, 'cannot come in on space', dest + 1]}
        }
        return true
    }

    constructor(board, color, face, isChecked) {

        super(board, color, -1, face)
        this._constructArgs = Object.values(arguments)

        if (!isChecked) {
            this.check(board, color, face)
        }

        const {dest, isHit} = this.getDestInfo(board, color, face)

        this.isComeIn = true
        this.dest = dest
        this.isHit = isHit
    }

    do() {
        if (this.isHit) {
            this.board.pushBar(Opponent[this.color], this.board.popOrigin(this.dest))
        }
        this.board.pushOrigin(this.dest, this.board.popBar(this.color))
    }

    undo() {
        this.board.pushBar(this.color, this.board.popOrigin(this.dest))
        if (this.isHit) {
            this.board.pushOrigin(this.dest, this.board.popBar(Opponent[this.color]))
        }
    }

    getDestInfo(...args) {
        return this.constructor.getDestInfo(...args)
    }

    static getDestInfo(board, color, face) {
        const dest = Direction[color] == 1 ? face - 1 : 24 - face
        const isHit = board.analyzer.piecesOnOrigin(Opponent[color], dest) == 1
        return {dest, isHit}
    }
}

class RegularMove extends Move {

    // Returns true or error object
    static check(board, color, origin, face) {
        const {dest} = RegularMove.getDestInfo(board, color, origin, face)
        if (!board.analyzer.canOccupyOrigin(color, dest)) {
            return {class: OccupiedSlotError, message: [color, 'may not occupy space', dest + 1]}
        }
        return true
    }

    constructor(board, color, origin, face, isChecked) {

        super(board, color, origin, face)
        this._constructArgs = Object.values(arguments)

        if (!isChecked) {
            this.check(board, color, origin, face)
        }

        const {dest, isHit} = this.getDestInfo(board, color, origin, face)

        this.dest = dest
        this.isRegular = true
        this.isHit = isHit
        if (!isHit) {
            this.flag = 8
        }
    }

    do() {
        if (this.isHit) {
            this.board.pushBar(Opponent[this.color], this.board.popOrigin(this.dest))
        }
        this.board.pushOrigin(this.dest, this.board.popOrigin(this.origin))
    }

    undo() {
        this.board.pushOrigin(this.origin, this.board.popOrigin(this.dest))
        if (this.isHit) {
            this.board.pushOrigin(this.dest, this.board.popBar(Opponent[this.color]))
        }
    }

    getDestInfo(...args) {
        return this.constructor.getDestInfo(...args)
    }

    static getDestInfo(board, color, origin, face) {
        const dest = origin + face * Direction[color]
        const isHit = board.analyzer.piecesOnOrigin(Opponent[color], dest) == 1
        return {dest, isHit}
    }
}

class BearoffMove extends Move {

    // Returns true or error object
    static check(board, color, origin, face) {
        if (!board.analyzer.mayBearoff(color)) {
            return {class: MayNotBearoffError, message: [color, 'may not bare off']}
        }
        // get distance to home
        const homeDistance = Direction[color] == 1 ? 24 - origin : origin + 1
        if (homeDistance != OriginPoints[color][origin]) {
            throw new Error('neq')
        }
        // make sure no piece is behind if we are taking more than the face
        if (face > homeDistance && board.analyzer.hasPieceBehind(color, origin)) {
            return {class: IllegalBareoffError, message: ['cannot bear off with a piece behind']}
        }
        return true
    }

    constructor(board, color, origin, face, isChecked) {

        super(board, color, origin, face)
        this._constructArgs = Object.values(arguments)

        if (!isChecked) {
            this.check(board, color, origin, face)
        }

        this.isBearoff = true
    }

    do() {
        this.board.pushHome(this.color, this.board.popOrigin(this.origin))
    }

    undo() {
        this.board.pushOrigin(this.origin, this.board.popHome(this.color))
    }
}

const {
    IllegalBareoffError
  , MayNotBearoffError
  , NoPieceOnBarError
  , NoPieceOnSlotError
  , NotImplementedError
  , OccupiedSlotError
  , PieceOnBarError
} = Errors

module.exports = {
    Move
  , BearoffMove
  , ComeInMove
  , RegularMove
}