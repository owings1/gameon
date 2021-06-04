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
    Structures
} = TestUtil

const Core = requireSrc('lib/core')
const Util = requireSrc('lib/util')

const {White, Red, Match, Game, Board, Turn, Piece, Dice, SequenceTree} = Core


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
    })

    describe('#getLoser', () => {

        it('should return null when match not started', () => {
            const match = new Match(1)
            const result = match.getLoser()
            expect(result).to.equal(null)
        })

        it('should return White when red doubles and white declines for 1 point match isCrawford=false', () => {
            const match = new Match(1, {isCrawford: false})
            const game = match.nextGame()
            game._rollFirst = () => [6, 1]
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

            const match = new Match(2, {isCrawford: true, isJacoby: true})

            const game1 = match.nextGame()
            // red moves first
            game1._rollFirst = () => [1, 6]
            makeRandomMoves(game1.firstTurn(), true)
            // white doubles
            game1.nextTurn().setDoubleOffered()
            // red declines, white wins
            game1.thisTurn.setDoubleDeclined()
            match.checkFinished()
            

            const game2 = match.nextGame()
            expect(game2.opts.isCrawford).to.equal(true)
            // white moves first
            game2._rollFirst = () => [6, 1]
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
            const m1 = new Match(1)
            const g1 = m1.nextGame()

            // white moves first
            g1._rollFirst = () => [6, 1]
            makeRandomMoves(g1.firstTurn(), true)

            const m2 = Match.unserialize(m1.serialize())
            const g2 = m2.thisGame

            expect(g2.board.stateString()).to.equal(g1.board.stateString())

            // should be red's turn
            const t2 = g2.nextTurn()
            expect(t2.color).to.equal(Red)
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

    describe('#getLoser', () => {

        it('should return null for new game', () => {
            const result = game.getLoser()
            expect(result).to.equal(null)
        })

        it('should return red after red first turn then force state to EitherOneMoveWin and white move', () => {
            game._rollFirst = () => [1, 6]
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

    describe('#meta', () => {

        it('should return opts with just the keys of Game.defaults()', () => {
            const game = new Game({badOpt: true})
            const result = Object.keys(game.meta().opts).sort()
            const exp = Object.keys(Game.defaults()).sort()
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
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

    describe('#finish', () => {

        it('should allow after setRoll 6,6 for white on bar with setup board', () => {
            const board = Board.setup()
            board.bars.White.push(board.slots[0].pop())
            board.markChange()
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
    })

    describe('#move', () => {

        it('should move Red 3,1 to 5 point with expected state', () => {
            const bexp = Board.setup()
            bexp.slots[4].push(bexp.slots[7].pop())
            bexp.slots[4].push(bexp.slots[5].pop())
            bexp.markChange()
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
            expect(JSON.stringify(exp1)).to.equal(JSON.stringify(exp2))
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

    describe('#unserialize', () => {

        it('should make new board with state if not passed', () => {
            const game = new Game
            const t1 = makeRandomMoves(game.firstTurn(), true)
            const t2 = Turn.unserialize(Turn.serialize(t1))
            expect(t2.board.stateString()).to.equal(t1.board.stateString())
            expect(t2).to.not.equal(t1)
        })

        it('should leave second turn unrolled, then continue play', () => {
            const game = new Game
            game._rollFirst = () => [6, 1]
            makeRandomMoves(game.firstTurn(), true)
            game.nextTurn()
            const t2 = Turn.unserialize(Turn.serialize(game.thisTurn))
            expect(t2.color).to.equal(Red)
            expect(t2.isRolled).to.equal(false)
            t2.roll()
            makeRandomMoves(t2, true)
            expect(t2.isFinished).to.equal(true)
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

    describe('endStatesToSeries', () => {

        it('should have expected value for sparse board with 2,1 roll', () => {
            const board = new Board
            board.slots[0] = Piece.make(2, White)
            board.markChange()

            // build expected board outcomes
            const b1 = board.copy()
            const b2 = board.copy()
            b1.slots[1].push(b1.slots[0].pop())
            b1.slots[2].push(b1.slots[0].pop())
            b2.slots[3].push(b2.slots[0].pop())
            b1.markChange()
            b2.markChange()

            const turn = new Turn(board, White)
            turn.setRoll([2, 1])

            const result = turn.endStatesToSeries
            const statesActual = Object.keys(result).sort()
            const statesExp = [b1.stateString(), b2.stateString()].sort()
            expect(JSON.stringify(statesActual)).to.equal(JSON.stringify(statesExp))

            const b1MovesActual = result[b1.stateString()]
            const b1MovesExp = [{origin: 0, face: 2}, {origin: 0, face: 1}] // could be 0:1|0:2
            const b2MovesAcutal = result[b2.stateString()]
            const b2MovesExp = [{origin: 0, face: 2}, {origin: 2, face: 1}] // could be 0:1|1:2
            expect(JSON.stringify(b1MovesActual)).to.equal(JSON.stringify(b1MovesExp))
            expect(JSON.stringify(b2MovesAcutal)).to.equal(JSON.stringify(b2MovesExp))
        })
    })

    describe('tree equivalence', () => {

        describe('depth vs breadth', () => {

            function checkEquivalence(t1, t2) {

                const amKeys1 = Object.keys(t1.allowedMoveIndex).sort()
                const amKeys2 = Object.keys(t2.allowedMoveIndex).sort()
                const stKeys1 = Object.keys(t1.endStatesToSeries).sort()
                const stKeys2 = Object.keys(t2.endStatesToSeries).sort()
                const states1 = t1.allowedEndStates.slice(0).sort()
                const states2 = t2.allowedEndStates.slice(0).sort()

                expect(JSON.stringify(t1.allowedFaces)).to.equal(JSON.stringify(t2.allowedFaces))
                expect(JSON.stringify(amKeys1)).to.equal(JSON.stringify(amKeys2))
                expect(JSON.stringify(stKeys1)).to.equal(JSON.stringify(stKeys2))
                expect(JSON.stringify(states1)).to.equal(JSON.stringify(states2))
                
                // the series selected for an end state can be different, and often are,
                // since depth strategy uses flagKey optimization, which sorts the series
                /*
                for (var i = 0; i < stKeys1.length; i++) {
                    var series1 = t1.endStatesToSeries[stKeys1[i]]
                    var series2 = t2.endStatesToSeries[stKeys1[i]]
                    for (var series of [series1, series2]) {
                        series.sort((a, b) => {
                            const cmp = Util.sortNumericAsc(a.origin, b.origin)
                            return cmp != 0 ? cmp : Util.sortNumericAsc(a.face, b.face)
                        })
                    }
                    expect(JSON.stringify(series1)).to.equal(JSON.stringify(series2))
                }
                */
            }

            describe('all rolls', () => {
                Rolls.allRolls.forEach(roll => {
                    it('should be equivalent for White at initial state for ' + roll.join(','), () => {
                        const t1 = new Turn(Board.setup(), White)
                        const t2 = new Turn(Board.setup(), White, {breadthTrees: true})
                        expect(t2.opts.breadthTrees).to.equal(true)
                        t1.setRoll(roll)
                        t2.setRoll(roll.slice(0).reverse())
                        checkEquivalence(t1, t2)
                    })
                })
            })

            describe('fixed game play', () => {
                var game1
                var game2

                before(() => {
                    game1 = new Game
                    game2 = new Game({breadthTrees: true})
                    game1._rollFirst = () => Rolls.allFirstRolls[0]
                    game2._rollFirst = () => Rolls.allFirstRolls[0]
                })

                function nextTurns(roll) {
                    const turns = [game1.nextTurn(), game2.nextTurn()]
                    turns.forEach(turn => turn.setRoll(roll))
                    return turns
                }

                function playTurns(t1, t2) {
                    const moves = t1.endStatesToSeries[t1.allowedEndStates[0]] || []
                    for (var move of moves) {
                        t1.move(move)
                        t2.move(move)
                    }
                    t1.finish()
                    t2.finish()
                }

                it('game2 should have breadthTrees but not game1', () => {
                    expect(!!game1.opts.breadthTrees).to.equal(false)
                    expect(game2.opts.breadthTrees).to.equal(true)
                })

                it('should be equivalent at first turn', () => {
                    const t1 = game1.firstTurn()
                    const t2 = game2.firstTurn()
                    checkEquivalence(t1, t2)
                    playTurns(t1, t2)
                })

                Util.intRange(2, 63).forEach(i => {
                    const roll = Rolls.fixedRandomRolls[i]
                    it('should be equivalent at turn ' + i + ' for roll ' + roll.join(','), () => {
                        const turns = nextTurns(roll)
                        checkEquivalence(...turns)
                        playTurns(...turns)
                    })
                })

                it('games should be finished and White should win', () => {
                    game1.checkFinished()
                    game2.checkFinished()
                    expect(game1.isFinished).to.equal(true)
                    expect(game2.isFinished).to.equal(true)
                    expect(game1.getWinner()).to.equal(game2.getWinner())
                    expect(game1.getWinner()).to.equal(White)
                })
            })
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

    describe('#originPoint', () => {

        const expCases = [
            {input: [Red, 5], exp: 6},
            {input: [White, 5], exp: 19},
            {input: [White, 18], exp: 6}
        ]

        expCases.forEach(({input, exp}) => {
            it('should return ' + exp + ' for ' + input.join(), () => {
                const result = board.originPoint(...input)
                expect(result).to.equal(exp)
            })
        })
    })

    describe('#copy', () => {

        it('should have two pieces on slot 0 copying setup board, but slot arrays non-identical', () => {
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
			board.bars.White = Piece.make(1, White)
            board.markChange()
			const result = board.getPossibleMovesForFace(White, 2)
			expect(result).to.have.length(1)
			expect(result[0].isComeIn).to.equal(true)
			expect(result[0].face).to.equal(2)
		})

		it('should return empty for white face=5 with one on 0 and red 2 on 5', () => {
			board.slots[0] = Piece.make(1, White)
			board.slots[5] = Piece.make(2, Red)
            board.markChange()
			const result = board.getPossibleMovesForFace(White, 5)
			expect(result).to.have.length(0)
		})

        // no longer applicable
		it.skip('should throw when non IllegalMoveError is thrown', () => {
			board.setup()
			board.checkMove = () => { throw new Error }
			const err = getError(() => board.getPossibleMovesForFace(White, 1))
			expect(err instanceof Error).to.equal(true)
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
            board.homes.White = Piece.make(15, White)
            board.markChange()
            const result = board.getWinner()
            expect(result).to.equal(White)
        })

        it('should return red when home has 15', () => {
            board.homes.Red = Piece.make(15, Red)
            board.markChange()
            const result = board.getWinner()
            expect(result).to.equal(Red)
        })
    })

    describe('#hasBar', () => {

        it('should return true for white with one on bar', () => {
            board.bars.White = Piece.make(1, White)
            board.markChange()
            const result = board.hasBar(White)
            expect(result).to.equal(true)
        })
    })

    describe('#hasWinner', () => {

        it('should return true when red has 15 in home', () => {
            board.homes.Red = Piece.make(15, Red)
            board.markChange()
            const result = board.hasWinner()
            expect(result).to.equal(true)
        })

        it('should return true when white has 15 in home', () => {
            board.homes.White = Piece.make(15, White)
            board.markChange()
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

    describe('#isAllHome', () => {

        it('should return true when red has 15 in home', () => {
            board.homes.Red = Piece.make(15, Red)
            board.markChange()
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

	describe('#originsOccupied', () => {

		it('should return [5,7,12,23] for red on setup', () => {
			board.setup()
			const result = board.originsOccupied(Red)
			const exp = [5, 7, 12, 23]
			expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
		})
	})

    describe('#mayBearoff', () => {

        it('should return false for white with one on bar', () => {
            board.bars.White = Piece.make(1, White)
            board.markChange()
            const result = board.mayBearoff(White)
            expect(result).to.equal(false)
        })

        it('should return true for red with none on bar and 15 on 0', () => {
            board.slots[0] = Piece.make(15, Red)
            board.markChange()
            const result = board.mayBearoff(Red)
            expect(result).to.equal(true)
        })

        it('should return false for red with none on bar and 1 on 0 and 14 on 23', () => {
            board.slots[23] = Piece.make(14, Red)
            board.slots[0] = Piece.make(1, Red)
            board.markChange()
            const result = board.mayBearoff(Red)
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
            board.bars.White.push(board.slots[0].pop())
            board.markChange()
            board.move(White, -1, 1)
            expect(board.slots[0]).to.have.length(2)
        })

        it('should comein to face=1 for red with bar', () => {
            board.bars.Red.push(board.slots[23].pop())
            board.markChange()
            board.move(Red, -1, 1)
            expect(board.slots[23]).to.have.length(2)
        })

        it('should not comein to face=6 for white with bar as OccupiedSlotError', () => {
            board.bars.White.push(board.slots[0].pop())
            board.markChange()
            const err = getError(() => board.move(White, -1, 6))
            expect(err.name).to.equal('OccupiedSlotError')
        })

        it('should not advance white with bar as PieceOnBarError', () => {
            board.bars.White.push(board.slots[0].pop())
            board.markChange()
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
            board.markChange()
            board.move(White, 18, 6)
            expect(board.slots[18]).to.have.length(4)
            expect(board.homes.White).to.have.length(1)
        })

        it('should bear off white from 5 point on face=5 with other pieces on 6 point', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            board.markChange()
            board.move(White, 19, 5)
            expect(board.slots[19]).to.have.length(9)
            expect(board.homes.White).to.have.length(1)
        })

        it('should bear off red from 5 point on face=5 with other pieces on 6 point', () => {
            board.slots[4] = board.slots[23].splice(0).concat(
                board.slots[12].splice(0),
                board.slots[7].splice(0)
            )
            board.markChange()
            board.move(Red, 4, 5)
            expect(board.slots[4]).to.have.length(9)
            expect(board.homes.Red).to.have.length(1)
        })

        it('should not bear off white with face=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.slots[19] = board.slots[0].splice(0).concat(
                board.slots[11].splice(0),
                board.slots[16].splice(0)
            )
            board.markChange()
            const err = getError(() => board.move(White, 19, 6))
            expect(err.name).to.equal('IllegalBareoffError')
        })

        it('should not bear off red with face=6 from 5 point with piece behind as IllegalBareoffError', () => {
            board.slots[4] = board.slots[23].splice(0).concat(
                board.slots[12].splice(0),
                board.slots[7].splice(0)
            )
            board.markChange()
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
            board.markChange()
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
            board.markChange()
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

    describe('#pointOrigin', () => {

        it('should return 18 for White 6 point', () => {
            const result = board.pointOrigin(White, 6)
            expect(result).to.equal(18)
        })

        it('should return 5 for Red 6 point', () => {
            const result = board.pointOrigin(Red, 6)
            expect(result).to.equal(5)
        })

        it('should return -1 for Red -1', () => {
            const result = board.pointOrigin(Red, -1)
            expect(result).to.equal(-1)
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
    })

	describe('#toString', () => {

		it('should return state string', () => {
			expect(board.toString()).to.equal(board.stateString())
		})
	})
})

describe('BoardAnalyzer', () => {

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

    /*
    // Obsolete methods
    describe('#piecesInPointRange', () => {

        it('should return 5 for white 1-6 for initial state', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.piecesInPointRange(White, 1, 6)
            expect(result).to.equal(5)
        })

        it('should return 0 for white 1-5 for initial state', () => {
            const {analyzer} = Board.setup()
            const result = analyzer.piecesInPointRange(White, 1, 5)
            expect(result).to.equal(0)
        })
    })
    */

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
})

describe('Move', () => {

    var board

    beforeEach(() => {
        board = Board.setup()
    })

    // refactored to property
    describe.skip('#coords', () => {

        it('should return origin and face properties', () => {
            const move = board.buildMove(White, 0, 1)
            const result = move.coords()
            expect(result.origin).to.equal(0)
            expect(result.face).to.equal(1)
        })
    })

    describe('#copy', () => {

        it('should return new ComeInMove with same board, color, and face', () => {
            board.bars.White.push(board.slots[0].pop())
            board.markChange()
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
            board.markChange()
            const move = board.buildMove(White, -1, 1)
            const otherBoard = board.copy()
            const copy = move.copyForBoard(otherBoard)
            expect(copy.constructor.name).to.equal('ComeInMove')
            expect(copy.board).to.equal(otherBoard)
            expect(copy.color).to.equal(White)
            expect(copy.face).to.equal(1)
        })
    })

    /*
    // Obsolete methods
    describe('#getDestSlot', () => {

        it('should return [] equal to board.slots[1] for white move 0,1', () => {
            const move = board.buildMove(White, 0, 1)
            const result = move.getDestSlot()
            expect(result.length).to.equal(0)
            expect(result).to.equal(board.slots[1])
        })
    })

    describe('#getOpponentBar', () => {

        it('should return board.bars.Red for White 0,1', () => {
            const move = board.buildMove(White, 0, 1)
            const result = move.getOpponentBar()
            expect(result).to.equal(board.bars.Red)
        })
    })

    describe('#getOriginSlot', () => {

        it('should return slot with length 2 equal to board.slots[0] for white move 0,1', () => {
            const move = board.buildMove(White, 0, 1)
            const result = move.getOriginSlot()
            expect(result.length).to.equal(2)
            expect(result).to.equal(board.slots[0])
        })
    })
    */
})

describe('Piece', () => {

    describe('#make', () => {
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

describe('SequenceTree', () => {

    describe('#build2', () => {
        it.skip('build2 playground', () => {

            var board = Board.fromStateString(States.WhiteCornerCase26)
            var tree = new SequenceTree(board, White, [2, 6])
            tree.buildDepth()

            //console.log(JSON.stringify(tree.index, null, 2))

            expect(tree.maxDepth).to.equal(2)

            var board = Board.setup()
            var tree = new SequenceTree(board, White, [6, 5, 3, 1])
            tree.buildDepth()

            //console.log(JSON.stringify(tree.index['11:6'], null, 2))

            expect(tree.maxDepth).to.equal(4)
        })

        it.skip('build2 console', () => {
            // this is for copy/paste to console
            /*
            // WhiteCornerCase26
            //  with 2,6 white has to move its rearmost piece(i:14) 2 then 6. it cannot move its middle piece(i:17) 2 first
            , WhiteCornerCase26 : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|1:White|0:|0:|2:Red|0:|0:|2:Red|0|0'
            */
            var Core = require('./src/lib/core')
            var States = require('./test/states')
            var {Board, SequenceTree, White} = Core

            var board = Board.fromStateString(States.WhiteCornerCase26)
            var tree = new SequenceTree(board, White, [2, 6])

            tree.buildDepth()

            //console.log(JSON.stringify(tree.index, null, 2))
        })
    })
    describe('#buildNodes', () => {

        // major refactor, nodes property is gone
        it.skip('should return 2 nodes, original state and regular move from origin:0 to dest:1 for sparse board with sequence [1]', () => {

            const board = new Board
            board.slots[0] = Piece.make(5, White)

            const {nodes} = SequenceTree.buildNodes(board, White, [1])

            expect(nodes).to.have.length(2)

            expect(nodes[0].board).to.equal(board)
            expect(nodes[0].depth).to.equal(0)
            expect(nodes[0].parent).to.equal(null)
            expect(nodes[0].thisFace).to.equal(undefined)
            //expect(nodes[0].thisFace).to.equal(null)
            expect(nodes[0].thisMove).to.equal(undefined)
            //expect(nodes[0].thisMove).to.equal(null)
            expect(nodes[0].nextFace).to.equal(1)
            expect(nodes[0].nextMoves).to.have.length(1)
            //expect(nodes[0].children).to.have.length(1)

            expect(nodes[1].board).to.not.equal(board)
            expect(nodes[1].depth).to.equal(1)
            expect(nodes[1].parent).to.equal(nodes[0])
            expect(nodes[1].thisFace).to.equal(1)
            expect(nodes[1].thisMove).to.not.equal(undefined)
            //expect(nodes[1].thisMove).to.not.equal(null)
            expect(nodes[1].nextFace).to.equal(undefined)
            //expect(nodes[1].nextFace).to.equal(null)
            //expect(nodes[1].children).to.have.length(0)

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

        it('should have node with winner for 2,1 from EitherOneMoveWin', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const tree = SequenceTree.buildBreadth(board, White, [2, 1])
            expect(tree.hasWinner).to.equal(true)
            expect(tree.leaves[0].isWinner).to.equal(true)
        })
    })

    describe('#build', () => {

        it.skip('should return one branch for regular move from i:0 to i:1 for sparse board with sequence [5]', () => {
            const board = new Board
            board.slots[4] = Piece.make(4, White)
            const tree = SequenceTree.buildBreadth(board, White, [5])
            expect(tree.branches).to.have.length(1)
        })

        it('should have maxDepth 0 with white piece on bar for sequence [6,6,6,6] on setup board', () => {

            const board = new Board
            board.setup()
            board.bars.White.push(board.slots[0].pop())

            const tree = SequenceTree.buildBreadth(board, White, [6, 6, 6, 6])

            expect(tree.maxDepth).to.equal(0)
        })

        it('should have maxDepth 2 for red for sequence [3, 1] on setup board', () => {

            const board = Board.setup()

            const tree = SequenceTree.buildBreadth(board, Red, [3, 1])

            expect(tree.maxDepth).to.equal(2)
        })

        it('should have leaf for taking 5 point for red with sequence [1, 3]', () => {

            const boardExp = Board.setup()
            boardExp.move(Red, 5, 1)
            boardExp.move(Red, 7, 3)
            const exp = boardExp.stateString()
            
            const tree = SequenceTree.buildBreadth(Board.setup(), Red, [1, 3])

            const leafStates = tree.leaves.map(node => node.board.stateString())

            expect(leafStates).to.contain(exp)
        })
    })
})