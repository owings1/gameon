const Core   = require('../lib/core')
const Base   = require('../lib/player')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const {Board, BoardAnalyzer, Opponent} = Core
const {merge} = Util

class Robot extends Base {

    constructor(...args) {
        super(...args)
        this.isRobot = true
    }

    async playRoll(turn, game, match) {
        if (turn.isCantMove) {
            return
        }
        const moves = await this.getMoves(turn, game, match)
        for (var move of moves) {
            turn.move(move)
        }
    }

    async getMoves(turn, game, match) {
        throw new Error('NotImplemented')
    }

    meta() {
        return merge(super.meta(), {isRobot: this.isRobot})
    }
}

class ConfidenceRobot extends Robot {

    constructor(...args) {
        super(...args)
        this.isConfidenceRobot = true
    }

    // for compatibility to be used as a standalone robot player
    async getMoves(turn, game, match) {
        if (turn.isCantMove) {
            return []
        }
        const rankings = await this.getRankings(turn, game, match)
        if (rankings.length == 0) {
            throw new UndecidedMoveError('No moves returned from getRankings')
        }
        const maxRank = Math.max(...Object.values(rankings))
        const stateString = Object.keys(rankings).find(str => rankings[str] == maxRank)
        return turn.endStatesToSeries[stateString]
    }

    // {stateString -> weight}
    // where 0 <= weight <= 1
    async getRankings(turn, game, match) {
        throw new Error('NotImplemented')
    }
}

class RobotDelegator extends Robot {

    constructor(...args) {
        super(...args)
        this.delegates = []
        this.logger = new Logger
    }

    addDelegate(robot, weight) {
        if (!robot.isConfidenceRobot) {
            throw new InvalidRobotError('Delegate is not a Confidence Robot')
        }
        if (typeof(weight) != 'number' || isNaN(weight) || weight == Infinity) {
            throw new InvalidWeightError('Invalid weight for delegate')
        }
        this.delegates.push({robot, weight})
    }

    async getMoves(turn, game, match) {
        if (this.delegates.length == 0) {
            throw new NoDelegatesError('No delegates to consult')
        }
        if (turn.isCantMove) {
            return []
        }
        // [{robot, weight, rankings}]
        const delegates = []
        for (var delegate of this.delegates) {
            delegates.push({
                ...delegate
              , rankings: await delegate.robot.getRankings(turn, game, match)
            })
        }
        const rankings = {}
        delegates.forEach(delegate => {
            Object.entries(delegate.rankings).forEach(([endState, localWeight]) => {
                if (!(endState in rankings)) {
                    rankings[endState] = 0
                }
                if (localWeight > 1 || localWeight < 0) {
                    this.logger.warn(delegate.robot.name, 'gave weight', localWeight)
                }
                this.logger.debug({localWeight, robot: delegate.robot.name})
                rankings[endState] += localWeight * delegate.weight
            })
        })
        const maxWeight = Math.max(...Object.values(rankings))
        //this.logger.debug({rankings, maxWeight})
        const stateString = turn.allowedEndStates.find(endState => rankings[endState] == maxWeight)
        const moves = turn.endStatesToSeries[stateString]
        if (!moves) {
            this.logger.error({maxWeight, rankings, stateString, allowedEndStates: turn.allowedEndStates})
            throw new UndecidedMoveError('Cannot find moves among delegates')
        }
        return moves
    }

    async destroy() {
        await Promise.all([super.destroy()].concat(this.delegates.map(delegate =>
            delegate.robot.destroy()
        )))
        this.delegates = null
    }

    meta() {
        return merge(super.meta(), {
            delegates : this.delegates.map(({robot, weight}) => merge({weight}, robot.meta()))
        })
    }
}

class BestRobot extends RobotDelegator {

    constructor(...args) {
        super(...args)
        this.addDelegate(new FirstTurnRobot(...args), 10)
        this.addDelegate(new PrimeRobot(...args), 6)
        this.addDelegate(new OccupyRobot(...args), 5)
        this.addDelegate(new SafetyRobot(...args), 4)
        this.addDelegate(new HittingRobot(...args), 4)
        this.addDelegate(new RandomRobot(...args), 1)
    }
}

class RandomRobot extends ConfidenceRobot {

    async getRankings(turn, game, match) {
        // fixed weight
        const weight = 1 / turn.allowedEndStates.length
        const rankings = {}
        turn.allowedEndStates.forEach(stateString => rankings[stateString] = weight)
        return rankings
    }
}

class FirstTurnRobot extends ConfidenceRobot {

    async getRankings(turn, game, match) {
        const rankings = {}
        turn.allowedEndStates.forEach(stateString => rankings[stateString] = 0)
        if (game.turns.length > 2 || turn.dice[0] == turn.dice[1]) {
            return rankings
        }
        const board = turn.board.copy()
        try {
            this.pointMoves(turn.diceSorted).forEach(({point, face}) => {
                board.move(turn.color, turn.originForPoint(point), face)
            })
            rankings[board.stateString()] = 1 / game.turns.length
        } catch (err) {
            if (turn.isFirstTurn || !err.isIllegalMoveError) {
                throw err
            }
        }
        return rankings
    }

    pointMoves(diceSorted) {
        switch (diceSorted.join()) {
            case '6,1':
                return [{point: 13, face: 6}, {point: 8, face: 1}]
            case '5,1':
                return [{point: 13, face: 5}, {point: 24, face: 1}]
            case '4,1':
                return [{point: 24, face: 4}, {point: 24, face: 1}]
            case '3,1':
                return [{point: 8, face: 3}, {point: 6, face: 1}]
            case '2,1':
                return [{point: 13, face: 2}, {point: 24, face: 1}]
            case '6,2':
                return [{point: 24, face: 6}, {point: 13, face: 2}]
            case '5,2':
                return [{point: 13, face: 5}, {point: 24, face: 2}]
            case '4,2':
                return [{point: 8, face: 4}, {point: 6, face: 2}]
            case '3,2':
                return [{point: 24, face: 3}, {point: 13, face: 2}]
            case '6,3':
                return [{point: 24, face: 6}, {point: 18, face: 3}]
            case '5,3':
                return [{point: 8, face: 5}, {point: 6, face: 3}]
            case '4,3':
                return [{point: 24, face: 4}, {point: 24, face: 3}]
            case '6,4':
                return [{point: 24, face: 6}, {point: 18, face: 4}]
            case '5,4':
                return [{point: 24, face: 4}, {point: 20, face: 5}]
            case '6,5':
                return [{point: 24, face: 6}, {point: 18, face: 5}]
            default:
                throw new UndecidedMoveError('No first move for ' + diceSorted.join())
        }
    }
}

class HittingRobot extends ConfidenceRobot {

    async getRankings(turn, game, match) {

        const them = Opponent[turn.color]
        const baseline = turn.board.bars[them].length

        const counts ={}
        const zeros = []

        turn.allowedEndStates.forEach(endState => {
            const board = Board.fromStateString(endState)
            const added = board.bars[them].length - baseline
            counts[endState] = added
            if (added < 1) {
                zeros.push(endState)
            }
        })

        const rankings = Util.spreadRanking(counts)
        zeros.forEach(endState => rankings[endState] = 0)

        return rankings
    }
}

class OccupyRobot extends ConfidenceRobot {

    // maximum number of points held
    async getRankings(turn, game, match) {
        const pointCounts = {}
        turn.allowedEndStates.forEach(endState => {
            const analyzer = BoardAnalyzer.forStateString(endState)
            pointCounts[endState] = analyzer.slotsHeld(turn.color).length
        })
        return Util.spreadRanking(pointCounts)
    }
}

class PrimeRobot extends ConfidenceRobot {

    async getRankings(turn, game, match) {

        const scores = {}
        const zeros = []

        turn.allowedEndStates.forEach(endState => {
            const analyzer = BoardAnalyzer.forStateString(endState)
            const primes = analyzer.primes(turn.color)
            if (primes.length) {
                const maxSize = Math.max(...primes.map(prime => prime.size))
                scores[endState] = maxSize + this.sizeBonus(maxSize)
            } else {
                scores[endState] = 0
                zeros.push(endState)
            }
        })

        const rankings = Util.spreadRanking(scores)
        zeros.forEach(endState => rankings[endState] = 0)

        return rankings
    }

    sizeBonus(size) {
        return (size - 2) * 2
    }
}

class SafetyRobot extends ConfidenceRobot {

    // minimum number of blots left
    async getRankings(turn, game, match) {

        const blotCounts = {}
        turn.allowedEndStates.forEach(endState => {
            const analyzer = BoardAnalyzer.forStateString(endState)
            blotCounts[endState] = analyzer.blots(turn.color).length
        })
        return Util.spreadRanking(blotCounts, true)
        // TODO: direct shots, indirect shots weighting
    }
}

class RobotError extends Error {

    constructor(...args){
        super(...args)
        this.name = this.constructor.name
        this.isRobotError = true
    }
}

class InvalidRobotError extends RobotError {}
class InvalidWeightError extends RobotError {}
class NoDelegatesError extends RobotError {}
class UndecidedMoveError extends RobotError {}

module.exports = {
    Robot
  , RandomRobot
  , BestRobot
  , FirstTurnRobot
  , HittingRobot
  , OccupyRobot
  , PrimeRobot
  , SafetyRobot
  , RobotDelegator
}