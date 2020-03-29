const Logger = require('./logger')
const Util   = require('./util')
const merge  = require('merge')

const {intRange} = Util
const sp         = Util.joinSpace

const White = 'White'
const Red   = 'Red'
const ColorAbbr = {
    White : 'W'
  , Red   : 'R'
}

const InsideSlots = {
    White : intRange(18, 23)
  , Red   : intRange(0, 5).reverse()
}

const OutsideSlots = {
    White : intRange(0, 17)
  , Red   : intRange(6, 23).reverse()
}

const Direction = {
    White : 1
 ,  Red   : -1
}

const Opponent = {
    White : Red
  , Red   : White
}

class Match extends Logger {

    constructor() {
        super()
        this.board = new Board()
        this.board.setup()
        this.cubeOwner = null
        this.cubeValue = 1
    }
}

class Board extends Logger {

    constructor() {
        super()
        this.clear()
    }

    move(color, i, n) {
        const move = this.buildMove(color, i, n)
        move.do()
        return move
    }

    buildMove(color, i, n) {
        if (n > 6) {
            throw new InvalidRollError('cannot advance more than 6 spaces')
        }
        if (n < 1) {
            throw new InvalidRollError('cannot advance less than 1 space')
        }
        if (i == -1) {
            return this.buildComeInMove(color, n)
        }
        if (this.hasBar(color)) {
            throw new PieceOnBarError(sp(color, 'has a piece on the bar'))
        }
        const slot = this.slots[i]
        if (slot.length < 1 || slot[0].color != color) {
            throw new NoPieceOnSlotError(sp(color, 'does not have a piece on slot', i + 1))
        }
        const j = i + n * Direction[color]
        const isBearoff = j < 0 || j > 23
        if (isBearoff) {
            if (!this.mayBearoff(color)) {
                throw new MayNotBearoffError(sp(color, 'may not bare off'))
            }
            // get distance to home
            const homeDistance = Direction[color] == 1 ? 24 - i : i + 1
            // make sure no piece is behind
            if (n > homeDistance && this.hasPieceBehind(color, i)) {
                throw new IllegalBareoffError(sp('cannot bear off with a piece behind'))
            }
            return {
                do   : () => this.homes[color].push(slot.pop())
              , undo : () => slot.push(this.homes[color].pop())
            }
        } else {
            const dest = this.slots[j]
            if (dest.length > 1 && dest[0].color != color) {
                throw new OccupiedSlotError(sp(color, 'may not occupy space', j + 1))
            }
            const isHit = dest.length == 1 && dest[0].color != color
            return {
                do   : () => {
                    if (isHit) {
                        this.bars[Opponent[color]].push(dest.pop())
                    }
                    dest.push(slot.pop())
                }
              , undo : () => {
                    slot.push(dest.pop())
                    if (isHit) {
                        dest.push(this.bars[Opponent[color]].pop())
                    }
                }
            }
        }
    }

    buildComeInMove(color, n) {
        if (!this.hasBar(color)) {
            throw new NoPieceOnBarError(sp(color, 'does not have a piece on the bar'))
        }
        const i = Direction[color] == 1 ? n - 1 : 24 - n
        const slot = this.slots[i]
        if (slot.length > 1 && slot[0].color != color) {
            throw new OccupiedSlotError(sp(color, 'cannot come in on space', i + 1))
        }
        return {
            do   : () => slot.push(this.bars[color].pop())
          , undo : () => this.bars[color].push(slot.pop())
        }
    }

    hasWinner() {
        return this.getWinner() != null
    }

    getWinner() {
        if (this.isAllHome(Red)) {
            return Red
        }
        if (this.isAllHome(White)) {
            return White
        }
        return null
    }

    clear() {
        this.slots = intRange(0, 23).map(i => [])
        this.bars  = {Red: [], White: []}
        this.homes = {Red: [], White: []}
    }

    copy() {
        const board = new Board()
        board.slots = this.slots.map(it => it.slice(0))
        board.bars = {
            Red   : this.bars.Red.slice(0)
          , White : this.bars.White.slice(0)
        }
        board.homes = {
            Red   : this.homes.Red.slice(0)
          , White : this.homes.White.slice(0)
        }
        return board
    }

    hasBar(color) {
        return this.bars[color].length > 0
    }

    mayBearoff(color) {
        return !this.hasBar(color) && undefined == OutsideSlots[color].find(i =>
            this.slots[i].find(piece =>
                piece.color == color
            )
        )
    }

    isAllHome(color) {
        return this.homes[color].length == 15
    }

    hasPieceBehind(color, i) {
        const behinds = Direction[color] == 1 ? intRange(0, i - 1) : intRange(i + 1, 23)
        return undefined != behinds.find(i =>
            this.slots[i].length > 0 &&
            this.slots[i][0].color == color
        )
    }

    setup() {
        this.clear()
        this.slots[0]  = Piece.make(2, White)
        this.slots[5]  = Piece.make(5, Red)
        this.slots[7]  = Piece.make(3, Red)
        this.slots[11] = Piece.make(5, White)
        this.slots[12] = Piece.make(5, Red)
        this.slots[16] = Piece.make(3, White)
        this.slots[18] = Piece.make(5, White)
        this.slots[23] = Piece.make(2, Red)
    }

    stateString() {
        // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
        return [
            this.bars.White.length
          , this.bars.Red.length
        ].concat(this.slots.map(slot =>
            [slot.length, slot.length > 0 ? slot[0].color : ''].join(':')
        )).concat([
            this.homes.White.length
          , this.homes.Red.length
        ]).join('|')
    }
}

class Piece {

    constructor(color) {
        this.color = color
        this.c = ColorAbbr[color]
    }

    static make(n, color) {
        return intRange(0, n - 1).map(i => new Piece(color))
    }
}

class Dice {

    static rollOne() {
        return Math.ceil(Math.random() * 6)
    }

    static rollTwo() {
        return [Dice.rollOne(), Dice.rollOne()]
    }

    static faces(roll) {
        if (roll[0] == roll[1]) {
            return roll.concat(roll)
        }
        return roll
    }
}

class GameError extends Error {

    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

class InvalidRollError extends GameError {}

class IllegalMoveError extends GameError {

    constructor(...args) {
        super(...args)
        this.isIllegalMoveError = true
    }
}

class PieceOnBarError extends IllegalMoveError {}
class NoPieceOnBarError extends IllegalMoveError {}
class NoPieceOnSlotError extends IllegalMoveError {}
class MayNotBearoffError extends IllegalMoveError {}
class IllegalBareoffError extends IllegalMoveError {}
class OccupiedSlotError extends IllegalMoveError {}

module.exports = {Match, Board, Piece, Dice}