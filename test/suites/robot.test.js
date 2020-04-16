const Test = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    States
} = Test

const Core  = requireSrc('lib/core')
const Robot = requireSrc('robot/player')
const Util  = requireSrc('lib/util')

const {White, Red, Game} = Core

var game

beforeEach(() => {
    game = new Game
})

describe('Robot', () => {

    describe('#getMoves', () => {
        it('should throw NotImplemented', async () => {
            const robot = new Robot.Robot(White)
            const err = await getErrorAsync(() => robot.getMoves())
            expect(err.message).to.equal('NotImplemented')
        })
    })

    describe('#meta', () => {
        it('should say isRobot', () => {
            const robot = new Robot.Robot(White)
            const result = robot.meta()
            expect(result.isRobot).to.equal(true)
        })
    })
})

describe('RandomRobot', () => {

    var robot

    beforeEach(() => {
        robot = new Robot.RandomRobot(White)
    })

    describe('#playRoll', () => {

        it('should play legal move for first roll 6,1', async () => {
            game._rollFirst = () => [6, 1]
            const turn = game.firstTurn()
            await robot.playRoll(turn, game)
            turn.finish()
        })
    })
})

describe('BearoffRobot', () => {

    var robot

    beforeEach(() => {
        robot = new Robot.BearoffRobot(White)
        game._rollFirst = () => [1, 2]
        makeRandomMoves(game.firstTurn(), true)
    })

    describe('#getRankings', () => {

        it('should rank Bearoff1Best best for Bearoff1Start with 5,3', async () => {
            game.board.setStateString(States.Bearoff1Start)
            const turn = game.nextTurn()
            turn.setRoll([5, 3])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States.Bearoff1Best]).to.equal(maxRank)
        })

        it('should rank only one best for Bearoff1Start with 5,3', async () => {
            game.board.setStateString(States.Bearoff1Start)
            const turn = game.nextTurn()
            turn.setRoll([5, 3])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should rank Bearoff2Best best for Bearoff2Start with 1,3', async () => {
            game.board.setStateString(States.Bearoff2Start)
            const turn = game.nextTurn()
            turn.setRoll([1, 3])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States.Bearoff2Best]).to.equal(maxRank)
        })

        it('should rank only one best for Bearoff2Start with 1,3', async () => {
            game.board.setStateString(States.Bearoff2Start)
            const turn = game.nextTurn()
            turn.setRoll([1, 3])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })
    })
})

describe('FirstTurnRobot', () => {

    const firstRolls = [
        [6,1]
      , [5,1]
      , [4,1]
      , [3,1]
      , [2,1]
      , [6,2]
      , [5,2]
      , [4,2]
      , [3,2]
      , [6,3]
      , [5,3]
      , [4,3]
      , [6,4]
      , [5,4]
      , [6,5]
    ]

    var robot

    beforeEach(() => {
        robot = new Robot.FirstTurnRobot(White)
    })

    describe('#getRankings', () => {

        it('should return all end states for 4th turn', async () => {
            game._rollFirst = () => [1, 2]
            makeRandomMoves(game.firstTurn(), true)
            game.nextTurn().roll()
            makeRandomMoves(game.thisTurn, true)
            game.nextTurn().roll()
            makeRandomMoves(game.thisTurn, true)
            const turn = game.nextTurn()
            turn.roll()
            const result = await robot.getRankings(turn, game)
            const keysActual = Object.keys(result).sort()
            const keysExp = turn.allowedEndStates.slice(0).sort()
            expect(JSON.stringify(keysActual)).to.equal(JSON.stringify(keysExp))
        })

        it('should throw non illegal move error on second turn', async () => {
            const e = new Error
            game._rollFirst= () => [1, 2]
            makeRandomMoves(game.firstTurn(), true)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            robot.pointMoves = () => { throw e }
            const err = await getErrorAsync(() => robot.getRankings(turn, game))
            expect(err).to.equal(e)
        })

        it('should catch illegal move error on second turn and return all 0 rankings', async () => {
            game._rollFirst = () => [1, 6]
            const firstTurn = game.firstTurn()
            firstTurn.move(12, 6)
            firstTurn.move(7, 1)
            firstTurn.finish()
            const turn = game.nextTurn()
            turn.setRoll([6, 5])
            const result = await robot.getRankings(turn, game)
            const uniqueVals = Util.uniqueInts(Object.values(result))
            expect(JSON.stringify(uniqueVals)).to.equal(JSON.stringify([0]))
        })
    })

    describe('#playRoll', () => {

        firstRolls.forEach(dice => {
            it('should have valid move for ' + dice.join(), async () => {
                game._rollFirst = () => dice
                const turn = game.firstTurn()
                await robot.playRoll(turn, game)
            })
        })
    })

    describe('#pointMoves', () => {

        it('should throw UndecidedMoveError for doubles', async () => {
            const err = await getErrorAsync(() => robot.pointMoves([2, 2]))
            expect(err.name).to.equal('UndecidedMoveError')
        })
    })
})

describe('HittingRobot', () => {

    var robot

    beforeEach(() => {
        robot = new Robot.HittingRobot(White)
        game._rollFirst = () => [1, 2]
        makeRandomMoves(game.firstTurn(), true)
    })

    describe('#getRankings', () => {

        it('should rank HittingCase1Best for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States.HittingCase1Best]).to.equal(maxRank)
        })

        it('should rank only one best for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should rank HittingCase1Bad 0 for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.HittingCase1Bad]).to.equal(0)
        })

        it('should rank HittingCase1Med > 0 and < 1 for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.HittingCase1Med]).to.be.greaterThan(0)
            expect(result[States.HittingCase1Med]).to.be.lessThan(1)
        })
    })
})

describe('OccupyRobot', () => {

    var robot

    beforeEach(() => {
        robot = new Robot.OccupyRobot(White)
        game._rollFirst = () => [1, 2]
        makeRandomMoves(game.firstTurn(), true)
    })

    describe('#getRankings', () => {

        it('should rank OccupyCase1Best best for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States.OccupyCase1Best]).to.equal(maxRank)
        })

        it('should rank OccupyCase1Best value 1 for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.OccupyCase1Best]).to.equal(1)
        })

        it('should rank OccupyCase1Bad value 0 for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.OccupyCase1Bad]).to.equal(0)
        })
    })
})

describe('PrimeRobot', () => {

    var robot

    beforeEach(() => {
        robot = new Robot.PrimeRobot(White)
        game._rollFirst = () => [1, 2]
        makeRandomMoves(game.firstTurn(), true)
    })

    describe('#getRankings', () => {

        it('should rank PrimeCase1Best best for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States.PrimeCase1Best]).to.equal(maxRank)
        })

        it('should rank only one best for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should rank PrimeCase1Bad 0 for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.PrimeCase1Bad]).to.equal(0)
        })

        it('should rank PrimeCase1Med > 0 and < 1 for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.PrimeCase1Med]).to.be.greaterThan(0)
            expect(result[States.PrimeCase1Med]).to.be.lessThan(1)
        })
    })
})

describe('SafetyRobot', () => {

    var robot

    beforeEach(() => {
        robot = new Robot.SafetyRobot(White)
        game._rollFirst = () => [1, 2]
        makeRandomMoves(game.firstTurn(), true)
    })

    describe('#getRankings', () => {

        it('should rank SafetyCase1Best best for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States.SafetyCase1Best]).to.equal(maxRank)
        })

        it('should rank only one best for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should rank SafetyCase1Bad 0 for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.SafetyCase1Bad]).to.equal(0)
        })

        it('should rank SafetyCase1Med > 0 and < 1 for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States.SafetyCase1Med]).to.be.greaterThan(0)
            expect(result[States.SafetyCase1Med]).to.be.lessThan(1)
        })
    })
})
