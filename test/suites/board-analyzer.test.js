const TestUtil = require('../util')

const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    Rolls,
    States,
    States28,
    Structures
} = TestUtil

const Constants = requireSrc('lib/constants')
const Core = requireSrc('lib/core')
const Util = requireSrc('lib/util')

const {White, Red} = Constants
const {Match, Game, Board, Turn, Piece, Dice} = Core

describe('BoardAnalyzer', () => {

    var board

    beforeEach(() => board = new Board)

    describe('#blotOrigins', () => {
        it('should return empty on initial with identical list on cache', () => {
            const {analyzer} = Board.setup()
            const r1 = analyzer.blotOrigins(White)
            const r2 = analyzer.blotOrigins(White)
            expect(Array.isArray(r1)).to.equal(true)
            expect(r1).to.have.length(0)
            expect(r1).to.equal(r2)
        })
    })

    describe('#blots', () => {

        it('should return empty for initial setup', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.blots(White)
            expect(result).to.have.length(0)
        })

        describe('Initial > White 0:1', () => {
            var board
            var blots
            beforeEach(() => {
                board = Board.setup()
                board.move(White, 0, 1)
                blots = board.analyzer.blots(White)
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
            var board
            var blots
            var blot
            beforeEach(() => {
                board = Board.fromStateString(States.EngagedWithBar)
                blots = board.analyzer.blots(White)
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
            var board
            var blots
            var blot
            beforeEach(() => {
                board = Board.fromStateString(States.BlotsIndBar1)
                blots = board.analyzer.blots(White)
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
            var board
            var blots
            beforeEach(() => {
                board = Board.fromStateString(States.BlotsDisengaged)
                blots = board.analyzer.blots(White, false)
            })
            it('should be empty', () => {
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsOutOfRange', () => {
            var board
            var blots
            beforeEach(() => {
                board = Board.fromStateString(States.BlotsOutOfRange)
                blots = board.analyzer.blots(White, false)
            })
            it('should be empty', () => {
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsMany1', () => {
            var board
            
            beforeEach(() => {
                board = Board.fromStateString(States.BlotsMany1)
            })

            describe('White', () => {
                var blots
                beforeEach(() => {
                    blots = board.analyzer.blots(White)
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
                var blots
                beforeEach(() => {
                    blots = board.analyzer.blots(Red)
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
            var board
            beforeEach(() => {
                board = Board.fromStateString(States.BlotsMinSkip1)
            })

            it('Red should have 0 blots for isIncludeAll=false', () => {
                const blots = board.analyzer.blots(Red, false)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(0)
            })

            it('Red should have 1 blot on point 3 for isIncludeAll=true', () => {
                const blots = board.analyzer.blots(Red, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(3)
            })

            it('White should have 4 blots on points 9, 11, 12, 16 with isIncludeAll=true', () => {
                const blots = board.analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(9)
                expect(blots[1].point).to.equal(11)
                expect(blots[2].point).to.equal(12)
                expect(blots[3].point).to.equal(16)
            })

            it('White should have no blots when isIncludeAll=false', () => {
                const blots = board.analyzer.blots(White, false)
                expect(blots).to.have.length(0)
            })
        })

        describe('BlotsMinSkip2', () => {
            var board
            beforeEach(() => {
                board = Board.fromStateString(States.BlotsMinSkip2)
            })

            it('White should have 7 blots on points 7, 9, 11, 12, 16, 17, 21 with isIncludeAll=true', () => {
                const blots = board.analyzer.blots(White, true)
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
                const blots = board.analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(21)
            })
        })

        describe('BlotsMinSkip3', () => {
            var board

            beforeEach(() => {
                board = Board.fromStateString(States.BlotsMinSkip3)
            })

            it('Red should have 5 blots on points 2, 3, 7, 12, 13 with isIncludeAll=true', () => {
                const blots = board.analyzer.blots(Red, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(5)
                expect(blots[0].point).to.equal(2)
                expect(blots[1].point).to.equal(3)
                expect(blots[2].point).to.equal(7)
                expect(blots[3].point).to.equal(12)
                expect(blots[4].point).to.equal(13)
            })

            it('Red should have 4 blots on points 2, 3, 7, 12 with isIncludeAll=false', () => {
                const blots = board.analyzer.blots(Red, false)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(2)
                expect(blots[1].point).to.equal(3)
                expect(blots[2].point).to.equal(7)
                expect(blots[3].point).to.equal(12)
            })
        })

        describe('BlotsMaxSkip1', () => {
            var board

            beforeEach(() => {
                board = Board.fromStateString(States.BlotsMaxSkip1)
            })

            it('White whould have 3 blots on points 12, 13, 22 with isIncludeAll=true', () => {
                const blots = board.analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(3)
                expect(blots[0].point).to.equal(12)
                expect(blots[1].point).to.equal(13)
                expect(blots[2].point).to.equal(22)
            })

            it('White should have 1 blot on point 22 with minDistance 1 with isIncludAll=false', () => {
                const blots = board.analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(22)
                expect(blots[0].minDistance).to.equal(1)
            })
        })

        describe('BlotsMaxSkip2', () => {
            var board

            beforeEach(() => {
                board = Board.fromStateString(States.BlotsMaxSkip2)
            })

            it('White whould have 4 blots on points 7, 13, 15, 16 with isIncludeAll=true', () => {
                const blots = board.analyzer.blots(White, true)
                blots.sort((a, b) => a.point - b.point)
                expect(blots).to.have.length(4)
                expect(blots[0].point).to.equal(7)
                expect(blots[1].point).to.equal(13)
                expect(blots[2].point).to.equal(15)
                expect(blots[3].point).to.equal(16)
            })

            it('White should have 1 blot on point 7 with minDistance 6, directCount 1 and indirectCount 1 with isIncludAll=false', () => {
                const blots = board.analyzer.blots(White, false)
                expect(blots).to.have.length(1)
                expect(blots[0].point).to.equal(7)
                expect(blots[0].minDistance).to.equal(6)
                expect(blots[0].directCount).to.equal(1)
                expect(blots[0].indirectCount).to.equal(1)
            })
        })

        describe('CornerCase', () => {
            it('should not barf on a sparse board with isIncludeAll=false', () => {
                const {analyzer} = Board.fromStateString(States.OneWhitePiece)
                const result = analyzer.blots(White, false)
                expect(Array.isArray(result)).to.equal(true)
                expect(result).to.have.length(0)
            })
        })
    })

    describe('#hasBar', () => {

        it('should return true for white with one on bar', () => {
            board.pushBar(White)
            const result = board.analyzer.hasBar(White)
            expect(result).to.equal(true)
        })
    })

    describe('#isAllHome', () => {

        it('should return true when red has 15 in home', () => {
            for (var i = 0; i < 15; i++) {
                board.pushHome(Red)
            }
            const result = board.analyzer.isAllHome(Red)
            expect(result).to.equal(true)
        })
    })

    describe('#isDisengaged', () => {

        it('should return false for Initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.isDisengaged()
            expect(result).to.equal(false)
        })

        it('should return true for Either65Win', () => {
            const {analyzer} = Board.fromStateString(States.Either65Win)
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })

        it('should return true for WhiteGammon1', () => {
            const {analyzer} = Board.fromStateString(States.WhiteGammon1)
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })

        it('should return false for EngagedWithBar', () => {
            const {analyzer} = Board.fromStateString(States.EngagedWithBar)
            const result = analyzer.isDisengaged()
            expect(result).to.equal(false)
        })

        it('should return true for empty board', () => {
            const {analyzer} = new Board
            const result = analyzer.isDisengaged()
            expect(result).to.equal(true)
        })
    })

    describe('#maxOriginOccupied', () => {
        it('should return -Infinity on empty board', () => {
            const board = new Board
            const result = board.analyzer.maxOriginOccupied(White)
            expect(result).to.equal(-Infinity)
        })

        it('should return 18 for White on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.maxOriginOccupied(White)
            expect(result).to.equal(18)
        })

        it('should return 23 for Red on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.maxOriginOccupied(Red)
            expect(result).to.equal(23)
        })
    })

    describe('#maxPointOccupied', () => {

        it('should return -Infinity on empty board for each color', () => {
            const {analyzer} = new Board
            const r1 = analyzer.maxPointOccupied(White)
            const r2 = analyzer.maxPointOccupied(Red)
            expect(r1).to.equal(-Infinity)
            expect(r2).to.equal(-Infinity)
        })
    })

    describe('#mayBearoff', () => {

        it('should return false for white with one on bar', () => {
            board.pushBar(White)
            const result = board.analyzer.mayBearoff(White)
            expect(result).to.equal(false)
        })

        it('should return true for red with none on bar and 15 on 0', () => {
            for (var i = 0; i < 15; ++i) {
                board.pushOrigin(0, Red)
            }
            const result = board.analyzer.mayBearoff(Red)
            expect(result).to.equal(true)
        })

        it('should return false for red with none on bar and 1 on 0 and 14 on 23', () => {
            for (var i = 0; i < 14; ++i) {
                board.pushOrigin(23, Red)
            }
            board.pushOrigin(0, Red)
            const result = board.analyzer.mayBearoff(Red)
            expect(result).to.equal(false)
        })

        it('should hit maxPoint cache (coverage)', () => {
            const {analyzer} = Board.setup()
            analyzer.cache['maxPointOccupied.White'] = 6
            const result = analyzer.mayBearoff(White)
            expect(result).to.equal(true)
        })
    })

    describe('#minOriginOccupied', () => {

        it('should return Infinity on empty board', () => {
            const board = new Board
            const result = board.analyzer.minOriginOccupied(White)
            expect(result).to.equal(Infinity)
        })
        it('should return 0 for White on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.minOriginOccupied(White)
            expect(result).to.equal(0)
        })
        it('should return 5 for Red on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.minOriginOccupied(Red)
            expect(result).to.equal(5)
        })
    })

    describe('#minPointOccupied', () => {

        it('should return Infinity on empty board for each color', () => {
            const {analyzer} = new Board
            const r1 = analyzer.minPointOccupied(White)
            const r2 = analyzer.minPointOccupied(Red)
            expect(r1).to.equal(Infinity)
            expect(r2).to.equal(Infinity)
        })

        it('should return 6 on initial for each color', () => {
            const {analyzer} = Board.setup()
            const r1 = analyzer.minPointOccupied(White)
            const r2 = analyzer.minPointOccupied(Red)
            expect(r1).to.equal(6)
            expect(r2).to.equal(6)
        })

        it('should return from cache when populated', () => {
            const {analyzer} = new Board
            analyzer.cache['minPointOccupied.White'] = 1
            const result = analyzer.minPointOccupied(White)
            expect(result).to.equal(1)
        })
    })

    describe('#nthPieceOnOrigin', () => {

        it('should return empty for 2 on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.nthPieceOnOrigin(2, 0)
            expect(!!result).to.equal(false)
        })

        it('should return White for 0,1 on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.nthPieceOnOrigin(0, 1)
            expect(result).to.equal(White)
        })

        it('should return empty for 0,2 on initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.nthPieceOnOrigin(0, 2)
            expect(!!result).to.equal(false)
        })
    })

    describe('#originOccupier', () => {

        it('should return White for 0 on Initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.originOccupier(0)
            expect(result).to.equal(White)
        })

        it('should return Red for 23 on Initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.originOccupier(23)
            expect(result).to.equal(Red)
        })

        it('should return empty for 2 on Initial', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.originOccupier(1)
            expect(!!result).to.equal(false)
        })
    })

    describe('#originPoint', () => {

        const expCases = [
            {input: [Red, 5], exp: 6},
            {input: [White, 5], exp: 19},
            {input: [White, 18], exp: 6}
        ]

        expCases.forEach(({input, exp}) => {
            it('should return ' + exp + ' for ' + input.join(), () => {
                const result = board.analyzer.originPoint(...input)
                expect(result).to.equal(exp)
            })
        })
    })

	describe('#originsOccupied', () => {

		it('should return [5,7,12,23] for red on setup', () => {
			board.setup()
			const result = board.analyzer.originsOccupied(Red)
			const exp = [5, 7, 12, 23]
			expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
		})
	})

    describe('#piecesOnPoint', () => {

        it('should return 5 for white 6 for initial state', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.piecesOnPoint(White, 6)
            expect(result).to.equal(5)
        })

        it('should return 5 for red 6 for initial state', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.piecesOnPoint(Red, 6)
            expect(result).to.equal(5)
        })
    })

    describe('#pipCount', () => {

        it('should return 0 for White on blank board', () => {
            const {analyzer} = new Board
            const result = analyzer.pipCount(White)
            expect(result).to.equal(0)
        })
    })

    describe('#pipCounts', () => {

        it('should return 167 for each at initial state', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.pipCounts()
            expect(result.Red).to.equal(167)
            expect(result.White).to.equal(167)
        })
    })

    describe('#pointOrigin', () => {

        it('should return 18 for White 6 point', () => {
            const result = board.analyzer.pointOrigin(White, 6)
            expect(result).to.equal(18)
        })

        it('should return 5 for Red 6 point', () => {
            const result = board.analyzer.pointOrigin(Red, 6)
            expect(result).to.equal(5)
        })

        it('should return -1 for Red -1', () => {
            const result = board.analyzer.pointOrigin(Red, -1)
            expect(result).to.equal(-1)
        })
    })

    describe('#pointsHeld', () => {

        it('should return expected at initial state for each color, sorted in point order', () => {
            const exp = [6, 8, 13, 24]
            const {analyzer} = Board.setup()
            const r1 = analyzer.pointsHeld(White)
            const r2 = analyzer.pointsHeld(Red)
            expect(JSON.stringify(r1)).to.equal(JSON.stringify(exp))
            expect(JSON.stringify(r2)).to.equal(JSON.stringify(exp))
        })

        it('should return empty list on empty board', () => {
            const {analyzer} = new Board
            const result = analyzer.pointsHeld(White)
            expect(Array.isArray(result)).to.equal(true)
            expect(result).to.have.length(0)
        })

        it('should return expected from new cache after White 0:1', () => {
            const exp = [6, 8, 13]
            const {analyzer} = Board.setup()
            analyzer.pointsHeld(White)
            analyzer.board.move(White, 0, 1)
            const r1 = analyzer.pointsHeld(White)
            const r2 = analyzer.pointsHeld(White)
            expect(JSON.stringify(r1)).to.equal(JSON.stringify(exp))
            expect(r1).to.equal(r2)
        })
    })

    describe('#pointsOccupied', () => {

        it('should be sorted and return expected for White at initial state', () => {
            const exp = [6, 8, 13, 24]
            const {analyzer} = Board.setup()
            const result = analyzer.pointsOccupied(White)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })

        it('should be sorted and return expected for Red at initial state', () => {
            const exp = [6, 8, 13, 24]
            const {analyzer} = Board.setup()
            const result = analyzer.pointsOccupied(Red)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })
    })

    describe('#primes', () => {

        it('should return 1 prime of size 5 for white for White5PointPrime1', () => {
            const {analyzer} = Board.fromStateString(States.White5PointPrime1)
            const result = analyzer.primes(White)
            expect(result).to.have.length(1)
            expect(result[0].size).to.equal(5)
        })

        it('should retun 2 primes of size 3 for red for RedTwo3Primes1', () => {
            const {analyzer} = Board.fromStateString(States.RedTwo3Primes1)
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
            it('should validate ' + name, () => {
                Board.fromStateString(States[name]).analyzer.validateLegalBoard()
            })
        })
        illegalsKeys.forEach(name => {
            it('should invalidate ' + name + ' with illegal state error', () => {
                const err = getError(() =>
                    Board.fromStateString(States[name]).analyzer.validateLegalBoard()
                )
                expect(err.isIllegalStateError).to.equal(true)
            })
        })

        it('should throw when board has extra slot', () => {
            const {analyzer} = new Board
            analyzer.board.slots.push([])
            const err = getError(() => analyzer.validateLegalBoard())
            expect(err.isIllegalStateError).to.equal(true)
        })

        it('should throw with different colors on origin', () => {
            const {analyzer} = new Board
            analyzer.board.pushOrigin(0, White)
            analyzer.board.pushOrigin(0, Red)
            const err = getError(() => analyzer.validateLegalBoard())
            expect(err.isIllegalStateError).to.equal(true)
        })

        it('should throw with invalid object on origin', () => {
            const {analyzer} = new Board
            analyzer.board.slots[0].push({color: 'foo'})
            const err = getError(() => analyzer.validateLegalBoard())
            expect(err.isIllegalStateError).to.equal(true)
        })

        it('should throw when a white piece is on the red home', () => {
            const {analyzer} = new Board
            analyzer.board.pushHome(Red, new Piece(White))
            const err = getError(() => analyzer.validateLegalBoard())
            expect(err.isIllegalStateError).to.equal(true)
        })

        it('should throw when a white piece is on the red bar', () => {
            const {analyzer} = new Board
            analyzer.board.pushBar(Red, new Piece(White))
            const err = getError(() => analyzer.validateLegalBoard())
            expect(err.isIllegalStateError).to.equal(true)
        })
    })
})