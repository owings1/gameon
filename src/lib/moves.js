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
import Dice from './dice.js'
import {
    Direction,
    MoveHashes,
    MoveCoords,
    Opponent,
    OriginPoints,
} from './constants.js'

import {
    IllegalBareoffError,
    MayNotBearoffError,
    MoveOutOfRangeError,
    NoPieceOnBarError,
    NoPieceOnSlotError,
    NotImplementedError,
    OccupiedSlotError,
    PieceOnBarError,
} from './errors.js'

import {DefaultProfiler as Profiler} from './util/profiler.js'

export class Move {

    /**
     * Returns an object with two keys:
     * 
     *  - check: true iff the move is valid, else an error object {class, message}
     *  - build: an object for constructing the move {class, args}
     * 
     * The caller must test whether check === true, else construct and throw the
     * error. The build object may still populated even if there is an error.
     * 
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {object}
     */
    static check(board, color, origin, face) {
        Profiler.start('Move.check')
        try {
            Dice.checkOne(face)
            let check
            let build
            if (origin == -1) {
                check = ComeInMove.check(board, color, face)
                build = {class: ComeInMove, args: [board, color, face, check === true]}
                return {check, build}
            }
            if (board.analyzer.hasBar(color)) {
                check = {class: PieceOnBarError, message: [color, 'has a piece on the bar']}
            } else {
                if (!board.analyzer.occupiesOrigin(color, origin)) {
                    check = {class: NoPieceOnSlotError, message: [color, 'does not have a piece on origin', origin]}
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

    /**
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     */
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

    /**
     * @return {Move}
     */
    copy() {
        return new this.constructor(...this._constructArgs)
    }

    /**
     * @see Move.check
     * 
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {object}
     */
    check(...args) {
        const check = this.constructor.check(...args)
        if (check !== true) {
            throw new check.class(check.message)
        }
    }

    /**
     * @param {Board} board
     * @return {Move}
     */
    copyForBoard(board) {
        return new this.constructor(board, ...this._constructArgs.slice(1))
    }

    /** 
     * NB: implementations should use board push/pop methods, and not directly
     *     modify board internals.
     * 
     * @abstract
     */
    do() {
        throw new NotImplementedError()
    }

    /** 
     * NB: implementations should use board push/pop methods, and not directly
     *     modify board internals.
     * 
     * @abstract
     */
    undo() {
        throw new NotImplementedError()
    }
}

export class ComeInMove extends Move {

    /**
     * Returns true or error object
     * @param {Board} board
     * @param {String} color
     * @param {Number} face
     * @return {Boolean|object}
     */ 
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

    /**
     * @see Move.check
     * 
     * @param {Board} board
     * @param {Number} origin
     * @param {Number} face
     * @param {Boolean} isChecked
     */
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


    /**
     * @param {Board} board
     * @param {String} color
     * @param {Number} face
     * @return {object}
     */ 
    static getDestInfo(board, color, face) {
        const dest = Direction[color] == 1 ? face - 1 : 24 - face
        const isHit = board.analyzer.piecesOnOrigin(Opponent[color], dest) == 1
        return {dest, isHit}
    }
}

export class RegularMove extends Move {

    /**
     * Returns true or error object
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {Boolean|object}
     */ 
    static check(board, color, origin, face) {
        const dest = origin + face * Direction[color]
        if (dest < 0 || dest > 23) {
            return {class: MoveOutOfRangeError, message: ['invalid destination', dest]}
        }
        if (!board.analyzer.occupiesOrigin(color, origin)) {
            return {class: NoPieceOnSlotError, message: [color, 'does not have a piece on origin', origin]}
        }
        if (!board.analyzer.canOccupyOrigin(color, dest)) {
            return {class: OccupiedSlotError, message: [color, 'may not occupy occupy', dest]}
        }
        return true
    }

    /**
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @param {Boolean} isChecked
     */ 
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

    /**
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {object}
     */ 
    static getDestInfo(board, color, origin, face) {
        const dest = origin + face * Direction[color]
        const isHit = board.analyzer.piecesOnOrigin(Opponent[color], dest) == 1
        return {dest, isHit}
    }
}

export class BearoffMove extends Move {

    /**
     * Returns true or error object
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {Boolean|object}
     */ 
    static check(board, color, origin, face) {
        if (!board.analyzer.mayBearoff(color)) {
            return {class: MayNotBearoffError, message: [color, 'may not bare off']}
        }
        // get distance to home
        const homeDistance = OriginPoints[color][origin]
        // make sure no piece is behind if we are taking more than the face
        if (face > homeDistance && board.analyzer.hasPieceBehind(color, origin)) {
            return {class: IllegalBareoffError, message: ['cannot bear off with a piece behind']}
        }
        return true
    }

    /**
     * @param {Board} board
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @param {Boolean} isChecked
     */ 
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

