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
import {sum as arraySum} from '@quale/core/arrays.js'
import {castToArray} from '@quale/core/types.js'
import Analyzer from './analyzer.js'
import Dice from './dice.js'
import {
    Colors,
    ColorAbbr,
    ColorNorm,
    Direction,
    Opponent,
    InsideOrigins,
    OriginPoints,
    Red,
    White,
} from './constants.js'

import {
    AlreadyRolledError,
    ArgumentError,
    DoubleNotAllowedError,
    GameAlreadyStartedError,
    GameFinishedError,
    GameNotFinishedError,
    GameNotStartedError,
    HasNotDoubledError,
    HasNotRolledError,
    IllegalMoveError,
    MatchFinishedError,
    MovesRemainingError,
    NoMovesMadeError,
    NoMovesRemainingError,
    TurnAlreadyFinishedError,
    TurnCanceledError,
    TurnNotFinishedError,
} from './errors.js'

import {
    defaults,
    nmap,
    sortNumericDesc,
    uuid,
} from './util.js'

import {
    BreadthBuilder,
    DepthBuilder,
    SequenceTree,
} from './trees.js'

import {
    BearoffMove,
    Move,
    RegularMove,
} from './moves.js'

import {DefaultProfiler as Profiler} from './util/profiler.js'

const CacheKeys = {
    state28     : 'state28',
    stateString : 'stateString',
}

export class Match {

    /**
     * @return {object}
     */
    static defaults() {
        return {
            cubeEnabled  : true,
            isCrawford   : true,
            isJacoby     : false,
            breadthTrees : false,
            roller       : null,
            startState   : null,
            forceFirst   : null,
        }
    }

    /**
     * @param {Number} total
     * @param {object} opts
     *
     * @throws {ArgumentError}
     */
    constructor(total, opts) {
        if (!Number.isInteger(total) || total < 1) {
            throw new ArgumentError('Total must be integer > 0')
        }
        this.createDate = new Date
        this.uuid = uuid()
        this.total = total
        this.opts = defaults(Match.defaults(), opts)
        this.scores = {Red: 0, White: 0}
        this.winner = null
        this.isCanceled = false
        this.cancelError = null
        this.isFinished = false
        this.hasCrawforded = false
        this.games = []
        this.thisGame = null
    }

    /**
     * @return {Game}
     *
     * @throws {GameNotFinishedError}
     * @throws {MatchFinishedError}
     */
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
        let shouldCrawford = this.opts.isCrawford && !this.hasCrawforded
        if (shouldCrawford) {
            let isFound = false
            for (const color in Colors) {
                const score = this.scores[color]
                if (score + 1 === this.total) {
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

    /**
     * @return {self}
     */
    updateScore() {
        for (const color in Colors) {
            this.scores[color] = arraySum(
                this.games.filter(
                    game => game.getWinner() === color
                ).map(game =>
                    game.finalValue
                )
            )
        }
        return this
    }

    /**
     * 
     * @return {self}
     */
    cancel(err) {
        if (this.checkFinished()) {
            return this
        }
        this.isCanceled = true
        this.cancelError = err
        this.isFinished = true
        if (this.thisGame) {
            this.thisGame.cancel(err)
        }
        return this
    }

    /**
     * @return {Boolean}
     */
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

    /**
     * @return {Boolean}
     */
    hasWinner() {
        return this.getWinner() !== null
    }

    /**
     * @return {String|null}
     */
    getWinner() {
        for (const color in Colors) {
            if (this.scores[color] >= this.total) {
                return color
            }
        }
        return null
    }

    /**
     * @return {String|null}
     */
    getLoser() {
        if (this.hasWinner()) {
            return Opponent[this.getWinner()]
        }
        return null
    }

    /**
     * @return {object}
     */
    meta() {
        return {
            uuid          : this.uuid,
            createDate    : this.createDate,
            total         : this.total,
            scores        : this.scores,
            winner        : this.getWinner(),
            loser         : this.getLoser(),
            hasCrawforded : this.hasCrawforded,
            isCanceled    : this.isCanceled,
            isFinished    : this.isFinished,
            gameCount     : this.games.length,
            opts          : this.opts,
        }
    }

    /**
     * @return {object}
     */
    serialize() {
        return Match.serialize(this)
    }

    /**
     * @param {Match} match
     * @return {object}
     */
    static serialize(match) {
        return {...match.meta(), games: match.games.map(Game.serialize)}
    }

    /**
     * @param {object} data
     * @return {Match}
     */
    static unserialize(data) {
        const match = new Match(data.total, data.opts)
        match.uuid = data.uuid
        match.createDate = new Date(data.createDate)
        if (isNaN(+match.createDate)) {
            match.createDate = new Date
        }
        match.scores = data.scores
        match.winner = data.winner
        match.isFinished = data.isFinished
        match.isCanceled  = data.isCanceled
        match.hasCrawforded = data.hasCrawforded
        match.games = castToArray(data.games).map(Game.unserialize)
        match.thisGame = match.games[match.games.length - 1] || null
        return match
    }
}

export class Game {

    /**
     * @return {object}
     */
    static defaults() {
        return {
            cubeEnabled  : true,
            breadthTrees : false,
            forceFirst   : null,
            isCrawford   : false,
            isJacoby     : false,
            roller       : null,
            startState   : null,
        }
    }

    /**
     * @param {object} opts
     */
    constructor(opts) {
        this.opts = defaults(Game.defaults(), opts)
        if (!this.opts.roller) {
            this.opts.roller = Dice.rollTwo
        }
        this.uuid = uuid()
        this.cubeOwner = null
        this.cubeValue = 1
        this.endState = null
        this.finalValue = null
        this.isFinished = false
        this.isCanceled = false
        this.cancelError = null
        this.isPass = false
        this.winner = null
        this.turnHistory = []
        this.thisTurn = null
        if (this.opts.startState) {
            this.board = Board.fromStateString(this.opts.startState)
        } else {
            this.board = Board.setup()
        }
    }

    /**
     * @param {String} color
     * @return {Boolean}
     */
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
        return this.cubeOwner == null || this.cubeOwner === color
    }

    /**
     * @return {Game} self
     * 
     * @throws {DoubleNotAllowedError}
     * @throws {GameFinishedError}
     * @throws {GameNotStartedError}
     */
    double() {
        if (this.isFinished) {
            if (this.cancelError) {
                throw this.cancelError
            }
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
        return this
    }

    /**
     * @return {Turn}
     * 
     * @throws {GameAlreadyStartedError}
     * @throws {GameFinishedError}
     */
    firstTurn() {
        if (this.isFinished) {
            if (this.cancelError) {
                throw this.cancelError
            }
            throw new GameFinishedError('The game is already over')
        }
        if (this.thisTurn) {
            throw new GameAlreadyStartedError('The game has already started')
        }
        let dice
        do {
            dice = this.opts.roller()
        } while (dice[0] === dice[1] && !this.opts.forceFirst)
        const firstColor = this.opts.forceFirst || Dice.getWinner(dice)
        this.thisTurn = new Turn(this.board, firstColor, this.opts)
        this.thisTurn.setRoll(dice)
        this.thisTurn.isFirstTurn = true
        return this.thisTurn
    }

    /**
     * Will return null if the game has just finished, but will throw after that.
     *
     * @return {Turn|null}
     * 
     * @throws {GameFinishedError}
     * @throws {GameNotStartedError}
     * @throws {TurnNotFinishedError}
     */
    nextTurn() {
        if (this.isFinished) {
            if (this.cancelError) {
                throw this.cancelError
            }
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

    /**
     * @return {Boolean}
     */
    hasWinner() {
        this.checkFinished()
        return this.winner != null
    }

    /**
     * @return {String|null}
     */
    getWinner() {
        this.checkFinished()
        return this.winner
    }

    /**
     * @return {String|null}
     */
    getLoser() {
        const winner = this.getWinner()
        return winner ? Opponent[winner] : null
    }

    /**
     * @param {Error} err
     * @return {self}
     */
    cancel(err) {
        if (this.checkFinished()) {
            return this
        }
        this.isCanceled = true
        this.cancelError = err
        this.isFinished = true
        this.endState = this.board.state28()
        if (this.thisTurn) {
            this.thisTurn.cancel(err)
            this.turnHistory.push(this.thisTurn.meta())
        }
        return this
    }

    /**
     * @return {Boolean}
     */
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

    /**
     * @return {Number}
     */
    getTurnCount() {
        return this.turnHistory.length + Boolean(this.thisTurn)
    }

    /**
     * @return {object}
     */
    meta() {
        return {
            uuid       : this.uuid,
            opts       : this.opts,
            board      : this.board.state28(),
            winner     : this.getWinner(),
            loser      : this.getLoser(),
            finalValue : this.finalValue,
            cubeOwner  : this.cubeOwner,
            cubeValue  : this.cubeValue,
            isFinished : this.isFinished,
            isCanceled : this.isCanceled,
            isPass     : this.isPass,
            endState   : this.endState,
            turnCount  : this.getTurnCount(),
        }
    }

    /**
     * @return {object}
     */
    serialize() {
        return Game.serialize(this)
    }

    /**
     * @param {Game} game
     * @return {object}
     */
    static serialize(game) {
        const data = game.meta()
        data.turnHistory = game.turnHistory.slice(0)
        if (game.thisTurn) {
            data.thisTurn = game.thisTurn.serialize()
        }
        return data
    }

    /**
     * @param {object} data
     * @return {Game}
     */
    static unserialize(data) {
        const game = new Game(data.opts)
        game.uuid = data.uuid
        game.cubeOwner = data.cubeOwner
        game.cubeValue = data.cubeValue
        game.endState = data.endState
        game.finalValue = data.finalValue
        game.isFinished = data.isFinished
        game.isCanceld = data.isCanceled
        game.isPass = data.isPass
        game.winner = data.winner
        game.turnHistory = data.turnHistory
        if (data.thisTurn) {
            game.thisTurn = Turn.unserialize(data.thisTurn, game.board)
        }
        game.board.setStateString(data.board)
        return game
    }
}

export class Turn {

    /**
     * @return {object}
     */
    static defaults() {
        return {
            breadthTrees : false,
            roller       : null,
        }
    }

    /**
     * @param {Board} board
     * @param {String} color
     * @param {object} opts
     */
    constructor(board, color, opts) {
        this.board = board
        this.color = color
        this.opponent = Opponent[color]
        this.startState = board.state28()
        this.dice = null
        this.diceSorted = null
        this.endState = null
        this.faces = null
        this.isCanceled = false
        this.cancelError = null
        this.isCantMove = false
        this.isDoubleDeclined = false
        this.isDoubleOffered = false
        this.isFinished = false
        this.isFirstTurn = false
        this.isForceMove = false
        this.isRolled = false
        this.builder = null
        this.isDepthTree = null
        this.isBreadthTree = null
        this.moves = []
        this.boardCache = {}
        this.opts = defaults(Turn.defaults(), opts)
        if (!this.opts.roller) {
            this.opts.roller = Dice.rollTwo
        }
    }

    /**
     * @return {Turn} self
     * 
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     * @throws {AlreadyRolledError}
     */
    setDoubleOffered() {
        this.assertNotFinished()
        this.assertNotRolled()
        Profiler.inc('double.offered')
        this.isDoubleOffered = true
        return this
    }

    /**
     * @return {Turn} self
     * 
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     * @throws {AlreadyRolledError}
     * @throws {HasNotDoubledError}
     */
    setDoubleDeclined() {
        if (this.isDoubleDeclined) {
            return
        }
        this.assertNotFinished()
        this.assertNotRolled()
        if (!this.isDoubleOffered) {
            throw new HasNotDoubledError([this.color, 'has not doubled'])
        }
        Profiler.inc('double.declined')
        this.isDoubleDeclined = true
        this.finish()
        return this
    }

    /**
     * Params can be 2 integers or an array of 2 integers.
     * 
     * @param {Number|Number[]}
     * @param {Number|undefined}
     * @return {Turn} self
     *
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     * @throws {AlreadyRolledError}
     */
    setRoll(...args) {
        this.assertNotFinished()
        this.assertNotRolled()
        const dice = args.length === 1 ? args[0] : args
        Dice.checkTwo(dice)
        this.dice = dice        
        this.isRolled = true
        this.afterRoll()
        return this
    }

    /**
     * @return {Turn} self
     *
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     * @throws {AlreadyRolledError}
     */
    roll() {
        this.assertNotFinished()
        this.assertNotRolled()
        this.dice = this.opts.roller()
        this.isRolled = true
        this.afterRoll()
        return this
    }

    /**
     * @return {Turn} self
     *
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     * @throws {HasNotRolledError}
     */
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
        return this
    }

    /**
     * @return {Move[]}
     *
     * @throws {HasNotRolledError}
     */
    getNextAvailableMoves() {
        this.assertIsRolled()
        let index = this.allowedMoveIndex
        for (let i = 0, ilen = this.moves.length; i < ilen; ++i) {
            index = index[this.moves[i].hash].index
        }
        const moves = []
        for (const k in index) {
            moves.push(index[k].move)
        }
        return moves
    }

    /**
     * @param {Number} origin
     * @param {Number} false
     * @return {Move}
     *
     * @throws {GameError.IllegalMoveError}
     * @throws {HasNotRolledError}
     * @throws {NoMovesRemainingError}
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     */
    move(origin, face) {
        Profiler.start('Turn.move')
        this.assertNotFinished()
        this.assertIsRolled()
        if (typeof origin === 'object') {
            // allow a move or coords to be passed
            face = origin.face
            origin = origin.origin
        }
        const nextMoves = this.getNextAvailableMoves()
        if (nextMoves.length === 0) {
            throw new NoMovesRemainingError([this.color, 'has no more moves to do'])
        }
        const matchingMove = nextMoves.find(move =>
            move.origin === origin && move.face === face
        )
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

    /**
     * @return {Move}
     *
     * @throws {NoMovesMadeError}
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     */
    unmove() {
        this.assertNotFinished()
        if (this.moves.length === 0) {
            throw new NoMovesMadeError([this.color, 'has no moves to undo'])
        }
        const move = this.moves.pop()
        move.undo()
        this.remainingFaces.push(move.face)
        this.remainingFaces.sort(sortNumericDesc)
        return move
    }

    /**
     * @return {Turn} self
     *
     * @throws {HasNotRolledError}
     * @throws {MovesRemainingError}
     */
    finish() {
        if (this.isFinished) {
            return this
        }
        if (!this.isDoubleDeclined) {
            this.assertIsRolled()
            const isAllMoved = this.moves.length === this.allowedMoveCount
            if (!isAllMoved) {
                const isWin = this.board.getWinner() === this.color
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

    /**
     * @param {Error} err
     * @return {Turn} self
     */
    cancel(err) {
        if (this.isFinished) {
            return this
        }
        this.endState = this.board.state28()
        this.isFinished = true
        this.isCanceled = true
        this.cancelError = err
        this.boardCache = {}
        this.builder = null
        return this
    }

    /**
     * Fetch cached. Cache is cleared on turn finish.
     *
     * @param {String} state28
     * @return {Board}
     *
     * @throws {TypeError}
     */
    fetchBoard(state28) {
        if (!this.boardCache[state28]) {
            this.boardCache[state28] = Board.fromState28(state28)
        }
        return this.boardCache[state28]
    }

    /**
     * @return {Turn} self
     *
     * @throws {TurnAlreadyFinishedError}
     * @throws {TurnCanceledError}
     */
    assertNotFinished() {
        if (this.isFinished) {
            if (this.cancelError) {
                throw this.cancelError
            }
            if (this.isCanceled) {
                throw new TurnCanceledError(['turn has been canceled for', this.color])
            }
            throw new TurnAlreadyFinishedError(['turn is already finished for', this.color])
        }
        return this
    }

    /**
     * @return {Turn} self
     *
     * @throws {HasNotRolledError}
     */
    assertIsRolled() {
        if (!this.isRolled) {
            throw new HasNotRolledError([this.color, 'has not rolled'])
        }
        return this
    }

    /**
     * @return {Turn} self
     *
     * @throws {AlreadyRolledError}
     */
    assertNotRolled() {
        if (this.isRolled) {
            throw new AlreadyRolledError([this.color, 'has already rolled'])
        }
        return this
    }

    /**
     * @return {object}
     */
    meta() {
        return {
            color            : this.color,
            dice             : this.dice,
            isCanceled       : this.isCanceled,
            isCantMove       : this.isCantMove,
            isDoubleDeclined : this.isDoubleDeclined,
            isDoubleOffered  : this.isDoubleOffered,
            isFinished       : this.isFinished,
            isFirstTurn      : this.isFirstTurn,
            isForceMove      : this.isForceMove,
            isRolled         : this.isRolled,
            startState       : this.startState,
            endState         : this.endState,
            moves            : this.moves.map(move => move.coords),
            opts             : this.opts,
        }
    }

    /**
     * @return {object}
     */
    serialize() {
        return Turn.serialize(this)
    }

    /**
     * @param {Turn} turn
     * @return {object}
     */
    static serialize(turn) {
        return {
            ...turn.meta(),
            allowedMoveCount: turn.allowedMoveCount,
            allowedEndStates: turn.allowedEndStates,
            allowedFaces: turn.allowedFaces,
            allowedMoveIndex: SequenceTree.serializeIndex(turn.allowedMoveIndex),
            endStatesToSeries: turn.endStatesToSeries,
        }
    }

    /**
     * @param {object} data
     * @param {Board} board
     * @return {Turn}
     */
    static unserialize(data, board = undefined) {
        board = board || Board.fromState28(data.startState)
        const turn = new Turn(board, data.color, data.opts)
        if (data.isRolled) {
            turn.setRoll(...data.dice)
        }
        data.moves.forEach(move => turn.move(move.origin, move.face))
        turn.isDoubleDeclined = data.isDoubleDeclined
        turn.isDoubleOffered = data.isDoubleOffered
        turn.isFirstTurn = data.isFirstTurn
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
export class Board {

    /**
     * @param {Boolean} isSkipInit
     */
    constructor(isSkipInit = false) {
        Profiler.inc('board.create')
        this.analyzer = new Analyzer(this)
        this.cache = {}
        // isSkipInit is for performance on copy
        if (!isSkipInit) {
            this.clear()
        }
    }

    /**
     * @throws {GameError.IllegalMoveError}
     *
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {Move}
     */
    move(color, origin, face) {
        const move = this.buildMove(color, origin, face)
        move.do()
        return move
    }

    /**
     * @throws {GameError.IllegalMoveError}
     *
     * @param {String} color
     * @param {Number} origin
     * @param {Number} face
     * @return {Move}
     */
    buildMove(color, origin, face) {
        const {check, build} = Move.check(this, color, origin, face)
        if (check !== true) {
            throw new check.class(check.message)
        }
        return new build.class(...build.args)
    }

    /**
     * @param {String} color
     * @param {Number} face
     * @return {Move[]}
     */
    getPossibleMovesForFace(color, face) {
        Profiler.start('Board.getPossibleMovesForFace')
        const moves = []
        if (this.analyzer.hasBar(color)) {
            Profiler.start('Board.getPossibleMovesForFace.1')
            let {check, build} = Move.check(this, color, -1, face)
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
            for (let i = 0, ilen = origins.length; i < ilen; ++i) {
                const origin = origins[i]
                const point = OriginPoints[color][origin]
                // Apply quick filters for performance
                // Filter bearoff moves
                if (point <= face) {
                    if (!mayBearoff) {
                        continue
                    }
                    if (point < face && point < maxPoint) {
                        continue
                    }
                    moves.push(new BearoffMove(this, color, origin, face, true))
                } else {
                    // Filter opponent points held
                    let dest = origin + face * Direction[color]
                    if (this.slots[dest].length > 1 && this.slots[dest][0].color !== color) {
                        continue
                    }
                    moves.push(new RegularMove(this, color, origin, face, true))
                }
                // We already filtered all the invalid moves, so we don't need
                // to call checkMove()
            }
            Profiler.stop('Board.getPossibleMovesForFace.3')
        }
        Profiler.stop('Board.getPossibleMovesForFace')
        return moves
    }

    /**
     * @return {Boolean}
     */
    hasWinner() {
        return this.getWinner() !== null
    }

    /**
     * @return {String|null}
     */
    getWinner() {
        if (this.analyzer.isAllHome(Red)) {
            return Red
        }
        if (this.analyzer.isAllHome(White)) {
            return White
        }
        return null
    }

    /**
     * @return {Boolean}
     */
    isGammon() {
        if (!this.hasWinner()) {
            return false
        }
        const loser = Opponent[this.getWinner()]
        return this.analyzer.piecesHome(loser) === 0
    }

    /**
     * @return {Boolean}
     */
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
        for (let i = 0, ilen = insides.length; i < ilen; ++i) {
            if (this.analyzer.occupiesOrigin(loser, insides[i])) {
                return true
            }
        }
        return false
    }

    /**
     * @return {Board} self
     */
    clear() {
        this.slots = nmap(24, () => [])
        this.bars = {Red: [], White: []}
        this.homes = {Red: [], White: []}
        this.markChange()
        return this
    }

    /**
     * @return {Board}
     */
    copy() {
        Profiler.start('Board.copy')
        const board = new Board(true)
        board.slots = this.slots.map(slot => slot.slice(0))
        board.bars = {
            Red   : this.bars.Red.slice(0),
            White : this.bars.White.slice(0),
        }
        board.homes = {
            Red   : this.homes.Red.slice(0),
            White : this.homes.White.slice(0),
        }
        board.markChange()
        Profiler.stop('Board.copy')
        return board
    }

    /**
     * @return {Board} self
     */
    setup() {
        this.clear()
        this.slots[0] = Piece.make(2, White)
        this.slots[5] = Piece.make(5, Red)
        this.slots[7] = Piece.make(3, Red)
        this.slots[11] = Piece.make(5, White)
        this.slots[12] = Piece.make(5, Red)
        this.slots[16] = Piece.make(3, White)
        this.slots[18] = Piece.make(5, White)
        this.slots[23] = Piece.make(2, Red)
        this.markChange()
        return this
    }

    /**
     * @cache
     *
     * @return {String}
     */
    state28() {
        Profiler.start('Board.state28')
        const key = CacheKeys.state28
        if (!this.cache[key]) {
            Profiler.inc('board.state28.cache.miss')
            const arr = [
                64 | this.bars.White.length,
                64 | this.bars.Red.length,
            ]
            for (let i = 0; i < 24; ++i) {
                let slot = this.slots[i]
                arr.push(64 | slot.length | (slot[0] && slot[0].color === White) << 4)
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

    /**
     * @throws {TypeError}
     *
     * @param {String|Srray|Buffer} input
     * @return {Board} self
     */
    setState28(input) {
        const arr = Buffer.from(input)
        this.bars = {
            White : Piece.make(~64 & arr[0], White),
            Red   : Piece.make(~64 & arr[1], Red),
        }
        this.slots = []
        for (let i = 2; i < 26; ++i) {
            this.slots[i - 2] = Piece.make(~64 & arr[i] & ~16, (arr[i] & 16) === 16 ? White : Red)
        }
        this.homes = {
            White :  Piece.make(~64 & arr[26], White),
            Red   :  Piece.make(~64 & arr[27], Red),
        }
        this.markChange()
        return this
    }

    /**
     * @cache
     *
     * @return {String}
     */
    stateString() {
        Profiler.start('Board.stateString')
        const key = CacheKeys.stateString
        if (!this.cache[key]) {
            Profiler.inc('board.stateString.cache.miss')
            // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
            let str = this.bars.White.length + '|' + this.bars.Red.length + '|'
            for (let i = 0; i < 24; ++i) {
                const slot = this.slots[i]
                str += slot.length + ':' + (slot.length ? slot[0].c : '') + '|'
            }
            this.cache[key] = str + this.homes.White.length + '|' + this.homes.Red.length
        } else {
            Profiler.inc('board.stateString.cache.hit')
        }
        Profiler.stop('Board.stateString')
        return this.cache[key]
    }

    /**
     * @throws {TypeError}
     *
     * @param {String} str
     * @return {Board} self
     */
    setStateString(str) {
        if (str.length === 28) {
            return this.setState28(str)
        }
        const locs = str.split('|')
        this.bars = {
            White : Piece.make(locs[0], White),
            Red   : Piece.make(locs[1], Red),
        }
        this.slots = []
        for (let i = 0; i < 24; ++i) {
            this.slots[i] = Piece.make(...locs[i + 2].split(':'))
        }
        this.homes = {
            White : Piece.make(locs[26], White),
            Red   : Piece.make(locs[27], Red),
        }
        this.markChange()
        return this
    }

    /**
     * @return {Board}
     */
    inverted() {
        const board = new Board(true)
        board.bars = {
            White : Piece.make(this.bars.Red.length, White),
            Red   : Piece.make(this.bars.White.length, Red),
        }
        board.homes = {
            White : Piece.make(this.homes.Red.length, White),
            Red   : Piece.make(this.homes.White.length, Red),
        }
        board.slots = []
        for (let i = 0; i < 24; ++i) {
            const slot = this.slots[i]
            board.slots[23 - i] = slot[0] ? Piece.make(slot.length, Opponent[slot[0].color]) : []
        }
        board.markChange()
        return board
    }

    /**
     *  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
     *  ┃                                                                 ┃
     *  ┃ NB: The push/pop methods perform no checks, and are for use by  ┃
     *  ┃     Move instances that have already been validated. These      ┃
     *  ┃     methods are here so that moves can avoid directly modifying ┃
     *  ┃     board internals (slots, homes, bars), and so do not need    ┃
     *  ┃     to worry about calling markChange().                        ┃
     *  ┃                                                                 ┃
     *  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
     */

    /**
     * @param {String} color
     * @return {Piece}
     */
    popBar(color) {
        const piece = this.bars[color].pop()
        this.markChange()
        return piece
    }

    /**
     * @param {String} color
     * @param {Piece} piece
     * @return {Board} self
     */
    pushBar(color, piece = undefined) {
        piece = piece || new Piece(color)
        this.bars[color].push(piece)
        this.markChange()
        return this
    }

    /**
     * @param {String}
     * @return {Piece}
     */
    popHome(color) {
        const piece = this.homes[color].pop()
        this.markChange()
        return piece
    }

    /**
     * @param {String} color
     * @param {Piece} piece
     * @return {Board} self
     */
    pushHome(color, piece = undefined) {
        piece = piece || new Piece(color)
        this.homes[color].push(piece)
        this.markChange()
        return this
    }

    /**
     * @param {Number} origin
     * @return {Piece}
     */
    popOrigin(origin) {
        const piece = this.slots[origin].pop()
        this.markChange()
        return piece
    }

    /**
     * @param {Number} origin
     * @param {String|Piece} piece
     * @return {Board} self
     */
    pushOrigin(origin, piece) {
        if (!(piece instanceof Piece)) {
            piece = new Piece(piece)
        }
        this.slots[origin].push(piece)
        this.markChange()
        return this
    }

    /**
     * @return {Board} self
     */
    markChange() {
        this.cache = {}
        this.analyzer.cache = {}
        return this
    }

    /**
     * @return {String}
     */
    toString() {
        return this.state28()
    }

    /**
     * @return {Board}
     */
    static setup() {
        return new Board(true).setup()
    }

    /**
     * @throws {TypeError}
     *
     * @param {String} str
     * @return {Board}
     */
    static fromStateString(str) {
        return new Board(true).setStateString(str)
    }

    /**
     * @throws {TypeError}
     *
     * @param {String|Array|Buffer} input
     * @return {Board}
     */
    static fromState28(input) {
        return new Board(true).setState28(input)
    }
}

export class Piece {

    /**
     * @param {String}
     */
    constructor(color) {
        if (color instanceof Piece) {
            color = color.color
        }
        this.color = ColorNorm[color]
        this.c = ColorAbbr[this.color]
    }

    /**
     * @return {String}
     */
    toString() {
        return this.color
    }

    /**
     * @param {Number} n
     * @param {String} color
     * @return {Piece[]}
     */
    static make(n, color) {
        return nmap(+n, () => new Piece(color))
    }
}

