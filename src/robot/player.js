/**
 * gameon - Robot class
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
const Core = require('../lib/core')
const Base = require('../lib/player')
const Util = require('../lib/util')

const {Board, Profiler} = Core
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

    async turnOption(turn, game, match) {
        const isDouble = await this.shouldDouble(turn, game, match)
        if (isDouble) {
            turn.setDoubleOffered()
        }
    }

    async decideDouble(turn, game, match) {
        const isAccept = await this.shouldAcceptDouble(turn, game, match)
        if (!isAccept) {
            turn.setDoubleDeclined()
        }
    }

    async getMoves(turn, game, match) {
        throw new Error('NotImplemented')
    }

    async shouldDouble(turn, game, match) {
        return false
    }

    async shouldAcceptDouble(turn, game, match) {
        return true
    }

    meta() {
        return merge(super.meta(), {isRobot: this.isRobot})
    }
}

const KnownRobots = {
    BearoffRobot   : {
        filename : 'bearoff'
      , defaults : {
            moveWeight   : 0.6
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , FirstTurnRobot : {
        filename : 'first-turn'
      , defaults : {
            moveWeight   : 1.0
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , HittingRobot   : {
        filename    : 'hitting'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.4
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , OccupyRobot    : {
        filename    : 'occupy'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.45
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , PrimeRobot     : {
        filename    : 'prime'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.55
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
        filename    : 'running'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.44
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , SafetyRobot    : {
        filename    : 'safety'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.5
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , DoubleRobot    : {
        filename   : 'double'
      , defaults   : {
            moveWeight   : 0
          , doubleWeight : 1
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

    static getClassVersion(name, version) {
        const classMeta = ConfidenceRobot.getClassMeta(name)
        const theClass = classMeta.versions[version]
        if (!theClass) {
            throw new InvalidRobotVersionError("Unknown version for " + name + ": " + version)
        }
        return theClass
    }

    static getClassDefault(name) {
        const {defaults} = ConfidenceRobot.getClassMeta(name)
        return ConfidenceRobot.getClassVersion(name, defaults.version)
    }

    static getVersionInstance(name, version, ...args) {
        const theClass = ConfidenceRobot.getClassVersion(name, version)
        return new theClass(...args)
    }

    static getDefaultInstance(name, ...args) {
        const theClass = ConfidenceRobot.getClassDefault(name)
        return new theClass(...args)
        /*
        const {defaults} = ConfidenceRobot.getClassMeta(name)
        return ConfidenceRobot.getVersionInstance(name, defaults.version, ...args)
        */
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

    // for compatibility to be used as a standalone robot player
    async shouldDouble(turn, game, match) {
        const p = await this.getDoubleConfidence(turn, game, match)
        return p >= 0.5
    }

    // for compatibility to be used as a standalone robot player
    async shouldAcceptDouble(turn, game, match) {
        const p = await this.getAcceptDoubleConfidence(turn, game, match)
        return p >= 0.5
    }

    // {stateString -> weight}
    // where 0 <= weight <= 1
    async getRankings(turn, game, match) {
        throw new Error('NotImplemented')
    }

    async getDoubleConfidence(turn, game, match) {
        return 0
    }

    async getAcceptDoubleConfidence(turn, game, match) {
        return 1
    }

    zeroRankings(turn) {
        const rankings = {}
        turn.allowedEndStates.forEach(endState => rankings[endState] = 0)
        return rankings
    }

    spreadRanking(...args) {
        return Util.spreadRanking(...args)
    }
}

class RobotDelegator extends Robot {

    static forConfigs(configs, ...args) {
        const robot = new RobotDelegator(...args)
        configs.forEach(({name, version, moveWeight, doubleWeight}) => {
            const delegate = ConfidenceRobot.getVersionInstance(name, version, ...args)
            robot.addDelegate(delegate, moveWeight, doubleWeight)
        })
        robot.logger.debug({configs})
        return robot
    }

    static forDefaults(...args) {
        const configs = RobotDelegator.getDefaultConfigs()
        return RobotDelegator.forConfigs(configs, ...args)
    }

    static getDefaultConfigs() {
        return ConfidenceRobot.listClassNames().map(name => {
            const {defaults, isCalibrate} = ConfidenceRobot.getClassMeta(name)
            return {name, isCalibrate, ...defaults}
        })
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
        Profiler.start('RobotDelegator.getMoves')
        try {
            if (this.delegates.length == 0) {
                throw new NoDelegatesError('No delegates to consult')
            }
            if (turn.isCantMove) {
                return []
            }
            if (!turn.isRolled) {
                throw new HasNotRolledError('Turn is not rolled')
            }
            Profiler.start('RobotDelegator.getMoves.1')
            const startState = turn.board.state28()
            // [{robot, moveWeight, doubleWeight, rankings}]
            const delegates = []
            for (var delegate of this.delegates) {
                var timerName = 'getRankings.' + delegate.robot.constructor.name
                Profiler.start(timerName)
                delegates.push({
                    ...delegate
                  , rankings: await delegate.robot.getRankings(turn, game, match)
                })
                Profiler.stop(timerName)
            }
            Profiler.stop('RobotDelegator.getMoves.1')
            Profiler.start('RobotDelegator.getMoves.2')
            const rankings = {}
            delegates.forEach(delegate => {
                Object.entries(delegate.rankings).forEach(([endState, localWeight]) => {
                    if (!(endState in rankings)) {
                        rankings[endState] = 0
                    }
                    if (localWeight > 1 || localWeight < 0) {
                        this.logger.warn(delegate.robot.name, 'gave weight', localWeight)
                    }
                    //this.logger.debug({localWeight, robot: delegate.robot.name})
                    rankings[endState] += localWeight * delegate.moveWeight
                })
            })
            const maxWeight = Math.max(...Object.values(rankings))
            //this.logger.debug({rankings, maxWeight})
            const endState = turn.allowedEndStates.find(endState => rankings[endState] == maxWeight)
            const moves = turn.endStatesToSeries[endState]
            Profiler.stop('RobotDelegator.getMoves.2')
            if (!moves) {
                this.logger.error({maxWeight, rankings, endState, allowedEndStates: turn.allowedEndStates})
                throw new UndecidedMoveError('Cannot find moves among delegates')
            }
            this.emit('turnData', turn, {startState, endState, rankings, moves})
            return moves
        } finally {
            Profiler.stop('RobotDelegator.getMoves')
        }
    }

    async shouldDouble(turn, game, match) {
        const p = await this.getDoubleConfidence(turn, game, match)
        return p >= 0.5
    }

    async shouldAcceptDouble(turn, game, match) {
        const p = await this.getAcceptDoubleConfidence(turn, game, match)
        return p >= 0.5
    }

    async getDoubleConfidence(turn, game, match) {
        if (this.delegates.length == 0) {
            throw new NoDelegatesError('No delegates to consult')
        }
        // sum(response_n * weight_n for each n) / sum(weight_n for each n)
        var weightedSum = 0
        var weightsSum = 0
        for (var delegate of this.delegates) {
            var response = await delegate.robot.getDoubleConfidence(turn, game, match)
            weightedSum += response * delegate.doubleWeight
            weightsSum += delegate.doubleWeight
        }
        if (weightsSum == 0) {
            // don't divide by zero
            return 0
        }
        return weightedSum / weightsSum
    }

    async getAcceptDoubleConfidence(turn, game, match) {
        if (this.delegates.length == 0) {
            throw new NoDelegatesError('No delegates to consult')
        }
        // sum(response_n * weight_n for each n) / sum(weight_n for each n)
        var weightedSum = 0
        var weightsSum = 0
        for (var delegate of this.delegates) {
            var response = await delegate.robot.getAcceptDoubleConfidence(turn, game, match)
            weightedSum += response * delegate.doubleWeight
            weightsSum += delegate.doubleWeight
        }
        if (weightsSum == 0) {
            // don't divide by zero
            return 1
        }
        return weightedSum / weightsSum
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

    validateWeight(...args) {
        RobotDelegator.validateWeight(...args)
    }

    static validateWeight(value) {
        if (typeof(value) != 'number' || isNaN(value) || Math.abs(value) == Infinity) {
            throw new InvalidWeightError('Invalid weight for delegate')
        }
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

class InvalidRobotVersionError extends InvalidRobotError {}

module.exports = {
    Robot
  , ConfidenceRobot
  , RobotDelegator
  , UndecidedMoveError
  , InvalidRobotError
}