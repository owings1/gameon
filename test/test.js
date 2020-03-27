const {expect} = require('@oclif/test')

const White = 'White'
const Red = 'Red'

const Lib = require('../src/lib/game')

function getError(cb) {
    try {
        cb()
    } catch (err) {
        return err
    }
}

describe('Game', () => {

    const {Game} = Lib

    describe('#constructor', () => {
        it('should construct', () => {
            new Game
        })
    })
})

describe('Board', () => {

    const {Board, Piece} = Lib

    describe('#constructor', () => {

        it('should construct', () => {
            new Board
        })
    })

    describe('#clear', () => {

        it('should make 24 slots', () => {
            const board = new Board()
            board.clear()
            expect(board.slots).to.have.length(24)
        })
    })

    describe('#copy', () => {

        it('should have two pieces on slot 0 copying setup board, but slot arrays non-identical', () => {
            const board = new Board()
            board.setup()
            const copy = board.copy()
            expect(copy.slots[0]).to.have.length(2)
            expect(copy.slots[0]).to.not.equal(board.slots[0])
        })
    })

    describe('#getWinner', () => {

        it('should return null for empty board', () => {
            const board = new Board()
            const result = board.getWinner()
            expect(result).to.equal(null)
        })

        it('should return null for setup board', () => {
            const board = new Board()
            board.setup()
            const result = board.getWinner()
            expect(result).to.equal(null)
        })

        it('should return white when home has 15', () => {
            const board = new Board()
            board.homes.White = Piece.make(15, White)
            const result = board.getWinner()
            expect(result).to.equal(White)
        })

        it('should return red when home has 15', () => {
            const board = new Board()
            board.homes.Red = Piece.make(15, Red)
            const result = board.getWinner()
            expect(result).to.equal(Red)
        })
    })

    describe('#hasBar', () => {
        it('should return true for white with one on bar', () => {
            const board = new Board()
            board.bars.White = Piece.make(1, White)
            const result = board.hasBar(White)
            expect(result).to.equal(true)
        })
    })

    describe('#hasWinner', () => {

        it('should return true when red has 15 in home', () => {
            const board = new Board()
            board.homes.Red = Piece.make(15, Red)
            const result = board.hasWinner()
            expect(result).to.equal(true)
        })

        it('should return true when white has 15 in home', () => {
            const board = new Board()
            board.homes.White = Piece.make(15, White)
            const result = board.hasWinner()
            expect(result).to.equal(true)
        })
    })

    describe('#isAllHome', () => {

        it('should return true when red has 15 in home', () => {
            const board = new Board()
            board.homes.Red = Piece.make(15, Red)
            const result = board.isAllHome(Red)
            expect(result).to.equal(true)
        })
    })

    describe('#mayBearoff', () => {

        it('should return false for white with one on bar', () => {
            const board = new Board()
            board.bars.White = Piece.make(1, White)
            const result = board.mayBearoff(White)
            expect(result).to.equal(false)
        })

        it('should return true for red with none on bar and 15 on 0', () => {
            const board = new Board()
            board.slots[0] = Piece.make(15, Red)
            const result = board.mayBearoff(Red)
            expect(result).to.equal(true)
        })

        it('should return false for red with none on bar and 1 on 0 and 14 on 23', () => {
            const board = new Board()
            board.slots[23] = Piece.make(14, Red)
            board.slots[0] = Piece.make(1, Red)
            const result = board.mayBearoff(Red)
            expect(result).to.equal(false)
        })
    })

    describe('#move', () => {

        var board

        beforeEach(() => {
            board = new Board()
            board.setup()
        })

        it('should throw for 7 spaces', () => {
            const err = getError(() => board.move(White, 0, 7))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should throw for -1 spaces', () => {
            const err = getError(() => board.move(White, 0, -1))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should throw for comein -1 with no bar', () => {
            const err = getError(() => board.move(White, -1, 1))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should comein to n=1 for white with bar', () => {
            board.bars.White.push(board.slots[0].pop())
            board.move(White, -1, 1)
            expect(board.slots[0]).to.have.length(2)
        })

        it('should comein to n=1 for red with bar', () => {
            board.bars.Red.push(board.slots[23].pop())
            board.move(Red, -1, 1)
            expect(board.slots[23]).to.have.length(2)
        })

        it('should not comein to n=6 for white with bar', () => {
            board.bars.White.push(board.slots[0].pop())
            const err = getError(() => board.move(White, -1, 6))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should not advance white with bar', () => {
            board.bars.White.push(board.slots[0].pop())
            const err = getError(() => board.move(White, 1, 1))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should not advance red from empty slot', () => {
            const err = getError(() => board.move(Red, 2, 1))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should not advance red from slot owned by white', () => {
            const err = getError(() => board.move(Red, 0, 1))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should not bear off white with piece outside', () => {
            const err = getError(() => board.move(White, 18, 6))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should bear off white from 6 point with all other pieces on 5 point', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            board.move(White, 18, 6)
            expect(board.slots[18]).to.have.length(4)
            expect(board.homes.White).to.have.length(1)
        })

        it('should bear off white from 5 point on n=5 with other pieces on 6 point', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            board.move(White, 19, 5)
            expect(board.slots[19]).to.have.length(9)
            expect(board.homes.White).to.have.length(1)
        })

        it('should bear off red from 5 point on n=5 with other pieces on 6 point', () => {
            board.slots[4] = board.slots[23].splice(0).concat(
                board.slots[12].splice(0),
                board.slots[7].splice(0)
            )
            board.move(Red, 4, 5)
            expect(board.slots[4]).to.have.length(9)
            expect(board.homes.Red).to.have.length(1)
        })

        it('should not bear off white with n=6 from 5 point with piece behind', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            const err = getError(() => board.move(White, 19, 6))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should not bear off red with n=6 from 5 point with piece behind', () => {
            board.slots[4] = board.slots[23].splice(0).concat(
                board.slots[12].splice(0),
                board.slots[7].splice(0)
            )
            const err = getError(() => board.move(Red, 4, 6))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should advance white from 0 to 1', () => {
            board.move(White, 0, 1)
            expect(board.slots[0]).to.have.length(1)
            expect(board.slots[1]).to.have.length(1)
        })

        it('should not advance white from 0 to 5', () => {
            const err = getError(() => board.move(White, 0, 5))
            expect(err.name).to.equal('IllegalMoveError')
        })

        it('should move white to bar when red hits on 1', () => {
            board.move(White, 0, 1)
            board.move(Red, 5, 4)
            expect(board.slots[1]).to.have.length(1)
            expect(board.slots[1][0].color).to.equal(Red)
            expect(board.bars.White).to.have.length(1)
        })
    })
})