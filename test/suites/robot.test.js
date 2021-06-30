/**
 * gameon - test suite - robots
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
const Test = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    noop,
    randomElement,
    requireSrc,
    normState,
    States,
    States28
} = Test

const path = require('path')
const {resolve} = path

const Constants   = requireSrc('lib/constants')
const Coordinator = requireSrc('lib/coordinator')
const Core  = requireSrc('lib/core')
const Robot = requireSrc('robot/player')
const Util  = requireSrc('lib/util')

const {ConfidenceRobot} = Robot

const {White, Red} = Constants
const {Game, Match, Turn, Board, Dice} = Core

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

    describe('#decideDouble', () => {

        it('should accept double by default', async () => {
            const turn = new Turn(Board.setup(), Red)
            turn.setDoubleOffered()
            await robot.decideDouble(turn)
            expect(turn.isDoubleDeclined).to.equal(false)
        })

        it('should not accept double when shouldAcceptDouble=fa;se', async () => {
            const turn = new Turn(Board.setup(), Red)
            robot.shouldAcceptDouble = () => false
            turn.setDoubleOffered()
            await robot.decideDouble(turn)
            expect(turn.isDoubleDeclined).to.equal(true)
        })
    })

    describe('#getMoves', () => {

        it('should throw NotImplemented', async () => {
            const err = await getErrorAsync(() => robot.getMoves())
            expect(err.name).to.equal('NotImplementedError')
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

    describe('#turnOption', () => {

        it('should not double by default', async () => {
            const turn = new Turn(Board.setup(), White)
            await robot.turnOption(turn)
            expect(turn.isDoubleOffered).to.equal(false)
        })

        it('should not double when shouldDouble returns true', async () => {
            const turn = new Turn(Board.setup(), White)
            robot.shouldDouble = () => true
            await robot.turnOption(turn)
            expect(turn.isDoubleOffered).to.equal(true)
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
            robot.getScores = () => []
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

    describe('#getScores', () => {

        it('should throw NotImplemented for base class', async () => {
            const err = await getErrorAsync(() => robot.getScores())
            expect(err.name).to.equal('NotImplementedError')
        })
    })

    describe('#getVersionInstance', () => {

        it('should throw InvalidRobotVersionError for RandomRobot vUnknown', () => {
            const err = getError(() => ConfidenceRobot.getVersionInstance('RandomRobot', 'vUnknown', White))
            expect(err.name).to.equal('InvalidRobotVersionError')
        })
    })

    describe('#shouldDouble', () => {

        it('should return false', async () => {
            const res = await robot.shouldDouble()
            expect(res).to.equal(false)
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

        it('should get scores', async () => {
            rolls = [[6, 2]]
            const turn = game.firstTurn()
            const scores = await robot.getScores(turn, game)
            expect(Object.keys(scores).length).to.equal(turn.allowedEndStates.length)
        })
    })
})

describe('BearoffRobot', () => {


    beforeEach(() => {
        robot = getRobot('BearoffRobot', White)
        doFirstTurn()
    })

    describe('#getScores', () => {

        it('should return 0 scores when cannot bear off', async () => {
            const turn = game.nextTurn().roll()
            const result = await robot.getScores(turn, game)
            expect(result).to.equal(robot.constructor.ZERO_SCORES)
        })

        it('should score Bearoff1Best best for Bearoff1Start with 5,3', async () => {
            game.board.setStateString(States.Bearoff1Start)
            const turn = game.nextTurn()
            turn.setRoll([5, 3])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.Bearoff1Best]).to.equal(maxRank)
        })

        it('should score only one best for Bearoff1Start with 5,3', async () => {
            game.board.setStateString(States.Bearoff1Start)
            const turn = game.nextTurn()
            turn.setRoll([5, 3])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should score Bearoff2Best best for Bearoff2Start with 1,3', async () => {
            game.board.setStateString(States.Bearoff2Start)
            const turn = game.nextTurn()
            turn.setRoll([1, 3])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.Bearoff2Best]).to.equal(maxRank)
        })

        it('should score only one best for Bearoff2Start with 1,3', async () => {
            game.board.setStateString(States.Bearoff2Start)
            const turn = game.nextTurn()
            turn.setRoll([1, 3])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should not care about points covered when game is still engaged for Bearoff3Start with 4,1', async () => {
            game.board.setStateString(States.Bearoff3Start)
            const turn = game.nextTurn().setRoll(4, 1)
            const result = await robot.getScores(turn, game)
            
            expect(result[States28.Bearoff3End1]).to.equal(result[States28.Bearoff3End2])
        })

        it('should take one home for Bearoff4Start even though may not yet bear off with 6,4', async () => {
            game.board.setStateString(States.Bearoff4Start)
            const turn = game.nextTurn().setRoll(6, 4)
            const result = await robot.getScores(turn, game)
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
    describe('#getScores', () => {

        it('should return all end states for 4th turn', async () => {
            rolls = [[1, 2]]
            makeRandomMoves(game.firstTurn(), true)
            game.nextTurn().roll()
            makeRandomMoves(game.thisTurn, true)
            game.nextTurn().roll()
            makeRandomMoves(game.thisTurn, true)
            const turn = game.nextTurn()
            turn.roll()
            const result = await robot.getScores(turn, game)
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
            const err = await getErrorAsync(() => robot.getScores(turn, game))
            expect(err).to.equal(e)
        })

        it('should not try an illegal move on second turn and return all 0 scores', async () => {
            rolls = [[1, 6]]
            const firstTurn = game.firstTurn()
            firstTurn.move(12, 6)
            firstTurn.move(7, 1)
            firstTurn.finish()
            const turn = game.nextTurn()
            turn.setRoll([6, 5])
            const result = await robot.getScores(turn, game)
            const uniqueVals = Util.uniqueInts(Object.values(result))
            expect(uniqueVals).to.jsonEqual([0])
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

    describe('#getScores', () => {

        it('should score HittingCase1Best for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.HittingCase1Best]).to.equal(maxRank)
        })

        it('should score only one best for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should score HittingCase1Bad 0 for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            expect(result[States28.HittingCase1Bad]).to.equal(0)
        })

        it('should score HittingCase1Med > 0 and < 1 for HittingCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.HittingCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
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

    describe('#getScores', () => {

        it('should score OccupyCase1Best best for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.OccupyCase1Best]).to.equal(maxRank)
        })

        it('should score OccupyCase1Best value 1 for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            expect(result[States28.OccupyCase1Best]).to.equal(1)
        })

        it('should score OccupyCase1Bad value 0 for OccupyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.OccupyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            expect(result[States28.OccupyCase1Bad]).to.equal(0)
        })
    })
})

describe('PrimeRobot', () => {

    beforeEach(() => {
        robot = getRobot('PrimeRobot', White)
        doFirstTurn()
    })

    describe('#getScores', () => {

        it('should score PrimeCase1Best best for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.PrimeCase1Best]).to.equal(maxRank)
        })

        it('should score only one best for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should score PrimeCase1Bad 0 for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            expect(result[States28.PrimeCase1Bad]).to.equal(0)
        })

        it('should score PrimeCase1Med > 0 and < 1 for PrimeCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.PrimeCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
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

    describe('#getScores', () => {

        it('should score SafetyCase1Best best for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            expect(result[States28.SafetyCase1Best]).to.equal(maxRank)
        })

        it('should score only one best for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            const maxRank = Math.max(...Object.values(result))
            const bests = turn.allowedEndStates.filter(str => result[str] == maxRank)
            expect(bests).to.have.length(1)
        })

        it('should score SafetyCase1Bad 0 for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            expect(result[States28.SafetyCase1Bad]).to.equal(0)
        })

        it('should score SafetyCase1Med > 0 and < 1 for SafetyCase1Start for 2,1 roll', async () => {
            game.board.setStateString(States.SafetyCase1Start)
            const turn = game.nextTurn()
            turn.setRoll([2, 1])
            const result = await robot.getScores(turn, game)
            expect(result[States28.SafetyCase1Med]).to.be.greaterThan(0)
            expect(result[States28.SafetyCase1Med]).to.be.lessThan(1)
        })
    })

    describe('v3', () => {

        describe('coverage', () => {

            it('getScores', async () => {
                const robot = ConfidenceRobot.getVersionInstance('SafetyRobot', 'v3', White)
                const turn = game.nextTurn().roll()
                await robot.getScores(turn, game)
                await robot.destroy()
            })
        })
    })
})

describe('DoubleRobot', () => {

    beforeEach(() => {
        robot = getRobot('DoubleRobot', White)
        doFirstTurn()
    })

    it('should not double after first turn', async () => {
        const turn = game.nextTurn()
        const res = await robot.shouldDouble(turn, game)
        expect(res).to.equal(false)
    })

    it('should accept double one third turn', async () => {
        makeRandomMoves(game.nextTurn().roll(), true)
        const turn = game.nextTurn()
        const res = await robot.shouldAcceptDouble(turn, game)
        expect(res).to.equal(true)
    })

    describe('coverage', () => {
        it('getScores', async () => {
            await robot.getScores()
        })
    })
})

describe('RobotDelegator', () => {

    var rando
    var always
    var never

    class AlwaysDoubleRobot extends ConfidenceRobot {
        async getScores() {
            return ConfidenceRobot.ZERO_SCORES
        }
        async getDoubleConfidence() {
            return 1
        }
        async getAcceptDoubleConfidence() {
            return 1
        }
    }
    class NeverDoubleRobot extends ConfidenceRobot {
        async getScores() {
            return ConfidenceRobot.ZERO_SCORES
        }
        async getDoubleConfidence() {
            return 0
        }
        async getAcceptDoubleConfidence() {
            return 0
        }
    }

    beforeEach(() => {
        robot = new Robot.RobotDelegator(White)
        rando = getRobot('RandomRobot', White)
        always = new AlwaysDoubleRobot(White)
        never = new NeverDoubleRobot(White)
    })

    afterEach(async () => {
        await rando.destroy()
        await always.destroy()
        await never.destroy()
    })

    describe('#addDelegate', () => {

        it('should throw InvalidRobotError if for base Robot', async () => {
            const baseRobot = new Robot.Robot(White)
            const err = getError(() => robot.addDelegate(baseRobot, 0, 0))
            await baseRobot.destroy()
            expect(err.name).to.equal('InvalidRobotError')
        })
    })

    describe('#explainResult', () => {

        it('should return object with rankList and delegateList for lastResult with isStoreLastResult=true', async () => {
            const match = new Match(1, {roller: () => [6, 1]})
            const game = match.nextGame()
            const robot = Robot.RobotDelegator.forDefaults(White)
            try {
                robot.isStoreLastResult = true
                await robot.getMoves(game.firstTurn(), game, match)
                const res = robot.explainResult(robot.lastResult)
                const keys = Object.keys(res)
                expect(keys).to.contain('rankList')
                expect(keys).to.contain('delegateList')
            } finally {
                await robot.destroy()
            }
        })

        describe('coverage', () => {
            it('2x rando v3 zero scores', async () => {
                robot.addDelegate(ConfidenceRobot.getVersionInstance('RandomRobot', 'v3', White), 1, 0)
                robot.addDelegate(ConfidenceRobot.getVersionInstance('RandomRobot', 'v3', White), 1, 0)
                robot.isStoreLastResult = true
                const match = new Match(1, {roller: () => [6, 1]})
                const game = match.nextGame()
                await robot.getMoves(game.firstTurn(), game, match)
                const res = robot.explainResult(robot.lastResult)
            })
            it('sorters.rankListDelegates', () => {
                const sorter = Robot.RobotDelegator.Sorters.rankListDelegates
                const data = [
                    {name: 'a', rawScore: 1, weightedScore: 0.5},
                    {name: 'b', rawScore: 0.5, weightedScore: 0.5}
                ]
                data.sort(sorter)
            })
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
            rando.getScores = turn => {
                const scores = rando.zeroScores(turn)
                const key = Object.keys(scores).pop()
                scores[key] = -1
                return scores
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

        it('should throw UndecidedMoveError when delegate scores invalid state highest', async () => {
            robot.addDelegate(rando, 1, 0)
            rando.getScores = turn => {
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

    describe('#getDoubleConfidence', () => {

        it('should be 0.6 with always=0.6,never=0.4', async () => {
            robot.addDelegate(always, 0, 0.6)
            robot.addDelegate(never, 0, 0.4)
            const res = await robot.getDoubleConfidence()
            expect(res).to.equal(0.6)
        })
    })

    describe('#shouldAcceptDouble', () => {

        it('should accept with always=0.6,never=0.4', async () => {
            robot.addDelegate(always, 0, 0.6)
            robot.addDelegate(never, 0, 0.4)
            const res = await robot.shouldAcceptDouble()
            expect(res).to.equal(true)
        })

        it('should not accept with always=0.4,never=0.6', async () => {
            robot.addDelegate(always, 0, 0.4)
            robot.addDelegate(never, 0, 0.6)
            const res = await robot.shouldAcceptDouble()
            expect(res).to.equal(false)
        })

        it('should throw NoDelegatesError with no delegates', async () => {
            const err = await getErrorAsync(() => robot.shouldAcceptDouble())
            expect(err.name).to.equal('NoDelegatesError')
        })

        it('should return false for rando=0', async () => {
            robot.addDelegate(rando, 1, 0)
            const res = await robot.shouldAcceptDouble()
            expect(res).to.equal(true)
        })
    })

    describe('#shouldDouble', () => {

        it('should double with always=0.6,never=0.4', async () => {
            robot.addDelegate(always, 0, 0.6)
            robot.addDelegate(never, 0, 0.4)
            const res = await robot.shouldDouble()
            expect(res).to.equal(true)
        })

        it('should not double with always=0.4,never=0.6', async () => {
            robot.addDelegate(new AlwaysDoubleRobot, 0, 0.4)
            robot.addDelegate(never, 0, 0.6)
            const res = await robot.shouldDouble()
            expect(res).to.equal(false)
        })

        it('should throw NoDelegatesError with no delegates', async () => {
            const err = await getErrorAsync(() => robot.shouldDouble())
            expect(err.name).to.equal('NoDelegatesError')
        })

        it('should return false for rando=0', async () => {
            robot.addDelegate(rando, 1, 0)
            const res = await robot.shouldDouble()
            expect(res).to.equal(false)
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

describe('ProfileHelper', () => {

    const ProfileHelper = requireSrc('robot/profile')
    const {TableHelper} = requireSrc('term/tables')
    var helper

    beforeEach(() => {
        const opts = {numMatches: 1}
        helper = new ProfileHelper(opts)
        helper.logger.loglevel = 1
        helper.newTableHelper = (...args) => {
            const h = new TableHelper(...args)
            h.println = noop
            h.interactive = noop
            return h
        }
    })

    describe('#run', () => {

        it('should run with basic opts', async () => {
            await helper.run()
        })

        it('should run with match column', async () => {
            helper.opts.columns += ',match'
            await helper.run()
        })

        it('should run with breadthTrees', async () => {
            helper.opts.numMatches = 0
            helper.opts.breadthTrees = true
            await helper.run()
        })

        it('should run with filterRegex', async () => {
            helper.opts.numMatches = 0
            helper.opts.filterRegex = 'a'
            await helper.run()
        })

        it('should run with interactive', async () => {
            helper.opts.numMatches = 0
            helper.opts.interactive = true
            await helper.run()
        })

        it('should run with rollsFile', async () => {
            helper.opts.numMatches = 0
            helper.opts.rollsFile = resolve(__dirname, '../rolls.json')
            await helper.run()
        })
    })

    describe('#newTableHelper', () => {

        describe('coverage', () => {

            it('run', () => {
                new ProfileHelper().newTableHelper()
            })
        })
    })

    describe('#sortableColumns', () => {

        describe('coverage', () => {

            it('run', () => {
                ProfileHelper.sortableColumns()
            })
        })
    })
})