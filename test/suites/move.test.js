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
const {Board} = Core
const {Move, BearoffMove, ComeInMove, RegularMove} = requireSrc('lib/move')
const {White, Red} = Constants


describe('Move', () => {

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