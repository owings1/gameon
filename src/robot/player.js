const Core = require('../lib/core')
const Base = require('../lib/player')
const Util = require('../lib/util')

const {Board} = Core
const {HasNotRolledError} = Core.Errors
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

const KnownRobots = {
    BearoffRobot   : {
        filename : 'bearoff'
      , defaults : {
            moveWeight   : 6
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , FirstTurnRobot : {
        filename : 'first-turn'
      , defaults : {
            moveWeight   : 10
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , HittingRobot   : {
        filename : 'hitting'
      , defaults : {
            moveWeight   : 4
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , OccupyRobot    : {
        filename : 'occupy'
      , defaults : {
            moveWeight   : 4.5
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , PrimeRobot     : {
        filename : 'prime'
      , defaults : {
            moveWeight   : 5.5
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , RandomRobot    : {
        filename : 'random'
      , defaults : {
            moveWeight   : 0
          , doubleWeight : 0
          , version      : 'v1'
        }
    }
  , RunningRobot   : {
        filename : 'running'
      , defaults : {
            moveWeight   : 4.4
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , SafetyRobot    : {
        filename : 'safety'
      , defaults : {
            moveWeight   : 5
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
}

class ConfidenceRobot extends Robot {

    // default
    static getClassVersions() {
        return {v1 : this}
    }

    static listClassNames() {
        return Object.keys(KnownRobots)
    }

    static getClassMeta(name) {
        const classMeta = KnownRobots[name]
        if (!classMeta) {
            throw new InvalidRobotError("Unknown robot: " + name)
        }
        if (!classMeta.class) {
            classMeta.class = require('./robots/' + classMeta.filename)
            classMeta.versions = classMeta.class.getClassVersions()
        }
        return classMeta
    }

    static getVersionInstance(name, version, ...args) {
        const classMeta = ConfidenceRobot.getClassMeta(name)
        const theClass = classMeta.versions[version]
        if (!theClass) {
            throw new InvalidRobotError("Unknown version for " + name + ": " + version)
        }
        return new theClass(...args)
    }

    static getDefaultInstance(name, ...args) {
        const {defaults} = ConfidenceRobot.getClassMeta(name)
        return ConfidenceRobot.getVersionInstance(name, defaults.version, ...args)
    }

    constructor(...args) {
        super(...args)
        this.isConfidenceRobot = true
    }

    // for compatibility to be used as a standalone robot player
    async getMoves(turn, game, match) {
        if (turn.isCantMove) {
            return []
        }
        if (!turn.isRolled) {
            throw new HasNotRolledError('Turn is not rolled')
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

    zeroRankings(turn) {
        const rankings = {}
        turn.allowedEndStates.forEach(endState => rankings[endState] = 0)
        return rankings
    }

    spreadRanking(...args) {
        return Util.spreadRanking(...args)
    }

    createBoard(stateString) {
        return Board.fromStateString(stateString)
    }
}

class RobotDelegator extends Robot {

    static forConfigs(configs, ...args) {
        const robot = new RobotDelegator(...args)
        configs.forEach(({name, version, moveWeight, doubleWeight}) => {
            const delegate = ConfidenceRobot.getVersionInstance(name, version, ...args)
            robot.addDelegate(delegate, moveWeight, doubleWeight)
        })
        return robot
    }

    static forDefaults(...args) {
        const configs = ConfidenceRobot.listClassNames().map(name => {
            const {defaults} = ConfidenceRobot.getClassMeta(name)
            return {name, ...defaults}
        })
        return RobotDelegator.forConfigs(configs, ...args)
    }

    constructor(...args) {
        super(...args)
        this.delegates = []
    }

    addDelegate(robot, moveWeight, doubleWeight) {
        if (!robot.isConfidenceRobot) {
            throw new InvalidRobotError('Delegate is not a Confidence Robot')
        }
        this.validateWeight(moveWeight)
        this.validateWeight(doubleWeight)
        this.delegates.push({robot, moveWeight, doubleWeight})
    }

    async getMoves(turn, game, match) {
        if (this.delegates.length == 0) {
            throw new NoDelegatesError('No delegates to consult')
        }
        if (turn.isCantMove) {
            return []
        }
        if (!turn.isRolled) {
            throw new HasNotRolledError('Turn is not rolled')
        }
        const startState = turn.board.stateString()
        // [{robot, moveWeight, doubleWeight, rankings}]
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
                rankings[endState] += localWeight * delegate.moveWeight
            })
        })
        const maxWeight = Math.max(...Object.values(rankings))
        //this.logger.debug({rankings, maxWeight})
        const endState = turn.allowedEndStates.find(endState => rankings[endState] == maxWeight)
        const moves = turn.endStatesToSeries[endState]
        if (!moves) {
            this.logger.error({maxWeight, rankings, endState, allowedEndStates: turn.allowedEndStates})
            throw new UndecidedMoveError('Cannot find moves among delegates')
        }
        this.emit('turnData', turn, {startState, endState, rankings, moves})
        return moves
    }

    async destroy() {
        await Promise.all([super.destroy()].concat(this.delegates.map(delegate =>
            delegate.robot.destroy()
        )))
        this.delegates.splice(0)
    }

    meta() {
        return merge(super.meta(), {
            delegates : this.delegates.map(({robot, weight}) => merge({weight}, robot.meta()))
        })
    }

    validateWeight(value) {
        if (typeof(value) != 'number' || isNaN(value) || Math.abs(value) == Infinity) {
            throw new InvalidWeightError('Invalid weight for delegate')
        }
    }
}

class BestRobot extends RobotDelegator {

    constructor(...args) {
        super(...args)
        this.addDelegate(new FirstTurnRobot(...args), 10, 0)
        this.addDelegate(new BearoffRobot(...args), 6, 0)
        this.addDelegate(new PrimeRobot(...args), 5.5, 0)
        this.addDelegate(new SafetyRobot(...args), 5, 0)
        this.addDelegate(new OccupyRobot(...args), 4.5, 0)
        this.addDelegate(new RunningRobot(...args), 4.4, 0)
        this.addDelegate(new HittingRobot(...args), 4, 0)
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
  , ConfidenceRobot
  , RobotDelegator
  , UndecidedMoveError
  , InvalidRobotError
}