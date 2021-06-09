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
const {SequenceTree, BreadthTree, DepthTree, DepthBuilder, TurnBuilder} = requireSrc('lib/trees')

const {White, Red} = Constants
const {Match, Game, Board, Turn, Piece, Dice} = Core


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

    describe('#serialize', () => {

        it('should have thisTurn when exists with same dice', () => {
            const firstTurn = game.firstTurn()
            const result = game.serialize()
            expect(!!result.thisTurn).to.equal(true)
            expect(JSON.stringify(result.thisTurn.dice)).to.equal(JSON.stringify(firstTurn.dice))
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
            expect(JSON.stringify(statesActual)).to.equal(JSON.stringify(statesExp))

            const b1MovesActual = result[b1.state28()]
            //const b1MovesActual = result[b1.stateString()]
            const b1MovesExp = [{origin: 0, face: 2}, {origin: 0, face: 1}] // could be 0:1|0:2
            const b2MovesAcutal = result[b2.state28()]
            //const b2MovesAcutal = result[b2.stateString()]
            const b2MovesExp = [{origin: 0, face: 2}, {origin: 2, face: 1}] // could be 0:1|1:2
            expect(JSON.stringify(b1MovesActual)).to.equal(JSON.stringify(b1MovesExp))
            expect(JSON.stringify(b2MovesAcutal)).to.equal(JSON.stringify(b2MovesExp))
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

describe('TurnBuilder', () => {

    describe('#newTree', () => {

        it('should throw NotImplementedError', () => {
            const builder = new TurnBuilder
            const err = getError(() => builder.newTree())
            expect(err.name).to.equal('NotImplementedError')
        })
    })
})

describe('SequenceTree', () => {

    describe('DepthTree', () => {

        describe('#buildSequence', () => {
            it('should throw MaxDepthExceededError on depth = 5', () => {
                const tree = new DepthTree(Board.setup(), White, [1, 2])
                const err = getError(() => tree.buildSequence(tree.board, tree.sequence, tree.index, null, 5))  
                expect(err.name).to.equal('MaxDepthExceededError')
            })

            it('should set isWinner when no parent (coverage)', () => {
                const board = Board.fromStateString(States.WhiteWin)
                const tree = new DepthTree(board, White, [1, 2])
                tree.buildSequence(board)
                expect(tree.hasWinner).to.equal(true)
            })
        })

        describe('#beforeMoves', () => {
            it('should not propagate maxDepth to parent if depth is less (deviant case)', () => {
                const tree = new DepthTree(Board.setup(), White, [1, 2])
                const node = tree.createNode({}, 2)
                tree.beforeMoves(1, 2, node)
                expect(node.maxDepth).to.equal(2)
            })
        })
    })

    describe('BreadthTree', () => {

        it('should have maxDepth 0 with white piece on bar for sequence [6,6,6,6] on setup board', () => {

            const board = new Board
            board.setup()
            board.pushBar(White, board.popOrigin(0))

            const tree = new BreadthTree(board, White, [6, 6, 6, 6]).build()
            

            expect(tree.maxDepth).to.equal(0)
        })

        it('should have maxDepth 2 for red for sequence [3, 1] on setup board', () => {

            const board = Board.setup()

            const tree = new BreadthTree(board, Red, [3, 1]).build()

            expect(tree.maxDepth).to.equal(2)
        })

        describe('#intakeNode', () => {
            it('should not set parent winner if no parent (deviant)', () => {
                const board = Board.fromStateString(States.WhiteWin)
                const tree = new BreadthTree(board, Red, [1, 2])
                const move = board.buildMove(Red, 0, 1)
                move.do()
                const node = tree.createNode(move, 1)
                tree.depthIndex[1] = []
                tree.intakeNode(node, tree.index)
                expect(tree.hasWinner).to.equal(true)
            })
        })
        describe('wip - TreeNode', () => {

            function indexJson(index) {
                return JSON.stringify(SequenceTree.serializeIndex(index), null, 2)
            }

            it('wip allowedMoveIndex2', () => {
                const t1 = new Turn(Board.setup(), White, {breadthTrees: true})
                const t2 = new Turn(Board.setup(), White)
                t1.setRoll(1, 2)
                t2.setRoll(1, 2)
                
            })
            it('wip moveSeries', () => {
                const t1 = new Turn(Board.setup(), White, {breadthTrees: true})
                const t2 = new Turn(Board.setup(), White)
                t1.setRoll(1, 1)
                t2.setRoll(1, 1)
                
            })

            it('wip buildSequence', () => {
                const board = Board.setup()
                const t1 = new DepthTree(board, White, [2, 1])
                t1.buildSequence(t1.board, [2], t1.index)
                t1.depthIndex[1][0].moveSeries()
                //console.log(t1.index)
            })

            it('wip prune', () => {
                const board = Board.fromStateString(States.WhitePrune1)
                const t1 = new DepthTree(board, White, [5, 1])
                const t2 = new DepthTree(board, White, [1, 5])
                t1.buildSequence(t1.board, [5, 1], t1.index)
                t2.buildSequence(t2.board, [1, 5], t2.index)
                //console.log(t2.index)
                t2.prune(2, 5, true)
                //console.log(t1)
                //console.log(t2.index)
            })

            it('wip prune 2', () => {
                const board = Board.setup()
                const tree = new DepthTree(board, Red, [3, 1])
                tree.buildSequence(board, [3, 1], tree.index)
                //console.log(SequenceTree.serializeIndex(tree.index, true))
                //console.log(tree.index['7:3'])
                tree.prune(tree.maxDepth, tree.highestFace, true)
                //console.log(SequenceTree.serializeIndex(tree.index, true))
                //console.log(SequenceTree.serializeIndex(turn.allowedMoveIndex, true))

                //const turn = new Turn(board, Red)
                //turn.setRoll([3, 1])                
                //turn.move(7, 3)
                //turn.move(5, 1)
            })

            it('sequence tree index equivalence with depth for basic example', () => {
                const board = new Board
                for (var i = 0; i < 4; ++i) {
                    board.pushOrigin(4, White)
                }
                const tree1 = new BreadthTree(board, White, [5, 2]).build()
                const tree2 = new DepthTree(board, White, [5, 2]).build()

                expect(indexJson(tree1.index)).to.equal(indexJson(tree2.index))
            })
        })
    })

    describe('high face', () => {

        it('should have highest face 4 on WhitePruneFace4', () => {
            const board = Board.fromStateString(States.WhitePruneFace4)
            const turn = new Turn(board, White)
            turn.setRoll(2, 4)
            expect(turn.builder.highestFace).to.equal(4)
        })
    })

    describe('leaf that does not pass', () => {

        it('should allow both the 5 and the 2 for EitherOneMoveWin', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const turn = new Turn(board, White)
            turn.setRoll(5, 2)
            expect(turn.allowedMoveIndex).to.contain.key('23:5')
            expect(turn.allowedMoveIndex).to.contain.key('23:2')
            //console.log(turn.builder.trees)
        })
    })

    it('should allow 1 then 6', () => {
        const board = Board.fromStateString(States.WhiteAllow16)
        const turn = new Turn(board, White)
        turn.setRoll(1, 6)
        turn.move(18, 1)
        turn.move(19, 6)
        //console.log(turn.allowedMoveIndex)
        expect(turn.allowedMoveIndex).to.contain.key('18:1')
        expect(turn.allowedMoveIndex['18:1'].index).to.contain.key('19:6')
    })

    describe('#serialize', () => {

        it('should be JSONable', () => {
            const tree = new DepthTree(Board.setup(), White, [1, 2]).build()
            const result = tree.serialize()
            JSON.stringify(result)
        })

        it('should sort index', () => {
            const tree = new DepthTree(Board.setup(), White, [1, 2]).build()
            const result1 = tree.serialize((a, b) => a.localeCompare(b))
            const result2 = tree.serialize((a, b) => b.localeCompare(a))
            const keys1 = Object.keys(result1.index)
            const keys2 = Object.keys(result2.index)
            expect(keys1[0]).to.equal('0:1')
            expect(keys2[0]).to.equal('18:1')
        })

        it('index should be recursive', () => {

            const tree = new DepthTree(Board.setup(), White, [1, 1, 1, 1]).build()
            const sorter = (a, b) => a.localeCompare(b)
            const result = tree.serialize(sorter)

            const base1_exp = tree.index
            const keys1_exp = Object.keys(base1_exp).sort(sorter)

            const base1 = result.index
            const keys1 = Object.keys(base1)

            expect(JSON.stringify(keys1)).to.equal(JSON.stringify(keys1_exp))


            const base2_exp = base1_exp[keys1[0]].index
            const keys2_exp = Object.keys(base2_exp).sort(sorter)

            const base2 = base1[keys1[0]].index
            const keys2 = Object.keys(base2)

            expect(JSON.stringify(keys2)).to.equal(JSON.stringify(keys2_exp))


            const base3_exp = base2_exp[keys2[0]].index
            const keys3_exp = Object.keys(base3_exp).sort(sorter)

            const base3 = base2[keys2[0]].index
            const keys3 = Object.keys(base3)

            expect(JSON.stringify(keys3)).to.equal(JSON.stringify(keys3_exp))


            const base4_exp = base3_exp[keys3[0]].index
            const keys4_exp = Object.keys(base4_exp).sort(sorter)

            const base4 = base3[keys3[0]].index
            const keys4 = Object.keys(base4)

            expect(JSON.stringify(keys4)).to.equal(JSON.stringify(keys4_exp))
        })
    })

    describe('DeviantBuilder', () => {

        class DeviantBuilder extends DepthBuilder {
            buildSequences(faces) {
                return this.deviantSequences
            }
            newTree(...args) {
                return new DeviantTree(...args)
            }
            //buildTrees() {
            //    const trees = super.buildTrees()
            //    this.initialTreeCount = trees.length
            //    return trees
            //}
        }

        class DeviantTree extends DepthTree {
            constructor(board, color, sequence) {
                super(board, color, [1, 2])
                this.sequence = sequence
            }
        }

        it('test white win on deviant roll 3, 6, 2', () => {
            const board = Board.fromStateString(States.WhiteWin362)
            const turn = new Turn(board, White)
            const builder = new DeviantBuilder(turn)
            builder.deviantSequences = [
                [2, 3, 6],
                [2, 6, 3],
                [3, 2, 6],
                [3, 6, 2],
                [6, 2, 3],
                [6, 3, 2]
            ]
            builder.compute()
            expect(builder.maxDepth).to.equal(3)
            //expect(builder.initialTreeCount).to.equal(6)
            expect(builder.trees).to.have.length(6)
            // some will be non-winners
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

                // check deep equivalence of index
                const ser1 = SequenceTree.serializeIndex(t1.allowedMoveIndex, (a, b) => b.localeCompare(a))
                const ser2 = SequenceTree.serializeIndex(t2.allowedMoveIndex, (a, b) => b.localeCompare(a))
                expect(JSON.stringify(ser1)).to.equal(JSON.stringify(ser2))

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

                const {allRolls} = Rolls
                //const allRolls = [[2, 3]]
                allRolls.forEach(roll => {

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

                const rolls = Rolls.rolls

                var game1
                var game2

                before(() => {
                    var rollIndex1 = 1
                    var rollIndex2 = 1
                    const roller1 = () => rolls[rollIndex1++]
                    const roller2 = () => rolls[rollIndex2++]
                    game1 = new Game({roller: roller1})
                    game2 = new Game({roller: roller2, breadthTrees: true})
                })

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

                Util.intRange(2, 60).forEach(i => {
                    it('should be equivalent at turn ' + i + ' for roll ' + rolls[i].join(','), () => {
                        
                        const turns = [game1.nextTurn().roll(), game2.nextTurn().roll()]
                        checkEquivalence(...turns)
                        if (i == 29) {
                            //console.log(turns[0].color)
                            //console.log(turns[0].startState)
                            //console.log(turns[0].dice)
                            //console.log(turns[0].allowedMoveIndex)
                        }
                        playTurns(...turns)
                    })
                })

                it('games should be finished and Red should win', () => {
                    game1.checkFinished()
                    game2.checkFinished()
                    expect(game1.isFinished).to.equal(true)
                    expect(game2.isFinished).to.equal(true)
                    expect(game1.getWinner()).to.equal(game2.getWinner())
                    expect(game1.getWinner()).to.equal(Red)
                })
            })
        })
    })
})