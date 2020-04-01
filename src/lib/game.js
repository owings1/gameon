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
        this.rolled = null
        this.isDoubleOffered = false
        this.isRolled = false
        this.isFinished = false
    }

    setDoubleOffered() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.isDoubleOffered = true
    }

    setDoubleDeclined() {

        this.assertNotFinished()
        if (!this.isDoubleOffered) {
            throw new IllegalStateError(sp(this.color, 'has not doubled'))
        }

        this.isDoubleDeclined = true
        this.isFinished = true
    }

    setRoll(dice) {

        this.assertNotFinished()
        this.assertNotRolled()

        Dice.checkTwo(dice)
        this.dice = dice
        this.isRolled = true

        this.afterRoll()
    }

    roll() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.dice = Dice.rollTwo()
        this.isRolled = true

        this.afterRoll()
    }

    afterRoll() {

        this.assertNotFinished()
        this.assertIsRolled()

        this.faces = Dice.faces(this.dice)

        const trees = Dice.sequencesForFaces(this.faces).map(sequence =>
            SequenceTree.build(this.board, this.color, sequence)
        )
        const maxDepth = Math.max(...trees.map(tree => tree.depth))

        // trees that use the most number of faces
        const fullestTrees = trees.filter(tree => maxDepth > 0 && tree.depth == maxDepth)

        // branches that use the most number of faces
        const fullestBranches = []
        fullestTrees.forEach(tree => {
            tree.branches.filter(branch => branch.length - 1 == maxDepth).forEach(branch => {
                fullestBranches.push(branch)
            })
        })
        // the highest face of nodes of the fullest branches
        const maxFace = Math.max(...fullestBranches.map(branch => Math.max(...branch.map(node => node.thisFace ))))
        // branches that use the highest face
        const allowedBranches = fullestBranches.filter(branch => branch.find(node => node.thisFace == maxFace))

        // TODO: de-duplicate
        this.allowedMoveSeries = allowedBranches.map(branch =>
            branch.slice(1).map(node => node.thisMove)
        )
        this.allowedMoveCount = maxDepth
        if (this.allowedMoveCount == 0) {
            this.finish()
        }
    }

    getNextAvaliableMoves() {
        return this.allowedMoveSeries.filter(allowedMoves => {
            // compare the first parts of allowedMoves to this.moves
            const subSeriesA = allowedMoves.slice(0, this.moves.length).map(move => [move.origin, move.face])
            const subSeriesB = this.moves.map(move => [move.origin, move.face])
            return JSON.stringify(subSeriesA) == JSON.stringify(subSeriesB)
        }).map(moves => moves[this.moves.length]).filter(it => it != undefined)
    }

    move(origin, face) {
        this.assertNotFinished()
        this.assertIsRolled()
        const nextMoves = this.getNextAvaliableMoves()
        if (nextMoves.length == 0) {
            throw new NoMovesRemainingError(sp(this.color, 'has no more moves to do'))
        }
        const matchingMove = nextMoves.find(move => move.origin == origin && move.face == face)
        if (!matchingMove) {
            // TODO: explain why it's not availble, if building the move fails, show that error
            throw new IllegalMoveError(sp('move not available for', this.color))
        }
        const move = this.board.move(this.color, origin, face)
        this.moves.push(move)
    }

    unmove() {
        this.assertNotFinished()
        if (this.moves.length == 0) {
            throw new NoMovesMadeError(sp(this.color, 'has no moves to undo'))
        }
        this.moves.pop().undo()
    }

    finish() {
        if (this.isFinished) {
            return
        }
        this.assertIsRolled()
        if (this.moves.length != this.allowedMoveCount) {
            throw new MovesRemainingError(sp(this.color, 'has more moves to do'))
        }
        this.isFinished = true
    }

    assertNotFinished() {
        if (this.isFinished) {
            throw new IllegalStateError(sp('turn is already finished for', this.color))
        }
    }

    assertIsRolled() {
        if (!this.isRolled) {
            throw new IllegalStateError(sp(this.color, 'has not rolled'))
        }
    }

    assertNotRolled() {
        if (this.isRolled) {
            throw new IllegalStateError(sp(this.color, 'has already rolled'))
        }
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

    move(color, origin, face) {
        const move = this.buildMove(color, origin, face)
        move.do()
        return move
    }

    getPossibleMovesForFace(color, face) {
        if (this.hasBar(color)) {
            return [this.getMoveIfCanMove(color, -1, face)].filter(move => move != null)
        }
        return this.listSlotsWithColor(color).map(origin =>
            this.getMoveIfCanMove(color, origin, face)
        ).filter(move => move != null)
    }

    getMoveIfCanMove(color, origin, face) {
        try {
            return this.buildMove(color, origin, face)
        } catch (err) {
            if (!err.isIllegalMoveError) {
                throw err
            }
            return null
        }
    }

    buildMove(color, origin, face) {
        Dice.checkOne(face)
        if (origin == -1) {
            return new ComeInMove(this, color, face)
        }
        if (this.hasBar(color)) {
            throw new PieceOnBarError(sp(color, 'has a piece on the bar'))
        }
        const slot = this.slots[origin]
        if (slot.length < 1 || slot[0].color != color) {
            throw new NoPieceOnSlotError(sp(color, 'does not have a piece on slot', origin + 1))
        }
        const dest = origin + face * Direction[color]
        const isBearoff = dest < 0 || dest > 23
        if (isBearoff) {
            return new BearoffMove(this, color, origin, face)
        }
        return new RegularMove(this, color, origin, face)
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

    constructor(board, color, origin, face) {
        this.board = board
        this.color = color
        this.origin = origin
        this.face = face
    }
}

class ComeInMove extends Move {

    constructor(board, color, face) {

        if (!board.hasBar(color)) {
            throw new NoPieceOnBarError(sp(color, 'does not have a piece on the bar'))
        }
        const dest = Direction[color] == 1 ? face - 1 : 24 - face
        const slot = board.slots[dest]
        if (slot.length > 1 && slot[0].color != color) {
            throw new OccupiedSlotError(sp(color, 'cannot come in on space', dest + 1))
        }

        super(board, color, -1, face)

        this.isComeIn = true
        this.dest = dest
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
        return this.board.slots[this.dest]
    }
}

class BearoffMove extends Move {

    constructor(board, color, origin, face) {

        if (!board.mayBearoff(color)) {
            throw new MayNotBearoffError(sp(color, 'may not bare off'))
        }
        // get distance to home
        const homeDistance = Direction[color] == 1 ? 24 - origin : origin + 1
        // make sure no piece is behind
        if (face > homeDistance && board.hasPieceBehind(color, origin)) {
            throw new IllegalBareoffError(sp('cannot bear off with a piece behind'))
        }

        super(board, color, origin, face)

        this.isBearoff = true
    }

    do() {
        this.getHome().push(this.getOriginSlot().pop())
    }

    undo() {
        this.getOriginSlot().push(this.getHome().pop())
    }

    getOriginSlot() {
        return this.board.slots[this.origin]
    }

    getHome() {
        return this.board.homes[this.color]
    }
}

class RegularMove extends Move {

    constructor(board, color, origin, face) {

        const dest = origin + face * Direction[color]
        const destSlot = board.slots[dest]

        if (destSlot.length > 1 && destSlot[0].color != color) {
            throw new OccupiedSlotError(sp(color, 'may not occupy space', dest + 1))
        }

        super(board, color, origin, face)

        this.dest = dest
        this.isRegular = true
        this.isHit = destSlot.length == 1 && destSlot[0].color != color
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
        return this.board.slots[this.origin]
    }

    getDestSlot() {
        return this.board.slots[this.dest]
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

    static checkOne(face) {
        if (!Number.isInteger(face)) {
            throw new InvalidRollError('die face must be an integer')
        }
        if (face > 6) {
            throw new InvalidRollError('die face cannot be greater than 6')
        }
        if (face < 1) {
            throw new InvalidRollError('die face cannot be less than 1')
        }
    }

    static checkTwo(faces) {
        Dice.checkOne(faces[0])
        Dice.checkOne(faces[1])
        if (faces.length > 2) {
            throw new InvalidRollError('more than two dice not allowed')
        }
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
class NoMovesRemainingError extends IllegalMoveError {}
class NoMovesMadeError extends IllegalMoveError {}
class MovesRemainingError extends IllegalMoveError {}

module.exports = {Match, Board, SequenceTree, BoardNode, Piece, Dice, Turn}