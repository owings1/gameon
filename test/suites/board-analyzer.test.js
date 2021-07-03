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
const TestUtil = require('../util')

const {
    expect
  , fetchBoard
  , getError
  , getErrorAsync
  , makeRandomMoves
  , randomElement
  , requireSrc
  , Rolls
} = TestUtil

const Constants = requireSrc('lib/constants')
const Core = requireSrc('lib/core')
const Util = requireSrc('lib/util')

const {White, Red} = Constants
const {Match, Game, Board, Turn, Piece, Dice} = Core

describe('-', () => {

    var board
    var analyzer

    beforeEach(() => {
        board = new Board
        analyzer = board.analyzer
    })

    function load(name) {
        board.setStateString(fetchBoard(name).state28())
    }

    describe('#blotOrigins', () => {

        it('should return empty on initial with identical list on cache', () => {
            board.setup()
            const r1 = analyzer.blotOrigins(White)
            const r2 = analyzer.blotOrigins(White)
            expect(Array.isArray(r1)).to.equal(true)
            expect(r1).to.have.length(0)
            expect(r1).to.equal(r2)
        })
    })

    describe('#blots', () => {

        var blots

        it('should return empty for initial setup', () => {
            board.setup()
            const result = analyzer.blots(White)
            expect(result).to.have.length(0)
        })

        describe('Initial > White 0:1', () => {

            beforeEach(() => {
                board.setup()
                board.move(White, 0, 1)
                blots = analyzer.blots(White)
                blots.sort((a, b) => a.point - b.point)
            })

            it('should have two blots, p23, p24', () => {
                expect(blots).to.have.length(2)
                expect(blots[0].point).to.equal(23)
                expect(blots[1].point).to.equal(24)
            })

            it('first blot should have 2 direct shots', () => {
                expect(blots[0].directCount).to.equal(2)
            })

            it('second blot should have 1 direct shot', () => {
                expect(blots[1].directCount).to.equal(1)
            })

            it('first blot should have 1 indirect shot', () => {
                expect(blots[0].indirectCount).to.equal(1)
            })

            it('second blot should have 1 indirect shot', () => {
                expect(blots[1].indirectCount).to.equal(1)
            })

            it('first blot should have minDistance 4', () => {
                expect(blots[0].minDistance).to.equal(4)
            })

            it('second blot should have minDistance 5', () => {
                expect(blots[1].minDistance).to.equal(5)
            })
        })

        describe('EngagedWithBar', () => {

            var blot

            beforeEach(() => {
                load('EngagedWithBar')
                blots = analyzer.blots(White)
                blot = blots[0]
            })

            it('should have 1 blot, p1', () => {
                expect(blots).to.have.length(1)
                expect(blot.point).to.equal(1)
            })

            it('blot should have 1 direct shot, 0 indirect', () => {
                expect(blot.directCount).to.equal(1)
                expect(blot.indirectCount).to.equal(0)
            })

            it('blot should have minDistance 1', () => {
                expect(blot.minDistance).to.equal(1)
            })
        })

        describe('BlotsIndBar1', () => {

            var blot

            beforeEach(() => {
                load('BlotsIndBar1')
                blots = analyzer.blots(White)
                blot = blots[0]
            })

            it('should have 1 blot, p7', () => {
                expect(blots).to.have.length(1)
                expect(blot.point).to.equal(7)
            })

            it('blot should have 0 direct shots, 1 indirect', () => {
                expect(blot.directCount).to.equal(0)
                expect(blot.indirectCount).to.equal(1)
            })

            it('blot should have minDistance 7', () => {
                expect(blot.minDistance).to.equal(7)
            })
        })

        describe('BlotsDisengaged', () => {

            beforeEach(() => {
                load('BlotsDisengaged')
                blots = analyzer.blots(White, false)
            })

            it('should be empty', () => {
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsOutOfRange', () => {

            beforeEach(() => {
                load('BlotsOutOfRange')
                blots = analyzer.blots(White, false)
            })

            it('should be empty', () => {
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsMany1', () => {

            beforeEach(() => {
                load('BlotsMany1')
            })

            describe('White', () => {

                beforeEach(() => {
                    blots = analyzer.blots(White)
                    blots.sort((a, b) => a.point - b.point)
                })

                it('should have 3 blots, p10, p22, p24', () => {
                    expect(blots).to.have.length(3)
                    expect(blots[0].point).to.equal(10)
                    expect(blots[1].point).to.equal(22)
                    expect(blots[2].point).to.equal(24)
                })

                it('blot 1 should have 1 direct, 1 indirect, minDistance 3', () => {
                    const blot = blots[0]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(1)
                    expect(blot.minDistance).to.equal(3)
                })

                it('blot 2 should have 3 direct, 1 indirect, minDistance 3', () => {
                    const blot = blots[1]
                    expect(blot.directCount).to.equal(3)
                    expect(blot.indirectCount).to.equal(1)
                    expect(blot.minDistance).to.equal(3)
                })

                it('blot 3 should have 1 direct, 2 indirect, minDistance 5', () => {
                    const blot = blots[2]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(2)
                    expect(blot.minDistance).to.equal(5)
                })
            })

            describe('Red', () => {

                beforeEach(() => {
                    blots = analyzer.blots(Red)
                    blots.sort((a, b) => a.point - b.point)
                })

                it('should have 3 blots, p9, p18, p24', () => {
                    expect(blots).to.have.length(3)
                    expect(blots[0].point).to.equal(9)
                    expect(blots[1].point).to.equal(18)
                    expect(blots[2].point).to.equal(24)
                })

                it('blot 1 should have 1 direct, 1 indirect, minDistance 6', () => {
                    const blot = blots[0]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(1)
                    expect(blot.minDistance).to.equal(6)
                })

                it('blot 2 should have 3 direct, 0 indirect, minDistance 1', () => {
                    const blot = blots[1]
                    expect(blot.directCount).to.equal(3)
                    expect(blot.indirectCount).to.equal(0)
                    expect(blot.minDistance).to.equal(1)
                })

                it('blot 3 should have 1 direct, 2 indirect, minDistance 5', () => {
                    const blot = blots[2]
                    expect(blot.directCount).to.equal(1)
                    expect(blot.indirectCount).to.equal(2)
                    expect(blot.minDistance).to.equal(5)
                })
            })
        })

        describe('BlotsMinSkip1', () => {

            beforeEach(() => {
                load('BlotsMinSkip1')
            })

            it('Red should have 0 blots for isIncludeAll=false', () => {
                const blots = analyzer.blots(Red, false)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(0)
            })

            it('Red should have 1 blot on point 3 for isIncludeAll=true', () => {
                const blots = analyzer.blots(Red, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(3)
            })

            it('White should have 4 blots on points 9, 11, 12, 16 with isIncludeAll=true', () => {
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(9)
                expect(blots[1].point).to.equal(11)
                expect(blots[2].point).to.equal(12)
                expect(blots[3].point).to.equal(16)
            })

            it('White should have no blots when isIncludeAll=false', () => {
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsMinSkip2', () => {

            beforeEach(() => {
                load('BlotsMinSkip2')
            })

            it('White should have 7 blots on points 7, 9, 11, 12, 16, 17, 21 with isIncludeAll=true', () => {
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

            it('White should have 1 blot on point 21 with isIncludeAll=false', () => {
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(21)
            })
        })

        describe('BlotsMinSkip3', () => {

            beforeEach(() => {
                load('BlotsMinSkip3')
            })

            it('Red should have 5 blots on points 2, 3, 7, 12, 13 with isIncludeAll=true', () => {
                const blots = analyzer.blots(Red, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(5)
                expect(blots[0].point).to.equal(2)
                expect(blots[1].point).to.equal(3)
                expect(blots[2].point).to.equal(7)
                expect(blots[3].point).to.equal(12)
                expect(blots[4].point).to.equal(13)
            })

            it('Red should have 4 blots on points 2, 3, 7, 12 with isIncludeAll=false', () => {
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

            beforeEach(() => {
                load('BlotsMaxSkip1')
            })

            it('White whould have 3 blots on points 12, 13, 22 with isIncludeAll=true', () => {
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(3)
                expect(blots[0].point).to.equal(12)
                expect(blots[1].point).to.equal(13)
                expect(blots[2].point).to.equal(22)
            })

            it('White should have 1 blot on point 22 with minDistance 1 with isIncludeAll=false', () => {
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(22)
                expect(blots[0].minDistance).to.equal(1)
            })
        })

        describe('BlotsMaxSkip2', () => {

            beforeEach(() => {
                load('BlotsMaxSkip2')
            })

            it('White whould have 4 blots on points 7, 13, 15, 16 with isIncludeAll=true', () => {
                const blots = analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(7)
                expect(blots[1].point).to.equal(13)
                expect(blots[2].point).to.equal(15)
                expect(blots[3].point).to.equal(16)
            })

            it('White should have 1 blot on point 7 with minDistance 6, directCount 1 and indirectCount 1 with isIncludeAll=false', () => {
                const blots = analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(7)
                expect(blots[0].minDistance).to.equal(6)
                expect(blots[0].directCount).to.equal(1)
                expect(blots[0].indirectCount).to.equal(1)
            })
        })

        describe('CornerCase', () => {

            it('should not barf on a sparse board with isIncludeAll=false', () => {
                load('OneWhitePiece')
                const result = analyzer.blots(White, false)
                expect(Array.isArray(result)).to.equal(true)
                expect(result).to.have.length(0)
            })
        })
    })

    describe('#hasBar', () => {

        it('should return true for white with one on bar', () => {
            board.pushBar(White)
            const result = analyzer.hasBar(White)
            expect(result).to.equal(true)
        })
    })

    describe('#isAllHome', () => {

        it('should return true when red has 15 in home', () => {
            for (var i = 0; i < 15; i++) {
                board.pushHome(Red)
            }
            const result = analyzer.isAllHome(Red)
            expect(result).to.equal(true)
        })
    })

    describe('#isDisengaged', () => {

        it('should return false for Initial', () => {
            board.setup()
            const result = analyzer.isDisengaged()
            expect(result).to.equal(false)
        })

        it('should return true for Either65Win', () => {
            load('Either65Win')
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })

        it('should return true for WhiteGammon1', () => {
            load('WhiteGammon1')
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })

        it('should return false for EngagedWithBar', () => {
            load('EngagedWithBar')
            const result = analyzer.isDisengaged()
            expect(result).to.equal(false)
        })

        it('should return true for empty board', () => {
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })
    })

    describe('#maxOriginOccupied', () => {

        it('should return -Infinity on empty board', () => {
            const result = analyzer.maxOriginOccupied(White)
            expect(result).to.equal(-Infinity)
        })

        it('should return 18 for White on initial', () => {
            board.setup()
            const result = analyzer.maxOriginOccupied(White)
            expect(result).to.equal(18)
        })

        it('should return 23 for Red on initial', () => {
            board.setup()
            const result = analyzer.maxOriginOccupied(Red)
            expect(result).to.equal(23)
        })
    })

    describe('#maxPointOccupied', () => {

        it('should return -Infinity on empty board for each color', () => {
            const r1 = analyzer.maxPointOccupied(White)
            const r2 = analyzer.maxPointOccupied(Red)
            expect(r1).to.equal(-Infinity)
            expect(r2).to.equal(-Infinity)
        })
    })

    describe('#mayBearoff', () => {

        it('should return false for white with one on bar', () => {
            board.pushBar(White)
            const result = analyzer.mayBearoff(White)
            expect(result).to.equal(false)
        })

        it('should return true for red with none on bar and 15 on 0', () => {
            for (var i = 0; i < 15; ++i) {
                board.pushOrigin(0, Red)
            }
            const result = analyzer.mayBearoff(Red)
            expect(result).to.equal(true)
        })

        it('should return false for red with none on bar and 1 on 0 and 14 on 23', () => {
            for (var i = 0; i < 14; ++i) {
                board.pushOrigin(23, Red)
            }
            board.pushOrigin(0, Red)
            const result = analyzer.mayBearoff(Red)
            expect(result).to.equal(false)
        })

        it('should hit maxPoint cache (coverage)', () => {
            board.setup()
            analyzer.cache['maxPointOccupied.White'] = 6
            const result = analyzer.mayBearoff(White)
            expect(result).to.equal(true)
        })
    })

    describe('#minOriginOccupied', () => {

        it('should return Infinity on empty board', () => {
            const result = analyzer.minOriginOccupied(White)
            expect(result).to.equal(Infinity)
        })

        it('should return 0 for White on initial', () => {
            board.setup()
            const result = analyzer.minOriginOccupied(White)
            expect(result).to.equal(0)
        })

        it('should return 5 for Red on initial', () => {
            board.setup()
            const result = analyzer.minOriginOccupied(Red)
            expect(result).to.equal(5)
        })
    })

    describe('#minPointOccupied', () => {

        it('should return Infinity on empty board for each color', () => {
            const r1 = analyzer.minPointOccupied(White)
            const r2 = analyzer.minPointOccupied(Red)
            expect(r1).to.equal(Infinity)
            expect(r2).to.equal(Infinity)
        })

        it('should return 6 on initial for each color', () => {
            board.setup()
            const r1 = analyzer.minPointOccupied(White)
            const r2 = analyzer.minPointOccupied(Red)
            expect(r1).to.equal(6)
            expect(r2).to.equal(6)
        })

        it('should return from cache when populated', () => {
            analyzer.cache['minPointOccupied.White'] = 1
            const result = analyzer.minPointOccupied(White)
            expect(result).to.equal(1)
        })
    })

    describe('#nthPieceOnOrigin', () => {

        it('should return empty for 2 on initial', () => {
            board.setup()
            const result = analyzer.nthPieceOnOrigin(2, 0)
            expect(!!result).to.equal(false)
        })

        it('should return White for 0,1 on initial', () => {
            board.setup()
            const result = analyzer.nthPieceOnOrigin(0, 1)
            expect(result).to.equal(White)
        })

        it('should return empty for 0,2 on initial', () => {
            board.setup()
            const result = analyzer.nthPieceOnOrigin(0, 2)
            expect(!!result).to.equal(false)
        })
    })

    describe('#originOccupier', () => {

        it('should return White for 0 on Initial', () => {
            board.setup()
            const result = analyzer.originOccupier(0)
            expect(result).to.equal(White)
        })

        it('should return Red for 23 on Initial', () => {
            board.setup()
            const result = analyzer.originOccupier(23)
            expect(result).to.equal(Red)
        })

        it('should return empty for 2 on Initial', () => {
            board.setup()
            const result = analyzer.originOccupier(1)
            expect(!!result).to.equal(false)
        })
    })

	describe('#originsOccupied', () => {

		it('should return [5,7,12,23] for red on setup', () => {
			board.setup()
			const result = board.analyzer.originsOccupied(Red)
			const exp = [5, 7, 12, 23]
			expect(result).to.jsonEqual(exp)
		})
	})

    describe('#piecesOnPoint', () => {

        it('should return 5 for white 6 for initial state', () => {
            board.setup()
            const result = analyzer.piecesOnPoint(White, 6)
            expect(result).to.equal(5)
        })

        it('should return 5 for red 6 for initial state', () => {
            board.setup()
            const result = analyzer.piecesOnPoint(Red, 6)
            expect(result).to.equal(5)
        })
    })

    describe('#pipCount', () => {

        it('should return 0 for White on blank board', () => {
            const result = analyzer.pipCount(White)
            expect(result).to.equal(0)
        })
    })

    describe('#pipCounts', () => {

        it('should return 167 for each at initial state', () => {
            board.setup()
            const result = analyzer.pipCounts()
            expect(result.Red).to.equal(167)
            expect(result.White).to.equal(167)
        })
    })

    describe('#pointsHeld', () => {

        it('should return expected at initial state for each color, sorted in point order', () => {
            board.setup()
            const exp = [6, 8, 13, 24]
            const r1 = analyzer.pointsHeld(White)
            const r2 = analyzer.pointsHeld(Red)
            expect(r1).to.jsonEqual(exp)
            expect(r2).to.jsonEqual(exp)
        })

        it('should return empty list on empty board', () => {
            const result = analyzer.pointsHeld(White)
            expect(Array.isArray(result)).to.equal(true)
            expect(result).to.have.length(0)
        })

        it('should return expected from new cache after White 0:1', () => {
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

        it('should be sorted and return expected for White at initial state', () => {
            board.setup()
            const exp = [6, 8, 13, 24]
            const result = analyzer.pointsOccupied(White)
            expect(result).to.jsonEqual(exp)
        })

        it('should be sorted and return expected for Red at initial state', () => {
            board.setup()
            const exp = [6, 8, 13, 24]
            const result = analyzer.pointsOccupied(Red)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#primes', () => {

        it('should return 1 prime of size 5 for white for White5PointPrime1', () => {
            load('White5PointPrime1')
            const result = analyzer.primes(White)
            expect(result).to.have.length(1)
            expect(result[0].size).to.equal(5)
        })

        it('should retun 2 primes of size 3 for red for RedTwo3Primes1', () => {
            load('RedTwo3Primes1')
            const result = analyzer.primes(Red)
            expect(result).to.have.length(2)
            expect(result[0].size).to.equal(3)
            expect(result[1].size).to.equal(3)
        })
    })

    describe('#validateLegalBoard', () => {

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
            it(`should validate ${name}`, () => {
                fetchBoard(name).analyzer.validateLegalBoard()
            })
        })

        illegalsKeys.forEach(name => {
            it(`should invalidate ${name} with illegal state error`, () => {
                const err = getError(() =>
                    fetchBoard(name).analyzer.validateLegalBoard()
                )
                expect(err.isIllegalStateError).to.equal(true)
            })
        })

        function getValErrorAssertState() {
            const err = getError(() => analyzer.validateLegalBoard())
            expect(err.isIllegalStateError).to.equal(true)
            return err
        }

        it('should throw when board has extra slot', () => {
            board.slots.push([])
            getValErrorAssertState()
        })

        it('should throw with different colors on origin', () => {
            board.pushOrigin(0, White)
            board.pushOrigin(0, Red)
            getValErrorAssertState()
        })

        it('should throw with invalid object on origin', () => {
            board.slots[0].push({color: 'foo'})
            getValErrorAssertState()
        })

        it('should throw when a white piece is on the red home', () => {
            board.pushHome(Red, new Piece(White))
            getValErrorAssertState()
        })

        it('should throw when a white piece is on the red bar', () => {
            board.pushBar(Red, new Piece(White))
            getValErrorAssertState()
        })
    })
})