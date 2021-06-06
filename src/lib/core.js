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
      , 'state28'
      , 'stateString'
    ]

    atomicKeys.forEach(key => keys[key] = key)

    const colorKeys = [
        'blotOrigins'
      , 'maxOriginOccupied'
      , 'maxPointOccupied'
      , 'mayBearoff'
      , 'minOriginOccupied'
      , 'minPointOccupied'
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
          , roller       : null
          , startState   : null
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
          , roller       : null
          , startState   : null
        }
    }

    constructor(opts) {

        this.opts  = Util.defaults(Game.defaults(), opts)
        if (!this.opts.roller) {
            this.opts.roller = Dice.rollTwo
        }

        this.uuid  = Util.uuid()
        this.board = this.opts.startState ? Board.fromStateString(this.opts.startState) : Board.setup()

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
        Profiler.inc('double.accepted')
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
            var dice = this.opts.roller()
        } while (dice[0] == dice[1])
        const firstColor = Dice.getWinner(dice)
        this.thisTurn = new Turn(this.board, firstColor, this.opts)
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
        this.thisTurn = new Turn(this.board, Opponent[this.thisTurn.color], this.opts)
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
            this.endState = this.board.state28()
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
          , board      : this.board.state28()
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
        game.board.setState28(data.board)

        return game
    }
}

class Turn {

    constructor(board, color, opts = {}) {

        this.board      = board
        this.color      = color
        this.opponent   = Opponent[color]
        this.startState = board.state28()

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

        this.isDepthTree      = null
        this.isBreadthTree    = null

        this.moves = []
        this.boardCache = {}

        this.opts = opts
        if (!this.opts.roller) {
            this.opts.roller = Dice.rollTwo
        }
    }

    setDoubleOffered() {

        this.assertNotFinished()
        this.assertNotRolled()

        Profiler.inc('double.offered')

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

        Profiler.inc('double.declined')

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
        this.isRolled = true
        this.afterRoll()

        return this
    }

    roll() {

        this.assertNotFinished()
        this.assertNotRolled()

        this.dice = this.opts.roller()
        this.isRolled = true
        this.afterRoll()

        return this
    }

    afterRoll() {

        this.assertNotFinished()
        this.assertIsRolled()

        this.diceSorted = this.dice.slice(0).sort(Util.sortNumericDesc)
        this.faces = Dice.faces(this.diceSorted)

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
        this.endState = this.board.state28()
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
    fetchBoard(state28) {
        if (!this.boardCache[state28]) {
            this.boardCache[state28] = Board.fromState28(state28)
        }
        return this.boardCache[state28]
    }

    meta() {
        return {
            color            : this.color
          , opts             : this.opts
          , dice             : this.dice
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
          , allowedMoveIndex   : SequenceTree.serializeIndex(turn.allowedMoveIndex)
          , endStatesToSeries  : turn.endStatesToSeries
        })
    }

    static unserialize(data, board) {

        board = board || Board.fromState28(data.startState)

        const turn = new Turn(board, data.color, data.opts)

        if (data.isRolled) {
            turn.setRoll(...data.dice)
        }

        data.moves.forEach(move => turn.move(move.origin, move.face))
    
        turn.isDoubleDeclined = data.isDoubleDeclined
        turn.isDoubleOffered  = data.isDoubleOffered
        turn.isFirstTurn      = data.isFirstTurn

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

        // TODO: test a case where max depth is 1, but only high face should win.
        // State strings
        const allowedEndStates  = []
        // Map of {moveHash: {move, index: {...}}}
        const allowedMoveIndex  = {}
        // Map of state28 to move coords
        const endStatesToSeries = {}

        const flagKeys = {}

        // the max number of faces determine the faces allowed, though not always required.
        var maxExample

        for (var i = 0, ilen = trees.length; i < ilen && maxDepth > 0; ++i) {

            var tree = trees[i]

            if (!tree.checkPasses(maxDepth, highestFace)) {
                //Profiler.inc('tree.check.discard')
                continue
            }

            SequenceTree.pruneIndexRecursive(tree.index, maxDepth, highestFace)

            for (var hash in tree.index) {
                allowedMoveIndex[hash] = tree.index[hash]
            }

            Profiler.start('Turn.compute.depth.moves.leaves')

            var leaves = tree.depthIndex[maxDepth]

            if (leaves) {

                for (var j = 0, jlen = leaves.length; j < jlen; ++j) {

                    var store = leaves[j]

                    var flagKey = store.flagKey()

                    if (flagKey) {
                        //Profiler.inc('store.check.flagKey')
                        if (flagKeys[flagKey]) {
                            //Profiler.inc('store.discard.leaf')
                            //Profiler.inc('store.discard.leaf.flagKey')
                            continue
                        }
                        flagKeys[flagKey] = true
                    }

                    //Profiler.inc('store.check.endState')

                    //var {board} = store.move
                    var endState = store.move.board.state28()

                    if (endStatesToSeries[endState]) {

                        //Profiler.inc('store.discard.leaf')
                        //Profiler.inc('store.discard.leaf.endState')

                        continue
                    }

                    // only about 25% of leaves are kept, flag key gets about twice
                    /// as many as endState
                    //Profiler.inc('store.keep.leaf')

                    endStatesToSeries[endState] = store.moveSeries()
                    allowedEndStates.push(endState)

                    if (!maxExample) {
                        maxExample = endStatesToSeries[endState]
                    }
                    
                    // populate board cache
                    this.boardCache[endState] = store.move.board
                }
            }

            Profiler.stop('Turn.compute.depth.moves.leaves')


            Profiler.start('Turn.compute.depth.moves.winners')

            // This takes very little time

            var winners = tree.winners

            for (var j = 0, jlen = winners.length; j < jlen; ++j) {

                var store = winners[j]

                if (store.depth == maxDepth) {
                    // already covered in leaves
                    continue
                }

                var {board} = store.move
                var endState = board.state28()

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
        // Map of state28 to move coords
        const endStatesToSeries = {}

        // the max number of faces determine the faces allowed, though not always required.
        var maxFaces = 0
        var maxExample

        for (var i = 0, ilen = leaves.length; i < ilen; ++i) {

            Profiler.inc('tree.leaf.process')

            var {board, movesMade} = leaves[i]

            if (movesMade.length > maxFaces) {
                maxFaces = movesMade.length
                maxExample = movesMade
            }

            var endState = board.state28()

            var seriesCoords = []
            var currentIndex = allowedMoveIndex

            for (var j = 0, jlen = movesMade.length; j < jlen; ++j) {
                var move = movesMade[j]
                Profiler.inc('tree.leaf.move.process')
                if (!currentIndex[move.hash]) {
                    currentIndex[move.hash] = {move, index: {}}
                    Profiler.inc('tree.leaf.move.cache.miss')
                } else {
                    Profiler.inc('tree.leaf.move.cache.hit')
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

    move(color, origin, face) {
        const move = this.buildMove(color, origin, face)
        move.do()
        return move
    }

    // Performance optimized
    getPossibleMovesForFace(color, face) {
        Profiler.start('Board.getPossibleMovesForFace')
        const moves = []
        if (this.analyzer.hasBar(color)) {
            Profiler.start('Board.getPossibleMovesForFace.1')
            var {check, build} = this.checkMove(color, -1, face)
            if (check === true) {
                moves.push(new build.class(...build.args))
            }
            Profiler.stop('Board.getPossibleMovesForFace.1')
        } else {
            Profiler.start('Board.getPossibleMovesForFace.2')

            const {analyzer} = this
            const origins = analyzer.originsOccupied(color)
            const mayBearoff = analyzer.mayBearoff(color)
            const maxPoint = analyzer.maxPointOccupied(color)

            Profiler.stop('Board.getPossibleMovesForFace.2')

            Profiler.start('Board.getPossibleMovesForFace.3')
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {

                var origin = origins[i]
                var point = OriginPoints[color][origin]

                // Apply quick filters for performance

                // filter bearoff moves
                if (point <= face) {
                    if (!mayBearoff) {
                        continue
                    }
                    if (point < face && point < maxPoint) {
                        continue
                    }
                    moves.push(new BearoffMove(this, color, origin, face, true))
                } else {
                    // filter opponent points held
                    var dest = origin + face * Direction[color]
                    if (this.slots[dest].length > 1 && this.slots[dest][0].color != color) {
                        continue
                    }
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
            if (this.analyzer.hasBar(color)) {
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

    hasWinner() {
        return this.getWinner() != null
    }

    getWinner() {
        if (this.analyzer.isAllHome(Red)) {
            return Red
        }
        if (this.analyzer.isAllHome(White)) {
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

    clear() {
        this.slots = intRange(0, 23).map(i => [])
        this.bars  = {Red: [], White: []}
        this.homes = {Red: [], White: []}
        this.markChange()
    }

    copy() {
        Profiler.start('Board.copy')
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
        Profiler.stop('Board.copy')
        return board
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

    // Optimized for performance
    stateString() {
        Profiler.start('Board.stateString')
        const key = CacheKeys.stateString
        if (!this.cache[key]) {
            Profiler.inc('board.stateString.cache.miss')
            // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
            var str = this.bars.White.length + '|' + this.bars.Red.length + '|'
            for (var i = 0; i < 24; ++i) {
                var slot = this.slots[i]
                str += slot.length + ':' + (slot.length ? slot[0].c : '') + '|'
            }
            this.cache[key] = str + this.homes.White.length + '|' + this.homes.Red.length
        } else {
            Profiler.inc('board.stateString.cache.hit')
        }
        Profiler.stop('Board.stateString')
        return this.cache[key]
    }

    // experimental
    state28() {
        Profiler.start('Board.state28')
        const key = CacheKeys.state28
        if (!this.cache[key]) {
            Profiler.inc('board.state28.cache.miss')
            const arr = [
                64 | this.bars.White.length
              , 64 | this.bars.Red.length
            ]
            for (var i = 0; i < 24; ++i) {
                var slot = this.slots[i]
                arr.push(64 | slot.length | (slot[0] && slot[0].color == White) << 4)
            }
            arr.push(64 | this.homes.White.length)
            arr.push(64 | this.homes.Red.length)
            this.cache[key] = Buffer.from(arr).toString()
        } else {
            Profiler.inc('board.state28.cache.hit')
        }
        Profiler.stop('Board.state28')
        return this.cache[key]
    }

    setState28(input) {
        const arr = Buffer.from(input)
        this.bars = {
            White : Piece.make(~64 & arr[0], White)
          , Red   : Piece.make(~64 & arr[1], Red)
        }
        this.slots = []
        for (var i = 2; i < 26; ++i) {
            this.slots[i - 2] = Piece.make(~64 & arr[i] & ~16, (arr[i] & 16) == 16 ? White : Red)
        }
        this.homes = {
            White :  Piece.make(~64 & arr[26], White)
          , Red   :  Piece.make(~64 & arr[27], Red)
        }
        this.markChange()
    }

    setStateString(str) {
        if (str.length == 28) {
            this.setState28(str)
            return
        }
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

    inverted() {
        const board = new Board(true)
        board.bars = {
            White : Piece.make(this.bars.Red.length, White)
          , Red   : Piece.make(this.bars.White.length, Red)
        }
        board.homes = {
            White : Piece.make(this.homes.Red.length, White)
          , Red   : Piece.make(this.homes.White.length, Red)
        }
        board.slots = []
        for (var i = 0; i < 24; ++i) {
            var slot = this.slots[i]
            board.slots[23 - i] = slot[0] ? Piece.make(slot.length, Opponent[slot[0].color]) : []
        }
        board.markChange()
        return board
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

    markChange() {
        this.cache = {}
        this.analyzer.cache = {}
    }

    toString() {
        return this.state28()
    }

    static setup() {
        const board = new Board(true)
        board.setup()
        return board
    }

    static fromStateString(str) {
        const board = new Board(true)
        board.setStateString(str)
        return board
    }

    static fromState28(input) {
        const board = new Board(true)
        board.setState28(input)
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

    occupiesOrigin(color, origin) {
        const slot = this.board.slots[origin]
        return slot[0] && slot[0].color == color
    }

    canOccupyOrigin(color, origin) {
        const slot = this.board.slots[origin]
        return slot.length < 2 || slot[0].color == color
    }

    originOccupier(origin) {
        const slot = this.board.slots[origin]
        if (slot[0]) {
            return slot[0].color
        }
    }

    statOrigin(origin) {
        const slot = this.board.slots[origin]
        const stat = {count: slot.length}
        if (slot[0]) {
            stat.color = slot[0].color
        }
        return stat
    }

    statPoint(color, point) {
        return this.statOrigin(PointOrigins[color][point])
    }

    // @cache
    originsOccupied(color) {
        Profiler.start('BoardAnalyzer.originsOccupied')
        const key = CacheKeys.originsOccupied[color]
        if (!this.cache[key]) {
            Profiler.inc('board.originsOccupied.cache.miss')
            const minKey = CacheKeys.minOriginOccupied[color]
            const maxKey = CacheKeys.maxOriginOccupied[color]
            const origins = []
            var minOrigin = Infinity
            var maxOrigin = -Infinity
            for (var i = 0; i < 24; ++i) {
                var slot = this.board.slots[i]
                if (slot[0] && slot[0].color == color) {
                    origins.push(i)
                    if (i < minOrigin) {
                        minOrigin = i
                    }
                    if (i > maxOrigin) {
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
        Profiler.stop('BoardAnalyzer.originsOccupied')
        return this.cache[key]
    }

    // @cache
    maxOriginOccupied(color) {
        const key = CacheKeys.maxOriginOccupied[color]
        if (!(key in this.cache)) {
            // will populate
            this.originsOccupied(color)
        }
        return this.cache[key]
    }

    // @cache
    minOriginOccupied(color) {
        const key = CacheKeys.minOriginOccupied[color]
        if (!(key in this.cache)) {
            // will populate
            this.originsOccupied(color)
        }
        return this.cache[key]
    }

    // @cache
    maxPointOccupied(color) {
        const key = CacheKeys.maxPointOccupied[color]
        if (!(key in this.cache)) {
            if (color == White) {
                var origin = this.minOriginOccupied(color)
                if (origin == Infinity) {
                    this.cache[key] = -Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            } else {
                var origin = this.maxOriginOccupied(color)
                if (origin == -Infinity) {
                    this.cache[key] = -Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            }
        }
        return this.cache[key]
    }

    // @cache
    minPointOccupied(color) {
        const key = CacheKeys.minPointOccupied[color]
        if (!(key in this.cache)) {
            if (color == White) {
                var origin = this.maxOriginOccupied(color)
                if (origin == -Infinity) {
                    this.cache[key] = Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            } else {
                var origin = this.minOriginOccupied(color)
                if (origin == Infinity) {
                    this.cache[key] = Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            }
        }
        return this.cache[key]
    }

    piecesOnOrigin(color, origin) {
        return this.occupiesOrigin(color, origin) ? this.board.slots[origin].length : 0
    }

    hasBar(color) {
        return this.board.bars[color].length > 0
    }

    // @cache
    mayBearoff(color) {
        Profiler.start('BoardAnalyzer.mayBearoff')
        const key = CacheKeys.mayBearoff[color]
        if (!(key in this.cache)) {
            Profiler.inc('board.mayBearoff.cache.miss')
            var isAble = !this.hasBar(color)
            if (isAble) {
                const maxKey = CacheKeys.maxPointOccupied[color]
                if (maxKey in this.cache) {
                    Profiler.inc('board.mayBearoff.cache.maxPoint.hit')
                    isAble = this.cache[maxKey] < 7
                } else {
                    Profiler.inc('board.mayBearoff.cache.maxPoint.miss')
                    for (var i = 0; i < 18; ++i) {
                        var piece = this.board.slots[OutsideOrigins[color][i]][0]
                        if (piece && piece.color == color) {
                            isAble = false
                            break
                        }
                    }
                }
            }
            this.cache[key] = isAble
        } else {
            Profiler.inc('board.mayBearoff.cache.hit')
        }
        Profiler.stop('BoardAnalyzer.mayBearoff')
        return this.cache[key]
    }

    isAllHome(color) {
        return this.board.homes[color].length == 15
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
            if (this.board.slots[i][0] && this.board.slots[i][0].color == color) {
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

    // One or more pieces
    // @cache
    pointsOccupied(color) {
        //Profiler.start('BoardAnalyzer.pointsOccupied')
        const key = CacheKeys.pointsOccupied[color]
        if (!this.cache[key]) {
            //Profiler.start('BoardAnalyzer.pointsOccupied.1')
            const points = []
            const origins = this.originsOccupied(color)
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

    // Two or more pieces
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

    // Two or more pieces
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

    piecesOnBar(color) {
        return this.board.bars[color].length
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

    // @cache
    blotOrigins(color) {
        Profiler.start('BoardAnalyzer.blotOrigins')
        const key = CacheKeys.blotOrigins[color]
        if (!this.cache[key]) {
            const origins = this.originsOccupied(color)
            const blotOrigins = []
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                var origin = origins[i]
                if (this.board.slots[origin].length == 1) {
                    blotOrigins.push(origin)
                }
            }
            this.cache[key] = blotOrigins
        }
        Profiler.stop('BoardAnalyzer.blotOrigins')
        return this.cache[key]
    }

    // Not cached, since it is currently only called once by SafetyRobot
    blots(color, isIncludeAll = true) {

        Profiler.start('BoardAnalyzer.blots')

        try {
            const blots = []

            const blotOrigins = this.blotOrigins(color)
            const blotPointCount = blotOrigins.length

            if (blotPointCount == 0) {
                return blots
            }

            Profiler.start('BoardAnalyzer.blots.prep')
            const {blotPoints, pointsWithOpponent} = this._blotsPrep(color, blotOrigins)
            const opponentCount = pointsWithOpponent.length
            const minPointWithOpponent = pointsWithOpponent[opponentCount - 1]
            var maxPointWithOpponent = pointsWithOpponent[0]
            Profiler.stop('BoardAnalyzer.blots.prep')

            if (opponentCount == 0 && !isIncludeAll) {
                // this shouldn't happen in a real game
                return blots
            }

            var minOpponentIndex = 0
            Profiler.start('BoardAnalyzer.blots.process')

            for (var i = 0; i < blotPointCount; ++i) {

                var point = blotPoints[i]

                if (!isIncludeAll) {
                    if (point < minPointWithOpponent) {
                        break
                    }
                    // distanceToMax
                    if (point - maxPointWithOpponent > 11) {
                        continue
                    }
                    // distanceToMin
                    if (point - minPointWithOpponent < 0) {
                        continue
                    }
                }

                var origin = PointOrigins[color][point]

                var minDistance = Infinity
                var directCount = 0
                var indirectCount = 0
                
                if (point > minPointWithOpponent) {
                    // calculate attacker distance, direct/indirect shots
                    Profiler.start('BoardAnalyzer.blots.process.inner')
                    if (minOpponentIndex > 0 && minOpponentIndex < opponentCount) {
                        Profiler.inc('blots.opponent.point.skipped.minIndex', minOpponentIndex)
                    }

                    for (var j = minOpponentIndex; j < opponentCount; ++j) {

                        Profiler.inc('blots.opponent.point.process')

                        var opposer = pointsWithOpponent[j]

                        if (opposer > point) {
                            minOpponentIndex = j + 1
                            if (minOpponentIndex < opponentCount) {
                                maxPointWithOpponent = pointsWithOpponent[minOpponentIndex]
                            }
                            Profiler.inc('blots.opponent.point.disengaged')
                            continue
                        }

                        var distance = point - opposer

                        if (distance < minDistance) {
                            minDistance = distance
                        }
                        if (distance < 7) {
                            directCount += 1
                        } else if (distance < 12) {
                            indirectCount += 1
                        } else {
                            break
                        }
                    }
                    Profiler.stop('BoardAnalyzer.blots.process.inner')
                } else {
                    Profiler.inc('blots.point.disengaged')
                }

                if (!isIncludeAll && minDistance > 11) {
                    Profiler.inc('blots.point.attacker.notFound')
                    continue
                }

                blots.push({
                    point
                  , origin
                  , minDistance
                  , directCount
                  , indirectCount
                })
            }

            Profiler.stop('BoardAnalyzer.blots.process')
            Profiler.inc('blots.found', blots.length)

            return blots

        } finally {
            Profiler.stop('BoardAnalyzer.blots')
        }
    }

    _blotsPrep(color, blotOrigins) {
        const blotPoints = []
        const blotOriginCount = blotOrigins.length
        // opponent points are relative to this color, not the opponent's color
        const pointsWithOpponent = []
        const opponentOrigins = this.originsOccupied(Opponent[color])
        const opponentCount = opponentOrigins.length

        // create pre-sorted
        if (color == Red) {
            for (var i = blotOriginCount - 1; i >= 0; --i) {
                blotPoints.push(OriginPoints[color][blotOrigins[i]])
            }
            for (var p = opponentCount - 1; p >= 0; --p) {
                pointsWithOpponent.push(OriginPoints[color][opponentOrigins[p]])
            }
        } else {
            for (var i = 0; i < blotOriginCount; ++i) {
                blotPoints.push(OriginPoints[color][blotOrigins[i]])
            }
            for (var p = 0, plen = opponentCount; p < plen; ++p) {
                pointsWithOpponent.push(OriginPoints[color][opponentOrigins[p]])
            }
        }
        if (this.hasBar(Opponent[color])) {
            pointsWithOpponent.push(0)
        }
        return {blotPoints, pointsWithOpponent}
    }

    // This function is relatively fast, but we cache since several robots use it.
    // @cache
    isDisengaged() {
        //Profiler.start('BoardAnalyzer.isDisengaged')
        const key = CacheKeys.isDisengaged
        if (!(key in this.cache)) {
            if (this.board.hasWinner()) {
                var isDisengaged = true
            } else if (this.hasBar(White) || this.hasBar(Red)) {
                var isDisengaged = false
            } else {
                const originsRed = this.originsOccupied(Red)
                const originsWhite = this.originsOccupied(White)
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

    // get the color of the nth piece on the given origin, if any.
    // used in terminal drawing.
    nthPieceOnOrigin(origin, n) {
        const piece = this.board.slots[origin][n]
        if (piece) {
            return piece.color
        }
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

    validateLegalBoard() {
        BoardAnalyzer.validateLegalBoard(this)
    }

    validateLegalBoard(board) {
        if (board.slots.length != 24) {
            throw new IllegalStateError('Board has ' + board.slots.length + ' slots')
        }
        const counts = {
            Red   : 0
          , White : 0
        }
        for (var i = 0; i < 24; ++i) {
            var slot = board.slots[i]
            var slotColor = null
            for (var p = 0; p < slot.length; ++p) {
                var piece = slot[p]
                if (slotColor && slotColor != piece.color) {
                    throw new IllegalStateError('Different colors on origin ' + i)
                }
                if (!(piece.color in counts)) {
                    throw new IllegalStateError('Invalid piece color: ' + piece.color)
                }
                slotColor = piece.color
                counts[piece.color] += 1
            }
        }
        for (var color in counts) {
            for (var p = 0; p < board.homes[color].length; ++p) {
                var piece = board.homes[color][p]
                if (piece.color != color) {
                    throw new IllegalStateError(color + ' home has ' + piece.color + ' piece')
                }
                counts[color] += 1
            }
            for (var p = 0; p < board.bars[color].length; ++p) {
                var piece = board.bars[color][p]
                if (piece.color != color) {
                    throw new IllegalStateError(color + ' bar has ' + piece.color + ' piece')
                }
                counts[color] += 1
            }
            if (counts[color] != 15) {
                throw new IllegalStateError(color + ' has ' + counts[color] + ' pieces on the board')
            }
        }
        if (board.homes.Red.length == 15 && board.homes.White.length == 15) {
            throw new IllegalStateError('both colors have 15 on home')
        }
        if (board.bars.Red.length == 15 && board.bars.White.length == 15) {
            throw new IllegalStateError('both colors have 15 on the bar')
        }
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

        //this.depth       = 0
        this.index       = {}
        this.winners     = []
        this.depthIndex  = {}
        this.highestFace = 0

        this._buildDepth(this.board, this.sequence, this.index)

        Profiler.stop('SequenceTree.buildDepth')
    }

    checkPasses(maxDepth, highestFace) {
        if (this.hasWinner) {
            return true
        }
        if (this.maxDepth < maxDepth) {
            Profiler.inc('SequenceTree.check.fail.maxDepth')
            return false
        }
        if (this.highestFace < highestFace) {
            Profiler.inc('SequenceTree.check.fail.highestFace')
            return false
        }
        return true
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
            Profiler.inc('tree.build.no.moves')
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
            if (face > parentStore.highestFace) {
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
            var store = new TreeStore(move, depth, face, index, parentStore)

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

    _buildBreadth() {

        const root = {board: this.board, depth: 0, parent: null, movesMade: [], highestFace: -Infinity}
        Profiler.inc('node.create')

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

                Profiler.start('SequenceTree.buildBreadth.1')
                var nextMoves = parent.board.getPossibleMovesForFace(this.color, face)
                Profiler.stop('SequenceTree.buildBreadth.1')

                for (var k = 0, klen = nextMoves.length; k < klen; ++k) {

                    var move = nextMoves[k]

                    Profiler.start('SequenceTree.buildBreadth.2')
                    move.board = move.board.copy()
                    Profiler.stop('SequenceTree.buildBreadth.2')

                    Profiler.start('SequenceTree.buildBreadth.3')
                    move.do()
                    Profiler.stop('SequenceTree.buildBreadth.3')

                    Profiler.start('SequenceTree.buildBreadth.4')
                    var child = {
                        board       : move.board
                      , depth
                      , isWinner    : move.board.getWinner() == this.color
                      , movesMade   : parent.movesMade.slice(0)
                      , highestFace : face > parent.highestFace ? face : parent.highestFace
                    }
                    Profiler.inc('node.create')

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
                    Profiler.stop('SequenceTree.buildBreadth.4')
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

    static pruneIndexRecursive(index, maxDepth, highestFace) {
        const hashes = Object.keys(index) // copy for modifying in place
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            Profiler.inc('SequenceTree.pruneIndexRecursive.check')
            var hash = hashes[i]
            var store = index[hash]
            if (store.hasWinner) {
                continue
            }
            if (store.maxDepth < maxDepth) {
                Profiler.inc('SequenceTree.pruneIndexRecursive.delete.maxDepth')
                store.deleted = true
                delete index[hash]
            } else if (store.highestFace < highestFace) {
                Profiler.inc('SequenceTree.pruneIndexRecursive.delete.highestFace')
                store.deleted = true
                delete index[hash]
            }
        }
    }

    // circular with move objects (board/analyzer)
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
                    // recurse
                    cleaned[hash][k] = SequenceTree.serializeIndex(index[hash][k])
                }
            }
        }
        return cleaned
    }
}

class TreeStore {

    constructor(move, depth, face, index, parentStore) {

        Profiler.start('TreeStore.create')
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
        this.move           = move
        this.depth          = depth
        this.face           = face
        this.highestFace    = highestFace
        this.moveSeriesFlag = moveSeriesFlag
        this.parentStore    = parentStore
        this.maxDepth       = depth
        this.index          = {}

        Profiler.stop('TreeStore.create')
    }

    parent() {
        return this.parentStore
    }

    moveSeries() {
        // profiling shows caching unnecessary (never hit)
        const moveSeries = [this.move.coords]
        for (var parent = this.parentStore; parent; parent = parent.parent()) {
            moveSeries.unshift(parent.move.coords)
        }
        return moveSeries
    }

    // propagate up maxDepth, hasWinner, highestFace

    setMaxDepth(depth) {
        //Profiler.inc('TreeStore.propagate')
        //Profiler.inc('TreeStore.propagate.setMaxDepth')
        this.maxDepth = depth
        if (this.parentStore && this.parentStore.maxDepth < depth) {
            this.parentStore.setMaxDepth(depth)
        }
    }

    setWinner() {
        //Profiler.inc('TreeStore.propagate')
        //Profiler.inc('TreeStore.propagate.setWinner')
        this.hasWinner = true
        if (this.parentStore && !this.parentStore.hasWinner) {
            this.parentStore.setWinner()
        }
    }

    setHighFace(face) {
        //Profiler.inc('TreeStore.propagate')
        //Profiler.inc('TreeStore.propagate.setHighFace')
        this.highestFace = face
        if (this.parentStore && this.parentStore.highestFace < face) {
            this.parentStore.setHighFace(face)
        }
    }

    prune(maxDepth, highestFace) {
        const hashes = Object.keys(this.index)
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            var hash = hashes[i]
            var store = this.index[hash]
            if (store.hasWinner) {
                continue
            }
            if (store.maxDepth < maxDepth) {
                Profiler.inc('TreeStore.prune.discard.maxDepth')
                delete store[hash]
                continue
            }
            if (store.highestFace < highestFace) {
                Profiler.inc('TreeStore.prune.discard.highestFace')
                delete store[hash]
            }
        }
    }

    // profiling shows caching not needed - never hit
    flagKey() {

        var flagKey = null

        // only do for doubles
        if (this.moveSeriesFlag == 8 && this.depth == 4) {

            Profiler.start('TreeStore.flagKey')

            const origins = [this.move.origin]
            for (var parent = this.parentStore; parent; parent = parent.parent()) {
                origins.push(parent.move.origin)
            }
            origins.sort(Util.sortNumericAsc)

            flagKey = '8/4-' + origins[0]
            for (var i = 1; i < 4; ++i) {
                flagKey += ',' + origins[i]
            }

            Profiler.stop('TreeStore.flagKey')
        }

        return flagKey
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