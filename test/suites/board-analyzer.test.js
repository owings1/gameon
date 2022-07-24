/**
 * gameon - test suite - board analyzer
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
import {update} from '@quale/core/objects.js'
import {fetchBoard, getError} from '../util.js'

import {Board, Piece} from '../../src/lib/core.js'
import {White, Red} from '../../src/lib/constants.js'

describe('BoardAnalyzer', () => {

    beforeEach(function () {
        this.load = function (name) {
            this.board.setStateString(fetchBoard(name).state28())
        }
        const board = new Board
        update(this, {board, analyzer: board.analyzer})
    })

    describe('#blotOrigins', function () {

        beforeEach(function () {
            this.board.setup()
        })

        it('should return empty on initial with identical list on cache', function () {
            const {analyzer} = this
            const r1 = analyzer.blotOrigins(White)
            const r2 = analyzer.blotOrigins(White)
            expect(Array.isArray(r1)).to.equal(true)
            expect(r1).to.have.length(0)
            expect(r1).to.equal(r2)
        })
    })

    describe('#blots', () => {

        beforeEach(function () {
            this.board.setup()
        })

        describe('Initial', () => {

            it('should return empty for initial setup', function () {
                const {analyzer} = this
                const result = analyzer.blots(White)
                expect(result).to.have.length(0)
            })
        })

        describe('Initial > White 0:1', () => {

            beforeEach(function () {
                const {board, analyzer} = this
                board.move(White, 0, 1)
                const blots = analyzer.blots(White)
                blots.sort((a, b) => a.point - b.point)
                update(this, {blots})
            })

            it('should have two blots, p23, p24', function () {
                const {blots} = this
                expect(blots).to.have.length(2)
                expect(blots[0].point).to.equal(23)
                expect(blots[1].point).to.equal(24)
            })

            it('first blot should have 2 direct shots', function () {
                const {blots} = this
                expect(blots[0].directCount).to.equal(2)
            })

            it('second blot should have 1 direct shot', function () {
                const {blots} = this
                expect(blots[1].directCount).to.equal(1)
            })

            it('first blot should have 1 indirect shot', function () {
                const {blots} = this
                expect(blots[0].indirectCount).to.equal(1)
            })

            it('second blot should have 1 indirect shot', function () {
                const {blots} = this
                expect(blots[1].indirectCount).to.equal(1)
            })

            it('first blot should have minDistance 4', function () {
                const {blots} = this
                expect(blots[0].minDistance).to.equal(4)
            })

            it('second blot should have minDistance 5', function () {
                const {blots} = this
                expect(blots[1].minDistance).to.equal(5)
            })
        })

        describe('EngagedWithBar', () => {

            beforeEach(function () {
                this.load('EngagedWithBar')
                const {analyzer} = this
                const blots = analyzer.blots(White)
                const blot = blots[0]
                update(this, {blots, blot})
            })

            it('should have 1 blot, p1', function () {
                const {blots, blot} = this
                expect(blots).to.have.length(1)
                expect(blot.point).to.equal(1)
            })

            it('blot should have 1 direct shot, 0 indirect', function () {
                const {blot} = this
                expect(blot.directCount).to.equal(1)
                expect(blot.indirectCount).to.equal(0)
            })

            it('blot should have minDistance 1', function () {
                const {blot} = this
                expect(blot.minDistance).to.equal(1)
            })
        })

        describe('BlotsIndBar1', () => {

            beforeEach(function () {
                this.load('BlotsIndBar1')
                const {analyzer} = this
                const blots = analyzer.blots(White)
                const blot = blots[0]
                update(this, {blots, blot})
            })

            it('should have 1 blot, p7', function () {
                const {blots, blot} = this
                expect(blots).to.have.length(1)
                expect(blot.point).to.equal(7)
            })

            it('blot should have 0 direct shots, 1 indirect', function () {
                const {blot} = this
                expect(blot.directCount).to.equal(0)
                expect(blot.indirectCount).to.equal(1)
            })

            it('blot should have minDistance 7', function () {
                const {blot} = this
                expect(blot.minDistance).to.equal(7)
            })
        })

        describe('BlotsDisengaged', () => {

            beforeEach(function () {
                this.load('BlotsDisengaged')
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                const blot = blots[0]
                update(this, {blots, blot})
            })

            it('should be empty', function () {
                const {blots} = this
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsOutOfRange', () => {

            beforeEach(function () {
                this.load('BlotsOutOfRange')
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                update(this, {blots})
            })

            it('should be empty', function () {
                const {blots} = this
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsMany1', () => {

            beforeEach(function () {
                this.load('BlotsMany1')
            })

            describe('White', () => {

                beforeEach(function () {
                    const {analyzer} = this
                    const blots = analyzer.blots(White)
                    blots.sort((a, b) => a.point - b.point)
                    update(this, {blots})
                })

                it('should have 3 blots, p10, p22, p24', function () {
                    const {blots} = this
                    expect(blots).to.have.length(3)
                    expect(blots[0].point).to.equal(10)
                    expect(blots[1].point).to.equal(22)
                    expect(blots[2].point).to.equal(24)
                })

                it('blot 1 should have 1 direct, 1 indirect, minDistance 3', function () {
                    const {blots} = this
                    const blot = blots[0]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(1)
                    expect(blot.minDistance).to.equal(3)
                })

                it('blot 2 should have 3 direct, 1 indirect, minDistance 3', function () {
                    const {blots} = this
                    const blot = blots[1]
                    expect(blot.directCount).to.equal(3)
                    expect(blot.indirectCount).to.equal(1)
                    expect(blot.minDistance).to.equal(3)
                })

                it('blot 3 should have 1 direct, 2 indirect, minDistance 5', function () {
                    const {blots} = this
                    const blot = blots[2]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(2)
                    expect(blot.minDistance).to.equal(5)
                })
            })

            describe('Red', () => {

                beforeEach(function () {
                    const {analyzer} = this
                    const blots = analyzer.blots(Red)
                    blots.sort((a, b) => a.point - b.point)
                    update(this, {blots})
                })

                it('should have 3 blots, p9, p18, p24', function () {
                    const {blots} = this
                    expect(blots).to.have.length(3)
                    expect(blots[0].point).to.equal(9)
                    expect(blots[1].point).to.equal(18)
                    expect(blots[2].point).to.equal(24)
                })

                it('blot 1 should have 1 direct, 1 indirect, minDistance 6', function () {
                    const {blots} = this
                    const blot = blots[0]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(1)
                    expect(blot.minDistance).to.equal(6)
                })

                it('blot 2 should have 3 direct, 0 indirect, minDistance 1', function () {
                    const {blots} = this
                    const blot = blots[1]
                    expect(blot.directCount).to.equal(3)
                    expect(blot.indirectCount).to.equal(0)
                    expect(blot.minDistance).to.equal(1)
                })

                it('blot 3 should have 1 direct, 2 indirect, minDistance 5', function () {
                    const {blots} = this
                    const blot = blots[2]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(2)
                    expect(blot.minDistance).to.equal(5)
                })
            })
        })

        describe('BlotsMinSkip1', () => {

            beforeEach(function () {
                this.load('BlotsMinSkip1')
            })

            it('Red should have 0 blots for isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(Red, false)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(0)
            })

            it('Red should have 1 blot on point 3 for isIncludeAll=true', function () {
                const {analyzer} = this
                const blots = analyzer.blots(Red, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(3)
            })

            it('White should have 4 blots on points 9, 11, 12, 16 with isIncludeAll=true', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(9)
                expect(blots[1].point).to.equal(11)
                expect(blots[2].point).to.equal(12)
                expect(blots[3].point).to.equal(16)
            })

            it('White should have no blots when isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsMinSkip2', () => {

            beforeEach(function () {
                this.load('BlotsMinSkip2')
            })

            it('White should have 7 blots on points 7, 9, 11, 12, 16, 17, 21 with isIncludeAll=true', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(7)
                expect(blots[0].point).to.equal(7)
                expect(blots[1].point).to.equal(9)
                expect(blots[2].point).to.equal(11)
                expect(blots[3].point).to.equal(12)
                expect(blots[4].point).to.equal(16)
                expect(blots[5].point).to.equal(17)
                expect(blots[6].point).to.equal(21)
            })

            it('White should have 1 blot on point 21 with isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(21)
            })
        })

        describe('BlotsMinSkip3', () => {

            beforeEach(function () {
                this.load('BlotsMinSkip3')
            })

            it('Red should have 5 blots on points 2, 3, 7, 12, 13 with isIncludeAll=true', function () {
                const {analyzer} = this
                const blots = analyzer.blots(Red, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(5)
                expect(blots[0].point).to.equal(2)
                expect(blots[1].point).to.equal(3)
                expect(blots[2].point).to.equal(7)
                expect(blots[3].point).to.equal(12)
                expect(blots[4].point).to.equal(13)
            })

            it('Red should have 4 blots on points 2, 3, 7, 12 with isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(Red, false)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(2)
                expect(blots[1].point).to.equal(3)
                expect(blots[2].point).to.equal(7)
                expect(blots[3].point).to.equal(12)
            })
        })

        describe('BlotsMaxSkip1', () => {

            beforeEach(function () {
                this.load('BlotsMaxSkip1')
            })

            it('White whould have 3 blots on points 12, 13, 22 with isIncludeAll=true', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(3)
                expect(blots[0].point).to.equal(12)
                expect(blots[1].point).to.equal(13)
                expect(blots[2].point).to.equal(22)
            })

            it('White should have 1 blot on point 22 with minDistance 1 with isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(22)
                expect(blots[0].minDistance).to.equal(1)
            })
        })

        describe('BlotsMaxSkip2', () => {

            beforeEach(function () {
                this.load('BlotsMaxSkip2')
            })

            it('White whould have 4 blots on points 7, 13, 15, 16 with isIncludeAll=true', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(7)
                expect(blots[1].point).to.equal(13)
                expect(blots[2].point).to.equal(15)
                expect(blots[3].point).to.equal(16)
            })

            it('White should have 1 blot on point 7 with minDistance 6, directCount 1 and indirectCount 1 with isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(7)
                expect(blots[0].minDistance).to.equal(6)
                expect(blots[0].directCount).to.equal(1)
                expect(blots[0].indirectCount).to.equal(1)
            })
        })

        describe('CornerCase', () => {

            it('should not barf on a sparse board with isIncludeAll=false', function () {
                const {analyzer} = this
                const blots = analyzer.blots(White, false)
                expect(Array.isArray(blots)).to.equal(true)
                expect(blots).to.have.length(0)
            })
        })
    })

    describe('#hasBar', () => {

        it('should return true for white with one on bar', function () {
            const {board, analyzer} = this
            board.pushBar(White)
            const result = analyzer.hasBar(White)
            expect(result).to.equal(true)
        })
    })

    describe('#isAllHome', () => {

        it('should return true when red has 15 in home', function () {
            const {board, analyzer} = this
            for (var i = 0; i < 15; i++) {
                board.pushHome(Red)
            }
            const result = analyzer.isAllHome(Red)
            expect(result).to.equal(true)
        })
    })

    describe('#isDisengaged', () => {

        it('should return false for Initial', function () {
            const {board, analyzer} = this
            board.setup()
            const result = analyzer.isDisengaged()
            expect(result).to.equal(false)
        })

        it('should return true for Either65Win', function () {
            this.load('Either65Win')
            const {analyzer} = this
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })

        it('should return true for WhiteGammon1', function () {
            this.load('WhiteGammon1')
            const {analyzer} = this
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })

        it('should return false for EngagedWithBar', function () {
            this.load('EngagedWithBar')
            const {analyzer} = this
            const result = analyzer.isDisengaged()
            expect(result).to.equal(false)
        })

        it('should return true for empty board', function () {
            const {analyzer} = this
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })
    })

    describe('#maxOriginOccupied', () => {

        it('should return -Infinity on empty board', function () {
            const {analyzer} = this
            const result = analyzer.maxOriginOccupied(White)
            expect(result).to.equal(-Infinity)
        })

        it('should return 18 for White on initial', function () {
            const {board, analyzer} = this
            board.setup()
            const result = analyzer.maxOriginOccupied(White)
            expect(result).to.equal(18)
        })

        it('should return 23 for Red on initial', function () {
            const {board, analyzer} = this
            board.setup()
            const result = analyzer.maxOriginOccupied(Red)
            expect(result).to.equal(23)
        })
    })

    describe('#maxPointOccupied', () => {

        it('should return -Infinity on empty board for each color', function () {
            const {analyzer} = this
            const r1 = analyzer.maxPointOccupied(White)
            const r2 = analyzer.maxPointOccupied(Red)
            expect(r1).to.equal(-Infinity)
            expect(r2).to.equal(-Infinity)
        })
    })

    describe('#mayBearoff', () => {

        it('should return false for white with one on bar', function () {
            const {board, analyzer} = this
            board.pushBar(White)
            const result = analyzer.mayBearoff(White)
            expect(result).to.equal(false)
        })

        it('should return true for red with none on bar and 15 on 0', function () {
            const {board, analyzer} = this
            for (let i = 0; i < 15; ++i) {
                board.pushOrigin(0, Red)
            }
            const result = analyzer.mayBearoff(Red)
            expect(result).to.equal(true)
        })

        it('should return false for red with none on bar and 1 on 0 and 14 on 23', function () {
            const {board, analyzer} = this
            for (let i = 0; i < 14; ++i) {
                board.pushOrigin(23, Red)
            }
            board.pushOrigin(0, Red)
            const result = analyzer.mayBearoff(Red)
            expect(result).to.equal(false)
        })

        it('should hit maxPoint cache (coverage)', function () {
            const {board, analyzer} = this
            board.setup()
            analyzer.cache['maxPointOccupied.White'] = 6
            const result = analyzer.mayBearoff(White)
            expect(result).to.equal(true)
        })
    })

    describe('#minOriginOccupied', () => {

        it('should return Infinity on empty board', function () {
            const {analyzer} = this
            const result = analyzer.minOriginOccupied(White)
            expect(result).to.equal(Infinity)
        })

        it('should return 0 for White on initial', function () {
            const {board, analyzer} = this
            board.setup()
            const result = analyzer.minOriginOccupied(White)
            expect(result).to.equal(0)
        })

        it('should return 5 for Red on initial', function () {
            const {board, analyzer} = this
            board.setup()
            const result = analyzer.minOriginOccupied(Red)
            expect(result).to.equal(5)
        })
    })

    describe('#minPointOccupied', () => {

        it('should return Infinity on empty board for each color', function () {
            const {analyzer} = this
            const r1 = analyzer.minPointOccupied(White)
            const r2 = analyzer.minPointOccupied(Red)
            expect(r1).to.equal(Infinity)
            expect(r2).to.equal(Infinity)
        })

        it('should return 6 on initial for each color', function () {
            const {board, analyzer} = this
            board.setup()
            const r1 = analyzer.minPointOccupied(White)
            const r2 = analyzer.minPointOccupied(Red)
            expect(r1).to.equal(6)
            expect(r2).to.equal(6)
        })

        it('should return from cache when populated', function () {
            const {analyzer} = this
            analyzer.cache['minPointOccupied.White'] = 1
            const result = analyzer.minPointOccupied(White)
            expect(result).to.equal(1)
        })
    })

    describe('#nthPieceOnOrigin', () => {

        describe('Initial', () => {

            beforeEach(function () {
                this.board.setup()
            })

            it('should return empty for 2 on initial', function () {
                const {analyzer} = this
                const result = analyzer.nthPieceOnOrigin(2, 0)
                expect(!!result).to.equal(false)
            })

            it('should return White for 0,1 on initial', function () {
                const {analyzer} = this
                const result = analyzer.nthPieceOnOrigin(0, 1)
                expect(result).to.equal(White)
            })

            it('should return empty for 0,2 on initial', function () {
                const {analyzer} = this
                const result = analyzer.nthPieceOnOrigin(0, 2)
                expect(!!result).to.equal(false)
            })
        })
    })

    describe('#originOccupier', () => {

        describe('Initial', () => {

            beforeEach(function () {
                this.board.setup()
            })

            it('should return White for 0', function () {
                const {analyzer} = this
                const result = analyzer.originOccupier(0)
                expect(result).to.equal(White)
            })

            it('should return Red for 23', function () {
                const {analyzer} = this
                const result = analyzer.originOccupier(23)
                expect(result).to.equal(Red)
            })

            it('should return empty for 2', function () {
                const {analyzer} = this
                const result = analyzer.originOccupier(1)
                expect(!!result).to.equal(false)
            })
        })
    })

	describe('#originsOccupied', () => {

        describe('Initial', () => {

            beforeEach(function () {
                this.board.setup()
            })

    		it('should return [5,7,12,23] for Red', function () {
                const {analyzer} = this
    			const exp = [5, 7, 12, 23]
    			const result = analyzer.originsOccupied(Red)
    			expect(result).to.jsonEqual(exp)
    		})
        })
	})

    describe('#piecesOnPoint', () => {

        describe('Initial', () => {

            beforeEach(function () {
                this.board.setup()
            })

            it('should return 5 for White 6', function () {
                const {analyzer} = this
                const result = analyzer.piecesOnPoint(White, 6)
                expect(result).to.equal(5)
            })

            it('should return 5 for Red 6 for', function () {
                const {analyzer} = this
                const result = analyzer.piecesOnPoint(Red, 6)
                expect(result).to.equal(5)
            })
        })
    })

    describe('#pipCount', () => {

        it('should return 0 for White on blank board', function () {
            const {analyzer} = this
            const result = analyzer.pipCount(White)
            expect(result).to.equal(0)
        })
    })

    describe('#pipCounts', () => {

        describe('Initial', () => {

            beforeEach(function () {
                this.board.setup()
            })

            it('should return 167 for each', function () {
                const {analyzer} = this
                const result = analyzer.pipCounts()
                expect(result.Red).to.equal(167)
                expect(result.White).to.equal(167)
            })
        })
    })

    describe('#pointsHeld', () => {

        it('should return empty list on empty board', function () {
            const {analyzer} = this
            const result = analyzer.pointsHeld(White)
            expect(Array.isArray(result)).to.equal(true)
            expect(result).to.have.length(0)
        })

        it('should return expected at initial state for each color, sorted in point order', function () {
            const {analyzer, board} = this
            board.setup()
            const exp = [6, 8, 13, 24]
            const r1 = analyzer.pointsHeld(White)
            const r2 = analyzer.pointsHeld(Red)
            expect(r1).to.jsonEqual(exp)
            expect(r2).to.jsonEqual(exp)
        })

        it('should return expected from new cache after White 0:1', function () {
            const {analyzer, board} = this
            const exp = [6, 8, 13]
            board.setup()
            analyzer.pointsHeld(White)
            analyzer.board.move(White, 0, 1)
            const r1 = analyzer.pointsHeld(White)
            const r2 = analyzer.pointsHeld(White)
            expect(r1).to.jsonEqual(exp)
            expect(r1).to.equal(r2)
        })
    })

    describe('#pointsOccupied', () => {

        describe('Initial', () => {

            beforeEach(function () {
                this.board.setup()
            })

            it('should be sorted and return expected for White', function () {
                const {analyzer} = this
                const exp = [6, 8, 13, 24]
                const result = analyzer.pointsOccupied(White)
                expect(result).to.jsonEqual(exp)
            })

            it('should be sorted and return expected for Red', function () {
                const {analyzer} = this
                const exp = [6, 8, 13, 24]
                const result = analyzer.pointsOccupied(Red)
                expect(result).to.jsonEqual(exp)
            })
        })
    })

    describe('#primes', () => {

        describe('White5PointPrime1', () => {

            beforeEach(function () {
                this.load('White5PointPrime1')
            })

            it('should return 1 prime of size 5 for White', function () {
                const {analyzer} = this
                const result = analyzer.primes(White)
                expect(result).to.have.length(1)
                expect(result[0].size).to.equal(5)
            })
        })

        describe('RedTwo3Primes1', () => {

            beforeEach(function () {
                this.load('RedTwo3Primes1')
            })

            it('should retun 2 primes of size 3 for Red', function () {
                const {analyzer} = this
                const result = analyzer.primes(Red)
                expect(result).to.have.length(2)
                expect(result[0].size).to.equal(3)
                expect(result[1].size).to.equal(3)
            })
        })
    })

    describe('#validateLegalBoard', () => {

        beforeEach(function () {
            this.getValErrorAssertState = function () {
                const {analyzer} = this
                const err = getError(() => analyzer.validateLegalBoard())
                expect(err.isIllegalStateError).to.equal(true)
                return err
            }
        })

        const legalsKeys = [
            'Initial',
            'Bearoff1Start',
            'RedHasWon'
        ]

        const illegalsKeys = [
            'Blank',
            'WhiteCornerCase16',
            'BothHaveWon',
            'BothAllOnBar'
        ]

        legalsKeys.forEach(name => {
            it(`should validate ${name}`, function () {
                fetchBoard(name).analyzer.validateLegalBoard()
            })
        })

        illegalsKeys.forEach(name => {
            it(`should invalidate ${name} with illegal state error`, function () {
                const err = getError(() =>
                    fetchBoard(name).analyzer.validateLegalBoard()
                )
                expect(err.isIllegalStateError).to.equal(true)
            })
        })

        it('should throw when board has extra slot', function () {
            const {board} = this
            board.slots.push([])
            this.getValErrorAssertState()
        })

        it('should throw with different colors on origin', function () {
            const {board} = this
            board.pushOrigin(0, White)
            board.pushOrigin(0, Red)
            this.getValErrorAssertState()
        })

        it('should throw with invalid object on origin', function () {
            const {board} = this
            board.slots[0].push({color: 'foo'})
            this.getValErrorAssertState()
        })

        it('should throw when a white piece is on the red home', function () {
            const {board} = this
            board.pushHome(Red, new Piece(White))
            this.getValErrorAssertState()
        })

        it('should throw when a white piece is on the red bar', function () {
            const {board} = this
            board.pushBar(Red, new Piece(White))
            this.getValErrorAssertState()
        })
    })
})