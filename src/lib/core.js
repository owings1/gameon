/**
 * gameon - Core class
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
const Util   = require('./util')

const {intRange} = Util

const White = 'White'
const Red   = 'Red'

const Colors = {White, Red}

const ColorAbbr = {
    White : 'W'
  , Red   : 'R'
}

const ColorNorm = {
    White
  , Red
  , W : White
  , R : Red
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

// Must manually enable
const Profiler = Util.Profiler.createDisabled()

class Match {

    static defaults() {
        return {
            isCrawford : true
          , isJacoby   : false
        }
    }

    static serialize(match) {
        return match.serialize()
    }

    static unserialize(data) {
        const match = new Match(data.total, data.opts)

        match.uuid = data.uuid

        match.hasCrawforded = data.hasCrawforded
        match.winner = data.winner
        match.isFinished = data.isFinished
        match.scores = data.scores

        match.games = data.games.map(Game.unserialize)
        match.thisGame = match.games[match.games.length - 1] || null

        return match
    }

    constructor(total, opts) {

        if (!Number.isInteger(total) || total < 1) {
            throw new ArgumentError('total must be integer > 0')
        }

        this.uuid = Util.uuid()
        this.total = total
        this.opts = Util.defaults(Match.defaults(), opts)

        this.hasCrawforded = false
        this.winner = null
        this.isFinished = false
        this.scores = {Red: 0, White: 0}

        this.games = []
        this.thisGame = null
    }

    nextGame() {
        if (this.thisGame && !this.thisGame.checkFinished()) {
            throw new GameNotFinishedError('Current game has not finished')
        }
        if (this.hasWinner()) {
            throw new MatchFinishedError('Match is already finished')
        }
        const isCrawford = this.opts.isCrawford &&
              !this.hasCrawforded &&
              undefined != Object.values(this.scores).find(score => score + 1 == this.total)
        if (isCrawford) {
            this.hasCrawforded = true
        }
        const opts = Util.merge({}, this.opts, {isCrawford})
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

    checkFinished() {
        if (this.isFinished) {
            return true
        }
        this.updateScore()
        this.isFinished = this.hasWinner()
        return this.isFinished
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

    meta() {
        return {
            uuid          : this.uuid
          , total         : this.total
          , scores        : this.scores
          , winner        : this.getWinner()
          , loser         : this.getLoser()
          , hasCrawforded : this.hasCrawforded
          , isFinished    : this.isFinished
          , gameCount     : this.games.length
        }
    }

    serialize() {
        return Util.merge(this.meta(), {
            games: this.games.map(Game.serialize)
        })
    }
}

class Game {

    static defaults() {
        return {
            isCrawford : false
          , isJacoby   : false
        }
    }

    static serialize(game) {
        return game.serialize()
    }

    static unserialize(data) {

        const game = new Game(data.opts)

        game.uuid = data.uuid

        game.cubeOwner   = data.cubeOwner
        game.cubeValue   = data.cubeValue
        game.endState    = data.endState
        game.finalValue  = data.finalValue
        game.isFinished  = data.isFinished
        game.isPass      = data.isPass
        game.winner      = data.winner
        game.turnHistory = data.turnHistory

        if (data.thisTurn) {
            game.thisTurn = Turn.unserialize(data.thisTurn, game.board)
        }
        game.board.setStateString(data.board)

        return game
    }

    constructor(opts) {

        this.opts  = Util.defaults(Game.defaults(), opts)
        this.uuid  = Util.uuid()
        this.board = Board.setup()

        this.cubeOwner  = null
        this.cubeValue  = 1
        this.endState   = null
        this.finalValue = null
        this.isFinished = false
        this.isPass     = false
        this.winner     = null

        this.turnHistory = []
        this.thisTurn = null
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
        this.thisTurn.isFirstTurn = true
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
            throw new TurnNotFinishedError([this.thisTurn.color, 'has not finished the current turn'])
        }
        if (this.checkFinished()) {
            return null
        }
        this.turnHistory.push(this.thisTurn.meta())
        this.thisTurn = new Turn(this.board, Opponent[this.thisTurn.color])
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

    getLoser() {
        const winner = this.getWinner()
        return winner ? Opponent[winner] : null
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
            this.turnHistory.push(this.thisTurn.meta())
            // We can't clear the turn because the net server expects it to be there
            // for the second player request
            //this.thisTurn = null
        }
        return this.isFinished
    }

    getTurnCount() {
        return this.turnHistory.length + +!!this.thisTurn
    }

    meta() {
        return {
            uuid       : this.uuid
          , opts       : this.opts
          , board      : this.board.stateString()
          , winner     : this.getWinner()
          , loser      : this.getLoser()
          , finalValue : this.finalValue
          , cubeOwner  : this.cubeOwner
          , cubeValue  : this.cubeValue
          , isFinished : this.isFinished
          , isPass     : this.isPass
          , endState   : this.endState
          , turnCount  : this.getTurnCount()
        }
    }

    serialize() {
        const data = this.meta()
        data.turnHistory = this.turnHistory.slice(0)
        if (this.thisTurn) {
            data.thisTurn = this.thisTurn.serialize()
        }
        return data
    }

    // allow override for testing
    _rollFirst() {
        return Dice.rollTwo()
    }
}

class Turn {

    static serialize(turn) {
        return turn.serialize()
    }

    static unserialize(data, board) {

        board = board || Board.fromStateString(data.startState)

        const turn = new Turn(board, data.color)

        if (data.isRolled) {
            turn.setRoll(...data.dice)
        }

        data.moves.forEach(move => turn.move(move.origin, move.face))
    
        turn.isDoubleDeclined = data.isDoubleDeclined
        turn.isDoubleOffered  = data.isDoubleOffered

        if (data.isFinished) {
            turn.finish()
        }

        return turn
    }

    constructor(board, color) {

        this.board      = board
        this.color      = color
        this.opponent   = Opponent[color]
        this.startState = board.stateString()

        this.dice             = null
        this.diceSorted       = null
        this.endState         = null
        this.faces            = null
        this.isCantMove       = false
        this.isDoubleDeclined = false
        this.isDoubleOffered  = false
        this.isFinished       = false
        this.isForceMove      = false
        this.isRolled         = false

        this.moves = []
    }

    setDoubleOffered() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.isDoubleOffered = true
        return this
    }

    setDoubleDeclined() {

        if (this.isDoubleDeclined) {
            return
        }

        this.assertNotFinished()
        if (!this.isDoubleOffered) {
            throw new HasNotDoubledError([this.color, 'has not doubled'])
        }

        this.isDoubleDeclined = true

        this.finish()
        return this
    }

    setRoll(...args) {

        this.assertNotFinished()
        this.assertNotRolled()
        const dice = args.length == 1 ? args[0] : args
        Dice.checkTwo(dice)
        this.dice = dice
        this.diceSorted = dice.slice(0).sort(Util.sortNumericDesc)
        this.isRolled = true

        this.afterRoll()
        return this
    }

    roll() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.dice = this._roll()
        this.diceSorted = this.dice.slice(0).sort(Util.sortNumericDesc)
        this.isRolled = true

        this.afterRoll()
        return this
    }

    afterRoll() {

        this.assertNotFinished()
        this.assertIsRolled()

        this.faces = Dice.faces(this.dice)

        this._compute()

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
            const subSeriesA = allowedMoves.slice(0, this.moves.length).map(Move.hash)
            const subSeriesB = this.moves.map(Move.hash)
            return JSON.stringify(subSeriesA) == JSON.stringify(subSeriesB)
        }).map(moves => moves[this.moves.length]).filter(it => it != undefined).forEach(move => {
            moveMap[Move.hash(move)] = move
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
            throw new NoMovesRemainingError([this.color, 'has no more moves to do'])
        }
        const matchingMove = nextMoves.find(move => move.origin == origin && move.face == face)
        if (!matchingMove) {
            // this will throw a more specific error
            this.board.buildMove(this.color, origin, face)
            throw new IllegalMoveError(['move not available for', this.color])
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
            throw new NoMovesMadeError([this.color, 'has no moves to undo'])
        }
        const move = this.moves.pop()
        move.undo()
        this.remainingFaces.push(move.face)
        this.remainingFaces.sort(Util.sortNumericDesc)
        return move
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
                    throw new MovesRemainingError([this.color, 'has more moves to do'])
                }
            }
        }
        this.endState = this.board.stateString()
        this.isFinished = true
        return this
    }

    assertNotFinished() {
        if (this.isFinished) {
            throw new TurnAlreadyFinishedError(['turn is already finished for', this.color])
        }
    }

    assertIsRolled() {
        if (!this.isRolled) {
            throw new HasNotRolledError([this.color, 'has not rolled'])
        }
    }

    assertNotRolled() {
        if (this.isRolled) {
            throw new AlreadyRolledError([this.color, 'has already rolled'])
        }
    }

    meta() {
        return {
            color            : this.color
          , dice             : this.dice
          , diceSorted       : this.diceSorted
          , startState       : this.startState
          , endState         : this.endState
          , isForceMove      : this.isForceMove
          , isCantMove       : this.isCantMove
          , isDoubleOffered  : this.isDoubleOffered
          , isDoubleDeclined : this.isDoubleDeclined
          , isFirstTurn      : this.isFirstTurn
          , isFinished       : this.isFinished
          , isRolled         : this.isRolled
          , moves            : this.moves.map(Move.coords)
        }
    }

    serialize() {
        return Util.merge(this.meta(), {
            allowedMoveCount   : this.allowedMoveCount
          , allowedMoveSeries  : this.allowedMoveSeries && this.allowedMoveSeries.map(moves => moves.map(Move.coords))
          , allowedEndStates   : this.allowedEndStates
          , allowedFaces       : this.allowedFaces
          , endStatesToSeries  : this.endStatesToSeries
        })
    }

    _compute() {
        Profiler.start('Turn.compute')
        Object.entries(this._computeAllowedMovesResult()).forEach(([k, v]) => {
            this[k] = v
        })
        Profiler.stop('Turn.compute')
    }

    _computeAllowedMovesResult() {

        Profiler.start('Turn.compute.1')

        const trees = Dice.sequencesForFaces(this.faces).map(sequence =>
            SequenceTree.build(this.board, this.color, sequence)
        )

        Profiler.stop('Turn.compute.1')

        Profiler.start('Turn.compute.2')

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

        Profiler.stop('Turn.compute.2')

        Profiler.start('Turn.compute.3')

        const endStatesToSeries = {}
        const allowedEndStates = []
        const allowedMoveSeries = []
        allowedBranches.forEach(branch => {

            const allowedMoves = branch.slice(1).map(node => node.thisMove)
            allowedMoveSeries.push(allowedMoves)
            

            const endState = branch[branch.length - 1].board.stateString()
            if (endStatesToSeries[endState]) {
                // de-dupe
                return
            }

            allowedEndStates.push(endState)
            endStatesToSeries[endState] = allowedMoves.map(Move.coords)

        })

        Profiler.stop('Turn.compute.3')

        Profiler.start('Turn.compute.4')

        const maximalAllowedFaces = Math.max(...allowedMoveSeries.map(allowedMoves => allowedMoves.length))

        const allowedFaces = allowedMoveSeries.length < 1 ? [] : allowedMoveSeries.find(
            allowedMoves => allowedMoves.length == maximalAllowedFaces
        ).map(move => move.face).sort(Util.sortNumericDesc)

        const res = {
            allowedMoveCount : maxDepth
          , isForceMove      : allowedMoveSeries.length == 1
          , isCantMove       : maxDepth == 0
          , allowedMoveSeries // constructed Move objects
          , allowedFaces
          , allowedEndStates
          , endStatesToSeries // move coords objects
        }

        Profiler.stop('Turn.compute.4')

        return res
    }

    // allow override for testing
    _roll() {
        return Dice.rollTwo()
    }
}

class Board {

    constructor(isSkipInit) {
        // isSkipInit is for performance on copy
        if (!isSkipInit) {
            this.clear()
            this.analyzer = new BoardAnalyzer(this)
        }
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

    // Performance optimized
    getPossibleMovesForFace(color, face) {
        Profiler.start('Board.getPossibleMovesForFace')
        try {
            if (this.hasBar(color)) {
                const barMove = this.getMoveIfCanMove(color, -1, face)
                return barMove ? [barMove] : []
            }
            const origins = this.originsOccupied(color)
            const len = origins.length
            const moves = []
            for (var i = 0; i < len; i++) {
                var move = this.getMoveIfCanMove(color, origins[i], face)
                if (move) {
                    moves.push(move)
                }
            }
            return moves
        } finally {
            Profiler.stop('Board.getPossibleMovesForFace')
        }
    }

    getMoveIfCanMove(color, origin, face) {
        Profiler.start('Board.getMoveIfCanMove')
        try {
            const {check, build} = this.checkMove(color, origin, face)
            if (check === true) {
                return new build.class(...build.args)
            }
            return null
        } finally {
            Profiler.stop('Board.getMoveIfCanMove')
        }
    }

    buildMove(color, origin, face) {
        const {check, build} = this.checkMove(color, origin, face)
        if (check !== true) {
            throw new check.class(check.message)
        }
        return new build.class(...build.args)
    }

    // Returns an object with two keys:
    //
    //    check: true iff the move is valid, else an error object {class, message}
    //    build: an object for constructing the move {class, args}
    //
    // The caller must test whether check === true, else construct and throw the
    // error. The build object may still populated even if there is an error.
    checkMove(color, origin, face) {
        Dice.checkOne(face)
        var check
        var build
        if (origin == -1) {
            check = ComeInMove.check(this, color, face)
            build = {class: ComeInMove, args: [this, color, face]}
            return {check, build}
        }
        if (this.hasBar(color)) {
            check = {class: PieceOnBarError, message: [color, 'has a piece on the bar']}
        } else {
            const slot = this.slots[origin]
            if (slot.length < 1 || slot[0].color != color) {
                check = {class: NoPieceOnSlotError, message: [color, 'does not have a piece on slot', origin + 1]}
            } else {
                const dest = origin + face * Direction[color]
                const isBearoff = dest < 0 || dest > 23
                if (isBearoff) {
                    check = BearoffMove.check(this, color, origin, face)
                    build = {class: BearoffMove, args: [this, color, origin, face]}
                } else {
                    check = RegularMove.check(this, color, origin, face)
                    build = {class: RegularMove, args: [this, color, origin, face]}
                }
            }
        }
        return {check, build}
    }

    canOccupyOrigin(color, origin) {
        const slot = this.slots[origin]
        return slot.length < 2 || slot[0].color == color
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

    // Performance optimized
    originsOccupied(color) {
        const origins = []
        for (var i = 0; i < 24; i++) {
            if (this.slots[i][0] && this.slots[i][0].color == color) {
                origins.push(i)
            }
        }
        return origins
    }

    clear() {
        this.slots = intRange(0, 23).map(i => [])
        this.bars  = {Red: [], White: []}
        this.homes = {Red: [], White: []}
    }

    copy() {
        const board = new Board(true)
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

    // Optimized for performance
    stateString() {
        // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
        // string concat implementation -- appears to be the best so far
        var str = this.bars.White.length + '|' + this.bars.Red.length + '|'
        for (var i = 0; i < 24; i++) {
            var slot = this.slots[i]
            str += slot.length + ':' + (slot.length ? slot[0].color : '') + '|'
        }
        return str + this.homes.White.length + '|' + this.homes.Red.length

        // array push/join implementation -- about 2x slower than string concat
        /*
        const parts = [
            this.bars.White.length
          , this.bars.Red.length
        ]
        this.slots.forEach(slot => {
            parts.push([slot.length, slot.length > 0 ? slot[0].color : ''].join(':'))
        })
        parts.push(this.homes.White.length)
        parts.push(this.homes.Red.length)
        return parts.join('|')
        */

        // array concat/join implementation -- no observed degredation over pushs
        /*
        return [
            this.bars.White.length
          , this.bars.Red.length
        ].concat(this.slots.map(slot =>
            [slot.length, slot.length > 0 ? slot[0].color : ''].join(':')
        )).concat([
            this.homes.White.length
          , this.homes.Red.length
        ]).join('|')
        */
    }

    stateStructure() {
        return [
            this.bars.White.length * Direction.White
          , this.bars.Red.length * Direction.Red
        ].concat(this.slots.map(slot =>
            slot.length > 0 ? Direction[slot[0].color] * slot.length : 0
        )).concat([
            this.homes.White.length * Direction.White
          , this.homes.Red.length * Direction.Red
        ])
    }

    setStateStructure(structure) {
        this.bars.White = Piece.make(Math.abs(structure[0]), White)
        this.bars.Red = Piece.make(Math.abs(structure[1]), Red)
        for (var i = 0; i < 24; i++) {
            this.slots[i] = Piece.make(Math.abs(structure[i + 2]), structure[i + 2] < 0 ? Red : White)
        }
        this.homes.White = Piece.make(Math.abs(structure[26]), White)
        this.homes.Red = Piece.make(Math.abs(structure[27]), Red)
    }

    pointOrigin(color, point) {
        return Board.pointOrigin(color, point)
    }

    originPoint(color, origin) {
        return Board.originPoint(color, origin)
    }

    toString() {
        return this.stateString()
    }

    inverted() {
        const board = new Board
        board.bars.White = Piece.make(this.bars.Red.length, White)
        board.bars.Red = Piece.make(this.bars.White.length, Red)
        board.homes.White = Piece.make(this.homes.Red.length, White)
        board.homes.Red = Piece.make(this.homes.White.length, Red)
        this.slots.forEach((slot, i) => {
            if (slot.length > 0) {
                const j = 23 - i
                board.slots[j] = Piece.make(slot.length, Opponent[slot[0].color])
            }
        })
        return board
    }

    static pointOrigin(color, point) {
        if (point == -1) {
            return -1
        }
        if (color == Red) {
            return point - 1
        }
        return 24 - point
    }

    static originPoint(color, origin) {
        if (origin == -1) {
            return -1
        }
        if (color == Red) {
            return origin + 1
        }
        return 24 - origin
    }

    static fromStateString(str) {
        const board = new Board
        board.setStateString(str)
        return board
    }

    static fromStateStructure(structure) {
        const board = new Board
        board.setStateStructure(structure)
        return board
    }
}

class BoardAnalyzer {

    constructor(board) {
        this.board = board
    }

    slotsHeld(color) {
        return Object.keys(this.board.slots).filter(i => {
            const slot = this.board.slots[i]
            return slot.length > 1 && slot[0].color == color
        }).map(i => +i)
    }

    piecesHome(color) {
        return this.board.homes[color].length
    }

    piecesOnPoint(color, point) {
        return this.board.slots[this.board.pointOrigin(color, point)].filter(piece => piece.color == color).length
    }

    piecesInPointRange(color, px, py) {
        var count = 0
        for (var p = px; p <= py; p++) {
            count += this.piecesOnPoint(color, p)
        }
        return count
    }

    pipCount(color) {
        var count = this.board.bars[color].length * 25
        this.pointsOccupied(color).forEach(point => {
            count += this.piecesOnPoint(color, point) * point
        })
        return count
    }

    pipCounts() {
        return {
            White : this.pipCount(White)
          , Red   : this.pipCount(Red)
        }
    }

    pointsOccupied(color) {
        return this.board.originsOccupied(color).map(i => this.board.originPoint(color, i))
    }

    blots(color) {

        Profiler.start('BoardAnalyzer.blots')

        try {
            const blots = []

            const blotSlots = Object.keys(this.board.slots).filter(i => {
                const slot = this.board.slots[i]
                return slot.length == 1 && slot[0].color == color
            }).map(i => +i)

            if (blotSlots.length == 0) {
                return blots
            }

            const opponentSlots = this.board.originsOccupied(Opponent[color])
            const opponentPoints = opponentSlots.map(i => this.board.originPoint(color, i))
            const hasBar = this.board.bars[Opponent[color]].length > 0

            blotSlots.forEach(origin => {

                const point = this.board.originPoint(color, origin)
                const attackerPoints = opponentPoints.filter(p => p < point)
                const attackerDistances = attackerPoints.map(p => point - p)
                if (hasBar) {
                    attackerDistances.push(point)
                }
                const minDistance = Math.min(...attackerDistances)
                const directCount = attackerDistances.filter(n => n < 7).length
                const indirectCount = attackerDistances.filter(n => n > 6 && n < 12).length
                // TODO: risk factor?
                const attackerSlots = attackerPoints.map(p => this.board.pointOrigin(color, p))

                blots.push({
                    point
                  , origin
                  , minDistance
                  , directCount
                  , indirectCount
                  , attackerDistances
                  , attackerPoints
                  , attackerSlots
                  , hasBar
                })
            })

            return blots
        } finally {
            Profiler.stop('BoardAnalyzer.blots')
        }
    }

    isDisengaged() {
        if (this.board.hasWinner()) {
            return true
        }
        if (this.board.hasBar(White) || this.board.hasBar(Red)) {
            return false
        }
        const backmostRed = Math.max(...this.board.originsOccupied(Red))
        const backmostWhite = Math.min(...this.board.originsOccupied(White))
        return backmostWhite > backmostRed
    }

    primes(color) {
        Profiler.start('BoardAnalyzer.primes')
        const slotsHeld = this.slotsHeld(color)
        const pointsHeld = slotsHeld.map(i => this.board.originPoint(color, i))
        pointsHeld.sort(Util.sortNumericAsc)
        const primes = []
        while (pointsHeld.length > 1) {
            var pointStart = pointsHeld.shift()
            var pointEnd = pointStart
            while (pointsHeld[0] == pointEnd + 1) {
                pointEnd = pointsHeld.shift()
            }
            if (pointEnd > pointStart) {
                primes.push({
                    pointStart
                  , pointEnd
                  , start : this.board.pointOrigin(color, pointStart)
                  , end   : this.board.pointOrigin(color, pointEnd)
                  , size  : pointEnd - pointStart + 1
                })
            }
        }
        Profiler.stop('BoardAnalyzer.primes')
        return primes
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
        Profiler.start('SequenceTree.build.1')
        this.nodes = SequenceTree.buildNodes(this.board, this.color, this.sequence)
        Profiler.stop('SequenceTree.build.1')
        Profiler.start('SequenceTree.build.2')
        this.depth = Math.max(...this.nodes.map(node => node.depth))
        this.leaves = this.nodes.filter(node => node.depth == this.depth)
        this.branches = SequenceTree.buildBranchesForLeaves(this.leaves)
        this.hasWinner = undefined != this.leaves.find(node => node.isWinner)
        this.winningBranches = this.branches.filter(branch => branch[branch.length - 1].isWinner)
        Profiler.stop('SequenceTree.build.2')
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

        const nodesAtDepth = [nodes.slice(0)]
        sequence.forEach((face, seqi) => {
            const depth = seqi + 1
            nodesAtDepth[depth] = []
            nodesAtDepth[depth - 1].forEach(parentNode => {
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
                    nodesAtDepth[depth].push(childNode)
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

    static coords(move) {
        const {origin, face} = move
        return {origin, face}
    }

    static hash(move) {
        return [move.origin, move.face].join(':')
    }

    constructor(board, color, origin, face) {
        this.board = board
        this.color = color
        this.origin = origin
        this.face = face
    }

    coords() {
        return Move.coords(this)
    }

    hash() {
        return Move.hash(this)
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

    // Returns true or error object
    static check(board, color, face) {
        if (!board.hasBar(color)) {
            return {class: NoPieceOnBarError, message: [color, 'does not have a piece on the bar']}
        }
        const {dest} = ComeInMove.getDestInfo(board, color, face)
        if (!board.canOccupyOrigin(color, dest)) {
            return {class: OccupiedSlotError, message: [color, 'cannot come in on space', dest + 1]}
        }
        return true
    }

    constructor(board, color, face) {

        super(board, color, -1, face)
        this._constructArgs = Object.values(arguments)

        this.check(board, color, face)

        const {dest, isHit} = this.getDestInfo(board, color, face)

        this.isComeIn = true
        this.dest = dest
        this.isHit = isHit
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

    getDestInfo(...args) {
        return this.constructor.getDestInfo(...args)
    }

    static getDestInfo(board, color, face) {
        const dest = Direction[color] == 1 ? face - 1 : 24 - face
        const destSlot = board.slots[dest]
        const isHit = destSlot.length == 1 && destSlot[0].color != color
        return {dest, isHit}
    }
}

class RegularMove extends Move {

    // Returns true or error object
    static check(board, color, origin, face) {
        const {dest} = RegularMove.getDestInfo(board, color, origin, face)
        if (!board.canOccupyOrigin(color, dest)) {
            return {class: OccupiedSlotError, message: [color, 'may not occupy space', dest + 1]}
        }
        return true
    }

    constructor(board, color, origin, face) {

        super(board, color, origin, face)
        this._constructArgs = Object.values(arguments)

        this.check(board, color, origin, face)

        const {dest, isHit} = this.getDestInfo(board, color, origin, face)

        this.dest = dest
        this.isRegular = true
        this.isHit = isHit
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

    getDestInfo(...args) {
        return this.constructor.getDestInfo(...args)
    }

    static getDestInfo(board, color, origin, face) {
        const dest = origin + face * Direction[color]
        const destSlot = board.slots[dest]
        const isHit = destSlot.length == 1 && destSlot[0].color != color
        return {dest, isHit}
    }
}

class BearoffMove extends Move {

    // Returns true or error object
    static check(board, color, origin, face) {
        if (!board.mayBearoff(color)) {
            return {class: MayNotBearoffError, message: [color, 'may not bare off']}
        }
        // get distance to home
        const homeDistance = BearoffMove.getHomeDistance(color, origin)
        // make sure no piece is behind
        if (face > homeDistance && board.hasPieceBehind(color, origin)) {
            return {class: IllegalBareoffError, message: ['cannot bear off with a piece behind']}
        }
        return true
    }

    constructor(board, color, origin, face) {

        super(board, color, origin, face)
        this._constructArgs = Object.values(arguments)

        this.check(board, color, origin, face)

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

    static getHomeDistance(color, origin) {
        return Direction[color] == 1 ? 24 - origin : origin + 1
    }
}

class Piece {

    constructor(color) {
        this.color = ColorNorm[color]
        this.c = ColorAbbr[this.color]
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

    constructor(message, ...args) {
        if (Array.isArray(message)) {
            message = Util.joinSpace(...message)
        }
        super(message, ...args)
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

class ArgumentError     extends GameError {}
class InvalidRollError  extends GameError {}

class AlreadyRolledError        extends IllegalStateError {}
class DoubleNotAllowedError     extends IllegalStateError {}
class HasNotDoubledError        extends IllegalStateError {}
class HasNotRolledError         extends IllegalStateError {}
class GameAlreadyStartedError   extends IllegalStateError {}
class GameFinishedError         extends IllegalStateError {}
class GameNotFinishedError      extends IllegalStateError {}
class GameNotStartedError       extends IllegalStateError {}
class MatchFinishedError        extends IllegalStateError {}
class TurnAlreadyFinishedError  extends IllegalStateError {}
class TurnNotFinishedError      extends IllegalStateError {}

class IllegalBareoffError    extends IllegalMoveError {}
class MayNotBearoffError     extends IllegalMoveError {}
class MovesRemainingError    extends IllegalMoveError {}
class NoMovesMadeError       extends IllegalMoveError {}
class NoMovesRemainingError  extends IllegalMoveError {}
class NoPieceOnBarError      extends IllegalMoveError {}
class NoPieceOnSlotError     extends IllegalMoveError {}
class OccupiedSlotError      extends IllegalMoveError {}
class PieceOnBarError        extends IllegalMoveError {}

// as needed
const Errors = {
    HasNotRolledError
}

module.exports = {
    Colors
  , ColorAbbr
  , Match
  , Game
  , Board
  , SequenceTree
  , BoardNode
  , Piece
  , Dice
  , Turn
  , White
  , Red
  , Opponent
  , Profiler
  , Errors
}