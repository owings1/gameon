/**
 * gameon - test suite - move classes
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
import {getError} from '../util.js'
import States from '../states.js'

import {Board} from '../../src/lib/core.js'
import {Move, BearoffMove, ComeInMove, RegularMove} from '../../src/lib/moves.js'
import {White, Red} from '../../src/lib/constants.js'


describe('Move', () => {
    var board

    beforeEach(() => {
        board = Board.setup()
    })

    describe('.coords', () => {

        it('should have origin and face properties', () => {
            const move = board.buildMove(White, 0, 1)
            const result = move.coords
            expect(result.origin).to.equal(0)
            expect(result.face).to.equal(1)
        })
    })

    describe('#copy', () => {

        it('should return new ComeInMove with same board, color, and face', () => {
            board.pushBar(White, board.popOrigin(0))
            const move = board.buildMove(White, -1, 1)
            const copy = move.copy()
            expect(copy.constructor.name).to.equal('ComeInMove')
            expect(copy.board).to.equal(board)
            expect(copy.color).to.equal(White)
            expect(copy.face).to.equal(1)
        })
    })

    describe('#copyForBoard', () => {

        it('should return new ComeInMove with same color and face, but other board', () => {
            board.pushBar(White, board.popOrigin(0))
            const move = board.buildMove(White, -1, 1)
            const otherBoard = board.copy()
            const copy = move.copyForBoard(otherBoard)
            expect(copy.constructor.name).to.equal('ComeInMove')
            expect(copy.board).to.equal(otherBoard)
            expect(copy.color).to.equal(White)
            expect(copy.face).to.equal(1)
        })
    })

    describe('#do', () => {
        it('should throw NotImplementedError', () => {
            const board = Board.setup()
            const move = new Move(board, White, 0, 1)
            const err = getError(() => move.do())
            expect(err.name).to.equal('NotImplementedError')
        })
    })

    describe('#undo', () => {
        it('should throw NotImplementedError', () => {
            const board = Board.setup()
            const move = new Move(board, White, 0, 1)
            const err = getError(() => move.undo())
            expect(err.name).to.equal('NotImplementedError')
        })
    })
})

describe('ComeInMove', () => {

    describe('#constructor', () => {

        it('should pass with isChecked=false for White bar:1 from WhiteOneOnBar', () => {
            const board = Board.fromStateString(States.WhiteOneOnBar)
            const move = new ComeInMove(board, White, 1, false)
        })

        it('should fail for White bar:1 on initial state with NoPieceOnBarError', () => {
            const board = Board.setup()
            const err = getError(() => new ComeInMove(board, White, 1))
            expect(err.name).to.equal('NoPieceOnBarError')
        })
    })
})

describe('RegularMove', () => {

    describe('#constructor', () => {

        it('should pass with isChecked=false for White 0:1 from Initial', () => {
            const board = Board.setup()
            const move = new RegularMove(board, White, 0, 1, false)
        })

        it('should fail for White 1:1 on initial state with NoPieceOnSlotError', () => {
            const board = Board.setup()
            const err = getError(() => new RegularMove(board, White, 1, 1))
            expect(err.name).to.equal('NoPieceOnSlotError')
        })
    })

    describe('#check', () => {
        it('should throw MoveOutOfRangeError for White 23:1', () => {
            const board = Board.fromStateString(States.Bearoff4Start)
            const err = getError(() => new RegularMove(board, White, 23, 1))
            expect(err.name).to.equal('MoveOutOfRangeError')
        })
    })
})

describe('BearoffMove', () => {

    describe('#constructor', () => {

        it('should pass with isChecked=false for Red 1:1 from Bearoff4Start', () => {
            const board = Board.fromStateString(States.Bearoff4Start)
            const move = new BearoffMove(board, Red, 1, 1, false)
        })

        it('should fail for White 23:1 on from Bearoff4Start with MayNotBearoffError', () => {
            const board = Board.fromStateString(States.Bearoff4Start)
            const err = getError(() => new BearoffMove(board, White, 23, 1))
            expect(err.name).to.equal('MayNotBearoffError')
        })
    })
})