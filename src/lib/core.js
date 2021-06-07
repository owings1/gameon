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
const Constants = require('./constants')
const Errors    = require('./errors')
const Util      = require('./util')

const {nmap} = Util

const CacheKeys = {
    state28     : 'state28'
  , stateString : 'stateString'
}

// Must manually enable
const Profiler = Util.Profiler.createDisabled()

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
        for (var color in Colors) {
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
        for (var color in Colors) {
            if (this.scores[color] >= this.total) {
                return color
            }
        }
        return null
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

        this.cubeOwner  = null
        this.cubeValue  = 1
        this.endState   = null
        this.finalValue = null
        this.isFinished = false
        this.isPass     = false
        this.winner     = null

        this.turnHistory = []
        this.thisTurn = null

        if (this.opts.startState) {
            this.board = Board.fromStateString(this.opts.startState)
        } else {
            this.board = Board.setup()
        }
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

    buildMove(color, origin, face) {
        const {check, build} = Move.check(this, color, origin, face)
        if (check !== true) {
            throw new check.class(check.message)
        }
        return new build.class(...build.args)
    }

    // Performance optimized
    getPossibleMovesForFace(color, face) {
        Profiler.start('Board.getPossibleMovesForFace')
        const moves = []
        if (this.analyzer.hasBar(color)) {
            Profiler.start('Board.getPossibleMovesForFace.1')
            var {check, build} = Move.check(this, color, -1, face)
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
        this.slots = nmap(24, () => [])
        this.bars  = {Red: [], White: []}
        this.homes = {Red: [], White: []}
        this.markChange()
    }

    copy() {
        Profiler.start('Board.copy')
        const board = new Board(true)
        board.slots = this.slots.map(slot => slot.slice(0))
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

    // @cache
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

    // @cache
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
        return nmap(+n, () => new Piece(color))
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

const {
    Red
  , White
  , Colors
  , ColorAbbr
  , ColorNorm
  , Direction
  , Opponent
  , InsideOrigins
  , OutsideOrigins
  , PointOrigins
  , OriginPoints
  , MoveHashes
  , MoveCoords
} = Constants

const {
    AlreadyRolledError
  , ArgumentError
  , DoubleNotAllowedError
  , GameAlreadyStartedError
  , GameFinishedError
  , GameNotFinishedError
  , GameNotStartedError
  , HasNotDoubledError
  , HasNotRolledError
  , IllegalMoveError
  , InvalidRollError
  , MatchFinishedError
  , MovesRemainingError
  , NoMovesMadeError
  , NoMovesRemainingError
  , TurnAlreadyFinishedError
  , TurnNotFinishedError
} = Errors


module.exports = {
    Match
  , Game
  , Turn
  , Board
  , Piece
  , Dice
  , Profiler
  //  Colors
  //, ColorAbbr
  //, Direction
  //, White
  //, Red
  //, Opponent
  //, OriginPoints
  //, OutsideOrigins
  //, PointOrigins
}

const BoardAnalyzer = require('./analyzer')
const {SequenceTree} = require('./trees')
const {Move, BearoffMove, ComeInMove, RegularMove} = require('./move')

Board.BoardAnalyzer = BoardAnalyzer