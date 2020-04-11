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
  , Red   : -1
}

const Opponent = {
    White : Red
  , Red   : White
}

const Defaults = {
    Match : {
        isCrawford : true
      , isJacoby   : false
    }
  , Game : {
        isCrawford : false
      , isJacoby   : false
    }
}

class Match {

    constructor(total, opts) {
        if (!Number.isInteger(total) || total < 1) {
            throw new ArgumentError('total must be integer > 0')
        }
        this.total = total
        this.opts = merge({}, Defaults.Match, opts)
        this.games = []
        this.scores = {
            Red   : 0
          , White : 0
        }
        this.thisGame = null
        this.winner = null
    }

    nextGame() {
        if (this.thisGame && !this.thisGame.checkFinished()) {
            throw new GameNotFinishedError('Current game has not finished')
        }
        if (this.hasWinner()) {
            throw new MatchFinishedError('Match is already finished')
        }
        const isCrawford = this.opts.isCrawford &&
                           undefined != Object.entries(this.scores).find(([color, score]) =>
                               score + 1 == this.total
                           )
        const opts = merge({}, this.opts, {isCrawford})
        this.thisGame = new Game(opts)
        this.games.push(this.thisGame)
        return this.thisGame
    }

    updateScore() {
        if (this.thisGame) {
            this.thisGame.checkFinished()
        }
        for (var color of Object.keys(this.scores)) {
            this.scores[color] = Util.sumArray(
                this.games.filter(
                    game => game.getWinner() == color
                ).map(game =>
                    game.finalValue
                )
            )
        }
    }

    hasWinner() {
        return this.getWinner() != null
    }

    getWinner() {
        const winner = Object.keys(this.scores).find(color => this.scores[color] >= this.total)
        return winner || null
    }

    getLoser() {
        if (this.hasWinner()) {
            return Opponent[this.getWinner()]
        }
        return null
    }
}

class Game {

    constructor(opts) {
        this.opts = merge({}, Defaults.Game, opts)
        this.board = Board.setup()
        this.cubeOwner = null
        this.cubeValue = 1
        this.thisTurn = null
        this.winner = null
        this.isFinished = false
        this.isPass = false
        this.endState = null
        this.finalValue = null
    }

    canDouble(color) {
        return !this.opts.isCrawford && this.cubeValue < 64 && (this.cubeOwner == null || this.cubeOwner == color)
    }

    double() {
        if (this.isFinished) {
            throw new GameFinishedError('The game is already over')
        }
        if (!this.thisTurn) {
            throw new GameNotStartedError('The game has not started')
        }
        this.thisTurn.assertNotRolled()
        if (!this.canDouble(this.thisTurn.color)) {
            throw new DoubleNotAllowedError(this.thisTurn.color + ' cannot double')
        }
        this.cubeValue *= 2
        this.cubeOwner = this.thisTurn.opponent
    }

    firstTurn() {
        if (this.isFinished) {
            throw new GameFinishedError('The game is already over')
        }
        if (this.thisTurn) {
            throw new GameAlreadyStartedError('The game has already started')
        }
        do {
            var dice = this._rollFirst()
        } while (dice[0] == dice[1])
        const firstColor = Dice.getWinner(dice)
        this.thisTurn = new Turn(this.board, firstColor)
        this.thisTurn.setRoll(dice)
        return this.thisTurn
    }

    nextTurn() {
        if (this.isFinished) {
            throw new GameFinishedError('The game is already over')
        }
        if (!this.thisTurn) {
            throw new GameNotStartedError('The game has not started')
        }
        if (!this.thisTurn.isFinished) {
            throw new TurnNotFinishedError(sp(this.thisTurn.color, 'has not finished the current turn'))
        }
        if (this.checkFinished()) {
            return null
        }
        this.thisTurn = new Turn(this.board, Opponent[this.thisTurn.color])
        this.thisTurn.isFirstTurn = true
        return this.thisTurn
    }

    hasWinner() {
        this.checkFinished()
        return this.winner != null
    }

    getWinner() {
        this.checkFinished()
        return this.winner
    }

    checkFinished() {
        if (this.isFinished) {
            return true
        }
        if (!this.thisTurn) {
            return false
        }
        if (!this.thisTurn.isFinished) {
            return false
        }
        if (this.thisTurn.isDoubleDeclined) {
            this.isPass = true
            this.winner = this.thisTurn.color
            this.finalValue = this.cubeValue
            this.isFinished = true
        } else if (this.board.hasWinner()) {
            this.isBackgammon = this.board.isBackgammon()
            this.isGammon = this.board.isGammon()
            this.winner = this.board.getWinner()
            if (this.isGammon && (this.cubeValue > 1 || !this.opts.isJacoby)) {
                if (this.isBackgammon) {
                    this.finalValue = this.cubeValue * 4
                } else {
                    this.finalValue = this.cubeValue * 2
                }
            } else {
                this.finalValue = this.cubeValue
            }
            this.isFinished = true
        }
        if (this.isFinished) {
            this.endState = this.board.stateString()
        }
        return this.isFinished
    }

    // allow override for testing
    _rollFirst() {
        return Dice.rollTwo()
    }
}

class Turn {

    constructor(board, color) {
        this.board = board
        this.color = color
        this.opponent = Opponent[color]
        this.moves = []
        this.dice = null
        this.diceSorted = null
        this.faces = null
        this.isDoubleOffered = false
        this.isDoubleDeclined = false
        this.isRolled = false
        this.isCantMove = false
        this.isForceMove = false
        this.isFinished = false
        this.startState = board.stateString()
        this.endState = null
    }

    setDoubleOffered() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.isDoubleOffered = true
    }

    setDoubleDeclined() {

        this.assertNotFinished()
        if (!this.isDoubleOffered) {
            throw new HasNotDoubledError(sp(this.color, 'has not doubled'))
        }

        this.isDoubleDeclined = true

        this.finish()
    }

    setRoll(dice) {

        this.assertNotFinished()
        this.assertNotRolled()

        Dice.checkTwo(dice)
        this.dice = dice
        this.diceSorted = dice.slice(0).sort(Util.sortNumericDesc)
        this.isRolled = true

        this.afterRoll()
    }

    roll() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.dice = this._roll()
        this.diceSorted = this.dice.slice(0).sort(Util.sortNumericDesc)
        this.isRolled = true

        this.afterRoll()
    }

    afterRoll() {

        this.assertNotFinished()
        this.assertIsRolled()

        this.faces = Dice.faces(this.dice)

        Object.entries(this._computeAllowedMovesResult()).forEach(([k, v]) => {
            this[k] = v
        })

        this.remainingFaces = this.allowedFaces.slice(0)
        if (this.isCantMove) {
            this.finish()
        }
    }

    getNextAvailableMoves() {
        this.assertIsRolled()
        const moveMap = {}
        this.allowedMoveSeries.filter(allowedMoves => {
            // compare the first parts of allowedMoves to this.moves
            const subSeriesA = allowedMoves.slice(0, this.moves.length).map(move => [move.origin, move.face])
            const subSeriesB = this.moves.map(move => [move.origin, move.face])
            return JSON.stringify(subSeriesA) == JSON.stringify(subSeriesB)
        }).map(moves => moves[this.moves.length]).filter(it => it != undefined).forEach(move => {
            const moveHash = [move.origin, move.face].join(':')
            moveMap[moveHash] = move
        })
        return Object.values(moveMap)
    }

    move(origin, face) {
        if (typeof(origin) == 'object') {
            // allow a move or coords to be passed
            face = origin.face
            origin = origin.origin
        }
        this.assertNotFinished()
        this.assertIsRolled()
        const nextMoves = this.getNextAvailableMoves()
        if (nextMoves.length == 0) {
            throw new NoMovesRemainingError(sp(this.color, 'has no more moves to do'))
        }
        const matchingMove = nextMoves.find(move => move.origin == origin && move.face == face)
        if (!matchingMove) {
            // this will throw a more specific error
            this.board.buildMove(this.color, origin, face)
            throw new IllegalMoveError(sp('move not available for', this.color))
        }
        const move = this.board.move(this.color, origin, face)
        this.moves.push(move)
        const faceIdx = this.remainingFaces.indexOf(face)
        this.remainingFaces.splice(faceIdx, 1)
        return move
    }

    unmove() {
        this.assertNotFinished()
        if (this.moves.length == 0) {
            throw new NoMovesMadeError(sp(this.color, 'has no moves to undo'))
        }
        const move = this.moves.pop()
        move.undo()
        this.remainingFaces.push(move.face)
        this.remainingFaces.sort(Util.sortNumericDesc)
    }

    finish() {
        if (this.isFinished) {
            return
        }
        if (!this.isDoubleDeclined) {
            this.assertIsRolled()
            const isAllMoved = this.moves.length == this.allowedMoveCount
            if (!isAllMoved) {
                const isWin = this.board.hasWinner() && this.board.getWinner() == this.color
                if (!isWin) {
                    throw new MovesRemainingError(sp(this.color, 'has more moves to do'))
                }
            }
        }
        this.endState = this.board.stateString()
        this.isFinished = true
    }

    assertNotFinished() {
        if (this.isFinished) {
            throw new TurnAlreadyFinishedError(sp('turn is already finished for', this.color))
        }
    }

    assertIsRolled() {
        if (!this.isRolled) {
            throw new HasNotRolledError(sp(this.color, 'has not rolled'))
        }
    }

    assertNotRolled() {
        if (this.isRolled) {
            throw new AlreadyRolledError(sp(this.color, 'has already rolled'))
        }
    }

    _computeAllowedMovesResult() {

        const trees = Dice.sequencesForFaces(this.faces).map(sequence =>
            SequenceTree.build(this.board, this.color, sequence)
        )

        const maxDepth = Math.max(...trees.map(tree => tree.depth))

        // the "most number of faces" rule has an exception when bearing off the last piece.
        // see test case RedBearoff51

        // trees that use the most number of faces, or have a winning branch
        const fullestTrees = trees.filter(tree =>
            maxDepth > 0 && (tree.depth == maxDepth || tree.hasWinner)
        )

        // branches that use the most number of faces, or is a winner
        const fullestBranches = []
        fullestTrees.forEach(tree => {
            tree.branches.filter(branch =>
                branch.length - 1 == maxDepth || tree.winningBranches.indexOf(branch) > -1
            ).forEach(branch => {
                fullestBranches.push(branch)
            })
        })
        // the highest face of nodes of the fullest branches
        const maxFace = Math.max(...fullestBranches.map(branch => Math.max(...branch.map(node => node.thisFace))))
        // branches that use the highest face, or is a winner
        const allowedBranches = fullestBranches.filter(branch =>
            branch.find(node =>
                node.thisFace == maxFace || node.isWinner
            )
        )

        const allowedMoveSeries = allowedBranches.map(branch =>
            branch.slice(1).map(node => node.thisMove)
        )
        // De-duplicate
        const seriesMap = {}
        allowedMoveSeries.forEach(allowedMoves => {
            // TODO: we could de-dupe further by inspecting end-states
            const hash = allowedMoves.map(move => [move.origin, move.face].join(':')).join('|')
            seriesMap[hash] = allowedMoves
        })
        const dedupSeries = Object.values(seriesMap)

        // end states
        const endStatesMap = {}
        allowedBranches.forEach(branch =>
            endStatesMap[branch[branch.length - 1].board.stateString()] = true
        )
        const allowedEndStates = Object.keys(endStatesMap)

        const maximalAllowedFaces = Math.max(...dedupSeries.map(allowedMoves => allowedMoves.length))
        
        const allowedFaces = dedupSeries.length < 1 ? [] : dedupSeries.find(
            allowedMoves => allowedMoves.length == maximalAllowedFaces
        ).map(move => move.face).sort(Util.sortNumericDesc)

        return {
            allowedMoveSeries : dedupSeries
          , allowedMoveCount  : maxDepth
          , isForceMove       : dedupSeries.length == 1
          , isCantMove        : maxDepth == 0
          , allowedFaces
          , allowedEndStates
        }
    }

    // allow override for testing
    _roll() {
        return Dice.rollTwo()
    }
}

class Board {

    constructor() {
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

    isGammon() {
        return this.hasWinner() && this.homes[Opponent[this.getWinner()]].length == 0
    }

    isBackgammon() {
        if (this.isGammon()) {
            const winner = this.getWinner()
            return this.bars[Opponent[winner]].length > 0 ||
                   undefined != InsideSlots[winner].find(i => this.slots[i].length)
        }
        return false
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

    setStateString(str) {
        const locs = str.split('|')
        this.bars.White = Piece.make(locs[0], White)
        this.bars.Red = Piece.make(locs[1], Red)
        for (var i = 0; i < 24; i++) {
            this.slots[i] = Piece.make(...locs[i + 2].split(':'))
        }
        this.homes.White = Piece.make(locs[26], White)
        this.homes.Red = Piece.make(locs[27], Red)
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
        const board = new Board
        board.setStateString(str)
        return board
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
        this.hasWinner = null
    }

    build() {
        this.nodes = SequenceTree.buildNodes(this.board, this.color, this.sequence)
        this.depth = Math.max(...this.nodes.map(node => node.depth))
        this.leaves = this.nodes.filter(node => node.depth == this.depth)
        this.branches = SequenceTree.buildBranchesForLeaves(this.leaves)
        this.hasWinner = undefined != this.leaves.find(node => node.isWinner)
        this.winningBranches = this.branches.filter(branch => branch[branch.length - 1].isWinner)
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
                    childNode.isWinner = move.board.hasWinner() && move.board.getWinner() == color
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
        this.isWinner = null
    }
}

class Move {

    constructor(board, color, origin, face) {
        this.board = board
        this.color = color
        this.origin = origin
        this.face = face
    }

    coords() {
        const {origin, face} = this
        return {origin, face}
    }

    copy() {
        return new this.constructor(...this._constructArgs)
    }

    copyForBoard(board) {
        return new this.constructor(board, ...this._constructArgs.slice(1))
    }

    getDestSlot() {
        return this.board.slots[this.dest]
    }

    getOpponentBar() {
        return this.board.bars[Opponent[this.color]]
    }

    getOriginSlot() {
        return this.board.slots[this.origin]
    }
}

class ComeInMove extends Move {

    constructor(board, color, face) {

        if (!board.hasBar(color)) {
            throw new NoPieceOnBarError(sp(color, 'does not have a piece on the bar'))
        }
        const dest = Direction[color] == 1 ? face - 1 : 24 - face
        const destSlot = board.slots[dest]
        if (destSlot.length > 1 && destSlot[0].color != color) {
            throw new OccupiedSlotError(sp(color, 'cannot come in on space', dest + 1))
        }

        super(board, color, -1, face)
        this._constructArgs = Object.values(arguments)

        this.isComeIn = true
        this.dest = dest
        this.isHit = destSlot.length == 1 && destSlot[0].color != color
    }

    do() {
        if (this.isHit) {
            this.getOpponentBar().push(this.getDestSlot().pop())
        }
        this.getDestSlot().push(this.getBar().pop())
    }

    undo() {
        this.getBar().push(this.getDestSlot().pop())
        if (this.isHit) {
            this.getDestSlot().push(this.getOpponentBar().pop())
        }
    }

    getBar() {
        return this.board.bars[this.color]
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
        this._constructArgs = Object.values(arguments)

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
        this._constructArgs = Object.values(arguments)

        this.isBearoff = true
    }

    do() {
        this.getHome().push(this.getOriginSlot().pop())
    }

    undo() {
        this.getOriginSlot().push(this.getHome().pop())
    }

    getHome() {
        return this.board.homes[this.color]
    }
}

class Piece {

    constructor(color) {
        this.color = color
        this.c = ColorAbbr[color]
    }

    toString() {
        return this.color
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

    static getWinner(dice) {
        if (dice[0] == dice[1]) {
            return null
        }
        return dice[0] > dice[1] ? White : Red
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
        this.isGameError = true
    }
}

class IllegalStateError extends GameError {
    constructor(...args) {
        super(...args)
        this.isIllegalStateError = true
    }
}

class IllegalMoveError extends GameError {

    constructor(...args) {
        super(...args)
        this.isIllegalMoveError = true
    }
}

class ArgumentError extends GameError {}
class InvalidRollError extends GameError {}

class MatchFinishedError extends IllegalStateError {}
class GameFinishedError extends IllegalStateError {}
class GameNotFinishedError extends IllegalStateError {}
class GameAlreadyStartedError extends IllegalStateError {}
class GameNotStartedError extends IllegalStateError {}
class TurnAlreadyFinishedError extends IllegalStateError {}
class TurnNotFinishedError extends IllegalStateError {}
class HasNotRolledError extends IllegalStateError {}
class AlreadyRolledError extends IllegalStateError {}
class HasNotDoubledError extends IllegalStateError {}
class DoubleNotAllowedError extends IllegalStateError {}

class PieceOnBarError extends IllegalMoveError {}
class NoPieceOnBarError extends IllegalMoveError {}
class NoPieceOnSlotError extends IllegalMoveError {}
class MayNotBearoffError extends IllegalMoveError {}
class IllegalBareoffError extends IllegalMoveError {}
class OccupiedSlotError extends IllegalMoveError {}
class NoMovesRemainingError extends IllegalMoveError {}
class NoMovesMadeError extends IllegalMoveError {}
class MovesRemainingError extends IllegalMoveError {}

module.exports = {Match, Game, Board, SequenceTree, BoardNode, Piece, Dice, Turn, White, Red, Opponent}