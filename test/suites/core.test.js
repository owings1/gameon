/**
 * gameon - test suite - core
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
import {expect} from 'chai'
import States from '../states.js'
import States28 from '../states28.js'
import {getError, makeRandomMoves} from '../util.js'

import {White, Red} from '../../src/lib/constants.js'

import Dice from '../../src/lib/dice.js'
import Player from '../../src/lib/player.js'
import {Match, Game, Board, Turn, Piece} from '../../src/lib/core.js'
import {destroyAll} from '../../src/lib/util.js'

describe('Match', () => {

    describe('#constructor', () => {

        it('should throw ArgumentError for total=0', () => {
            const err = getError(() => new Match(0))
            expect(err.name).to.equal('ArgumentError')
        })

        it('should not throw for total=1', () => {
            new Match(1)
        })
    })

    describe('#cancel', () => {

        it('should set isCanceled when not already finished', () => {
            const match = new Match(1)
            const err = new Error
            match.cancel(err)
            expect(match.isCanceled).to.equal(true)
            expect(match.cancelError).to.equal(err)
        })

        it('should set isCanceled on thisGame', () => {
            const match = new Match(1)
            const err = new Error
            const game = match.nextGame()
            match.cancel(err)
            expect(match.thisGame.isCanceled).to.equal(true)
            expect(match.thisGame.cancelError).to.equal(err)
        })

        it('should not set isCanceled when already finished', () => {
            const match = new Match(1)
            // force
            match.isFinished = true
            match.cancel(new Error)
            expect(match.isCanceled).to.equal(false)
            expect(Boolean(match.cancelError)).to.equal(false)
        })
    })

    describe('#checkFinished', () => {

        it('should return false when match not started', () => {
            const match = new Match(1)
            const result = match.checkFinished()
            expect(result).to.equal(false)
        })

        it('should return true when match isFinished=true', () => {
            const match = new Match(1)
            // force property
            match.isFinished = true
            const result = match.checkFinished()
            expect(result).to.equal(true)
        })

        it('should return true for 1 point match when double is declined', () => {
            const match = new Match(1, {isCrawford: false})
            makeRandomMoves(match.nextGame().firstTurn(), true)
            match.thisGame.nextTurn().setDoubleOffered().setDoubleDeclined()
            match.checkFinished()
            expect(match.isFinished).to.equal(true)
        })

        it('should not throw on thisGame null (deviant)', () => {
            const match = new Match(1, {isCrawford: false})
            makeRandomMoves(match.nextGame().firstTurn(), true)
            match.thisGame.nextTurn().setDoubleOffered().setDoubleDeclined()
            match.checkFinished()
            // force properties
            match.isFinished = false
            match.thisGame = null
            match.checkFinished()
        })
    })

    describe('#getLoser', () => {

        it('should return null when match not started', () => {
            const match = new Match(1)
            const result = match.getLoser()
            expect(result).to.equal(null)
        })

        it('should return White when red doubles and white declines for 1 point match isCrawford=false', () => {
            const match = new Match(1, {isCrawford: false, roller: () => [6, 1]})
            const game = match.nextGame()
            makeRandomMoves(game.firstTurn(), true)
            game.nextTurn().setDoubleOffered()
            game.thisTurn.setDoubleDeclined()
            match.checkFinished()
            const result = match.getLoser()
            expect(result).to.equal(White)
        })
    })

    describe('#meta', () => {

        it('should return gameCount=0 for match not started', () => {
            const match = new Match(1)
            const result = match.meta()
            expect(result.gameCount).to.equal(0)
        })
    })

    describe('#nextGame', () => {

        it('should throw GameNotFinishedError on second call', () => {
            const match = new Match(1)
            match.nextGame()
            const err = getError(() => match.nextGame())
            expect(err.name).to.equal('GameNotFinishedError')
        })

        it('should throw MatchFinishedError for 1 point match when first game is finished', () => {
            const match = new Match(1)
            const game = match.nextGame()
            game.board.setStateString(States.EitherOneMoveWin)
            const turn = game.firstTurn()
            makeRandomMoves(turn)
            turn.finish()
            expect(game.checkFinished()).to.equal(true)
            match.updateScore()
            const err = getError(() => match.nextGame())
            expect(err.name).to.equal('MatchFinishedError')
        })

        it('should set isCrawford only once', () => {

            const rolls = [[1, 6], [6, 1], [6, 6]]
            const match = new Match(2, {isCrawford: true, isJacoby: true, roller: () => rolls.shift()})

            const game1 = match.nextGame()
            // red moves first
            makeRandomMoves(game1.firstTurn(), true)
            // white doubles
            game1.nextTurn().setDoubleOffered()
            // red declines, white wins
            game1.thisTurn.setDoubleDeclined()
            match.checkFinished()
            

            const game2 = match.nextGame()
            expect(game2.opts.isCrawford).to.equal(true)
            // white moves first
            makeRandomMoves(game2.firstTurn(), true)
            // force state red will win
            game2.board.setStateString(States.EitherOneMoveWin)
            makeRandomMoves(game2.nextTurn().roll(), true)
            match.checkFinished()

            const game3 = match.nextGame()
            expect(game3.opts.isCrawford).to.equal(false)
        })
    })

    describe('#unserialize', () => {

        it('should unserialize unstarted match', () => {
            const m1 = new Match(1)
            const m2 = Match.unserialize(m1.serialize())
            expect(m2.total).to.equal(1)
        })

        it('should unserialize match with unstarted game', () => {
            const m1 = new Match(1)
            m1.nextGame()
            const m2 = Match.unserialize(m1.serialize())
            m2.thisGame.firstTurn()
        })

        it('should serialize/unserialize and continue play with total:1', () => {
            const m1 = new Match(1, {roller: () => [6, 1]})
            const g1 = m1.nextGame()

            // white moves first
            makeRandomMoves(g1.firstTurn(), true)

            const m2 = Match.unserialize(m1.serialize())
            const g2 = m2.thisGame

            expect(g2.board.stateString()).to.equal(g1.board.stateString())

            // should be red's turn
            const t2 = g2.nextTurn()
            expect(t2.color).to.equal(Red)
        })

        it('should fix bad createDate', () => {
            const match = new Match(1)
            const data = match.serialize()
            data.createDate = 'bad date'
            const res = Match.unserialize(data)
            expect(res.createDate.toString()).to.not.equal('Invalid Date')
        })
    })

    describe('#updateScore', () => {

        it('should do nothing when match not started', () => {
            const match = new Match(1)
            match.updateScore()
            expect(match.scores.Red).to.equal(0)
            expect(match.scores.White).to.equal(0)
        })
    })
})

describe('Game', () => {

    var game

    beforeEach(() => {
        game = new Game
    })

    describe('opts.startState', () => {
        it('should set board to startState in opts', () => {
            const game = new Game({startState: States.BlotsMinSkip1})
            expect(game.board.stateString()).to.equal(States.BlotsMinSkip1)
        })
    })

    describe('#cancel', () => {

        it('should not set isCanceled when isFinished', () => {
            const game = new Game
            // force
            game.isFinished = true
            game.cancel()
            expect(game.isCanceled).to.equal(false)
        })

        it('should set isCanceled when not isFinished', () => {
            const game = new Game
            const err = new Error
            game.cancel(err)
            expect(game.isCanceled).to.equal(true)
            expect(game.cancelError).to.equal(err)
        })

        it('should add thisTurn to turn history', () => {
            const game = new Game
            const turn = game.firstTurn()
            game.cancel(new Error)
            expect(game.turnHistory).to.have.length(1)
            expect(game.turnHistory[0].uuid).to.equal(turn.uuid)
        })
    })

    describe('#canDouble', () => {

        it('should return false when isCrawford', () => {
            game.opts.isCrawford = true
            const result = game.canDouble(White)
            expect(result).to.equal(false)
        })

        it('should return false for red when white owns the cube', () => {
            game.cubeValue = 2
            game.cubeOwner = White
            const result = game.canDouble(Red)
            expect(result).to.equal(false)
        })

        it('should return true for white when white owns the cube', () => {
            game.cubeValue = 2
            game.cubeOwner = White
            const result = game.canDouble(White)
            expect(result).to.equal(true)
        })

        it('should return true for red when nobody owns the cube', () => {
            const result = game.canDouble(Red)
            expect(result).to.equal(true)
        })

        it('should return false for Red when value is 64', () => {
            game.cubeValue = 64
            game.cubeOwner = Red
            const result = game.canDouble(Red)
            expect(result).to.equal(false)
        })

        it('should return false when cubeEnabled = false', () => {
            const game = new Game({cubeEnabled: false})
            const res = game.canDouble()
            expect(res).to.equal(false)
        })
    })

    describe('#checkFinished', () => {

        it('should return false for new game', () => {
            const result = game.checkFinished()
            expect(result).to.equal(false)
        })

        it('should return true when isFinished=true', () => {
            game.isFinished = true
            const result = game.checkFinished()
            expect(result).to.equal(true)
        })

        it('should return false when firstTurn is not finished', () => {
            const firstTurn = game.firstTurn()
            const result = game.checkFinished()
            expect(result).to.equal(false)
        })

        it('should return true when player doubles on second turn and it is declined', () => {
            const firstTurn = game.firstTurn()
            makeRandomMoves(firstTurn)
            firstTurn.finish()
            const turn = game.nextTurn()
            turn.setDoubleOffered()
            turn.setDoubleDeclined()
            const result = game.checkFinished()
            expect(result).to.equal(true)
        })

        it('should return true for gammon and set finalValue to 1 for isJacoby', () => {
            game.opts.isJacoby = true
            const firstTurn = game.firstTurn()
            makeRandomMoves(firstTurn)
            firstTurn.finish()
            game.board = Board.fromStateString(States.WhiteGammon1)
            const result = game.checkFinished()
            expect(result).to.equal(true)
            expect(game.finalValue).to.equal(1)
        })

        it('should return true for backgammon and set finalValue to 4 for isJacoby=false', () => {
            game.opts.isJacoby = false
            const firstTurn = game.firstTurn()
            makeRandomMoves(firstTurn)
            firstTurn.finish()
            game.board = Board.fromStateString(States.WhiteBackgammon1)
            const result = game.checkFinished()
            expect(result).to.equal(true)
            expect(game.finalValue).to.equal(4)
        })

        it('should return true and set finalValue to 2 for no gammon with cubeValue=2', () => {
            game.opts.isJacoby = false
            game.cubeValue = 2
            const firstTurn = game.firstTurn()
            makeRandomMoves(firstTurn)
            firstTurn.finish()
            game.board = Board.fromStateString(States.WhiteNoGammon1)
            const result = game.checkFinished()
            expect(result).to.equal(true)
            expect(game.finalValue).to.equal(2)
        })
    })

    describe('#double', () => {

        it('should throw GameFinishedError if game is finished', () => {
            game.isFinished = true
            const err = getError(() => game.double())
            expect(err.name).to.equal('GameFinishedError')
        })

        it('should throw GameNotStartedError before first turn', () => {
            const err = getError(() => game.double())
            expect(err.name).to.equal('GameNotStartedError')
        })

        it('should throw AlreadyRolledError when first turn is active', () => {
            game.firstTurn()
            const err = getError(() => game.double())
            expect(err.name).to.equal('AlreadyRolledError')
        })

        it('should double score before second turn', () => {
            makeRandomMoves(game.firstTurn()).finish()
            game.nextTurn()
            game.double()
            expect(game.cubeValue).to.equal(2)
        })

        it('should not allow player to double twice with DoubleNotAllowedError', () => {
            makeRandomMoves(game.firstTurn()).finish()
            game.nextTurn()
            game.double()
            const err = getError(() => game.double())
            expect(err.name).to.equal('DoubleNotAllowedError')
        })
    })

    describe('#firstTurn', () => {

        it('should throw GameFinishedError for finished game', () => {
            game.isFinished = true
            const err = getError(() => game.firstTurn())
            expect(err.name).to.equal('GameFinishedError')
        })

        it('should throw GameAlreadyStartedError on second call', () => {
            game.firstTurn()
            const err = getError(() => game.firstTurn())
            expect(err.name).to.equal('GameAlreadyStartedError')
        })
    })

    describe('#getLoser', () => {

        it('should return null for new game', () => {
            const result = game.getLoser()
            expect(result).to.equal(null)
        })

        it('should return red after red first turn then force state to EitherOneMoveWin and white move', () => {
            const rolls = [[1, 6], [5, 2]]
            game.opts.roller = () => rolls.shift()
            makeRandomMoves(game.firstTurn()).finish()
            game.board.setStateString(States.EitherOneMoveWin)
            const turn = game.nextTurn()
            turn.roll()
            makeRandomMoves(turn).finish()
            const result = game.getLoser()
            expect(result).to.equal(Red)
        })
    })

    describe('#getWinner', () => {

        it('should return null for new game', () => {
            const result = game.getWinner()
            expect(result).to.equal(null)
        })

        it('should return white after red first turn then force state to EitherOneMoveWin and white move', () => {
            const rolls = [[1, 6], [5, 2]]
            game.opts.roller = () => rolls.shift()
            makeRandomMoves(game.firstTurn()).finish()
            game.board.setStateString(States.EitherOneMoveWin)
            const turn = game.nextTurn()
            turn.roll()
            makeRandomMoves(turn).finish()
            const result = game.getWinner()
            expect(result).to.equal(White)
        })

        it('should return red after white first turn then force state to EitherOneMoveWin and red move', () => {
            const rolls = [[6, 1], [5, 2]]
            game.opts.roller = () => rolls.shift()
            makeRandomMoves(game.firstTurn()).finish()
            game.board.setStateString(States.EitherOneMoveWin)
            const turn = game.nextTurn()
            turn.roll()
            makeRandomMoves(turn).finish()
            const result = game.getWinner()
            expect(result).to.equal(Red)
        })
    })

    describe('#hasWinner', () => {

        it('should return false for new game', () => {
            const result = game.hasWinner()
            expect(result).to.equal(false)
        })

        it('should return true for EitherOneMoveWin after first turn', () => {
            game.board.setStateString(States.EitherOneMoveWin)
            makeRandomMoves(game.firstTurn()).finish()
            const result = game.hasWinner()
            expect(result).to.equal(true)
        })
    })

    describe('#meta', () => {

        it('should return opts with just the keys of Game.defaults()', () => {
            const game = new Game({badOpt: true})
            const result = Object.keys(game.meta().opts).sort()
            const exp = Object.keys(Game.defaults()).sort()
            expect(result).to.jsonEqual(exp)
        })

        it('should turnCount = 1 after firstTurn is called', () => {
            game.firstTurn()
            const result = game.meta()
            expect(result.turnCount).to.equal(1)
        })
    })

    describe('#nextTurn', () => {

        it('should throw GameFinishedError for finished game', () => {
            game.isFinished = true
            const err = getError(() => game.nextTurn())
            expect(err.name).to.equal('GameFinishedError')
        })

        it('should throw GameNotStartedError for unstarted game', () => {
            const err = getError(() => game.nextTurn())
            expect(err.name).to.equal('GameNotStartedError')
        })

        it('should throw TurnNotFinishedError when current turn is not finished', () => {
            const turn = game.firstTurn()
            const err = getError(() => game.nextTurn())
            expect(err.name).to.equal('TurnNotFinishedError')
        })

        it('should return null if game is just now finished', () => {
            // take the first turn
            const turn = game.firstTurn()
            makeRandomMoves(turn)
            turn.finish()
            // force game over
            game.board = Board.fromStateString(States.WhiteGammon1)
            const result = game.nextTurn()
            expect(result).to.equal(null)
        })

        it('should return turn for opponent of first roll winner after first turn finished', () => {
            // take the first turn
            const firstTurn = game.firstTurn()
            makeRandomMoves(firstTurn)
            firstTurn.finish()
            const expColor = firstTurn.color == White ? Red : White
            const turn = game.nextTurn()
            expect(turn.color).to.equal(expColor)
        })
    })

    describe('#serialize', () => {

        it('should have thisTurn when exists with same dice', () => {
            const firstTurn = game.firstTurn()
            const result = game.serialize()
            expect(!!result.thisTurn).to.equal(true)
            expect(result.thisTurn.dice).to.jsonEqual(firstTurn.dice)
        })
    })
})

describe('Turn', () => {

    describe('#assertIsRolled', () => {

        it('should throw HasNotRolledError for new turn', () => {
            const turn = new Turn(new Board, White)
            const err = getError(() => turn.assertIsRolled())
            expect(err.name).to.equal('HasNotRolledError')
        })
    })

    describe('#assertNotFinished', () => {

        it('should throw TurnAlreadyFinishedError when isFinished=true', () => {
            const turn = new Turn(new Board, White)
            turn.isFinished = true
            const err = getError(() => turn.assertNotFinished())
            expect(err.name).to.equal('TurnAlreadyFinishedError')
        })
    })

    describe('#assertNotRolled', () => {

        it('should throw AlreadyRolledError after roll', () => {
            const turn = new Turn(new Board, White)
            turn.roll()
            const err = getError(() => turn.assertNotRolled())
            expect(err.name).to.equal('AlreadyRolledError')
        })
    })

    describe('#cancel', () => {

        it('should not set isCanceled when already finished', () => {
            const turn = new Turn(Board.setup(), White)
            turn.roll()
            makeRandomMoves(turn).finish()
            turn.cancel()
            expect(turn.isCanceled).to.equal(false)
        })

        it('should set isCanceled when not already finished', () => {
            const turn = new Turn(Board.setup(), White)
            const err = new Error
            turn.roll()
            turn.cancel(err)
            expect(turn.isCanceled).to.equal(true)
            expect(turn.cancelError).to.equal(err)
        })
    })

    describe('#fetchBoard', () => {

        it('should get new board if not in cache', () => {
            const turn = new Turn(Board.setup(), White)
            const b1 = turn.fetchBoard(States28.BlotsMinSkip1)
            expect(b1.state28()).to.equal(States28.BlotsMinSkip1)
        })

        it('should get self-same board if after second call', () => {
            const turn = new Turn(Board.setup(), White)
            const b1 = turn.fetchBoard(States28.BlotsMinSkip1)
            const b2 = turn.fetchBoard(States28.BlotsMinSkip1)
            expect(b2.state28()).to.equal(States28.BlotsMinSkip1)
            expect(b1).to.equal(b1)
        })
    })

    describe('#finish', () => {

        it('should allow after setRoll 6,6 for white on bar with setup board', () => {
            const board = Board.setup()
            board.pushBar(White, board.popOrigin(0))
            //board.bars.White.push(board.slots[0].pop())
            //board.markChange()
            const turn = new Turn(board, White)
            turn.setRoll([6, 6])
            turn.finish()
        })

        it('should throw MovesRemainingError after one move for [2, 1]', () => {
            const turn = new Turn(Board.setup(), Red)
            turn.setRoll([2, 1])
            turn.move(23, 2)
            const err = getError(() => turn.finish())
            expect(err.name).to.equal('MovesRemainingError')
        })

        it('should clear board cache', () => {
            const turn = new Turn(Board.setup(), White)
            turn.roll()
            turn.fetchBoard(States28.BlotsMinSkip1)
            makeRandomMoves(turn)
            turn.finish()
            expect(Object.keys(turn.boardCache)).to.have.length(0)
        })
    })

    describe('#meta', () => {

        it('should have correct color', () => {
            const turn = new Turn(Board.setup(), White)
            const result = turn.meta()
            expect(result.color).to.equal(White)
        })

        it('should have moves length 1 after move', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setRoll([1, 2])
            const move = {origin: 0, face: 1}
            turn.move(move)
            const result = turn.meta()
            expect(result.moves).to.have.length(1)
        })

        it('should set isDoubleOffered and isDoubleDeclined when double is offered', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setDoubleOffered()
            const result = turn.meta()
            expect(result.isDoubleOffered).to.equal(true)
            expect(result.isDoubleDeclined).to.equal(false)
        })

        it('should convert to json when opts with circular references are passed', () => {
            const board = Board.setup()
            board.board = board
            const opts = {board}
            opts.opts = opts
            const turn = new Turn(board, White, opts)
            const result = turn.meta()
            JSON.stringify(result)
        })
    })

    describe('#move', () => {

        it('should move Red 3,1 to 5 point with expected state', () => {
            const bexp = Board.setup()
            bexp.pushOrigin(4, bexp.popOrigin(7))
            bexp.pushOrigin(4, bexp.popOrigin(5))
            const exp = bexp.stateString()

            const board = Board.setup()
            const turn = new Turn(board, Red)
            turn.setRoll([3, 1])
            //console.log(SequenceTree.serializeIndex(turn.allowedMoveIndex, true))
            turn.move(7, 3)
            turn.move(5, 1)
            turn.finish()

            expect(board.stateString()).to.equal(exp)
        })

        it('should not move a 4 when it was not rolled', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setRoll([5, 2])
            const err = getError(() => turn.move(0, 4))
            expect(err.isIllegalMoveError).to.equal(true)
        })

        it('should accept coords object as first param', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setRoll([1, 2])
            const move = {origin: 0, face: 1}
            turn.move(move)
            expect(turn.board.slots[0]).to.have.length(1)
            expect(turn.board.slots[1]).to.have.length(1)
        })

        it('should throw NoMovesRemainingError for a third move on roll [3, 4]', () => {
            const turn = new Turn(Board.setup(), Red)
            turn.setRoll([3, 4])
            turn.move(23, 4)
            turn.move(23, 3)
            const err = getError(() => turn.move(20, 3))
            expect(err.name).to.equal('NoMovesRemainingError')
        })

        it('should allow come in on 4 for WhiteCornerCase24', () => {
            const turn = new Turn(Board.fromStateString(States.WhiteCornerCase24), White)
            turn.setRoll([2, 4])
            turn.move(-1, 4)
        })

        it('should not allow come in on 2 for WhiteCornerCase24', () => {
            const turn = new Turn(Board.fromStateString(States.WhiteCornerCase24), White)
            turn.setRoll([2, 4])
            const err = getError(() => turn.move(-1, 2))
            expect(err.isIllegalMoveError).to.equal(true)
        })

        it('should allow white to move i:14 2, i:16 6 for WhiteCornerCase26', () => {
            const board = Board.fromStateString(States.WhiteCornerCase26)
            const turn = new Turn(board, White)
            turn.setRoll([2, 6])
            turn.move(14, 2)
            turn.move(16, 6)
            turn.finish()
        })

        it('should not allow white to move i:17 2 for WhiteCornerCase26', () => {
            const board = Board.fromStateString(States.WhiteCornerCase26)
            const turn = new Turn(board, White)
            turn.setRoll([2, 6])
            const err = getError(() => turn.move(17, 2))
            expect(err.isIllegalMoveError).to.equal(true)
        })

        it('should allow white to take the 6 and finish for WhiteCornerCase16', () => {
            const board = Board.fromStateString(States.WhiteCornerCase16)
            const turn = new Turn(board, White)
            turn.setRoll([1, 6])
            turn.move(17, 6)
            turn.finish()
        })

        it('should not allow white to take the 1 for WhiteCornerCase16', () => {
            const board = Board.fromStateString(States.WhiteCornerCase16)
            const turn = new Turn(board, White)
            turn.setRoll([1, 6])
            const err = getError(() => turn.move(17, 1))
            expect(err.isIllegalMoveError).to.equal(true)
        })

        it('should not allow white to come in on 1 with no piece on bar with NoPieceOnBarError', () => {
            const board = Board.setup()
            const turn = new Turn(board, White)
            turn.setRoll([1, 2])
            const err = getError(() => turn.move(-1, 1))
            expect(err.name).to.equal('NoPieceOnBarError')
        })

        it('should allow red to bearoff with the 5 on 5,1 roll with one on i:1', () => {
            const board = Board.fromStateString(States.RedBearoff51)
            const turn = new Turn(board, Red)
            turn.setRoll([5, 1])
            const move = turn.move(1, 5)
            turn.finish()
        })

        it('should allow red to bearoff with the 5 on 5,1 roll with one on i:1, one on i:2', () => {

            const board = Board.fromStateString(States.RedBearoff51easy)
            //console.log(board.stateString())
            const turn = new Turn(board, Red)
            turn.setRoll([5, 1])
            turn.move(2, 5)
            // This is weird, I think it was a bug before -- it shouldn't let you continue after a win
            //turn.move(1, 1)
            turn.finish()
        })
    })

	describe('#roll', () => {

		it('should set dice and faces', () => {
			const board = new Board
			const turn = new Turn(board, White)
			turn.roll()
			expect(turn.dice).to.have.length(2)
			expect(turn.faces.length).to.be.greaterThan(1)
		})
	})

    describe('#serialize', () => {

        it('should convert to json', () => {
            const game = new Game
            const t1 = makeRandomMoves(game.firstTurn(), true)
            expect(t1.isDepthTree).to.equal(true)
            const res = t1.serialize()
            JSON.stringify(res)
        })

        it('should convert to json with breadth', () => {
            const game = new Game({breadthTrees: true})
            const t1 = makeRandomMoves(game.firstTurn(), true)
            expect(t1.isBreadthTree).to.equal(true)
            const res = t1.serialize()
            JSON.stringify(res)
        })

        it('allowed move index should have same keys', () => {
            const game = new Game
            const t1 = makeRandomMoves(game.firstTurn(), true)
            const exp1 = Object.keys(t1.allowedMoveIndex).sort()
            const res = t1.serialize()
            const exp2 = Object.keys(res.allowedMoveIndex).sort()
            expect(exp1).to.jsonEqual(exp2)
        })

        it('should convert to json when opts with circular references are passed', () => {
            const board = Board.setup()
            board.board = board
            const opts = {board}
            opts.opts = opts
            const turn = new Turn(board, White, opts)
            const result = turn.serialize()
            JSON.stringify(result)
        })
    })

    describe('#setDoubleDeclined', () => {

        it('should throw HasNotDoubledError if double has not been offered', () => {
            const turn = new Turn(Board.setup(), White)
            const err = getError(() => turn.setDoubleDeclined())
            expect(err.name).to.equal('HasNotDoubledError')
        })

        it('should finish turn', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setDoubleOffered()
            turn.setDoubleDeclined()
            expect(turn.isFinished).to.equal(true)
        })

        it('should allow double call', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setDoubleOffered()
            turn.setDoubleDeclined()
            turn.setDoubleDeclined()
            expect(turn.isFinished).to.equal(true)
        })
    })

    describe('#setDoubleOffered', () => {

        it('should throw AlreadyRolledError if already rolled', () => {
            const turn = new Turn(Board.setup(), White)
            turn.roll()
            const err = getError(() => turn.setDoubleOffered())
            expect(err.name).to.equal('AlreadyRolledError')
        })

        it('should set isDoubleOffered=true if not already rolled', () => {
            const turn = new Turn(Board.setup(), White)
            turn.setDoubleOffered()
            expect(turn.isDoubleOffered).to.equal(true)
        })
    })

    describe('#unmove', () => {

        it('should throw NoMovesMadeError before any move is made', () => {
            const turn = new Turn(Board.setup(), White)
            turn.roll()
            const err = getError(() => turn.unmove())
            expect(err.name).to.equal('NoMovesMadeError')
        })

        it('should undo second move to end up with 5 point for red for 3,1', () => {
            const turn = new Turn(Board.setup(), Red)
            turn.setRoll([3, 1])
            turn.move(5, 1)
            turn.move(23, 3)
            turn.unmove()
            turn.move(7, 3)
            turn.finish()
            expect(turn.board.analyzer.piecesOnOrigin(Red, 4)).to.equal(2)
        })

        it('should undo both moves to end up with 5 point for red for 3,1', () => {
            const turn = new Turn(Board.setup(), Red)
            turn.setRoll([3, 1])
            turn.move(5, 1)
            turn.move(23, 3)
            turn.unmove()
            turn.unmove()
            turn.move(5, 1)
            turn.move(7, 3)
            turn.finish()
            expect(turn.board.analyzer.piecesOnOrigin(Red, 4)).to.equal(2)
        })
    })

    describe('#unserialize', () => {

        it('should make new board with state if not passed', () => {
            const game = new Game
            const t1 = makeRandomMoves(game.firstTurn(), true)
            const t2 = Turn.unserialize(Turn.serialize(t1))
            expect(t2.board.stateString()).to.equal(t1.board.stateString())
            expect(t2).to.not.equal(t1)
        })

        it('should leave second turn unrolled, then continue play', () => {
            const rolls = [[6, 1]]
            const game = new Game({roller: () => rolls.shift() || Dice.rollTwo()})
            makeRandomMoves(game.firstTurn(), true)
            game.nextTurn()
            const t2 = Turn.unserialize(Turn.serialize(game.thisTurn))
            expect(t2.color).to.equal(Red)
            expect(t2.isRolled).to.equal(false)
            t2.roll()
            makeRandomMoves(t2, true)
            expect(t2.isFinished).to.equal(true)
        })

        it('should set isCanceled', () => {
            const turn = new Turn(Board.setup(), White)
            turn.roll()
            turn.cancel()
            const res = Turn.unserialize(turn.serialize())
            expect(res.isCanceled).to.equal(true)
        })
    })

    describe('endStatesToSeries', () => {

        it('should have expected value for sparse board with 2,1 roll', () => {
            const board = new Board
            board.pushOrigin(0, White)
            board.pushOrigin(0, White)

            // build expected board outcomes
            const b1 = board.copy()
            const b2 = board.copy()
            b1.pushOrigin(1, b1.popOrigin(0))
            b1.pushOrigin(2, b1.popOrigin(0))
            b2.pushOrigin(3, b2.popOrigin(0))

            const turn = new Turn(board, White)
            turn.setRoll([2, 1])

            const result = turn.endStatesToSeries
            const statesActual = Object.keys(result).sort()
            const statesExp = [b1.state28(), b2.state28()].sort()
            //const statesExp = [b1.stateString(), b2.stateString()].sort()
            expect(statesActual).to.jsonEqual(statesExp)

            const b1MovesActual = result[b1.state28()]
            //const b1MovesActual = result[b1.stateString()]
            const b1MovesExp = [{origin: 0, face: 2}, {origin: 0, face: 1}] // could be 0:1|0:2
            const b2MovesAcutal = result[b2.state28()]
            //const b2MovesAcutal = result[b2.stateString()]
            const b2MovesExp = [{origin: 0, face: 2}, {origin: 2, face: 1}] // could be 0:1|1:2
            expect(b1MovesActual).to.jsonEqual(b1MovesExp)
            expect(b2MovesAcutal).to.jsonEqual(b2MovesExp)
        })
    })
})

describe('Board', () => {

    var board

    beforeEach(() => board = new Board)

    describe('#constructor', () => {

        it('should construct', () => {
            new Board
        })
    })

    describe('#clear', () => {

        it('should make 24 slots', () => {
            board.clear()
            expect(board.slots).to.have.length(24)
        })
    })

    describe('#copy', () => {

        it('should have two pieces on slot 0 copying setup board, but slot arrays non-identical', () => {
            board.setup()
            const copy = board.copy()
            expect(copy.analyzer.piecesOnOrigin(White, 0)).to.equal(2)
            board.popOrigin(0)
            expect(copy.analyzer.piecesOnOrigin(White, 0)).to.equal(2)
        })
    })

	describe('#fromStateString', () => {

		it('should return board whose state string is same as input for initial setup', () => {
			const board = Board.fromStateString(States.Initial)
			const result = board.stateString()
			expect(result).to.equal(States.Initial)
		})

        it('should accept short style', () => {
            const board = Board.fromStateString(States.Initial)
            const result = Board.fromStateString(States.InitialShort)
            expect(result.stateString()).to.equal(board.stateString())
        })

        it('should accept shorter style', () => {
            const board = Board.fromStateString(States.Initial)
            const result = Board.fromStateString(States.InitialShorter)
            expect(result.stateString()).to.equal(board.stateString())
        })
	})

	describe('#getPossibleMovesForFace', () => {

		it('should return singleton isComeIn face=2 with white from bar on sparse board', () => {
            board.pushBar(White)
			const result = board.getPossibleMovesForFace(White, 2)
			expect(result).to.have.length(1)
			expect(result[0].isComeIn).to.equal(true)
			expect(result[0].face).to.equal(2)
		})

		it('should return empty for white face=5 with one on 0 and red 2 on 5', () => {
            board.pushOrigin(0, White)
            board.pushOrigin(5, Red)
            board.pushOrigin(5, Red)
			const result = board.getPossibleMovesForFace(White, 5)
			expect(result).to.have.length(0)
		})

	})

    describe('#getWinner', () => {

        it('should return null for empty board', () => {
            const result = board.getWinner()
            expect(result).to.equal(null)
        })

        it('should return null for setup board', () => {
            board.setup()
            const result = board.getWinner()
            expect(result).to.equal(null)
        })

        it('should return white when home has 15', () => {
            for (var i = 0; i < 15; i++) {
                board.pushHome(White)
            }
            const result = board.getWinner()
            expect(result).to.equal(White)
        })

        it('should return red when home has 15', () => {
            for (var i = 0; i < 15; i++) {
                board.pushHome(Red)
            }
            const result = board.getWinner()
            expect(result).to.equal(Red)
        })
    })

    describe('#setStateString', () => {

        it('should accept stateString and state28', () => {
            const b1 = new Board
            const b2 = new Board
            b1.setStateString(States.RedHasWon)
            b2.setStateString(States28.RedHasWon)
            expect(b1.stateString()).to.equal(b2.stateString())
        })
    })

    describe('#hasWinner', () => {

        it('should return true when red has 15 in home', () => {
            for (var i = 0; i < 15; i++) {
                board.pushHome(Red)
            }
            const result = board.hasWinner()
            expect(result).to.equal(true)
        })

        it('should return true when white has 15 in home', () => {
            for (var i = 0; i < 15; i++) {
                board.pushHome(White)
            }
            const result = board.hasWinner()
            expect(result).to.equal(true)
        })
    })

    describe('#inverted', () => {

        it('should preserve initial state', () => {
            const board = Board.setup()
            const result = board.inverted()
            expect(result.stateString()).to.equal(States.Initial)
        })

        it('should return WhiteGammon1 for RedGammon1', () => {
            const board = Board.fromStateString(States.RedGammon1)
            const result = board.inverted()
            expect(result.stateString()).to.equal(States.WhiteGammon1)
        })
    })

    describe('#isBackgammon', () => {

        it('should return true for WhiteBackgammon1 case', () => {
            const board = Board.fromStateString(States.WhiteBackgammon1)
            const result = board.isBackgammon()
            expect(result).to.equal(true)
        })

        it('should return true for WhiteBackgammon2 case', () => {
            const board = Board.fromStateString(States.WhiteBackgammon2)
            const result = board.isBackgammon()
            expect(result).to.equal(true)
        })

        it('should return false for WhiteNoGammon1 case', () => {
            const board = Board.fromStateString(States.WhiteNoGammon1)
            const result = board.isBackgammon()
            expect(result).to.equal(false)
        })

        it('should return false for WhiteGammon1 case', () => {
            const board = Board.fromStateString(States.WhiteGammon1)
            const result = board.isBackgammon()
            expect(result).to.equal(false)
        })

        it('should return false for Initial case', () => {
            const board = Board.fromStateString(States.Initial)
            const result = board.isBackgammon()
            expect(result).to.equal(false)
        })
    })

    describe('#isGammon', () => {

        it('should return true for WhiteGammon1 case', () => {
            const board = Board.fromStateString(States.WhiteGammon1)
            const result = board.isGammon()
            expect(result).to.equal(true)
        })

        it('should return false for WhiteNoGammon1 case', () => {
            const board = Board.fromStateString(States.WhiteNoGammon1)
            const result = board.isGammon()
            expect(result).to.equal(false)
        })

        it('should return false for Initial case', () => {
            const board = Board.fromStateString(States.Initial)
            const result = board.isGammon()
            expect(result).to.equal(false)
        })
    })

    describe('#move', () => {


        beforeEach(() => {
            board.setup()
        })

        it('should throw InvalidRollError for 7 spaces', () => {
            const err = getError(() => board.move(White, 0, 7))
            expect(err.name).to.equal('InvalidRollError')
        })

        it('should throw InvalidRollError for -1 spaces', () => {
            const err = getError(() => board.move(White, 0, -1))
            expect(err.name).to.equal('InvalidRollError')
        })

        it('should throw NoPieceOnBarError for comein -1 with no bar', () => {
            const err = getError(() => board.move(White, -1, 1))
            expect(err.name).to.equal('NoPieceOnBarError')
        })

        it('should comein to face=1 for white with bar', () => {
            board.pushBar(White, board.popOrigin(0))
            board.move(White, -1, 1)
            expect(board.analyzer.piecesOnOrigin(White, 0)).to.equal(2)
        })

        it('should comein to face=1 for red with bar', () => {
            board.pushBar(Red, board.popOrigin(23))
            board.move(Red, -1, 1)
            expect(board.analyzer.piecesOnOrigin(Red, 23)).to.equal(2)
        })

        it('should not comein to face=6 for white with bar as OccupiedSlotError', () => {
            board.pushBar(White, board.popOrigin(0))
            const err = getError(() => board.move(White, -1, 6))
            expect(err.name).to.equal('OccupiedSlotError')
        })

        it('should not advance white with bar as PieceOnBarError', () => {
            board.pushBar(White, board.popOrigin(0))
            const err = getError(() => board.move(White, 1, 1))
            expect(err.name).to.equal('PieceOnBarError')
        })

        it('should not advance red from empty slot as NoPieceOnSlotError', () => {
            const err = getError(() => board.move(Red, 2, 1))
            expect(err.name).to.equal('NoPieceOnSlotError')
        })

        it('should not advance red from slot owned by white as NoPieceOnSlotError', () => {
            const err = getError(() => board.move(Red, 0, 1))
            expect(err.name).to.equal('NoPieceOnSlotError')
        })

        it('should not bear off white with piece outside as MayNotBearoffError', () => {
            const err = getError(() => board.move(White, 18, 6))
            expect(err.name).to.equal('MayNotBearoffError')
        })

        it('should bear off white from 6 point with all other pieces on 5 point', () => {
            board.setStateString('0|0|0:|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|0:|5:R|0:|0:|0:|0:|0:|5:W|10:W|0:|0:|0:|2:R|0|0')
            board.move(White, 18, 6)
            expect(board.analyzer.piecesOnOrigin(White, 18)).to.equal(4)
            expect(board.analyzer.piecesHome(White)).to.equal(1)
        })

        it('should bear off white from 5 point on face=5 with other pieces on 6 point', () => {
            board.setStateString('0|0|0:|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|0:|5:R|0:|0:|0:|0:|0:|5:W|10:W|0:|0:|0:|2:R|0|0')
            board.move(White, 19, 5)
            expect(board.analyzer.piecesOnOrigin(White, 19)).to.equal(9)
            expect(board.analyzer.piecesHome(White)).to.equal(1)
        })

        it('should bear off red from 5 point on face=5 with other pieces on 6 point', () => {
            board.setStateString('0|0|2:W|0:|0:|0:|10:R|5:R|0:|0:|0:|0:|0:|5:W|0:|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|0:|0|0')
            board.move(Red, 4, 5)
            expect(board.analyzer.piecesOnOrigin(Red, 4)).to.equal(9)
            expect(board.analyzer.piecesHome(Red)).to.equal(1)
        })

        it('should not bear off white with face=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.setStateString('0|0|0:|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|0:|5:R|0:|0:|0:|0:|0:|5:W|10:W|0:|0:|0:|2:R|0|0')
            const err = getError(() => board.move(White, 19, 6))
            expect(err.name).to.equal('IllegalBareoffError')
        })

        it('should not bear off red with face=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.setStateString('0|0|2:W|0:|0:|0:|10:R|5:R|0:|0:|0:|0:|0:|5:W|0:|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|0:|0|0')
            const err = getError(() => board.move(Red, 4, 6))
            expect(err.name).to.equal('IllegalBareoffError')
        })

        it('should advance white from 0 to 1', () => {
            board.move(White, 0, 1)
            expect(board.analyzer.piecesOnOrigin(White, 0)).to.equal(1)
            expect(board.analyzer.piecesOnOrigin(White, 1)).to.equal(1)
        })

        it('should not advance white from 0 to 5 as OccupiedSlotError', () => {
            const err = getError(() => board.move(White, 0, 5))
            expect(err.name).to.equal('OccupiedSlotError')
        })

        it('should move white to bar when red hits on 1', () => {
            board.move(White, 0, 1)
            board.move(Red, 5, 4)
            expect(board.analyzer.piecesOnOrigin(Red, 1)).to.equal(1)
            expect(board.analyzer.piecesOnBar(White)).to.equal(1)
        })

        it('should return expected state string after white moves 2 pips for one runner', () => {
            board.move(White, 0, 2)
            const result = board.stateString()
            expect(result).to.equal(States.WhiteRunner2Pips)
        })

        it('should return initial state string after undoing white i:0,n:2', () => {
            const move = board.move(White, 0, 2)
            move.undo()
            const result = board.stateString()
            expect(result).to.equal(States.Initial)
        })

        it('should return expected state string after white i:0,n:2, then undoing red i:5,n:3 hit', () => {
            board.move(White, 0, 2)
            const move = board.move(Red, 5, 3)
            move.undo()
            const result = board.stateString()
            expect(result).to.equal(States.WhiteRunner2Pips)
        })

        it('should undo bareoff on sparse board white i:22,n:3', () => {
            board.clear()
            board.pushOrigin(22, White)
            board.pushOrigin(22, White)
            const move = board.move(White, 22, 3)
            expect(board.analyzer.piecesOnOrigin(White, 22)).to.equal(1)
            expect(board.analyzer.piecesHome(White)).to.equal(1)
            move.undo()
            expect(board.analyzer.piecesOnOrigin(White, 22)).to.equal(2)
            expect(board.analyzer.piecesHome(White)).to.equal(0)
        })

        it('should undo comein on sparse board white i:-1,n:2', () => {
            board.clear()
            board.pushBar(White)
            const move = board.move(White, -1, 2)
            expect(board.analyzer.piecesOnBar(White)).to.equal(0)
            expect(board.analyzer.piecesOnOrigin(White, 1)).to.equal(1)
            move.undo()
            expect(board.analyzer.piecesOnBar(White)).to.equal(1)
            expect(board.analyzer.piecesOnOrigin(White, 1)).to.equal(0)
        })

        it('should hit for red come in with 3 with RedHitComeIn3', () => {
            board.setStateString(States.RedHitComeIn3)
            const move = board.move(Red, -1, 3)
            expect(board.analyzer.piecesOnBar(Red)).to.equal(0)
            expect(board.analyzer.piecesOnOrigin(Red, 21)).to.equal(1)
            expect(board.analyzer.piecesOnBar(White)).to.equal(1)
        })

        it('should undo hit for red come in with 3 with RedHitComeIn3', () => {
            board.setStateString(States.RedHitComeIn3)
            const move = board.move(Red, -1, 3)
            move.undo()
            expect(board.analyzer.piecesOnBar(Red)).to.equal(1)
            expect(board.analyzer.piecesOnOrigin(White,21)).to.equal(1)
            expect(board.analyzer.piecesOnBar(White)).to.equal(0)
        })
    })

    describe('#setup', () => {

        it('should return board with initial state', () => {
            const board = Board.setup()
            expect(board.stateString()).to.equal(States.Initial)
        })
    })

    describe('#stateString', () => {

        it('should return all zeros and no slot colors for blank board', () => {
            const result = board.stateString()
            expect(result).to.equal(States.Blank)
        })

        it('should return expected value for setup board', () => {
            board.setup()
            const result = board.stateString()
            expect(result).to.equal(States.Initial)
        })

        it('should retrieve from cache second call (observed through coverage)', () => {
            const result = board.stateString()
            expect(board.cache.stateString).to.equal(result)
            board.stateString()
        })
    })

    describe('#state28', () => {
        it('should convert back and from from InitialState', () => {
            board.setup()
            expect(board.stateString()).to.equal(States.Initial)
            board.setState28(board.state28())
            expect(board.stateString()).to.equal(States.Initial)
        })
    })

	describe('#toString', () => {

		it('should return state28 string', () => {
			expect(board.toString()).to.equal(board.state28())
		})
	})
})

describe('Piece', () => {

    describe('#constructor', () => {

        it('should accept piece instance as argument', () => {
            const piece = new Piece(White)
            const result = new Piece(piece)
            expect(result.color).to.equal(White)
        })
    })

    describe('#make', () => {

        it('should return empty array for 0', () => {
            const result = Piece.make(0)
            expect(result).to.have.length(0)
        })

        it('should return array of 2 white pieces for 2,White', () => {
            const result = Piece.make(2, White)
            expect(result).to.have.length(2)
            expect(result[0].color).to.equal(White)
            expect(result[1].color).to.equal(White)
        })
    })

    describe('#toString', () => {

        it('should return Red for red piece', () => {
            const piece = new Piece(Red)
            const result = piece.toString()
            expect(result).to.equal(Red)
        })

        it('should return White for white piece', () => {
            const piece = new Piece(White)
            const result = piece.toString()
            expect(result).to.equal(White)
        })
    })
})

describe('Dice', () => {

    describe('#checkFaces', () => {

        it('should throw on 1,2,3,4', () => {
            const err = getError(() => Dice.checkFaces([1,2,3,4]))
            expect(err.name).to.equal('InvalidRollError')
        })

        it('should throw on 1,2,3', () => {
            const err = getError(() => Dice.checkFaces([1,2,3]))
            expect(err.name).to.equal('InvalidRollError')
        })
    })

    describe('#checkOne', () => {

        it('should throw InvalidRollError for decimal', () => {
            const err = getError(() => Dice.checkOne(1.2))
            expect(err.name).to.equal('InvalidRollError')
        })

        it('should throw InvalidRollError for 7', () => {
            const err = getError(() => Dice.checkOne(7))
            expect(err.name).to.equal('InvalidRollError')
        })

        it('should throw InvalidRollError for 9', () => {
            const err = getError(() => Dice.checkOne(0))
            expect(err.name).to.equal('InvalidRollError')
        })
    })

    describe('#checkTwo', () => {

        it('should throw InvalidRollError for [1, 2, 3]', () => {
            const err = getError(() => Dice.checkTwo([1, 2, 3]))
            expect(err.name).to.equal('InvalidRollError')
        })

        it('should pass for [5, 4]', () => {
            Dice.checkTwo([5, 4])
        })
    })

    describe('#createRoller', () => {
        it('should toggle for 2 rolls', () => {
            const roller = Dice.createRoller([[1,2], [3,4]])
            const res = [roller(), roller(), roller(), roller()]
            const exp = [[1,2], [3,4], [1,2], [3,4]]
            expect(res).to.jsonEqual(exp)
        })
    })
    describe('#faces', () => {

        it('should return [1, 2] for [1, 2]', () => {
            const result = Dice.faces([1, 2])
            expect(result).to.jsonEqual([1, 2])
        })

        it('should return [5, 5, 5, 5] for [5, 5]', () => {
            const result = Dice.faces([5, 5])
            expect(result).to.jsonEqual([5, 5, 5, 5])
        })
    })

    describe('#getWinner', () => {

        it('should return White for [6,5]', () => {
            const result = Dice.getWinner([6, 5])
            expect(result).to.equal(White)
        })

        it('should return Red for [1,2]', () => {
            const result = Dice.getWinner([1, 2])
            expect(result).to.equal(Red)
        })

        it('should return null for [4,4]', () => {
            const result = Dice.getWinner([4, 4])
            expect(result).to.equal(null)
        })
    })

    describe('#rollOne', () => {

        it('should return number between 1 and 6 for 100 rolls', () => {
            for (var i = 0; i < 100; i ++) {
                var result = Dice.rollOne()
                expect(result).to.be.greaterThan(0)
                expect(result).to.be.lessThan(7)
            }
        })
    })

    describe('#rollTwo', () => {

        it('should have length 2', () => {
            const result = Dice.rollTwo()
            expect(result).to.have.length(2)
        })

        it('should return numbers between 1 and 6 for 100 rolls', () => {
            for (var i = 0; i < 100; i ++) {
                var result = Dice.rollTwo()
                expect(result[0]).to.be.greaterThan(0)
                expect(result[0]).to.be.lessThan(7)
                expect(result[1]).to.be.greaterThan(0)
                expect(result[1]).to.be.lessThan(7)
            }
        })
    })

	describe('#sequencesForFaces', () => {

		it('should return [[1, 2], [2, 1]] for faces [1, 2]', () => {
			const result = Dice.sequencesForFaces([1, 2])
			const exp = [[1, 2], [2, 1]]
			expect(result).to.jsonEqual(exp)
		})

		it('should return [[5, 5, 5, 5]] for faces [5, 5, 5, 5]', () => {
			const result = Dice.sequencesForFaces([5, 5, 5, 5])
			const exp = [[5, 5, 5, 5]]
			expect(result).to.jsonEqual(exp)
		})
	})

    describe('#validateRollsData', () => {

        it('should pass for [6,1]', () => {
            Dice.validateRollsData({rolls: [[6,1]]})
        })

        it('should throw for empty object', () => {
            const err = getError(() => Dice.validateRollsData({}))
            expect(err.name).to.equal('InvalidRollDataError')
        })

        it('should throw for empty rolls', () => {
            const err = getError(() => Dice.validateRollsData({rolls: []}))
            expect(err.name).to.equal('InvalidRollDataError')
        })

        it('should throw for only [1,1]', () => {
            const err = getError(() => Dice.validateRollsData({rolls: [[1,1]]}))
            expect(err.name).to.equal('InvalidRollDataError')
        })

        it('should throw for [1,2], [7,1]', () => {
            const err = getError(() => Dice.validateRollsData({rolls: [[1,2], [7,1]]}))
            expect(err.name).to.equal('InvalidRollDataError')
        })
    })
})

describe('Player', () => {

    describe('#constructor', () => {

        it('should have 1 listener on matchStart', function() {
            const player = new Player(Red)
            expect(player.listenerCount('matchStart')).to.equal(1)
        })

        it('should have 1 listener on gameStart', function() {
            const player = new Player(Red)
            expect(player.listenerCount('gameStart')).to.equal(1)
        })

        it('should have 1 listener on matchCanceled', function() {
            const player = new Player(Red)
            expect(player.listenerCount('matchCanceled')).to.equal(1)
        })
    })

    describe('#destroy', () => {

        it('should have 0 listeners on matchStart', function() {
            const player = new Player(Red)
            player.destroy()
            expect(player.listenerCount('matchStart')).to.equal(0)
        })

        it('should have 0 listeners on gameStart', function() {
            const player = new Player(Red)
            player.destroy()
            expect(player.listenerCount('gameStart')).to.equal(0)
        })

        it('should have 0 listeners on matchCanceled', function() {
            const player = new Player(Red)
            player.destroy()
            expect(player.listenerCount('matchCanceled')).to.equal(0)
        })

        it('should not remove matchStart listener added elsewhere', function () {
            const player = new Player(Red)
            player.on('matchStart', () => {})
            expect(player.listenerCount('matchStart')).to.equal(2)
            player.destroy()
            expect(player.listenerCount('matchStart')).to.equal(1)
        })

        it('should have 0 listeners on matchCanceled after Util.destroyAll object', function() {
            const player = new Player(Red)
            destroyAll({a: player})
            expect(player.listenerCount('matchCanceled')).to.equal(0)
        })

        it('should have 0 listeners on matchCanceled after Util.destroyAll array', function() {
            const player = new Player(Red)
            destroyAll([player])
            expect(player.listenerCount('matchCanceled')).to.equal(0)
        })
    })
})
