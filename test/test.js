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

describe('Match', () => {

    const {Match} = Lib

    describe('#constructor', () => {
        it('should construct', () => {
            new Match
        })
    })
})

describe('Board', () => {

    const {Board, Piece} = Lib

    const InitialStateString = '0|0|2:White|0:|0:|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'

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

        it('should not comein to n=6 for white with bar as OccupiedSlotError', () => {
            board.bars.White.push(board.slots[0].pop())
            const err = getError(() => board.move(White, -1, 6))
            expect(err.name).to.equal('OccupiedSlotError')
        })

        it('should not advance white with bar as PieceOnBarError', () => {
            board.bars.White.push(board.slots[0].pop())
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

        it('should not bear off white with n=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            const err = getError(() => board.move(White, 19, 6))
            expect(err.name).to.equal('IllegalBareoffError')
        })

        it('should not bear off red with n=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.slots[4] = board.slots[23].splice(0).concat(
                board.slots[12].splice(0),
                board.slots[7].splice(0)
            )
            const err = getError(() => board.move(Red, 4, 6))
            expect(err.name).to.equal('IllegalBareoffError')
        })

        it('should advance white from 0 to 1', () => {
            board.move(White, 0, 1)
            expect(board.slots[0]).to.have.length(1)
            expect(board.slots[1]).to.have.length(1)
        })

        it('should not advance white from 0 to 5 as OccupiedSlotError', () => {
            const err = getError(() => board.move(White, 0, 5))
            expect(err.name).to.equal('OccupiedSlotError')
        })

        it('should move white to bar when red hits on 1', () => {
            board.move(White, 0, 1)
            board.move(Red, 5, 4)
            expect(board.slots[1]).to.have.length(1)
            expect(board.slots[1][0].color).to.equal(Red)
            expect(board.bars.White).to.have.length(1)
        })

        it('should return expected state string after white moves 2 pips for one runner', () => {
            board.move(White, 0, 2)
            const exp = '0|0|1:White|0:|1:White|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'
            const result = board.stateString()
            expect(result).to.equal(exp)
        })

        it('should return initial state string after undoing white i:0,n:2', () => {
            const move = board.move(White, 0, 2)
            move.undo()
            const result = board.stateString()
            const exp = InitialStateString
            expect(result).to.equal(exp)
        })

        it('should return expected state string after white i:0,n:2, then undoing red i:5,n:3 hit', () => {
            board.move(White, 0, 2)
            const move = board.move(Red, 5, 3)
            move.undo()
            const result = board.stateString()
            const exp = '0|0|1:White|0:|1:White|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'
            expect(result).to.equal(exp)
        })

        it('should undo bareoff on sparse board white i:22,n:3', () => {
            board.clear()
            board.slots[22] = Piece.make(2, White)
            const move = board.move(White, 22, 3)
            expect(board.slots[22].length).to.equal(1)
            expect(board.homes.White).to.have.length(1)
            move.undo()
            expect(board.slots[22].length).to.equal(2)
            expect(board.homes.White).to.have.length(0)
        })

        it('should undo comein on sparse board white i:-1,n:2', () => {
            board.clear()
            board.bars.White.push(new Piece(White))
            const move = board.move(White, -1, 2)
            expect(board.bars.White).to.have.length(0)
            expect(board.slots[1]).to.have.length(1)
            move.undo()
            expect(board.bars.White).to.have.length(1)
            expect(board.slots[1]).to.have.length(0)
        })
    })

    describe('#stateString', () => {

        it('should return all zeros and no slot colors for blank board', () => {
            const board = new Board
            const result = board.stateString()
            const exp = '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0'
            expect(result).to.equal(exp)
        })

        it('should return expected value for setup board', () => {
            const board = new Board
            board.setup()
            const result = board.stateString()
            const exp = InitialStateString
            expect(result).to.equal(exp)
        })
    })

})
describe('Dice', () => {

    const {Dice} = Lib

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

    describe('#faces', () => {

        it('should return [1, 2] for [1, 2]', () => {
            const result = Dice.faces([1, 2])
            expect(JSON.stringify(result)).to.equal(JSON.stringify([1, 2]))
        })

        it('should return [5, 5, 5, 5] for [5, 5]', () => {
            const result = Dice.faces([5, 5])
            expect(JSON.stringify(result)).to.equal(JSON.stringify([5, 5, 5, 5]))
        })
    })
})