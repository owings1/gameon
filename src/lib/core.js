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

function populatePointsAndOrigins(pointOrigins, originPoints) {
    intRange(0, 23).forEach(origin => {
        // Origins are from 0 to 23
        // Points are from 1 to 24
        const point = origin + 1
        // Red point 1 is origin 0
        pointOrigins.Red[point] = point - 1
        // White point 1 is origin 23
        pointOrigins.White[point] = 24 - point
        // Red origin 0 is point 1
        originPoints.Red[origin] = origin + 1
        // White origin 0 is point 24
        originPoints.White[origin] = 24 - origin
    })
}

populatePointsAndOrigins(PointOrigins, OriginPoints)

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
        'blotOrigins'
      , 'maxOriginOccupied'
      , 'mayBearoff'
      , 'minOriginOccupied'
      , 'originsHeld'
      , 'originsHeldMap'
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

const MoveHashes = {}
const MoveCoords = {}

function populateMoveHashesCoords(hashes, coords) {
    const faces = intRange(1, 6)
    intRange(-1, 23).forEach(origin => {
        hashes[origin] = {}
        coords[origin] = {}
        faces.forEach(face => {
            hashes[origin][face] = origin + ':' + face
            coords[origin][face] = {origin, face}
        })
    })
}

populateMoveHashesCoords(MoveHashes, MoveCoords)

class Match {

    static defaults() {
        return {
            isCrawford   : true
          , isJacoby     : false
          , breadthTrees : false
        }
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
        return Match.serialize(this)
    }

    static serialize(match) {
        return Util.merge(match.meta(), {
            games: match.games.map(Game.serialize)
        })
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
}

class Game {

    static defaults() {
        return {
            isCrawford   : false
          , isJacoby     : false
          , breadthTrees : false
        }
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
        const dice = this._rollFirst()
        const firstColor = Dice.getWinner(dice)
        this.thisTurn = new Turn(this.board, firstColor, {breadthTrees: this.opts.breadthTrees})
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
        return Game.serialize(this)
    }

    static serialize(game) {
        const data = game.meta()
        data.turnHistory = game.turnHistory.slice(0)
        if (game.thisTurn) {
            data.thisTurn = game.thisTurn.serialize()
        }
        return data
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

    // allow override for testing
    _rollFirst() {
        return Dice.rollTwoUnique()
    }
}

class Turn {

    constructor(board, color, opts = {}) {

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
        this.isFirstTurn      = false
        this.isForceMove      = false
        this.isRolled         = false

        this.moves = []
        this.boardCache = {}

        this.opts = opts
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

        Profiler.start('Turn.compute')
        const result = this.opts.breadthTrees ? this._computeBreadth() : this._computeDepth()
        Profiler.stop('Turn.compute')

        this.allowedFaces      = result.allowedFaces
        this.allowedEndStates  = result.allowedEndStates
        this.allowedMoveIndex  = result.allowedMoveIndex
        this.endStatesToSeries = result.endStatesToSeries

        this.allowedMoveCount = result.maxDepth
        this.isCantMove       = result.maxDepth == 0
        this.isForceMove      = this.allowedEndStates.length == 1

        this.remainingFaces = this.allowedFaces.slice(0)

        if (this.isCantMove) {
            this.finish()
        }
    }

    // Performance optimized
    getNextAvailableMoves() {

        this.assertIsRolled()

        //Profiler.start('Turn.getNextAvailableMoves')
        
        var index = this.allowedMoveIndex

        for (var i = 0, ilen = this.moves.length; i < ilen; ++i) {
            var move = this.moves[i]
            index = index[move.hash].index
        }

        const moves = []

        for (var k in index) {
            moves.push(index[k].move)
        }

        //Profiler.stop('Turn.getNextAvailableMoves')

        return moves
    }

    move(origin, face) {
        Profiler.start('Turn.move')
        this.assertNotFinished()
        this.assertIsRolled()
        if (typeof(origin) == 'object') {
            // allow a move or coords to be passed
            face = origin.face
            origin = origin.origin
        }
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
        Profiler.stop('Turn.move')
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
          , moves            : this.moves.map(move => move.coords)
        }
    }

    serialize() {
        return Turn.serialize(this)
    }

    static serialize(turn) {
        return Util.merge(turn.meta(), {
            allowedMoveCount   : turn.allowedMoveCount
          , allowedEndStates   : turn.allowedEndStates
          , allowedFaces       : turn.allowedFaces
          , allowedMoveIndex   : SequenceTree.serializeIndex(turn.allowedMoveIndex) // circular with move objects (board/analyzer)
          , endStatesToSeries  : turn.endStatesToSeries
        })
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

    _computeDepth() {
        Profiler.start('Turn.compute.depth')
        Profiler.start('Turn.compute.depth.trees')
        const {maxDepth, trees, highestFace} = this._computeTreesDepth()
        Profiler.stop('Turn.compute.depth.trees')

        Profiler.start('Turn.compute.depth.moves')
        const result = this._computeMovesDepth(trees, maxDepth, highestFace)
        result.maxDepth = maxDepth
        this.isDepthTree = true
        Profiler.stop('Turn.compute.depth.moves')

        Profiler.stop('Turn.compute.depth')

        return result
    }

    _computeBreadth() {
        Profiler.start('Turn.compute.breadth')
        Profiler.start('Turn.compute.breadth.trees')
        const {maxDepth, trees} = this._computeTreesBreadth()
        Profiler.stop('Turn.compute.breadth.trees')

        Profiler.start('Turn.compute.breadth.leaves')
        const leaves = this._computeLeavesBreadth(trees, maxDepth)
        Profiler.stop('Turn.compute.breadth.leaves')

        Profiler.start('Turn.compute.breadth.moves')
        const result = this._computeMovesBreadth(leaves)
        result.maxDepth = maxDepth
        this.isBreadthTree = true
        Profiler.stop('Turn.compute.breadth.moves')
        Profiler.stop('Turn.compute.breadth')

        return result
    }

    // Construct the move series, end states
    _computeMovesDepth(trees, maxDepth, highestFace) {
        
        // State strings
        const allowedEndStates  = []
        // Map of {moveHash: {move, index: {...}}}
        const allowedMoveIndex  = {}
        // Map of stateString to move coords
        const endStatesToSeries = {}

        const storeCheck = store => store.hasWinner || (store.maxDepth == maxDepth && store.highestFace == highestFace)

        const seriesFlagKeys = {}

        const pruneRecursive = index => {
            const hashes = Object.keys(index) // copy for modifying in place
            for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
                var store = index[hashes[i]]
                if (!storeCheck(store)) {
                    Profiler.inc('store.prune')
                    delete index[hashes[i]]
                } else {
                    pruneRecursive(store.index)
                }
            }
        }

        // the max number of faces determine the faces allowed, though not always required.
        var maxExample

        for (var i = 0, ilen = trees.length; i < ilen && maxDepth > 0; ++i) {

            var tree = trees[i]
            if (!storeCheck(tree)) {
                Profiler.inc('tree.discard')
                continue
            }

            pruneRecursive(tree.index)

            for (var hash in tree.index) {
                allowedMoveIndex[hash] = tree.index[hash]
            }

            Profiler.start('Turn.compute.depth.moves.leaves')

            var leaves = tree.depthIndex[maxDepth]

            if (leaves) {

                for (var j = 0, jlen = leaves.length; j < jlen; ++j) {

                    var store = leaves[j]
                    var {board} = store.move

                    var flagKey = store.flagKey()

                    if (flagKey) {
                        Profiler.inc('store.check.flagKey')
                        if (seriesFlagKeys[flagKey]) {
                            Profiler.inc('store.discard.leaf')
                            Profiler.inc('store.discard.leaf.flagKey')
                            continue
                        }
                        seriesFlagKeys[flagKey] = true
                    }

                    Profiler.inc('store.check.endState')

                    var endState = board.stateString()

                    if (endStatesToSeries[endState]) {

                        Profiler.inc('store.discard.leaf')
                        Profiler.inc('store.discard.leaf.endState')

                        continue
                    }

                    // only about 25% of leaves are kept, flag key gets about twice
                    /// as many as endState
                    Profiler.inc('store.keep.leaf')

                    endStatesToSeries[endState] = store.moveSeries()
                    allowedEndStates.push(endState)

                    if (!maxExample) {
                        maxExample = endStatesToSeries[endState]
                    }
                    
                    // populate board cache
                    this.boardCache[endState] = board
                }
            }

            Profiler.stop('Turn.compute.depth.moves.leaves')


            Profiler.start('Turn.compute.depth.moves.winners')

            // This takes very little time

            var winners = tree.winners

            for (var j = 0, jlen = winners.length; j < jlen; ++j) {

                var store = winners[j]
                var {board} = store.move

                if (store.depth == maxDepth) {
                    // already covered in leaves
                    continue
                }
                
                var endState = board.stateString()

                if (endStatesToSeries[endState]) {
                    // de-dupe
                    continue
                }

                endStatesToSeries[endState] = store.moveSeries()
                allowedEndStates.push(endState)

                // populate board cache
                this.boardCache[endState] = board
            }

            Profiler.stop('Turn.compute.depth.moves.winners')
        }

        const allowedFaces = maxExample ? maxExample.map(move => move.face).sort(Util.sortNumericDesc) : []

        return {allowedFaces, allowedEndStates, allowedMoveIndex, endStatesToSeries}
    }

    // Build the sequence trees
    _computeTreesDepth() {

        const trees = []
        // the max depth, or number of faces/moves, of all the trees
        var maxDepth = 0

        var highestFace = 0
        const sequences = Dice.sequencesForFaces(this.faces)
        for (var i = 0, ilen = sequences.length; i < ilen; ++i) {
            var sequence = sequences[i]
            var tree = SequenceTree.buildDepth(this.board, this.color, sequence)
            if (tree.maxDepth > maxDepth) {
                maxDepth = tree.maxDepth
            }
            if (tree.highestFace > highestFace) {
                highestFace = tree.highestFace
            }
            trees.push(tree)
        }

        return {trees, maxDepth, highestFace}
    }

    // Construct the move series, end states
    _computeMovesBreadth(leaves) {

        // State strings
        const allowedEndStates  = []
        // Map of {moveHash: {move, index: {...}}}
        const allowedMoveIndex  = {}
        // Map of stateString to move coords
        const endStatesToSeries = {}

        // the max number of faces determine the faces allowed, though not always required.
        var maxFaces = 0
        var maxExample

        for (var i = 0, ilen = leaves.length; i < ilen; ++i) {

            Profiler.inc('processNode')

            var {board, movesMade} = leaves[i]

            if (movesMade.length > maxFaces) {
                maxFaces = movesMade.length
                maxExample = movesMade
            }

            var endState = board.stateString()

            var seriesCoords = []
            var currentIndex = allowedMoveIndex

            for (var j = 0, jlen = movesMade.length; j < jlen; ++j) {
                var move = movesMade[j]
                Profiler.inc('processMove')
                if (!currentIndex[move.hash]) {
                    currentIndex[move.hash] = {move, index: {}}
                } else {
                    Profiler.inc('moveExists')
                }
                currentIndex = currentIndex[move.hash].index
                // only if we will use it below
                if (!endStatesToSeries[endState]) {
                    seriesCoords.push(move.coords)
                }
            }

            if (endStatesToSeries[endState]) {
                // de-dupe
                continue
            }

            allowedEndStates.push(endState)
            endStatesToSeries[endState] = seriesCoords

            // populate board cache
            this.boardCache[endState] = board
        }

        const allowedFaces = maxExample ? maxExample.map(move => move.face).sort(Util.sortNumericDesc) : []

        return {allowedFaces, allowedEndStates, allowedMoveIndex, endStatesToSeries}
    }

    // Build the sequence trees
    _computeTreesBreadth() {

        const trees = []
        // the max depth, or number of faces/moves, of all the trees
        var maxDepth = 0

        const sequences = Dice.sequencesForFaces(this.faces)
        for (var i = 0, ilen = sequences.length; i < ilen; ++i) {
            var sequence = sequences[i]
            var tree = SequenceTree.buildBreadth(this.board, this.color, sequence)
            if (tree.maxDepth > maxDepth) {
                maxDepth = tree.maxDepth
            }
            trees.push(tree)
        }

        return {trees, maxDepth}
    }

    // Filter the trees and leaves
    _computeLeavesBreadth(trees, maxDepth) {

        // the "most number of faces" rule has an exception when bearing off the last piece.
        // see test case RedBearoff51

        // leaves that meet the depth/win threshold, or are winners
        const candidateLeaves = []
        // the highest die face used by any of the branch candidates
        var highestFace = -Infinity
        
        if (maxDepth > 0) {
            for (var i = 0, ilen = trees.length; i < ilen; ++i) {
                var tree = trees[i]
                // Tree Filter - trees must meet the depth/win threshold
                if (tree.maxDepth < maxDepth && !tree.hasWinner) {
                    continue
                }

                for (var j = 0, jlen = tree.leaves.length; j < jlen; ++j) {
                    var leaf = tree.leaves[j]
                    // Node Filter 1 - leaves must meet the depth/win threshold
                    if (leaf.depth == maxDepth || leaf.isWinner) {
                        if (leaf.highestFace > highestFace) {
                            highestFace = leaf.highestFace
                        }
                        candidateLeaves.push(leaf)
                    }
                }
            }
        }

        // leaves that use the most and highest faces, or are winners
        const leaves = []
        for (var i = 0, ilen = candidateLeaves.length; i < ilen; ++i) {
            var leaf = candidateLeaves[i]
            // Node Filter 2 - leaves must meet the final high-face/win threshold
            if (leaf.highestFace == highestFace || leaf.isWinner) {
                leaves.push(leaf)
            }
        }

        return leaves
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
        Profiler.inc('board.create')
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
            Profiler.start('Board.getPossibleMovesForFace.1')
            var {check, build} = this.checkMove(color, -1, face)
            if (check === true) {
                moves.push(new build.class(...build.args))
            }
            Profiler.stop('Board.getPossibleMovesForFace.1')
        } else {
            Profiler.start('Board.getPossibleMovesForFace.2')
            
            const unavailable = this.analyzer.originsHeldMap(Opponent[color])
            const origins = this.originsOccupied(color)
            const mayBearoff = this.mayBearoff(color)

            if (mayBearoff) {
                if (color == White) {
                    var minOriginOccupied = this.minOriginOccupied(color)
                } else {
                    var maxOriginOccupied = this.maxOriginOccupied(color)
                }
            }

            Profiler.stop('Board.getPossibleMovesForFace.2')

            Profiler.start('Board.getPossibleMovesForFace.3')
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {

                var origin = origins[i]

                // Apply quick filters for performance

                // filter opponent points held
                var dest = origin + face * Direction[color]
                if (unavailable[dest]) {
                    continue
                }

                // filter bearoff moves
                var distanceToHome = Direction[color] == 1 ? 24 - origin : origin + 1
                if (distanceToHome <= face) {
                    if (!mayBearoff) {
                        continue
                    }
                    if (distanceToHome < face) {
                        if (color == White) {
                            if (minOriginOccupied < origin) {
                                continue
                            }
                        } else {
                            if (maxOriginOccupied > origin) {
                                continue
                            }
                        }
                        //if (this.hasPieceBehind(color, origin)) {
                        //    continue
                        //}
                    }
                    moves.push(new BearoffMove(this, color, origin, face, true))
                } else {
                    moves.push(new RegularMove(this, color, origin, face, true))
                }
                // We already filtered all the invalid moves, so we don't need to call checkMove
            }
            Profiler.stop('Board.getPossibleMovesForFace.3')
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
            Profiler.inc('board.originsOccupied.cache.miss')
            const origins = []
            var minOrigin = Infinity
            var maxOrigin = -Infinity
            const minKey = CacheKeys.minOriginOccupied[color]
            const maxKey = CacheKeys.maxOriginOccupied[color]
            for (var i = 0; i < 24; ++i) {
                if (this.slots[i][0] && this.slots[i][0].color == color) {
                    origins.push(i)
                    if (i < minOrigin) {
                        minOrigin = i
                    } else if (i > maxOrigin) {
                        maxOrigin = i
                    }
                }
            }
            this.cache[key] = origins
            this.cache[minKey] = minOrigin
            this.cache[maxKey] = maxOrigin
        } else {
            Profiler.inc('board.originsOccupied.cache.hit')
        }
        return this.cache[key]
    }

    blotOrigins(color) {
        const key = CacheKeys.blotOrigins[color]
        if (!this.cache[key]) {
            const origins = this.originsOccupied(color)
            const blotOrigins = []
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                var origin = origins[i]
                if (this.slots[origin].length == 1) {
                    blotOrigins.push(origin)
                }
            }
            this.cache[key] = blotOrigins
        }
        return this.cache[key]
    }

    maxOriginOccupied(color) {
        const key = CacheKeys.maxOriginOccupied[color]
        if (!(key in this.cache)) {
            // will populate
            this.originsOccupied(color)
        }
        return this.cache[key]
    }

    minOriginOccupied(color) {
        const key = CacheKeys.minOriginOccupied[color]
        if (!(key in this.cache)) {
            // will populate
            this.originsOccupied(color)
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

    // @cache
    mayBearoff(color) {
        Profiler.start('Board.mayBearoff')
        const key = CacheKeys.mayBearoff[color]
        if (!(key in this.cache)) {
            var isAble = !this.hasBar(color)
            if (isAble) {
                //isAble = !this.hasPieceBehind(color, PointOrigins[color][6])
                for (var origin of OutsideOrigins[color]) {
                    var slot = this.slots[origin]
                    if (slot[0] && slot[0].color == color) {
                        isAble = false
                        break
                    }
                }
            }
            this.cache[key] = isAble
        }
        Profiler.stop('Board.mayBearoff')
        return this.cache[key]
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
        for (var i = start; i <= end; ++i) {
            if (this.slots[i][0] && this.slots[i][0].color == color) {
                return true
            }
        }
        return false
        /*
        if (color == White) {
            // for white, point 1 is origin 23, so we are looking for the min
            return this.minOriginOccupied(color) < origin
        }
        // for red point 1 is origin 0, so we are looking for the max
        return this.maxOriginOccupied(color) > origin
        */
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
        for (var i = 0; i < 24; ++i) {
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
            Profiler.start('Board.stateString.cache.miss')
            // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
            var str = this.bars.White.length + '|' + this.bars.Red.length + '|'
            for (var i = 0; i < 24; ++i) {
                var slot = this.slots[i]
                str += slot.length + ':' + (slot.length ? slot[0].color : '') + '|'
            }
            this.cache[key] = str + this.homes.White.length + '|' + this.homes.Red.length
            Profiler.stop('Board.stateString.cache.miss')
        }
        return this.cache[key]
    }

    // Red point 1 is origin 0
    // White point 1 is origin 23
    pointOrigin(color, point) {
        return PointOrigins[color][point]
    }

    // Red origin 0 is point 1
    // White origin 0 is point 24
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
        board.markChange()
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

    static fromStateString(str) {
        const board = new Board(true)
        board.setStateString(str)
        return board
    }
}

// NB: Caching methods return a reference for performance. Callers must make a copy
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
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
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
            for (var i = 0; i < 24; ++i) {
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

    // @cache
    originsHeldMap(color) {
        const key = CacheKeys.originsHeldMap[color]
        if (!this.cache[key]) {
            const origins = this.originsHeld(color)
            const originsMap = {}
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                originsMap[origins[i]] = true
            }
            this.cache[key] = originsMap
        }
        return this.cache[key]
    }

    // Two or more checkers
    // @cache
    pointsHeld(color) {
        const key = CacheKeys.pointsHeld[color]
        if (!this.cache[key]) {
            const points = []
            const origins = this.originsHeld(color)
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
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
            for (var i = 0, ilen = points.length; i < ilen; ++i) {
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

            const blotOrigins = this.board.blotOrigins(color)

            if (blotOrigins.length == 0) {
                return blots
            }

            const opponentOrigins = this.board.originsOccupied(Opponent[color])
            const opponentHasBar = this.board.bars[Opponent[color]].length > 0

            for (var i = 0, ilen = blotOrigins.length; i < ilen; ++i) {

                var origin = blotOrigins[i]

                var point = OriginPoints[color][origin]

                // Not currently used
                //const attackerPoints = []
                //const attackerDistances = []

                var minDistance = Infinity
                var directCount = 0
                var indirectCount = 0

                // TODO: can we avoid a loop within a loop?
                for (var j = 0, jlen = opponentOrigins.length; j < jlen; ++j) {

                    // the opponent point is relative to this color, not the opponent's color
                    var p = OriginPoints[color][opponentOrigins[j]]

                    if (p < point) {

                        var distance = point - p

                        if (distance < minDistance) {
                            minDistance = distance
                        }
                        if (distance < 7) {
                            directCount += 1
                        }
                        if (distance > 6 && distance < 12) {
                            indirectCount += 1
                        }

                        //attackerPoints.push(p)
                        //attackerDistances.push(distance)
                    }
                }

                if (opponentHasBar) {

                    if (point < minDistance) {
                        minDistance = point
                    }
                    if (point < 7) {
                        directCount += 1
                    }
                    if (point > 6 && point < 12) {
                        indirectCount += 1
                    }
                    //attackerDistances.push(point)
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
            }

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
        this.board     = board
        this.color     = color
        this.sequence  = sequence
        this.hasWinner = false
        this.maxDepth  = 0        
    }

    // build breadth first, flat node list structure
    buildBreadth() {

        Profiler.start('SequenceTree.buildBreadth')

        this.leaves    = null
        this.maxDepth  = -1
        this.nodeCount = 0

        const result = this._buildBreadth()

        this.maxDepth  = result.maxDepth
        this.hasWinner = result.hasWinner
        this.leaves    = result.leaves
        this.nodeCount = result.nodeCount

        Profiler.stop('SequenceTree.buildBreadth')
    }

    // build depth first, proper tree structure
    buildDepth() {

        Profiler.start('SequenceTree.buildDepth')

        this.depth       = 0
        this.index       = {}
        this.winners     = []
        this.depthIndex  = {}
        this.highestFace = 0

        this._buildDepth(this.board, this.sequence, this.index)

        Profiler.stop('SequenceTree.buildDepth')
    }

    _buildDepth(board, faces, index, parentStore, depth = 0) {

        if (depth > 4) {
            throw new MaxDepthExceededError
        }

        if (board.getWinner() == this.color) {
            // terminal case - winner
            this.hasWinner = true
            if (parentStore) {
                parentStore.setWinner()
                this.winners.push(parentStore)
            }
            return
        }

        const face = faces[0]
        const moves = board.getPossibleMovesForFace(this.color, face)

        if (!moves.length) {
            // terminal case - no available moves
            // this happens too infrequently to warrant trying to remove it from the tree.
            return
        }

        // continuation case

        depth += 1

        if (depth > this.maxDepth) {
            this.maxDepth = depth
        }
        if (face > this.highestFace) {
            this.highestFace = face
        }

        if (parentStore) {
            if (depth > parentStore.maxDepth) {
                // propagate up the max depth
                parentStore.setMaxDepth(depth)
            }
            if (parentStore.highestFace < face) {
                // propagate up highest face
                parentStore.setHighFace(face)
            }
        }

        const nextFaces = faces.slice(1)

        for (var i = 0, ilen = moves.length; i < ilen; ++i) {

            var move = moves[i]

            move.board = move.board.copy()
            move.do()

            // careful about loop and closure references
            var store = this.newStore(move, depth, face, index, parentStore)

            if (!this.depthIndex[depth]) {
                this.depthIndex[depth] = []
            }
            this.depthIndex[depth].push(store)

            index[move.hash] = store

            if (!nextFaces.length) {
                continue
            }

            // recurse
            this._buildDepth(move.board, nextFaces, store.index, store, depth)
        }
    }

    newStore(move, depth, face, index, parentStore) {

        Profiler.start('SequenceTree.newStore')
        Profiler.inc('store.create')

        var highestFace = face
        var moveSeriesFlag = move.flag

        if (parentStore) {
            if (parentStore.moveSeriesFlag != moveSeriesFlag) {
                moveSeriesFlag = -1
            }
            if (parentStore.face > face) {
                // progagate down the parent's face
                highestFace = parentStore.face
            }
        }

        // lazy getter
        var flagKey = undefined

        const store = {

            move
          , depth
          , face
          , highestFace
          , moveSeriesFlag

          , maxDepth : depth
          , index    : {}

          , parent   : () => parentStore

          , moveSeries : () => {
                // profiling shows caching unnecessary (never hit)
                const moveSeries = [move.coords]
                for (var parent = parentStore; parent; parent = parent.parent()) {
                    moveSeries.unshift(parent.move.coords)
                }
                return moveSeries
            }

          // propagate up maxDepth, hasWinner, highestFace

          , setMaxDepth: depth => {
                Profiler.inc('store.propagate')
                Profiler.inc('store.propagate.setMaxDepth')
                store.maxDepth = depth
                if (parentStore && parentStore.maxDepth < depth) {
                    parentStore.setMaxDepth(depth)
                }
            }
          , setWinner: () => {
                Profiler.inc('store.propagate')
                Profiler.inc('store.propagate.setWinner')
                store.hasWinner = true
                if (parentStore && !parentStore.hasWinner) {
                    parentStore.setWinner()
                }
            }
          , setHighFace: face => {
                Profiler.inc('store.propagate')
                Profiler.inc('store.propagate.setHighFace')
                store.highestFace = face
                if (parentStore && parentStore.highestFace < face) {
                    parentStore.setHighFace(face)
                }
            }
          , flagKey: () => {

                if (flagKey === undefined) {

                    flagKey = null

                    // only do for doubles
                    if (moveSeriesFlag == 8 && depth == 4) {

                        Profiler.start('store.flagKey')

                        const flagOrigins = [move.origin]
                        for (var parent = parentStore; parent; parent = parent.parent()) {
                            flagOrigins.push(parent.move.origin)
                        }
                        flagOrigins.sort(Util.sortNumericAsc)
                        flagKey = moveSeriesFlag + '/' + depth + '-'
                        for (var i = 0, ilen = flagOrigins.length; i < ilen; ++i) {
                            if (i > 0) {
                                flagKey += ','
                            }
                            flagKey += flagOrigins[i]
                        }

                        Profiler.stop('store.flagKey')
                    }
                }

                return flagKey
            }
        }

        Profiler.stop('SequenceTree.newStore')

        return store
    }

    _buildBreadth() {

        const root = {board: this.board, depth: 0, parent: null, movesMade: [], highestFace: -Infinity}
        Profiler.inc('createNode')

        var hasWinner = false
        var maxDepth = 0
        var nodeCount = 1

        var lastNodes = [root]
        var leaves = lastNodes


        for (var i = 0, ilen = this.sequence.length; i < ilen; ++i) {

            var face = this.sequence[i]
            var depth = i + 1

            var nextNodes = []

            for (var j = 0, jlen = lastNodes.length; j < jlen; ++j) {

                var parent = lastNodes[j]

                Profiler.start('SequenceTree.buildNodes.1')
                var nextMoves = parent.board.getPossibleMovesForFace(this.color, face)
                Profiler.stop('SequenceTree.buildNodes.1')

                for (var k = 0, klen = nextMoves.length; k < klen; ++k) {

                    var move = nextMoves[k]

                    Profiler.start('SequenceTree.buildNodes.2')
                    move.board = move.board.copy()
                    Profiler.stop('SequenceTree.buildNodes.2')

                    Profiler.start('SequenceTree.buildNodes.3')
                    move.do()
                    Profiler.stop('SequenceTree.buildNodes.3')

                    Profiler.start('SequenceTree.buildNodes.4')
                    var child = {
                        board       : move.board
                      , depth
                      , isWinner    : move.board.getWinner() == this.color
                      , movesMade   : parent.movesMade.slice(0)
                      , highestFace : face > parent.highestFace ? face : parent.highestFace
                      //, thisMove    : move
                      //, thisFace    : face
                      //, parent
                    }
                    Profiler.inc('createNode')

                    nodeCount += 1

                    child.movesMade.push(move)
                    nextNodes.push(child)

                    if (child.isWinner) {
                        hasWinner = true
                    }
                    if (depth > maxDepth) {
                        maxDepth = depth
                        // leaves only include nodes of maxDepth, since a tree is for a single sequence
                        // i.e. a shorter winning tree would always have a different sequence. the proof
                        // is left as an exercise for the reader.
                        leaves = nextNodes
                    }
                    Profiler.stop('SequenceTree.buildNodes.4')
                }
            }

            lastNodes = nextNodes
        }

        return {hasWinner, maxDepth, leaves, nodeCount}
    }

    static buildBreadth(board, color, sequence) {
        const tree = new SequenceTree(board, color, sequence)
        tree.buildBreadth()
        return tree
    }

    static buildDepth(board, color, sequence) {
        const tree = new SequenceTree(board, color, sequence)
        tree.buildDepth()
        return tree
    }

    static serializeIndex(index, isSort) {
        if (!index) {
            return index
        }
        const cleaned = {}
        const hashes = Object.keys(index)
        if (isSort) {
            hashes.sort(typeof isSort == 'function' ? isSort : undefined)
        }
        for (var hash of hashes) {
            cleaned[hash] = {}
            for (var k in index[hash]) {
                if (k == 'move') {
                    cleaned[hash][k] = index[hash][k].coords
                } else if (k == 'index') {
                    cleaned[hash][k] = SequenceTree.serializeIndex(index[hash][k])
                }
            }
        }
        return cleaned
    }
}

class Move {

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

    static rollTwoUnique() {
        do {
            var dice = Dice.rollTwo()
        } while (dice[0] == dice[1])
        return dice
    }

    static faces(roll) {
        const faces = [roll[0], roll[1]]
        if (roll[0] == roll[1]) {
            faces.push(roll[0])
            faces.push(roll[1])
        }
        return faces
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
        if (faces.length > 2) {
            throw new InvalidRollError('more than two dice not allowed')
        }
        Dice.checkOne(faces[0])
        Dice.checkOne(faces[1])
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

class MaxDepthExceededError extends ArgumentError {}

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
  , Piece
  , Dice
  , Turn
  , White
  , Red
  , Opponent
  , Profiler
  , Errors
}