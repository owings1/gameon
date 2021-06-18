const Test = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    normState,
    States,
    States28
} = Test

const Constants   = requireSrc('lib/constants')
const Coordinator = requireSrc('lib/coordinator')
const Core  = requireSrc('lib/core')
const Robot = requireSrc('robot/player')
const Util  = requireSrc('lib/util')

const {ConfidenceRobot} = Robot

const {White, Red} = Constants
const {Game, Match, Dice} = Core

var game
var robot

var rolls
var roller

function doFirstTurn() {
    makeRandomMoves(game.firstTurn(), true)
}

function getRobot(...args) {
    return ConfidenceRobot.getDefaultInstance(...args)
}

beforeEach(() => {
    rolls = [[1, 2]]
    roller = () => rolls.shift() || Dice.rollTwo()
    game = new Game({roller})
})

afterEach(async () => {
    if (robot) {
        await robot.destroy()
    }
})

describe('Robot', () => {

    beforeEach(() => {
        robot = new Robot.Robot(White)
    })

    describe('#getMoves', () => {

        it('should throw NotImplemented', async () => {
            const err = await getErrorAsync(() => robot.getMoves())
            expect(err.message).to.equal('NotImplemented')
        })
    })

    describe('#meta', () => {

        it('should say isRobot', () => {
            const result = robot.meta()
            expect(result.isRobot).to.equal(true)
        })
    })

    describe('#playRoll', () => {
        it('should pass for isCantMove', async () => {
            // hack a turn
            const turn = {isCantMove: true}
            await robot.playRoll(turn)
        })
    })
})

describe('ConfidenceRobot', () => {


    beforeEach(() => robot = new ConfidenceRobot(White))

    describe('#getClassMeta', () => {

        it('should throw InvalidRobotError for MyUnknown', () => {
            const err = getError(() => ConfidenceRobot.getClassMeta('MyUnknown'))
            expect(err.name).to.equal('InvalidRobotError')
        })
    })

    describe('#getMoves', () => {

        it('should return empty array for isCantMove', async () => {
            // hack a turn
            const turn = {isCantMove: true}
            const result = await robot.getMoves(turn)
            expect(result).to.have.length(0)
        })

        it('should throw UndecidedMoveError when moves are empty', async () => {
            robot.getRankings = () => []
            // hack a turn
            const turn = {isRolled: true}
            const err = await getErrorAsync(() => robot.getMoves(turn))
            expect(err.name).to.equal('UndecidedMoveError')
        })

        it('should throw HasNotRolledError when isRolled=false', async () => {
            doFirstTurn()
            const err = await getErrorAsync(() => robot.getMoves(game.nextTurn(), game))
            expect(err.name).to.equal('HasNotRolledError')
        })
    })

    describe('#getRankings', () => {

        it('should throw NotImplemented for base class', async () => {
            const err = await getErrorAsync(() => robot.getRankings())
            expect(err.message).to.equal('NotImplemented')
        })
    })

    describe('#getVersionInstance', () => {

        it('should throw InvalidRobotVersionError for RandomRobot vUnknown', () => {
            const err = getError(() => ConfidenceRobot.getVersionInstance('RandomRobot', 'vUnknown', White))
            expect(err.name).to.equal('InvalidRobotVersionError')
        })
    })
})

describe('RandomRobot', () => {

    beforeEach(() => {
        robot = getRobot('RandomRobot', White)
    })

    describe('#playRoll', () => {

        it('should play legal move for first roll 6,1', async () => {
            rolls = [[6, 1]]
            const turn = game.firstTurn()
            await robot.playRoll(turn, game)
            turn.finish()
        })
    })

    describe('v2', () => {

        beforeEach(() => {
            robot = ConfidenceRobot.getVersionInstance('RandomRobot', 'v2', White)
        })

        it('should get rankings', async () => {
            rolls = [[6, 2]]
            const turn = game.firstTurn()
            const rankings = await robot.getRankings(turn, game)
            expect(Object.keys(rankings).length).to.equal(turn.allowedEndStates.length)
        })
    })
})

describe('BearoffRobot', () => {


    beforeEach(() => {
        robot = getRobot('BearoffRobot', White)
        doFirstTurn()
    })

    describe('#getRankings', () => {

        it('should return 0 rankings when cannot bear off', async () => {
            const turn = game.nextTurn().roll()
            const result = await robot.getRankings(turn, game)
            expect(result).to.equal(robot.constructor.ZERO_SCORES)
        })

        it('should rank Bearoff1Best best for Bearoff1Start with 5,3', async () => {
            game.board.setStateString(States.Bearoff1Start)
            const turn = game.nextTurn()
            turn.setRoll([5, 3])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.Bearoff1Best]).to.equal(maxRank)
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
            expect(result[States28.Bearoff2Best]).to.equal(maxRank)
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

        it('should not care about points covered when game is still engaged for Bearoff3Start with 4,1', async () => {
            game.board.setStateString(States.Bearoff3Start)
            const turn = game.nextTurn().setRoll(4, 1)
            const result = await robot.getRankings(turn, game)
            
            expect(result[States28.Bearoff3End1]).to.equal(result[States28.Bearoff3End2])
        })

        it('should take one home for Bearoff4Start even though may not yet bear off with 6,4', async () => {
            game.board.setStateString(States.Bearoff4Start)
            const turn = game.nextTurn().setRoll(6, 4)
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.Bearoff4Best]).to.equal(maxRank)
            expect(result[States28.Bearoff4Best]).to.be.greaterThan(result[States28.Bearoff4Bad])
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

    beforeEach(() => {
        robot = getRobot('FirstTurnRobot', White)
    })

    describe('MoveIndex', () => {
        it('should have move index for both red and white', () => {
            const FirstTurnRobot = ConfidenceRobot.getClassDefault('FirstTurnRobot')
            const moveIndex = FirstTurnRobot.getFirstTurnMoveIndex()
            const keys = Object.keys(moveIndex)
            expect(keys).to.contain(Red)
            expect(keys).to.contain(White)
            //console.log(moveIndex.White)
            //console.log(moveIndex.Red)
        })
    })
    describe('#getRankings', () => {

        it('should return all end states for 4th turn', async () => {
            rolls = [[1, 2]]
            makeRandomMoves(game.firstTurn(), true)
            game.nextTurn().roll()
            makeRandomMoves(game.thisTurn, true)
            game.nextTurn().roll()
            makeRandomMoves(game.thisTurn, true)
            const turn = game.nextTurn()
            turn.roll()
            const result = await robot.getRankings(turn, game)
            expect(result).to.equal(robot.constructor.ZERO_SCORES)
        })

        // implementation has changed
        it.skip('should throw non illegal move error on second turn', async () => {
            const e = new Error
            rolls = [[1, 2]]
            makeRandomMoves(game.firstTurn(), true)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            robot.pointMoves = () => { throw e }
            const err = await getErrorAsync(() => robot.getRankings(turn, game))
            expect(err).to.equal(e)
        })

        it('should not try an illegal move on second turn and return all 0 rankings', async () => {
            rolls = [[1, 6]]
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
                rolls = [dice]
                const turn = game.firstTurn()
                await robot.playRoll(turn, game)
            })
        })
    })

    // obsolete
    describe.skip('#pointMoves', () => {

        it('should throw UndecidedMoveError for doubles', async () => {
            const err = await getErrorAsync(() => robot.pointMoves([2, 2]))
            expect(err.name).to.equal('UndecidedMoveError')
        })
    })
})

describe('HittingRobot', () => {

    beforeEach(() => {
        robot = getRobot('HittingRobot', White)
        doFirstTurn()
    })

    describe('#getRankings', () => {

        it('should rank HittingCase1Best for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.HittingCase1Best]).to.equal(maxRank)
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
            expect(result[States28.HittingCase1Bad]).to.equal(0)
        })

        it('should rank HittingCase1Med > 0 and < 1 for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States28.HittingCase1Med]).to.be.greaterThan(0)
            expect(result[States28.HittingCase1Med]).to.be.lessThan(1)
        })
    })
})

describe('OccupyRobot', () => {

    beforeEach(() => {
        robot = getRobot('OccupyRobot', White)
        doFirstTurn()
    })

    describe('#getRankings', () => {

        it('should rank OccupyCase1Best best for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.OccupyCase1Best]).to.equal(maxRank)
        })

        it('should rank OccupyCase1Best value 1 for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States28.OccupyCase1Best]).to.equal(1)
        })

        it('should rank OccupyCase1Bad value 0 for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States28.OccupyCase1Bad]).to.equal(0)
        })
    })
})

describe('PrimeRobot', () => {

    beforeEach(() => {
        robot = getRobot('PrimeRobot', White)
        doFirstTurn()
    })

    describe('#getRankings', () => {

        it('should rank PrimeCase1Best best for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.PrimeCase1Best]).to.equal(maxRank)
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
            expect(result[States28.PrimeCase1Bad]).to.equal(0)
        })

        it('should rank PrimeCase1Med > 0 and < 1 for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States28.PrimeCase1Med]).to.be.greaterThan(0)
            expect(result[States28.PrimeCase1Med]).to.be.lessThan(1)
        })
    })
})

describe('SafetyRobot', () => {

    beforeEach(() => {
        robot = getRobot('SafetyRobot', White)
        doFirstTurn()
    })

    describe('#getRankings', () => {

        it('should rank SafetyCase1Best best for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.SafetyCase1Best]).to.equal(maxRank)
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
            expect(result[States28.SafetyCase1Bad]).to.equal(0)
        })

        it('should rank SafetyCase1Med > 0 and < 1 for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getRankings(turn, game)
            expect(result[States28.SafetyCase1Med]).to.be.greaterThan(0)
            expect(result[States28.SafetyCase1Med]).to.be.lessThan(1)
        })
    })
})

describe('RobotDelegator', () => {

    var rando

    beforeEach(() => {
        robot = new Robot.RobotDelegator(White)
        rando = getRobot('RandomRobot', White)
    })

    afterEach(async () => {
        await rando.destroy()
    })

    describe('#addDelegate', () => {

        it('should throw InvalidRobotError if for base Robot', async () => {
            const baseRobot = new Robot.Robot(White)
            const err = getError(() => robot.addDelegate(baseRobot, 0, 0))
            await baseRobot.destroy()
            expect(err.name).to.equal('InvalidRobotError')
        })
    })

    describe('#getMoves', () => {

        it('should throw NoDelegatesError with empty delegates', async () => {
            const err = await getErrorAsync(() => robot.getMoves())
            expect(err.name).to.equal('NoDelegatesError')
        })

        it('should return empty for turn isCantMove', async () => {
            robot.addDelegate(rando, 1, 0)
            // fake a turn
            const turn = {isCantMove: true}
            const result = await robot.getMoves(turn)
            expect(result).to.have.length(0)
        })

        it('should throw HasNotRolledError if not rolled', async () => {
            robot.addDelegate(rando, 1, 0)
            doFirstTurn()
            const err = await getErrorAsync(() => robot.getMoves(game.nextTurn(), game))
            expect(err.name).to.equal('HasNotRolledError')
        })

        it('should warn when delegate sets a score less than 0', async () => {
            var msg = ''
            robot.logger.warn = (...args) => msg += args.join(' ')
            rando.getRankings = turn => {
                const rankings = rando.zeroRankings(turn)
                const key = Object.keys(rankings).pop()
                rankings[key] = -1
                return rankings
            }
            rolls = [[1, 2]]
            makeRandomMoves(game.firstTurn(), true)
            robot.addDelegate(rando, 1, 0)
            const turn = game.nextTurn()
            turn.roll()
            const result = await robot.getMoves(turn, game)
            expect(msg).to.equal('RandomRobot gave score -1')
            expect(msg).to.have.length.greaterThan(0)
        })

        it('should throw UndecidedMoveError when delegate ranks invalid state highest', async () => {
            robot.addDelegate(rando, 1, 0)
            rando.getRankings = turn => {
                return {invalidStr: 1}
            }
            doFirstTurn()
            const turn = game.nextTurn()
            turn.roll()
            robot.logger.loglevel = -1
            const err = await getErrorAsync(() => robot.getMoves(turn, game))
            expect(err.name).to.equal('UndecidedMoveError')
        })
    })

    describe('#meta', () => {

        it('should have delegates length 1', () => {
            robot.addDelegate(rando, 1, 0)
            const result = robot.meta()
            expect(result.delegates).to.have.length(1)
        })
    })

    describe('#validateWeight', () => {

        it('should throw InvalidWeightError for string', () => {
            const err = getError(() => robot.validateWeight('1'))
            expect(err.name).to.equal('InvalidWeightError')
        })

        it('should throw InvalidWeightError for NaN', () => {
            const err = getError(() => robot.validateWeight(NaN))
            expect(err.name).to.equal('InvalidWeightError')
        })

        it('should throw InvalidWeightError for Infinity', () => {
            const err = getError(() => robot.validateWeight(Infinity))
            expect(err.name).to.equal('InvalidWeightError')
        })

        it('should throw InvalidWeightError for -Infinity', () => {
            const err = getError(() => robot.validateWeight(-Infinity))
            expect(err.name).to.equal('InvalidWeightError')
        })
    })
})

describe('BestRobot', () => {

    function newBestRobot(...args) {
        return Robot.RobotDelegator.forDefaults(...args)
    }

    it('should run a match', async function() {
        this.timeout(20000)
        const coordinator = new Coordinator
        const players = [newBestRobot(White), newBestRobot(Red)]
        const match = new Match(1)
        await coordinator.runMatch(match, ...players)
        await players[0].destroy()
        await players[1].destroy()
    })
})