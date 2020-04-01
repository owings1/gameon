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
        this.board = new Board
        this.board.setup()
        this.cubeOwner = null
        this.cubeValue = 1
    }
}

class Turn extends Logger {

    constructor(board, color) {
        super()
        this.board = board
        this.color = color
        this.moves = []
        this.roll = null
        this.hasRolled = false
    }

    roll() {
        this.roll = Dice.rollTwo()
        this.faces = Dice.faces(this.roll)
        this.hasRolled = true
    }
}

class SequenceTree {

    constructor(board, color, sequence) {
        this.board = board
        this.color = color
        this.sequence = sequence
        this.nodes = null
        this.branches = null
        this.depth = -1
    }

    build() {
        this.nodes = SequenceTree.buildNodes(this.board, this.color, this.sequence)
        this.depth = Math.max(...this.nodes.map(node => node.depth))
        this.leaves = this.nodes.filter(node => node.depth == this.depth)
        this.branches = SequenceTree.buildBranchesForLeaves(this.leaves)
    }

    static build(board, color, sequence) {
        const tree = new SequenceTree(board, color, sequence)
        tree.build()
        return tree
    }

    static buildBranchesForLeaves(leaves) {
        const branches = []
        leaves.forEach(leaf => {
            const branch = [leaf]
            for (var node = leaf; node.parent; node = node.parent) {
                branch.unshift(node.parent)
            }
            branches.push(branch)
        })
        return branches
    }

    static buildNodes(board, color, sequence) {

        const nodes = [new BoardNode(board, 0, null)]

        sequence.forEach((face, seqi) => {
            const depth = seqi + 1
            nodes.filter(n => n.depth == depth - 1).forEach(parentNode => {
                parentNode.nextFace = face
                parentNode.nextMoves = parentNode.board.getPossibleMovesForFace(color, face)
                parentNode.nextMoves.forEach(move => {
                    move.board = move.board.copy()
                    move.do()
                    const childNode = new BoardNode(move.board, depth, parentNode)
                    childNode.thisMove = move
                    childNode.thisFace = face
                    parentNode.children.push(childNode)
                    nodes.push(childNode)
                })
            })
        })

        return nodes
    }
}

class BoardNode {

    constructor(board, depth, parent) {
        this.board = board
        this.depth = depth
        this.parent = parent
        this.children = []
        this.thisFace = null
        this.thisMove = null
        this.nextFace = null
        this.nextMoves = null
    }
}

class Board extends Logger {

    constructor() {
        super()
        this.clear()
    }

    static setup() {
        const board = new Board
        board.setup()
        return board
    }

    move(color, i, n) {
        const move = this.buildMove(color, i, n)
        move.do()
        return move
    }

    getPossibleMovesForFace(color, n) {
        if (this.hasBar(color)) {
            return [this.getMoveIfCanMove(color, -1, n)].filter(move => move != null)
        }
        return this.listSlotsWithColor(color).map(i =>
            this.getMoveIfCanMove(color, i, n)
        ).filter(move => move != null)
    }

    getMoveIfCanMove(color, i, n) {
        try {
            return this.buildMove(color, i, n)
        } catch (err) {
            if (!err.isIllegalMoveError) {
                throw err
            }
            return null
        }
    }

    buildMove(color, i, n) {
        if (n > 6) {
            throw new InvalidRollError('cannot advance more than 6 spaces')
        }
        if (n < 1) {
            throw new InvalidRollError('cannot advance less than 1 space')
        }
        if (i == -1) {
            return new ComeInMove(this, color, n)
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
            return new BearoffMove(this, color, i, n)
        }
        return new RegularMove(this, color, i, n, j)
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

    listSlotsWithColor(color) {
        return Object.keys(this.slots).filter(i =>
            this.slots[i].length > 0 && this.slots[i][0].color == color
        ).map(i => +i)
    }

    clear() {
        this.slots = intRange(0, 23).map(i => [])
        this.bars  = {Red: [], White: []}
        this.homes = {Red: [], White: []}
    }

    copy() {
        const board = new Board
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

    toString() {
        return this.stateString()
    }

    static fromStateString(str) {
        const locs = str.split('|')
        const board = new Board
        board.bars.White = Piece.make(locs[0], White)
        board.bars.Red = Piece.make(locs[1], Red)
        for (var i = 0; i < 24; i++) {
            board.slots[i] = Piece.make(...locs[i + 2].split(':'))
        }
        board.homes.White = Piece.make(locs[26], White)
        board.homes.Red = Piece.make(locs[27], Red)
        return board
    }
}

class Move {

    constructor(board, color, i, n) {
        this.board = board
        this.color = color
        this.i = i
        this.n = n
    }
}

class ComeInMove extends Move {

    constructor(board, color, n) {

        if (!board.hasBar(color)) {
            throw new NoPieceOnBarError(sp(color, 'does not have a piece on the bar'))
        }
        const destIndex = Direction[color] == 1 ? n - 1 : 24 - n
        const slot = board.slots[destIndex]
        if (slot.length > 1 && slot[0].color != color) {
            throw new OccupiedSlotError(sp(color, 'cannot come in on space', destIndex + 1))
        }

        super(board, color, -1, n)

        this.isComeIn = true
        this.destIndex = destIndex
    }

    do() {
        this.getDestSlot().push(this.getBar().pop())
    }

    undo() {
        this.getBar().push(this.getDestSlot().pop())
    }

    getBar() {
        return this.board.bars[this.color]
    }

    getDestSlot() {
        return this.board.slots[this.destIndex]
    }
}

class BearoffMove extends Move {

    constructor(board, color, i, n) {

        if (!board.mayBearoff(color)) {
            throw new MayNotBearoffError(sp(color, 'may not bare off'))
        }
        // get distance to home
        const homeDistance = Direction[color] == 1 ? 24 - i : i + 1
        // make sure no piece is behind
        if (n > homeDistance && board.hasPieceBehind(color, i)) {
            throw new IllegalBareoffError(sp('cannot bear off with a piece behind'))
        }

        super(board, color, i, n)

        this.isBearoff = true
    }

    do() {
        this.getHome().push(this.getOriginSlot().pop())
    }

    undo() {
        this.getOriginSlot().push(this.getHome().pop())
    }

    getOriginSlot() {
        return this.board.slots[this.i]
    }

    getHome() {
        return this.board.homes[this.color]
    }
}

class RegularMove extends Move {

    constructor(board, color, i, n, j) {

        const dest = board.slots[j]

        if (dest.length > 1 && dest[0].color != color) {
            throw new OccupiedSlotError(sp(color, 'may not occupy space', j + 1))
        }

        super(board, color, i, n)

        this.j = j
        this.isRegular = true
        this.isHit = dest.length == 1 && dest[0].color != color
    }

    do() {
        if (this.isHit) {
            this.getOpponentBar().push(this.getDestSlot().pop())
        }
        this.getDestSlot().push(this.getOriginSlot().pop())
    }

    undo() {
        this.getOriginSlot().push(this.getDestSlot().pop())
        if (this.isHit) {
            this.getDestSlot().push(this.getOpponentBar().pop())
        }
    }

    getOriginSlot() {
        return this.board.slots[this.i]
    }

    getDestSlot() {
        return this.board.slots[this.j]
    }

    getOpponentBar() {
        return this.board.bars[Opponent[this.color]]
    }
}

class Piece {

    constructor(color) {
        this.color = color
        this.c = ColorAbbr[color]
    }

    static make(n, color) {
        return intRange(0, +n - 1).map(i => new Piece(color))
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

    static sequencesForFaces(faces) {
        if (faces.length == 2) {
            return [
                [faces[0], faces[1]]
              , [faces[1], faces[0]]
            ]
        }
        return [
            [faces[0], faces[1], faces[2], faces[3]]
        ]
    }
}

class GameError extends Error {

    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

class IllegalStateError extends GameError {}
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

module.exports = {Match, Board, SequenceTree, BoardNode, Piece, Dice, Turn}