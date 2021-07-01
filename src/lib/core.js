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

const {
    castToArray
  , defaults
  , nmap
  , sortNumericDesc
  , sumArray
  , uuid
} = Util

const CacheKeys = {
    state28     : 'state28'
  , stateString : 'stateString'
}

// Must manually enable
const Profiler = Util.Profiler.createDisabled()

class Match {

    static defaults() {
        return {
            cubeEnabled  : true
          , isCrawford   : true
          , isJacoby     : false
          , breadthTrees : false
          , roller       : null
          , startState   : null
          , forceFirst   : null
        }
    }

    constructor(total, opts) {

        if (!Number.isInteger(total) || total < 1) {
            throw new ArgumentError('Total must be integer > 0')
        }

        this.createDate = new Date

        this.uuid  = uuid()
        this.total = total
        this.opts  = defaults(Match.defaults(), opts)

        this.scores = {Red: 0, White: 0}
        this.winner = null
        this.isCanceled = false
        this.isFinished = false
        this.hasCrawforded = false

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
        if (this.thisGame) {
            this.thisGame.thisTurn = null
        }

        var shouldCrawford = this.opts.isCrawford && !this.hasCrawforded
        if (shouldCrawford) {
            var isFound = false
            for (var color in Colors) {
                var score = this.scores[color]
                if (score + 1 == this.total) {
                    isFound = true
                    break
                }
            }
            shouldCrawford = isFound
        }
        if (shouldCrawford) {
            this.hasCrawforded = true
        }

        this.thisGame = new Game({...this.opts, isCrawford: shouldCrawford})
        this.games.push(this.thisGame)

        return this.thisGame
    }

    updateScore() {
        for (var color in Colors) {
            this.scores[color] = sumArray(
                this.games.filter(
                    game => game.getWinner() == color
                ).map(game =>
                    game.finalValue
                )
            )
        }
    }

    cancel() {
        if (this.checkFinished()) {
            return
        }
        this.isCanceled = true
        this.isFinished = true
        if (this.thisGame) {
            this.thisGame.cancel()
        }
    }

    checkFinished() {
        if (this.isFinished) {
            return true
        }
        this.updateScore()
        this.isFinished = this.hasWinner()
        if (this.isFinished) {
            if (this.thisGame && this.thisGame.isFinished) {
                this.thisGame.thisTurn = null
            }
        }
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
          , createDate    : this.createDate
          , total         : this.total
          , scores        : this.scores
          , winner        : this.getWinner()
          , loser         : this.getLoser()
          , hasCrawforded : this.hasCrawforded
          , isCanceled    : this.isCanceled
          , isFinished    : this.isFinished
          , gameCount     : this.games.length
          , opts          : this.opts
        }
    }

    serialize() {
        return Match.serialize(this)
    }

    static serialize(match) {
        const games = match.games.map(Game.serialize)
        return {...match.meta(), games}
    }

    static unserialize(data) {
        const match = new Match(data.total, data.opts)

        match.uuid = data.uuid
        match.createDate = new Date(data.createDate)
        if (isNaN(+match.createDate)) {
            match.createDate = new Date
        }

        match.scores = data.scores
        match.winner = data.winner

        match.isFinished    = data.isFinished
        match.isCanceled    = data.isCanceled
        match.hasCrawforded = data.hasCrawforded

        match.games    = castToArray(data.games).map(Game.unserialize)
        match.thisGame = match.games[match.games.length - 1] || null

        return match
    }
}

class Game {

    static defaults() {
        return {
            cubeEnabled  : true
          , breadthTrees : false
          , forceFirst   : null
          , isCrawford   : false
          , isJacoby     : false
          , roller       : null
          , startState   : null
        }
    }

    constructor(opts) {

        this.opts  = defaults(Game.defaults(), opts)

        if (!this.opts.roller) {
            this.opts.roller = Dice.rollTwo
        }

        this.uuid  = uuid()

        this.cubeOwner  = null
        this.cubeValue  = 1
        this.endState   = null
        this.finalValue = null
        this.isFinished = false
        this.isCanceled = false
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
        if (!this.opts.cubeEnabled) {
            return false
        }
        if (this.opts.isCrawford) {
            return false
        }
        if (this.cubeValue >= 64) {
            return false
        }
        return this.cubeOwner == null || this.cubeOwner == color
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
        } while (dice[0] == dice[1] && !this.opts.forceFirst)

        const firstColor = this.opts.forceFirst || Dice.getWinner(dice)

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

        const color = Opponent[this.thisTurn.color]
        this.thisTurn = new Turn(this.board, color, this.opts)

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

    cancel() {
        if (this.checkFinished()) {
            return
        }
        this.isCanceled = true
        this.isFinished = true
        this.endState = this.board.state28()
        if (this.thisTurn) {
            this.thisTurn.cancel()
            this.turnHistory.push(this.thisTurn.meta())
        }
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
          , isCanceled : this.isCanceled
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
        game.isCanceld   = data.isCanceled
        game.isPass      = data.isPass
        game.winner      = data.winner
        game.turnHistory = data.turnHistory

        if (data.thisTurn) {
            game.thisTurn = Turn.unserialize(data.thisTurn, game.board)
        }
        game.board.setStateString(data.board)

        return game
    }
}

class Turn {

    static defaults() {
        return {
            breadthTrees : false
          , roller       : null
        }
    }

    constructor(board, color, opts = {}) {

        this.board      = board
        this.color      = color
        this.opponent   = Opponent[color]
        this.startState = board.state28()

        this.dice             = null
        this.diceSorted       = null
        this.endState         = null
        this.faces            = null
        this.isCanceled       = false
        this.isCantMove       = false
        this.isDoubleDeclined = false
        this.isDoubleOffered  = false
        this.isFinished       = false
        this.isFirstTurn      = false
        this.isForceMove      = false
        this.isRolled         = false

        this.builder          = null
        this.isDepthTree      = null
        this.isBreadthTree    = null

        this.moves = []
        this.boardCache = {}

        this.opts = defaults(Turn.defaults(), opts)
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

        this.diceSorted = this.dice.slice(0).sort(sortNumericDesc)
        this.faces = Dice.faces(this.diceSorted)

        Profiler.start('Turn.compute')
        this.builder = this.opts.breadthTrees ? new BreadthBuilder(this) : new DepthBuilder(this)
        const result = this.builder.compute()
        Profiler.stop('Turn.compute')

        if (this.opts.breadthTrees) {
            this.isBreadthTree = true
            this.isDepthTree   = false
        } else {
            this.isBreadthTree = false
            this.isDepthTree   = true
        }

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
        
        var index = this.allowedMoveIndex

        for (var i = 0, ilen = this.moves.length; i < ilen; ++i) {
            var move = this.moves[i]
            index = index[move.hash].index
        }

        const moves = []

        for (var k in index) {
            moves.push(index[k].move)
        }

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
        this.remainingFaces.sort(sortNumericDesc)

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
                const isWin = this.board.getWinner() == this.color
                if (!isWin) {
                    throw new MovesRemainingError([this.color, 'has more moves to do'])
                }
            }
        }
        this.endState = this.board.state28()
        this.isFinished = true

        this.boardCache = {}
        this.builder = null

        return this
    }

    cancel() {
        if (this.isFinished) {
            return
        }
        this.endState = this.board.state28()
        this.isFinished = true
        this.isCanceled = true

        this.boardCache = {}
        this.builder = null
    }

    // Fetch cached. Cache is cleared on turn finish.
    fetchBoard(state28) {
        if (!this.boardCache[state28]) {
            this.boardCache[state28] = Board.fromState28(state28)
        }
        return this.boardCache[state28]
    }

    assertNotFinished() {
        if (this.isFinished) {
            if (this.isCanceled) {
                throw new TurnCanceledError(['turn has been canceled for', this.color])
            }
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
          , isCanceled       : this.isCanceled
          , isCantMove       : this.isCantMove
          , isDoubleDeclined : this.isDoubleDeclined
          , isDoubleOffered  : this.isDoubleOffered
          , isFinished       : this.isFinished
          , isFirstTurn      : this.isFirstTurn
          , isForceMove      : this.isForceMove
          , isRolled         : this.isRolled
          , startState       : this.startState
          , endState         : this.endState
          , moves            : this.moves.map(move => move.coords)
          , opts             : this.opts
        }
    }

    serialize() {
        return Turn.serialize(this)
    }

    static serialize(turn) {
        return {
            ...turn.meta()
          , allowedMoveCount   : turn.allowedMoveCount
          , allowedEndStates   : turn.allowedEndStates
          , allowedFaces       : turn.allowedFaces
          , allowedMoveIndex   : SequenceTree.serializeIndex(turn.allowedMoveIndex)
          , endStatesToSeries  : turn.endStatesToSeries
        }
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

        if (data.isCanceled) {
            turn.cancel()
        } else if (data.isFinished) {
            turn.finish()
        }

        return turn
    }
}

// NB: Do not directly modify slots, bars, or homes unless you call markChange()
//     afterward. Validated moves can use push/pop methods.
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
        if (!this.hasWinner()) {
            return false
        }
        const loser = Opponent[this.getWinner()]
        return this.analyzer.piecesHome(loser) == 0
    }

    isBackgammon() {

        if (!this.isGammon()) {
            return false
        }

        const winner = this.getWinner()
        const loser  = Opponent[winner]

        if (this.analyzer.piecesOnBar(loser)) {
            return true
        }

        const insides = InsideOrigins[winner]
        for (var i = 0, ilen = insides.length; i < ilen; ++i) {
            if (this.analyzer.occupiesOrigin(loser, insides[i])) {
                return true
            }
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

    pushOrigin(origin, piece) {
        if (!(piece instanceof Piece)) {
            piece = new Piece(piece)
        }
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

    static checkFaces(faces)  {
        if (faces.length == 4) {
            Dice.checkOne(faces[0])
            if (faces[0] != faces[1] || faces[0] != faces[2] || faces[0] != faces[3]) {
                throw new InvalidRollError('4 faces must be equal')
            }
        } else {
            if (faces.length != 2) {
                throw new InvalidRollError('faces must be length 2 or 4')
            }
            Dice.checkOne(faces[0])
            Dice.checkOne(faces[1])
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

    static createRoller(rolls) {
        var rollIndex = 0
        var maxIndex = rolls.length - 1
        return () => {
            if (rollIndex > maxIndex) {
                rollIndex = 0
            }
            return rolls[rollIndex++]
        }
    }

    static validateRollsData(data) {
        if (!Array.isArray(data.rolls)) {
            throw new InvalidRollDataError('Rolls key must be an array')
        }
        if (!data.rolls.length) {
            throw new InvalidRollDataError('Rolls cannot be empty')
        }
        // check for at least one valid first roll
        var isUniqueFound = false
        for (var i = 0; i < data.rolls.length; ++i) {
            var dice = data.rolls[i]
            try {
                Dice.checkTwo(dice)
            } catch (err) {
                throw new InvalidRollDataError('Invalid roll found at index ' + i + ': ' + err.message, err)
            }
            if (dice[0] != dice[1]) {
                isUniqueFound = true
            }
        }
        if (!isUniqueFound) {
            throw new InvalidRollDataError('Cannot find one unique roll')
        }
        return data
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
  , InvalidRollDataError
  , MatchFinishedError
  , MovesRemainingError
  , NoMovesMadeError
  , NoMovesRemainingError
  , TurnAlreadyFinishedError
  , TurnCanceledError
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
}

const BoardAnalyzer = require('./analyzer')

const {
    BreadthBuilder
  , DepthBuilder
  , SequenceTree
} = require('./trees')

const {
    BearoffMove
  , ComeInMove
  , Move
  , RegularMove
} = require('./move')

Board.BoardAnalyzer = BoardAnalyzer