const Coordinator  = require('../src/lib/coordinator')
const Core         = require('../src/lib/core')
const Util         = require('../src/lib/util')
const Logger       = require('../src/lib/logger')
const Server       = require('../src/net/server')
const Client       = require('../src/net/client')
const TermPlayer   = require('../src/term/player')
const Menu         = require('../src/term/menu')
const Draw         = require('../src/term/draw')
const Robot        = require('../src/robot/player')

const {RandomRobot} = Robot

const {White, Red} = Core

const TestUtil = require('./util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    MockPrompter,
    States
} = TestUtil

describe('Match', () => {

    const {Match, Board} = Core

    describe('#constructor', () => {

        it('should throw ArgumentError for total=0', () => {
            const err = getError(() => new Match(0))
            expect(err.name).to.equal('ArgumentError')
        })

        it('should not throw for total=1', () => {
            new Match(1)
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

    const {Game, Board} = Core

    var game

    beforeEach(() => {
        game = new Game
        game.loglevel = 1
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

    describe('#getWinner', () => {

        it('should return null for new game', () => {
            const result = game.getWinner()
            expect(result).to.equal(null)
        })

        it('should return white after red first turn then force state to EitherOneMoveWin and white move', () => {
            game._rollFirst = () => [1, 6]
            makeRandomMoves(game.firstTurn()).finish()
            game.board.setStateString(States.EitherOneMoveWin)
            const turn = game.nextTurn()
            turn.roll()
            makeRandomMoves(turn).finish()
            const result = game.getWinner()
            expect(result).to.equal(White)
        })

        it('should return red after white first turn then force state to EitherOneMoveWin and red move', () => {
            game._rollFirst = () => [6, 1]
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
})

describe('Turn', () => {

	const {Turn, Board, Piece} = Core

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

    describe('#finish', () => {

        it('should allow after setRoll 6,6 for white on bar with setup board', () => {
            const board = Board.setup()
            board.bars.White.push(board.slots[0].pop())
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
    })

    describe('#move', () => {

        it('should move Red 3,1 to 5 point with expected state', () => {
            const bexp = Board.setup()
            bexp.slots[4].push(bexp.slots[7].pop())
            bexp.slots[4].push(bexp.slots[5].pop())
            const exp = bexp.stateString()

            const board = Board.setup()
            const turn = new Turn(board, Red)
            turn.setRoll([3, 1])
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
            const turn = new Turn(board, Red)
            turn.setRoll([5, 1])
            turn.move(2, 5)
            turn.move(1, 1)
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
            expect(turn.board.slots[4]).to.have.length(2)
            expect(turn.board.slots[4][0].color).to.equal(Red)
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
            expect(turn.board.slots[4]).to.have.length(2)
            expect(turn.board.slots[4][0].color).to.equal(Red)
        })
    })
})

describe('Board', () => {

    const {Board, Piece} = Core

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

	describe('#fromStateString', () => {

		it('should return board whose state string is same as input for initial setup', () => {
			const board = Board.fromStateString(States.Initial)
			const result = board.stateString()
			expect(result).to.equal(States.Initial)
		})
	})

	describe('#getPossibleMovesForFace', () => {

		it('should return singleton isComeIn face=2 with white from bar on sparse board', () => {
			const board = new Board
			board.bars.White = Piece.make(1, White)
			const result = board.getPossibleMovesForFace(White, 2)
			expect(result).to.have.length(1)
			expect(result[0].isComeIn).to.equal(true)
			expect(result[0].face).to.equal(2)
		})

		it('should return empty for white face=5 with one on 0 and red 2 on 5', () => {
			const board = new Board
			board.slots[0] = Piece.make(1, White)
			board.slots[5] = Piece.make(2, Red)
			const result = board.getPossibleMovesForFace(White, 5)
			expect(result).to.have.length(0)
		})

		it('should throw when non IllegalMoveError is thrown', () => {
			const board = new Board
			board.setup()
			board.buildMove = () => { throw new Error }
			const err = getError(() => board.getPossibleMovesForFace(White, 1))
			expect(err instanceof Error).to.equal(true)
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

	describe('#listSlotsWithColor', () => {

		it('should return [5,7,12,23] for red on setup', () => {
			const board = new Board
			board.setup()
			const result = board.listSlotsWithColor(Red)
			const exp = [5, 7, 12, 23]
			expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
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

        it('should comein to face=1 for white with bar', () => {
            board.bars.White.push(board.slots[0].pop())
            board.move(White, -1, 1)
            expect(board.slots[0]).to.have.length(2)
        })

        it('should comein to face=1 for red with bar', () => {
            board.bars.Red.push(board.slots[23].pop())
            board.move(Red, -1, 1)
            expect(board.slots[23]).to.have.length(2)
        })

        it('should not comein to face=6 for white with bar as OccupiedSlotError', () => {
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

        it('should bear off white from 5 point on face=5 with other pieces on 6 point', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            board.move(White, 19, 5)
            expect(board.slots[19]).to.have.length(9)
            expect(board.homes.White).to.have.length(1)
        })

        it('should bear off red from 5 point on face=5 with other pieces on 6 point', () => {
            board.slots[4] = board.slots[23].splice(0).concat(
                board.slots[12].splice(0),
                board.slots[7].splice(0)
            )
            board.move(Red, 4, 5)
            expect(board.slots[4]).to.have.length(9)
            expect(board.homes.Red).to.have.length(1)
        })

        it('should not bear off white with face=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            const err = getError(() => board.move(White, 19, 6))
            expect(err.name).to.equal('IllegalBareoffError')
        })

        it('should not bear off red with face=6 from 5 point with piece behind as IllegalBareoffError', () => {
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

        it('should hit for red come in with 3 with RedHitComeIn3', () => {
            board.setStateString(States.RedHitComeIn3)
            const move = board.move(Red, -1, 3)
            expect(board.bars.Red).to.have.length(0)
            expect(board.slots[21]).to.have.length(1)
            expect(board.slots[21][0].color).to.equal(Red)
            expect(board.bars.White).to.have.length(1)
        })

        it('should undo hit for red come in with 3 with RedHitComeIn3', () => {
            board.setStateString(States.RedHitComeIn3)
            const move = board.move(Red, -1, 3)
            move.undo()
            expect(board.bars.Red).to.have.length(1)
            expect(board.slots[21]).to.have.length(1)
            expect(board.slots[21][0].color).to.equal(White)
            expect(board.bars.White).to.have.length(0)
        })
    })

    describe('#stateString', () => {

        it('should return all zeros and no slot colors for blank board', () => {
            const board = new Board
            const result = board.stateString()
            expect(result).to.equal(States.Blank)
        })

        it('should return expected value for setup board', () => {
            const board = new Board
            board.setup()
            const result = board.stateString()
            expect(result).to.equal(States.Initial)
        })
    })

	describe('#toString', () => {

		it('should return state string', () => {
			const board = new Board
			expect(board.toString()).to.equal(board.stateString())
		})
	})
})

describe('Move', () => {

    const {Board, Piece} = Core

    describe('#coords', () => {

        it('should return origin and face properties', () => {
            const move = Board.setup().buildMove(White, 0, 1)
            const result = move.coords()
            expect(result.origin).to.equal(0)
            expect(result.face).to.equal(1)
        })
    })

    describe('#copy', () => {

        it('should return new ComeInMove with same board, color, and face', () => {
            const board = Board.setup()
            board.bars.White.push(board.slots[0].pop())
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
            const board = Board.setup()
            board.bars.White.push(board.slots[0].pop())
            const move = board.buildMove(White, -1, 1)
            const otherBoard = board.copy()
            const copy = move.copyForBoard(otherBoard)
            expect(copy.constructor.name).to.equal('ComeInMove')
            expect(copy.board).to.equal(otherBoard)
            expect(copy.color).to.equal(White)
            expect(copy.face).to.equal(1)
        })
    })
})

describe('SequenceTree', () => {

    const {Board, SequenceTree, Piece} = Core

    describe('#buildNodes', () => {

        it('should return 2 nodes, original state and regular move from origin:0 to dest:1 for sparse board with sequence [1]', () => {

            const board = new Board
            board.slots[0] = Piece.make(5, White)

            const nodes = SequenceTree.buildNodes(board, White, [1])

            expect(nodes).to.have.length(2)

            expect(nodes[0].board).to.equal(board)
            expect(nodes[0].depth).to.equal(0)
            expect(nodes[0].parent).to.equal(null)
            expect(nodes[0].thisFace).to.equal(null)
            expect(nodes[0].thisMove).to.equal(null)
            expect(nodes[0].nextFace).to.equal(1)
            expect(nodes[0].nextMoves).to.have.length(1)
            expect(nodes[0].children).to.have.length(1)

            expect(nodes[1].board).to.not.equal(board)
            expect(nodes[1].depth).to.equal(1)
            expect(nodes[1].parent).to.equal(nodes[0])
            expect(nodes[1].thisFace).to.equal(1)
            expect(nodes[1].thisMove).to.not.equal(null)
            expect(nodes[1].nextFace).to.equal(null)
            expect(nodes[1].children).to.have.length(0)

            const move = nodes[1].thisMove
            expect(move).to.equal(nodes[0].nextMoves[0])
            expect(move.isRegular).to.equal(true)
            expect(move.origin).to.equal(0)
            expect(move.face).to.equal(1)

            const expBoard = new Board
            expBoard.slots[0] = Piece.make(4, White)
            expBoard.slots[1] = Piece.make(1, White)
            expect(nodes[1].board.stateString()).to.equal(expBoard.stateString())
        })
    })

    describe('#build', () => {

        it('should return one branch for regular move from i:0 to i:1 for sparse board with sequence [5]', () => {
            const board = new Board
            board.slots[4] = Piece.make(4, White)
            const tree = SequenceTree.build(board, White, [5])
            expect(tree.branches).to.have.length(1)
        })

        it('should have depth 0 with white piece on bar for sequence [6,6,6,6] on setup board', () => {

            const board = new Board
            board.setup()
            board.bars.White.push(board.slots[0].pop())

            const tree = SequenceTree.build(board, White, [6, 6, 6, 6])

            expect(tree.depth).to.equal(0)
        })

        it('should have depth 2 for red for sequence [3, 1] on setup board', () => {

            const board = Board.setup()

            const tree = SequenceTree.build(board, Red, [3, 1])

            expect(tree.depth).to.equal(2)
        })

        it('should have leaf for taking 5 point for red with sequence [1, 3]', () => {

            const boardExp = Board.setup()
            boardExp.move(Red, 5, 1)
            boardExp.move(Red, 7, 3)
            const exp = boardExp.stateString()
            
            const tree = SequenceTree.build(Board.setup(), Red, [1, 3])

            const leafStates = tree.leaves.map(node => node.board.stateString())

            expect(leafStates).to.contain(exp)
        })

    })
})

describe('Dice', () => {

    const {Dice} = Core

    describe('#checkOne', () => {

        it('should throw InvalidRollError for decimal', () => {
            const err = getError(() => Dice.checkOne(1.2))
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
			expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
		})

		it('should return [[5, 5, 5, 5]] for faces [5, 5, 5, 5]', () => {
			const result = Dice.sequencesForFaces([5, 5, 5, 5])
			const exp = [[5, 5, 5, 5]]
			expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
		})
	})
})

describe('Piece', () => {

    const {Piece} = Core

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

describe('Util', () => {

    // used with permission
    describe('#castToArray', () => {

        it('should return singleton [1] for input 1', () => {
            const result = Util.castToArray(1)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([1]))
        })

        it('should return empty list for undefined', () => {
            const result = Util.castToArray(undefined)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([]))
        })

        it('should return empty list for null', () => {
            const result = Util.castToArray(null)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([]))
        })

        it('should return singleton false for input false', () => {
            const result = Util.castToArray(false)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([false]))
        })

        it('should return singleton 0 for input 0', () => {
            const result = Util.castToArray(0)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([0]))
        })

        it('should return same reference for array input', () => {
            const arr = []
            const result = Util.castToArray(arr)
            expect(result).to.equal(arr)
        })
    })
    

    describe('#sortNumericAsc', () => {

        it('should sort [32, 4, 1, 7] to [1, 4, 7, 32]', () => {
            const input = [32, 4, 1, 7]
            const exp = [1, 4, 7, 32]
            const result = input.sort(Util.sortNumericAsc)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })
    })

    describe('#sortNumericDesc', () => {

        it('should sort [32, 4, 1, 7] to [32, 7, 4, 1]', () => {
            const input = [32, 4, 1, 7]
            const exp = [32, 7, 4, 1]
            const result = input.sort(Util.sortNumericDesc)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })
    })

    describe('#sumArray', () => {

        const expCases = [
            {input: [1, 2], exp: 3},
            {input: [], exp: 0},
            {input: [5, 5], exp: 10}
        ]

        expCases.forEach(({input, exp}) => {
            it('should return ' + exp + ' for ' + JSON.stringify(input), () => {
                const result = Util.sumArray(input)
                expect(result).to.equal(exp)
            })
        })
    })

    describe('#uniqueInts', () => {

        it('should return [1,2,3] for [1,1,2,2,3,3]', () => {
            const input = [1, 1, 2, 2, 3, 3]
            const exp = [1, 2, 3]
            const result = Util.uniqueInts(input)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })
    })

    describe('#uniqueStrings', () => {
        it('should return [a, b] for [a, a, b]', () => {
            const input = ['a', 'a', 'b']
            const result = Util.uniqueStrings(input)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(['a', 'b']))
        })
    })
})

describe('Logger', () => {

    describe('#format', () => {

        it('should return string with type and msg', () => {
            const str = Logger.format({type: 'info', msg: 'test'})
            expect(str.toLowerCase()).to.contain('info')
            expect(str).to.contain('test')
        })
    })

    describe('#getStdout', () => {

        it('should return process.stdout if not set', () => {
            const logger = new Logger
            const result = logger.getStdout()
            expect(result).to.equal(process.stdout)
        })

        it('should return what is set', () => {
            const logger = new Logger
            logger.stdout = 1
            const result = logger.getStdout()
            expect(result).to.equal(1)
        })
    })

    describe('#writeStdout', () => {
        it('should call write method on logger.stdout with str as argument', () => {
            const logger = new Logger
            var s
            logger.stdout = {write: str => s = str}
            logger.writeStdout('foo')
            expect(s).to.equal('foo')
        })
    })
})

describe('Menu', () => {

    const {Match} = Core

    var player
    var menu

    beforeEach(() => {
        menu = new Menu
        player = new TermPlayer
        player.loglevel = 1
        player.stdout = {write: () => {}}
    })

    describe('#doMainIfEquals', () => {

        // coverage tricks

        var oldMain

        before(() => {
            oldMain = Menu.main
        })

        afterEach(() => {
            Menu.main = oldMain
        })

        it('should call mock main', () => {
            var isCalled
            Menu.main = () => isCalled = true
            Menu.doMainIfEquals(null, null)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#main', () => {

        // coverage tricks

        it('should call mainMenu', () => {
            var isCalled = false
            menu.mainMenu = () => isCalled = true
            Menu.main(menu)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#mainMenu', () => {

        it('should quit', async () => {
            menu.prompt = MockPrompter({mainChoice: 'quit'})
            await menu.mainMenu()
        })

        it('should go to new local match menu, then come back, then quit', async () => {
            menu.prompt = MockPrompter([
                {mainChoice: 'newLocal'},
                {matchChoice: 'quit'},
                {mainChoice: 'quit'}
            ])
            await menu.mainMenu()
        })

        it('should invalidate match id abcd with joinOnline', async () => {
            menu.prompt = MockPrompter([
                {mainChoice: 'joinOnline'},
                {matchId: 'abcd'}
            ])
            const err = await getErrorAsync(() => menu.mainMenu())
            expect(err.message).to.contain('Validation failed for matchId')
        })

    })

    describe('#matchMenu', () => {

        
        it('should set match total to 5', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'total'},
                {total: '5'},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.total).to.equal(5)
        })

        it('should invalidate total=-1', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'total'},
                {total: '-1'}
            ])
            const err = await getErrorAsync(() => menu.matchMenu())
            expect(err.message).to.contain('Validation failed for total')
        })

        it('should set isJacoby to true', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'isJacoby'},
                {isJacoby: true},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.isJacoby).to.equal(true)
        })

        it('should set isCrawford to false', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'isCrawford'},
                {isCrawford: false},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.isCrawford).to.equal(false)

        })

        it('should quit', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
        })
    })

    describe('#prompt', () => {

        // coverage tricks

        const inquirer = require('inquirer')

        var oldPrompt

        before(() => {
            oldPrompt = inquirer.prompt
        })

        afterEach(() => {
            inquirer.prompt = oldPrompt
        })

        it('should call inquirer.prompt with array and set menu._prompt', () => {
            var q
            inquirer.prompt = questions => q = questions
            menu.prompt()
            expect(Array.isArray(q)).to.equal(true)
        })
    })
})

describe('Coordinator', () => {

    const {Match, Game} = Core

    var coord
    var r1
    var r2

    beforeEach(() => {
        coord = new Coordinator
        r1 = new RandomRobot(White)
        r2 = new RandomRobot(Red)
        t1 = new TermPlayer(White)
        t2 = new TermPlayer(Red)
        t1.logger.loglevel = 1
        t2.logger.loglevel = 1
        t1.stdout = {write: () => {}}
        t2.stdout = t1.stdout
    })

    describe('#runMatch', () => {
        it('should play 3 point match with mock runGame', async () => {
            const match = new Match(3)
            coord.runGame = (players, game) => {
                game.board.setStateString(States.EitherOneMoveWin)
                makeRandomMoves(game.firstTurn(), true)
            }
            await coord.runMatch(match, r1, r2)
            expect(match.hasWinner()).to.equal(true)
        })
    })

    describe('#runGame', () => {

        var game

        beforeEach(() => {
            game = new Game
        })

        it('should play RedWinWith66 for white first move 6,1 then red 6,6', async () => {
            game.board.setStateString(States.RedWinWith66)
            game._rollFirst = () => [6, 1]
            t1.rollTurn = turn => turn.setRoll([6, 6])
            t2.rollTurn = turn => turn.setRoll([6, 6])
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {face: '6'},
                {origin: '17'},
                {finish: 'f'}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'r'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {finish: 'f'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
        })

        it('should end with white refusing double on second turn', async () => {
            game._rollFirst = () => [6, 1]
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {origin: '17'},
                {finish: 'f'},
                {accept: false}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
        })

        it('should play RedWinWith66 for white first move 6,1 then red double, white accept, red rolls 6,6 backgammon', async () => {
            game.board.setStateString(States.RedWinWith66)
            game._rollFirst = () => [6, 1]
            t1.rollTurn = turn => turn.setRoll([6, 6])
            t2.rollTurn = turn => turn.setRoll([6, 6])
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {face: '6'},
                {origin: '17'},
                {finish: 'f'},
                {accept: true}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {finish: 'f'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
            expect(game.cubeValue).to.equal(2)
            expect(game.finalValue).to.equal(8)
        })

        it('should play RedWinWith66, white 6,1, red double, white accept, red 6,5, white 1,2, red cant double 6,6, backgammon', async () => {
            game.board.setStateString(States.RedWinWith66)
            game._rollFirst = () => [6, 1]
            const rolls = [
                [6, 5],
                [1, 2],
                [6, 6]
            ]
            t1.rollTurn = turn => turn.setRoll(rolls.shift())
            t2.rollTurn = turn => turn.setRoll(rolls.shift())
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {face: '6'},
                {origin: '17'},
                {finish: 'f'},
                // accept
                {accept: true},
                // white's turn
                {action: 'r'},
                {origin: '1'},
                {face: '2'},
                {origin: '1'},
                {finish: 'f'}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'},
                {origin: '6'},
                {finish: 'f'},
                // red's turn
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {finish: 'f'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
            expect(game.cubeValue).to.equal(2)
            expect(game.finalValue).to.equal(8)
        })
    })
})

describe('TermPlayer', () => {

    const {Board, Game, Match} = Core

    var player

    beforeEach(() => {
        player = new TermPlayer(White)
        player.logger.loglevel = 1
        player.stdout = {write: () => {}}
    })

    describe('#describeMove', () => {

        it('should include \'bar\' if origin is -1', () => {
            const board = Board.fromStateString(States.WhiteCornerCase24)
            const move = board.buildMove(White, -1, 4)
            const result = player.describeMove(move)
            expect(result).to.contain('bar')
        })

        it('should inclue 1 and 3 if origin is 0 and face is 2', () => {
            const board = Board.setup()
            const move = board.buildMove(White, 0, 2)
            const result = player.describeMove(move)
            expect(result).to.contain('1')
            expect(result).to.contain('3')
        })

        it('should include \'home\' for red if origin is 0 and face is 2', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const move = board.buildMove(Red, 0, 2)
            const result = player.describeMove(move)
            expect(result).to.contain('home')
        })
    })

    describe('#playRoll', () => {

        var game

        beforeEach(() => {
            game = new Game
            player.thisGame = game
        })

        it('should return without prompting if turn.isCantMove', async () => {
            const turn = game.firstTurn()
            // force properties
            turn.isCantMove = true
            turn.allowedMoveCount = 0
            await player.playRoll(turn, game)
        })

        it('should play first roll White 6,1 then break with board as expected for 6 point', async () => {
            game._rollFirst = () => [6, 1]
            player.prompt = MockPrompter([
                {origin: '12'},
                {origin: '17'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })

        it('should play first roll White 6,1 undo first then second with board as expected for 6 point', async () => {
            game._rollFirst = () => [6, 1]
            player.prompt = MockPrompter([
                {origin: '12'},
                {origin: 'u'},
                {origin: '12'},
                {origin: '17'},
                {finish: 'u'},
                {origin: '17'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })
    })

    describe('#prompt', () => {

        // coverage tricks

        const inquirer = require('inquirer')

        var oldPrompt

        before(() => {
            oldPrompt = inquirer.prompt
        })

        afterEach(() => {
            inquirer.prompt = oldPrompt
        })

        it('should call inquirer.prompt with array and set player._prompt', () => {
            var q
            inquirer.prompt = questions => q = questions
            player.prompt()
            expect(Array.isArray(q)).to.equal(true)
        })
    })

    describe('#promptDecideDouble', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return true for true', async () => {
            player.prompt = MockPrompter({accept: true})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(true)
        })

        it('should return false for false', async () => {
            player.prompt = MockPrompter({accept: false})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptTurnOption', () => {

        it('should return false for r', async () => {
            player.prompt = MockPrompter({action: 'r'})
            const result = await player.promptTurnOption()
            expect(result).to.equal(false)
        })

        it('should return true for d', async () => {
            player.prompt = MockPrompter({action: 'd'})
            const result = await player.promptTurnOption()
            expect(result).to.equal(true)
        })
    })

    describe('#promptFace', () => {

        it('should return 3 for [3, 3, 3, 3] and not prompt', async () => {
            const result = await player.promptFace([3, 3, 3, 3])
            expect(result).to.equal(3)
        })

        it('should return 5 for 5 with [5, 6]', async () => {
            player.prompt = MockPrompter({face: '5'})
            const result = await player.promptFace([5, 6])
            expect(result).to.equal(5)
        })

        it('should fail validation for 3 with [1, 2]', async () => {
            player.prompt = MockPrompter({face: '3'})
            const err = await getErrorAsync(() => player.promptFace([1, 2]))
            expect(err.message).to.contain('Validation failed for face')
        })
    })

    describe('#promptFinish', () => {

        it('should return true for f', async () => {
            player.prompt = MockPrompter({finish: 'f'})
            const result = await player.promptFinish()
            expect(result).to.equal(true)
        })

        it('should return false for u', async () => {
            player.prompt = MockPrompter({finish: 'u'})
            const result = await player.promptFinish()
            expect(result).to.equal(false)
        })
    })

    describe('#promptOrigin', () => {

        it('should return -1 for b with [-1]', async () => {
            player.prompt = MockPrompter({origin: 'b'})
            const result = await player.promptOrigin([-1])
            expect(result).to.equal(-1)
        })

        it('should return 0 for 1 with [0, 4]', async () => {
            player.prompt = MockPrompter({origin: '1'})
            const result = await player.promptOrigin([0, 4])
            expect(result).to.equal(0)
        })

        it('should return undo for u with [11, 12] canUndo=true', async () => {
            player.prompt = MockPrompter({origin: 'u'})
            const result = await player.promptOrigin([11, 12], true)
            expect(result).to.equal('undo')
        })

        it('should fail validation for 3 with [3, 4]', async () => {
            player.prompt = MockPrompter({origin: '3'})
            const err = await getErrorAsync(() => player.promptOrigin([3, 4]))
            expect(err.message).to.contain('Validation failed for origin')
        })
    })

    describe('#rollTurn', () => {

        const {Turn} = Core

        // coverage
        it('should roll', async () => {
            const turn = new Turn(Board.setup(), White)
            await player.rollTurn(turn)
            expect(turn.isRolled).to.equal(true)
        })
    })
})

describe('Draw', () => {

    const {Game, Match} = Core

    describe('#drawBoard', () => {

        // these are just for coverage
        var game

        beforeEach(() => game = new Game)

        it('should not barf for initial board', () => {
            Draw.drawBoard(game)
        })

        it('should not barf for RedHitComeIn3', () => {
            game.board.setStateString(States.RedHitComeIn3)
            Draw.drawBoard(game)
        })

        it('should not barf for WhiteCornerCase24', () => {
            game.board.setStateString(States.WhiteCornerCase24)
            Draw.drawBoard(game)
        })

        it('should not barf for WhiteGammon1', () => {
            game.board.setStateString(States.WhiteGammon1)
            Draw.drawBoard(game)
        })

        it('should not barf for RedGammon1', () => {
            game.board.setStateString(States.RedGammon1)
            Draw.drawBoard(game)
        })

        it('should not barf when game isCrawford', () => {
            game.opts.isCrawford = true
            Draw.drawBoard(game)
        })

        it('should not barf when cubeOwner is red', () => {
            game.cubeOwner = Red
            Draw.drawBoard(game)
        })

        it('should not barf when cubeOwner is white', () => {
            game.cubeOwner = White
            Draw.drawBoard(game)
        })

        it('should not barf when match is passed', () => {
            Draw.drawBoard(game, new Match(1))
        })
    })
})

describe('Server', () => {

    var server
    var port
    var client
    var client2

    beforeEach(async () => {
        server = new Server
        server.loglevel = 1
        await server.listen()
        const url = 'ws://localhost:' + server.port
        client = new Client(url)
        client.logger.loglevel = 1
        client2 = new Client(url)
        client2.logger.loglevel = 1
    })

    afterEach(async () => {
        await client.close()
        server.close()
    })

    describe('#checkSync', () => {

        it('should call for white and red equal', () => {
            var isCalled = false
            Server.checkSync({White: 'value', Red: 'value'}, () => isCalled = true)
            expect(isCalled).to.equal(true)
        })

        it('should not call for white and red unequal', () => {
            var isCalled = false
            Server.checkSync({White: 'value', Red: 'other'}, () => isCalled = true)
            expect(isCalled).to.equal(false)
        })
    })

    describe('#doMainIfEquals', () => {
        
    })

    describe('#listen', () => {

        it('should have non-null socketServer', () => {
            expect(!!server.socketServer).to.equal(true)
        })

        it('should accept connection', async () => {
            await client.connect()
            expect(!!client.conn).to.equal(true)
        })
    })

    describe('#matchIdFromSecret', () => {
        
    })

    describe('#response', () => {

        async function bareConn(client) {
            const p = new Promise(resolve => client.socketClient.on('connect', conn => {
                client.conn = conn
                resolve()
            }))
            client.socketClient.connect(client.serverUrl)
            await p
        }
        it('should return HandshakeError for missing secret in message', async () => {
            server.loglevel = -1
            await client.connect()
            const res = await client.sendAndWait({secret: null})
            expect(res.isError).to.equal(true)
            expect(res.name).to.equal('HandshakeError')
        })

        it('should return HandshakeError for missing secret on server', async () => {
            server.loglevel = -1
            await bareConn(client)
            const res = await client.sendAndWait({secret: 'abc'})
            expect(res.isError).to.equal(true)
            expect(res.name).to.equal('HandshakeError')
        })

        describe('establishSecret', () => {

            it('should return HandshakeError for secret of length 23', async () => {
                server.loglevel = -1
                const msg = {secret: 'abcdefghijklmnopqrstuvw', action: 'establishSecret'}
                await bareConn(client)
                const res = await client.sendAndWait(msg)
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })

            it('should return HandshakeError for mismatch secret', async () => {
                server.loglevel = -1
                await client.connect()
                const msg = {secret: Client.generateSecret(), action: 'establishSecret'}
                const res = await client.sendAndWait(msg)
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })
        })

        describe('startMatch', () => {

            it('should return matchCreated with id of new match with total 1', async () => {
                await client.connect()
                const msg = {action: 'startMatch', total: 1}
                const res = await client.sendAndWait(msg)
                expect(res.action).to.equal('matchCreated')
                expect(typeof(res.id)).to.equal('string')
            })

            it('should return ArgumentError for match with total -1', async () => {
                server.loglevel = -1
                await client.connect()
                const msg = {action: 'startMatch', total: -1}
                const res = await client.sendAndWait(msg)
                expect(res.name).to.equal('ArgumentError')
            })
        })

        describe('joinMatch', () => {

            it('should return matchJoined and opponentJoind with id of new match with total 1', async () => {
                await client.connect()
                const {id} = await client.sendAndWait({action: 'startMatch', total: 1})
                var p = client.waitForMessage()
                await client2.connect()
                const msg = {action: 'joinMatch', id}
                const res2 = await client2.sendAndWait(msg)
                const res = await p
                expect(res.action).to.equal('opponentJoined')
                expect(res2.action).to.equal('matchJoined')
                expect(res2.id).to.equal(res.id)
            })

            it('should return MatchNotFoundError for unknown match id', async () => {
                server.loglevel = -1
                await client.connect()
                const msg = {action: 'joinMatch', id: '12345678'}
                const res = await client.sendAndWait(msg)
                expect(res.name).to.equal('MatchNotFoundError')
            })

            it('should return MatchAlreadyJoinedError when already joined', async () => {
                server.loglevel = -1
                await client.connect()
                const {id} = await client.sendAndWait({action: 'startMatch', total: 1})
                var p = client.waitForMessage()
                await client2.connect()
                const msg = {action: 'joinMatch', id}
                await client2.sendAndWait(msg)
                await p
                const res = await client2.sendAndWait(msg)
                expect(res.name).to.equal('MatchAlreadyJoinedError')
            })
        })
    })

    describe('#matchResponse', () => {

        var id

        beforeEach(async () => {
            await Promise.all([client.connect(), client2.connect()])
            const res = await client.sendAndWait({action: 'startMatch', total: 3})
            id = res.id
            const p = client.waitForMessage()
            await client2.sendAndWait({action: 'joinMatch', id})
            await p
        })

        describe('nextGame', () => {

            it('should reply with nextGame for correct color and id', async () => {
                client.sendAndWait({action: 'nextGame', color: White, id})
                const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
                expect(res.action).to.equal('nextGame')
            })

            it('should return GameNotFinishedError when both make second call', async () => {
                client.sendAndWait({action: 'nextGame', color: White, id})
                await client2.sendAndWait({action: 'nextGame', color: Red, id})
                client.sendAndWait({action: 'nextGame', color: White, id})
                server.loglevel = -1
                const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
                expect(res.name).to.equal('GameNotFinishedError')
            })
        })

        describe('firstTurn', () => {

            it('should reply with same dice for started game', async () => {
                server.matches[id].nextGame()
                const p = client.sendAndWait({action: 'firstTurn', color: White, id})
                const res = await client2.sendAndWait({action: 'firstTurn', color: Red, id})
                const res2 = await p
                expect(res.dice).to.have.length(2)
                expect(JSON.stringify(res.dice)).to.equal(JSON.stringify(res2.dice))
            })
        })

        describe('playRoll', () => {

            it('should reply with same moves', async () => {
                const game = server.matches[id].nextGame()
                game._rollFirst = () => [2, 1]
                game.firstTurn()
                client2.sendAndWait({action: 'playRoll', color: Red, id})
                const moves = [
                    {origin: 0, face: 1},
                    {origin: 0, face: 2}
                ]
                const res = await client.sendAndWait({action: 'playRoll', color: White, id, moves})
                expect(JSON.stringify(res.moves)).to.equal(JSON.stringify(moves))
            })

            it('should return RequestError for missing moves', async () => {
                const game = server.matches[id].nextGame()
                game.firstTurn()
                client2.sendAndWait({action: 'playRoll', color: Red, id})
                const res = await client.sendAndWait({action: 'playRoll', color: White, id})
                expect(res.isRequestError).to.equal(true)
            })
        })

        describe('nextTurn', () => {
            it('should reply for valid case', async () => {
                makeRandomMoves(server.matches[id].nextGame().firstTurn()).finish()
                client2.sendAndWait({action: 'nextTurn', color: Red, id})
                const res = await client.sendAndWait({action: 'nextTurn', color: White, id})
                expect(res.action).to.equal('nextTurn')
            })
        })

        describe('turnOption', () => {

            it('should return isDouble for isDouble=false', async () => {
                const game = server.matches[id].nextGame()
                makeRandomMoves(game.firstTurn(), true)
                game.nextTurn()
                client2.sendAndWait({action: 'turnOption', isDouble: false, color: Red, id})
                const res = await client.sendAndWait({action: 'turnOption', color: White, id})
                expect(res.isDouble).to.equal(false)
            })

            it('should return isDouble=true for isDouble=true', async () => {
                const game = server.matches[id].nextGame()
                game._rollFirst = () => [2, 1]
                makeRandomMoves(game.firstTurn(), true)
                game.nextTurn()
                client2.sendAndWait({action: 'turnOption', color: Red, id, isDouble: true})
                const res = await client.sendAndWait({action: 'turnOption', color: White, id})
                expect(res.isDouble).to.equal(true)
            })
        })

        describe('doubleResponse', () => {

            it('should set double declined for isAccept=false', async () => {
                const game = server.matches[id].nextGame()
                game._rollFirst = () => [2, 1]
                makeRandomMoves(game.firstTurn(), true)
                game.nextTurn().setDoubleOffered()
                client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                const res = await client.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: false})
                expect(game.thisTurn.isDoubleDeclined).to.equal(true)
                expect(res.isAccept).to.equal(false)
            })

            it('should double game for isAccept=true', async () => {
                const game = server.matches[id].nextGame()
                game._rollFirst = () => [2, 1]
                makeRandomMoves(game.firstTurn(), true)
                game.nextTurn().setDoubleOffered()
                client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                const res = await client.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: true})
                expect(game.cubeValue).to.equal(2)
                expect(res.isAccept).to.equal(true)
            })
        })

        describe('rollTurn', () => {
            it('should return same dice')
        })
    })

    describe('#roll', () => {
        it('should return 2 length array', () => {
            const result = server.roll()
            expect(result).to.have.length(2)
        })
    })

    describe('#validateColor', () => {

        it('should pass for White', () => {
            Server.validateColor(White)
        })

        it('should pass for Red', () => {
            Server.validateColor(Red)
        })

        it('should throw server error for Brown', () => {
            const err = getError(() => Server.validateColor('Brown'))
            expect(err.isRequestError).to.equal(true)
        })
    })
    
})

describe('Client', () => {

    var server
    var client

    beforeEach(() => {
        server = new Server
        client = new Client
    })


})


