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

const InsideOrigins = {
    White : intRange(18, 23)
  , Red   : intRange(0, 5).reverse()
}

const OutsideOrigins = {
    White : intRange(0, 17)
  , Red   : intRange(6, 23).reverse()
}

const PointOrigins = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}
const OriginPoints = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}

intRange(0, 23).forEach(origin => {
    // Origins are from 0 to 23
    // Points are from 1 to 24
    const point = origin + 1
    // Red point 1 is origin 0
    PointOrigins.Red[point] = point - 1
    // White point 1 is origin 23
    PointOrigins.White[point] = 24 - point
    // Red origin 0 is point 1
    OriginPoints.Red[origin] = origin + 1
    // White origin 0 is point 24
    OriginPoints.White[origin] = 24 - origin
})


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

const CacheKeys = {}

function populateCacheKeys(keys) {

    const atomicKeys = [
        'isDisengaged'
      , 'stateString'
    ]

    atomicKeys.forEach(key => keys[key] = key)

    const colorKeys = [
        'originsHeld'
      , 'originsOccupied'
      , 'pipCount'
      , 'pointsHeld'
      , 'pointsOccupied'
    ]

    colorKeys.forEach(key => {
        keys[key] = {
            Red   : key + '.' + Red
          , White : key + '.' + White
        }
    })
}

populateCacheKeys(CacheKeys)

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
        this.boardCache = {}
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

    // Performance optimized
    getNextAvailableMoves() {

        this.assertIsRolled()

        Profiler.start('Turn.getNextAvailableMoves')

        const moves = []
        const movesMap = {}
        const thisMovesStr = this.moves.map(Move.hash).join('|')

        this.allowedMoveSeries.forEach(allowedMoves => {

            // skip fast if there is no next move in the series
            const move = allowedMoves[this.moves.length]
            if (!move) {
                return
            }

            // skip fast if we already processed this move
            const hash = Move.hash(move)
            if (movesMap[hash]) {
                return
            }

            // compare the beginning of the series to this.moves
            // TODO: more performant comparison
            const movesSlice = allowedMoves.slice(0, this.moves.length)
            const movesSliceStr = movesSlice.map(Move.hash).join('|')
            const isEqual = movesSliceStr == thisMovesStr
            if (!isEqual) {
                return
            }

            movesMap[hash] = true
            moves.push(move)
        })

        Profiler.stop('Turn.getNextAvailableMoves')

        return moves
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
        this.boardCache = {}
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

    // Fetch cached. Cache is cleared on turn finish.
    fetchBoard(stateString) {
        if (!this.boardCache[stateString]) {
            this.boardCache[stateString] = Board.fromStateString(stateString)
        }
        return this.boardCache[stateString]
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

            const board = branch[branch.length - 1].board
            const endState = board.stateString()
            if (endStatesToSeries[endState]) {
                // de-dupe
                return
            }

            allowedEndStates.push(endState)
            endStatesToSeries[endState] = allowedMoves.map(Move.coords)
            // populate board cache
            this.boardCache[endState] = board
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

// NB: Do not directly modify slots, bars, or homes unless you call markChange()
//     afterward. Validated moves can use push/pop methods.
// NB: Cached methods return a reference, so callers must make a copy if they will modify
class Board {

    constructor(isSkipInit) {
        this.analyzer = new BoardAnalyzer(this)
        this.cache = {}
        // isSkipInit is for performance on copy
        if (!isSkipInit) {
            this.clear()
        }
    }

    static setup() {
        const board = new Board(true)
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
        const moves = []
        if (this.bars[color].length) {
            var {check, build} = this.checkMove(color, -1, face)
            if (check === true) {
                moves.push(new build.class(...build.args))
            }
        } else {
            const origins = this.originsOccupied(color)
            const len = origins.length
            for (var i = 0; i < len; i++) {
                var {check, build} = this.checkMove(color, origins[i], face)
                if (check === true) {
                    moves.push(new build.class(...build.args))
                }
            }
        }
        Profiler.stop('Board.getPossibleMovesForFace')
        return moves
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
        Profiler.start('Board.checkMove')
        try {
            Dice.checkOne(face)
            var check
            var build
            if (origin == -1) {
                check = ComeInMove.check(this, color, face)
                build = {class: ComeInMove, args: [this, color, face, check === true]}
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
                        build = {class: BearoffMove, args: [this, color, origin, face, check === true]}
                    } else {
                        check = RegularMove.check(this, color, origin, face)
                        build = {class: RegularMove, args: [this, color, origin, face, check === true]}
                    }
                }
            }
            return {check, build}
        } finally {
            Profiler.stop('Board.checkMove')
        }
    }

    occupiesOrigin(color, origin) {
        const slot = this.slots[origin]
        return slot[0] && slot[0].color == color
    }

    canOccupyOrigin(color, origin) {
        const slot = this.slots[origin]
        return slot.length < 2 || slot[0].color == color
    }

    piecesOnOrigin(color, origin) {
        return this.occupiesOrigin(color, origin) ? this.slots[origin].length : 0
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
                   undefined != InsideOrigins[winner].find(i => this.slots[i].length)
        }
        return false
    }

    // One or more pieces
    // @cache
    originsOccupied(color) {
        const key = CacheKeys.originsOccupied[color]
        if (!this.cache[key]) {
            const origins = []
            for (var i = 0; i < 24; i++) {
                if (this.slots[i][0] && this.slots[i][0].color == color) {
                    origins.push(i)
                }
            }
            this.cache[key] = origins
        }
        return this.cache[key]
    }

    clear() {
        this.slots = intRange(0, 23).map(i => [])
        this.bars  = {Red: [], White: []}
        this.homes = {Red: [], White: []}
        this.markChange()
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
        board.markChange()
        return board
    }

    hasBar(color) {
        return this.bars[color].length > 0
    }

    // More performant not to cache
    mayBearoff(color) {
        Profiler.start('Board.mayBearoff')
        var isAble = !this.hasBar(color)
        if (isAble) {
            for (var origin of OutsideOrigins[color]) {
                var slot = this.slots[origin]
                if (slot[0] && slot[0].color == color) {
                    isAble = false
                    break
                }
            }
        }
        Profiler.stop('Board.mayBearoff')
        return isAble
    }

    isAllHome(color) {
        return this.homes[color].length == 15
    }

    // To check for bearing off for less than a face value
    // No cache
    hasPieceBehind(color, origin) {
        if (Direction[color] == 1) {
            var start = 0
            var end   = origin - 1
        } else {
            var start = origin + 1
            var end   = 23
        }
        for (var i = start; i <= end; i++) {
            if (this.slots[i][0] && this.slots[i][0].color == color) {
                return true
            }
        }
        return false
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
        this.markChange()
    }

    setStateString(str) {
        const locs = str.split('|')
        this.bars = {
            White : Piece.make(locs[0], White)
          , Red   : Piece.make(locs[1], Red)
        }
        this.slots = []
        for (var i = 0; i < 24; i++) {
            this.slots[i] = Piece.make(...locs[i + 2].split(':'))
        }
        this.homes = {
            White : Piece.make(locs[26], White)
          , Red   : Piece.make(locs[27], Red)
        }
        this.markChange()
    }

    // Optimized for performance
    stateString() {
        const key = CacheKeys.stateString
        if (!this.cache[key]) {
            // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
            var str = this.bars.White.length + '|' + this.bars.Red.length + '|'
            for (var i = 0; i < 24; i++) {
                var slot = this.slots[i]
                str += slot.length + ':' + (slot.length ? slot[0].color : '') + '|'
            }
            this.cache[key] = str + this.homes.White.length + '|' + this.homes.Red.length
        }
        return this.cache[key]
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
        this.bars = {
            White : Piece.make(Math.abs(structure[0]), White)
          , Red   : Piece.make(Math.abs(structure[1]), Red)
        }
        this.slots = []
        for (var i = 0; i < 24; i++) {
            this.slots[i] = Piece.make(Math.abs(structure[i + 2]), structure[i + 2] < 0 ? Red : White)
        }
        this.homes = {
            White : Piece.make(Math.abs(structure[26]), White)
          , Red   : Piece.make(Math.abs(structure[27]), Red)
        }
        this.markChange()
    }

    pointOrigin(color, point) {
        return PointOrigins[color][point]
    }

    originPoint(color, origin) {
        return OriginPoints[color][origin]
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

    markChange() {
        this.cache = {}
        this.analyzer.cache = {}
    }

    // NB: the push*/pop* methods perform no checks, and are for use by Move instances
    //     that have already been validated. These methods are here so that moves
    //     can avoid directly modifying board internals (slots, homes, bars), and
    //     so do not need to worry about calling markChange().
    popBar(color) {
        const piece = this.bars[color].pop()
        this.markChange()
        return piece
    }

    pushBar(color, piece) {
        piece = piece || new Piece(color)
        this.bars[color].push(piece)
        this.markChange()
    }

    popHome(color) {
        const piece = this.homes[color].pop()
        this.markChange()
        return piece
    }

    pushHome(color, piece) {
        piece = piece || new Piece(color)
        this.homes[color].push(piece)
        this.markChange()
    }

    popOrigin(origin) {
        const piece = this.slots[origin].pop()
        this.markChange()
        return piece
    }

    pushOrigin(origin, pieceOrColor) {
        const piece = (pieceOrColor instanceof Piece) ? pieceOrColor : new Piece(pieceOrColor)
        this.slots[origin].push(piece)
        this.markChange()
    }

    // Red point 1 is origin 0
    // White point 1 is origin 23
    static pointOrigin(color, point) {
        return PointOrigins[color][point]
    }

    // Red origin 0 is point 1
    // White origin 0 is point 24
    static originPoint(color, origin) {
        return OriginPoints[color][origin]
    }

    static fromStateString(str) {
        const board = new Board(true)
        board.setStateString(str)
        return board
    }

    static fromStateStructure(structure) {
        const board = new Board(true)
        board.setStateStructure(structure)
        return board
    }
}

// NB: Cached methods return a reference for performance. Callers must make a copy
///    if they will modify the result
class BoardAnalyzer {

    constructor(board) {
        this.board = board
        this.cache = {}
    }

    // One or more checkers
    // @cache
    pointsOccupied(color) {
        //Profiler.start('BoardAnalyzer.pointsOccupied')
        const key = CacheKeys.pointsOccupied[color]
        if (!this.cache[key]) {
            //Profiler.start('BoardAnalyzer.pointsOccupied.1')
            const points = []
            const origins = this.board.originsOccupied(color)
            for (var i = 0; i < origins.length; i++) {
                // create pre-sorted
                if (color == Red) {
                    // Origin 0 is Red point 1
                    points.push(OriginPoints[color][origins[i]])
                } else {
                    // Origin 0 is White point 24
                    points.unshift(OriginPoints[color][origins[i]])
                }
            }
            this.cache[key] = points
            //Profiler.stop('BoardAnalyzer.pointsOccupied.1')
        }
        //Profiler.stop('BoardAnalyzer.pointsOccupied')
        return this.cache[key]
    }

    // Two or more checkers
    // @cache
    originsHeld(color) {
        //Profiler.start('BoardAnalyzer.originsHeld')
        const key = CacheKeys.originsHeld[color]
        if (!this.cache[key]) {
            const origins = []
            for (var i = 0; i < 24; i++) {
                var slot = this.board.slots[i]
                if (slot.length > 1 && slot[0].color == color) {
                    origins.push(i)
                }
            }
            this.cache[key] = origins
        }
        //Profiler.stop('BoardAnalyzer.originsHeld')
        return this.cache[key]
    }

    // Two or more checkers
    // @cache
    pointsHeld(color) {
        const key = CacheKeys.pointsHeld[color]
        if (!this.cache[key]) {
            const points = []
            const origins = this.originsHeld(color)
            for (var i = 0; i < origins.length; i++) {
                // create pre-sorted
                if (color == Red) {
                    // Origin 0 is Red point 1
                    points.push(OriginPoints[color][origins[i]])
                } else {
                    // Origin 0 is White point 24
                    points.unshift(OriginPoints[color][origins[i]])
                }
            }
            this.cache[key] = points
        }
        return this.cache[key]
    }

    piecesHome(color) {
        return this.board.homes[color].length
    }

    piecesOnPoint(color, point) {
        const slot = this.board.slots[PointOrigins[color][point]]
        return (slot[0] && slot[0].color == color) ? slot.length : 0
    }

    // @cache
    pipCount(color) {
        const key = CacheKeys.pipCount[color]
        if (!(key in this.cache)) {
            var count = this.board.bars[color].length * 25
            const points = this.pointsOccupied(color)
            for (var i = 0; i < points.length; i++) {
                count += this.piecesOnPoint(color, points[i]) * points[i]
            }
            this.cache[key] = count
        }
        return this.cache[key]
    }

    pipCounts() {
        return {
            White : this.pipCount(White)
          , Red   : this.pipCount(Red)
        }
    }

    // Not cached, since it is currently only called once by SafetyRobot
    blots(color) {

        Profiler.start('BoardAnalyzer.blots')

        try {
            const blots = []

            const blotOrigins = []
            for (var i = 0; i < 24; i++) {
                if (this.board.piecesOnOrigin(color, i) == 1) {
                    blotOrigins.push(i)
                }
            }

            if (blotOrigins.length == 0) {
                return blots
            }

            const opponentOrigins = this.board.originsOccupied(Opponent[color])
            // the opponent points are relative to this color, not the opponent's color
            const opponentPoints = opponentOrigins.map(i => OriginPoints[color][i])
            const opponentHasBar = this.board.bars[Opponent[color]].length > 0

            blotOrigins.forEach(origin => {

                const point = OriginPoints[color][origin]

                // Not currently used
                //const attackerPoints = []
                //const attackerDistances = []

                var minDistance = Infinity
                var directCount = 0
                var indirectCount = 0
                for (var i = 0; i < opponentPoints.length; i++) {
                    var p = opponentPoints[i]
                    if (p < point) {
                        //attackerPoints.push(p)
                        var distance = point - p
                        //attackerDistances.push(distance)
                        if (distance < minDistance) {
                            minDistance = distance
                        }
                        if (distance < 7) {
                            directCount += 1
                        }
                        if (distance > 6 && distance < 12) {
                            indirectCount += 1
                        }
                    }
                }

                if (opponentHasBar) {
                    //attackerDistances.push(point)
                    if (point < minDistance) {
                        minDistance = point
                    }
                    if (point < 7) {
                        directCount += 1
                    }
                    if (point > 6 && point < 12) {
                        indirectCount += 1
                    }
                }

                // TODO: risk factor?

                blots.push({
                    point
                  , origin
                  , minDistance
                  , directCount
                  , indirectCount
                  //, attackerDistances
                  //, attackerPoints
                  //, opponentHasBar
                })
            })

            return blots
        } finally {
            Profiler.stop('BoardAnalyzer.blots')
        }
    }

    // This function is relatively fast, but we cache since several robots use it.
    // @cache
    isDisengaged() {
        //Profiler.start('BoardAnalyzer.isDisengaged')
        const key = CacheKeys.isDisengaged
        if (!(key in this.cache)) {
            if (this.board.hasWinner()) {
                var isDisengaged = true
            } else if (this.board.hasBar(White) || this.board.hasBar(Red)) {
                var isDisengaged = false
            } else {
                const originsRed = this.board.originsOccupied(Red)
                const originsWhite = this.board.originsOccupied(White)
                const backmostRed = originsRed.length ? originsRed[originsRed.length - 1] : -Infinity
                const backmostWhite = originsWhite.length ? originsWhite[0] : Infinity
                var isDisengaged = backmostWhite > backmostRed
            }
            this.cache[key] = isDisengaged
        }
        //Profiler.stop('BoardAnalyzer.isDisengaged')
        return this.cache[key]
    }

    // Not cached, since it is currently only called once by PrimeRobot
    primes(color) {
        //Profiler.start('BoardAnalyzer.primes')
        // NB: make a copy, so we can modify
        const pointsHeld = this.pointsHeld(color).slice(0)
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
                  , start : PointOrigins[color][pointStart]
                  , end   : PointOrigins[color][pointEnd]
                  , size  : pointEnd - pointStart + 1
                })
            }
        }
        //Profiler.stop('BoardAnalyzer.primes')
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
                    Profiler.start('SequenceTree.buildNodes.1')
                    move.board = move.board.copy()
                    Profiler.stop('SequenceTree.buildNodes.1')
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
        return {origin: move.origin, face: move.face}
    }

    static hash(move) {
        return move.origin + ':' + move.face
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
        if (!board.hasBar(color)) {
            return {class: NoPieceOnBarError, message: [color, 'does not have a piece on the bar']}
        }
        const {dest} = ComeInMove.getDestInfo(board, color, face)
        if (!board.canOccupyOrigin(color, dest)) {
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
        const isHit = board.piecesOnOrigin(Opponent[color], dest) == 1
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
        const isHit = board.piecesOnOrigin(Opponent[color], dest) == 1
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
        const homeDistance = Direction[color] == 1 ? 24 - origin : origin + 1
        // make sure no piece is behind if we are taking more than the face
        if (face > homeDistance && board.hasPieceBehind(color, origin)) {
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

class Piece {

    constructor(color) {
        if (color instanceof Piece) {
            color = color.color
        }
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

class NotImplementedError extends GameError {}
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