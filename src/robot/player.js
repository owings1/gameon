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
const Constants = require('../lib/constants')
const Core      = require('../lib/core')
const Base      = require('../lib/player')
const Errors    = require('../lib/errors')
const Util      = require('../lib/util')

const {Profiler} = Core
const {HasNotRolledError} = Errors

const ZERO_SCORES = 'ZERO_SCORES'

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
        return {...super.meta(), isRobot: this.isRobot}
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
          , version      : 'v2'
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

    zeroScores(turn) {
        return ConfidenceRobot.zeroScores(turn)
    }

    spreadScore(...args) {
        return Util.spreadScore(...args)
    }

    static zeroScores(turn) {
        Profiler.inc('ConfidenceRobot.zeroScores')
        const rankings = {}
        turn.allowedEndStates.forEach(endState => rankings[endState] = 0)
        return rankings
    }
}

ConfidenceRobot.ZERO_SCORES = ZERO_SCORES

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
        this.isStoreLastResult = false
    }

    addDelegate(robot, moveWeight, doubleWeight) {
        if (!robot.isConfidenceRobot) {
            throw new InvalidRobotError('Delegate is not a Confidence Robot')
        }
        this.validateWeight(moveWeight)
        this.validateWeight(doubleWeight)
        this.delegates.push({robot, moveWeight, doubleWeight, rankTimerName: 'getRankings.' + robot.name})
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
            if (turn.isForceMove) {
                return turn.endStatesToSeries[turn.allowedEndStates[0]]
            }
            if (!turn.isRolled) {
                throw new HasNotRolledError('Turn is not rolled')
            }

            Profiler.start('RobotDelegator.getMoves.1')            
            const results = await this._getDelegatesResults(turn, game, match)
            Profiler.stop('RobotDelegator.getMoves.1')

            Profiler.start('RobotDelegator.getMoves.2')
            const {totals, maxWeight, selectedEndState} = this._computeTotals(results)
            Profiler.stop('RobotDelegator.getMoves.2')

            Profiler.start('RobotDelegator.getMoves.3')
            const moves = turn.endStatesToSeries[selectedEndState]
            if (!moves) {
                this.logger.error({maxWeight, totals, selectedEndState, allowedEndStates: turn.allowedEndStates})
                throw new UndecidedMoveError('Cannot find moves among delegates')
            }
            this.emit('turnData', turn, {startState: turn.startState, endState: selectedEndState, totals, moves})
            Profiler.stop('RobotDelegator.getMoves.3')

            if (this.isStoreLastResult) {
                this.lastResult = {
                    totals
                  , maxWeight
                  , selectedEndState
                  , results
                  , turn
                }
            }

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
        Profiler.start('RobotDelegator.getDoubleConfidence')
        // sum(response_n * weight_n for each n) / sum(weight_n for each n)
        var weightedSum = 0
        var weightsSum = 0
        for (var delegate of this.delegates) {
            var response = await delegate.robot.getDoubleConfidence(turn, game, match)
            weightedSum += response * delegate.doubleWeight
            weightsSum += delegate.doubleWeight
        }
        Profiler.stop('RobotDelegator.getDoubleConfidence')
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
        return {
            ...super.meta()
          , delegates : this.delegates.map(({robot, moveWeight, doubleWeight}) => {
                return {moveWeight, doubleWeight, ...robot.meta()}
            })
        }
    }

    validateWeight(...args) {
        RobotDelegator.validateWeight(...args)
    }

    static validateWeight(value) {
        if (typeof(value) != 'number' || isNaN(value) || Math.abs(value) == Infinity) {
            throw new InvalidWeightError('Invalid weight for delegate')
        }
    }

    explainResult(result) {

        // overall rankings
        const overallRankings = Object.keys(result.totals)
        overallRankings.sort((a, b) => {
            var cmp = result.totals[b] - result.totals[a]
            if (cmp) {
                return cmp
            }
            cmp = (b == result.selectedEndState) - (a == result.selectedEndState)
            if (cmp) {
                return cmp
            }
            return a.localeCompare(b)
        })
        const overallRankingsMap = {}
        var rankTrack = 1
        overallRankings.forEach((endState, i) => {
            // score of zero ties for dead last
            if (result.totals[endState] == 0) {
                rankTrack = overallRankings.length
                overallRankingsMap[endState] = rankTrack
                return
            }
            if (i == 0) {
                overallRankingsMap[endState] = rankTrack
                return
            }
            if (result.totals[endState] < result.totals[overallRankings[i - 1]]) {
                rankTrack += 1
            }
            overallRankingsMap[endState] = rankTrack
        })
        // how many endStates for each rank {rank: count}
        const overallRankCounts = {}
        Object.values(overallRankingsMap).forEach(rank => {
            if (!overallRankCounts[rank]) {
                overallRankCounts[rank] = 0
            }
            overallRankCounts[rank] += 1
        })

        // delegate rankings, delegate ordered
        const delegateRankedStatesMaps = []

        // what did this delegate prefer wrt what was chosen
        const delegateList = result.results.map((res, i) => {

            const myRankedStates = Object.keys(res)
            myRankedStates.sort((a, b) => res[b] - res[a])

            // ties are much more likely
            const myRankedStatesMap = {}
            var myRankTrack = 1
            myRankedStates.forEach((endState, i) => {
                // score of zero ties for dead last
                if (res[endState] == 0) {
                    // but if it's also first, i gave no rankings, so null
                    // is more appropriate
                    if (i == 0 || myRankTrack == null) {
                        myRankTrack = null
                    } else {
                        myRankTrack = myRankedStates.length
                    }
                    myRankedStatesMap[endState] = myRankTrack
                    return
                }
                if (i == 0) {
                    myRankedStatesMap[endState] = myRankTrack
                    return
                }
                if (res[endState] < res[myRankedStates[i - 1]]) {
                    myRankTrack += 1
                }
                myRankedStatesMap[endState] = myRankTrack
            })

            delegateRankedStatesMaps.push(myRankedStatesMap)

            const delegate = this.delegates[i]
            const info = {
                name       : delegate.robot.name
              , moveWeight : delegate.moveWeight
              , rankings   : myRankedStates.map((endState, i) => {
                    return {
                        endState
                      , moves       : result.turn.endStatesToSeries[endState]
                        // just for reference
                      , myScore     : res[endState]
                      , actualScore : result.totals[endState]
                        // what the delegator said
                      , actualRank  : overallRankingsMap[endState]
                        // what i said
                      , myRank      : myRankedStatesMap[endState]
                    }
                })
            }
            info.rankings.sort((a, b) => {
                var cmp = a.myRank - b.myRank
                if (cmp) {
                    return cmp
                }
                return a.actualRank - b.actualRank
            })

            return info
        })

        const rankList = overallRankings.map(endState => {
            const rank = overallRankingsMap[endState]
            const info = {
                endState
              , finalScore    : result.totals[endState]
              , rank          : rank
              , rankCount     : overallRankCounts[rank]
              , moves         : result.turn.endStatesToSeries[endState]
              , isChosen      : endState == result.selectedEndState
              , delegates     : this.delegates.map((delegate, i) => {
                    const myScore = result.results[i][endState]
                    const myRank = delegateRankedStatesMaps[i][endState]
                    return {
                        name          : delegate.robot.name
                      , weightedScore : myScore * delegate.moveWeight
                      , myScore
                      , myRank
                    }
                })
            }
            info.delegates.sort((a, b) => {
                var cmp = b.weightedScore - a.weightedScore
                if (cmp) {
                    return cmp
                }
                cmp = b.rawScore - a.rawScore
                if (cmp) {
                    return cmp
                }
                return a.name.localeCompare(b.name)
            })
            return info
        })

        return {rankList, delegateList}
    }

   /**
    * Get scores from each delegate.
    *
    * Returns a list of delegate scores, in this.delegates order
    *
    *   [
    *       {endState: scores}
    *   ]
    */
   async _getDelegatesResults(turn, game, match) {
       const results = []
       const zeroScores = ConfidenceRobot.zeroScores(turn)
       for (var i = 0, ilen = this.delegates.length; i < ilen; ++i) {
           var delegate = this.delegates[i]
           Profiler.start(delegate.rankTimerName)
           if (delegate.moveWeight == 0) {
               var scores = zeroScores
           } else {
               var scores = await delegate.robot.getRankings(turn, game, match)
               if (scores === ZERO_SCORES) {
                   scores = zeroScores
               }
           }
           results.push(scores)
           Profiler.stop(delegate.rankTimerName)
       }
       return results
   }

   /**
    * Reduce the results. Assumes results are in this.delegates order.
    *
    * Returns a result object:
    *
    *    totals: {endState: totalScore}
    *    maxWeight
    *    selectedEndState
    */
   _computeTotals(results) {
       const totals = {}
       // Don't assume delegates will give good rankings >= 0. Instead log a warning,
       // but still allow selecting the moves with the max ranking.
       var maxWeight = -Infinity
       var selectedEndState
       for (var i = 0, ilen = results.length; i < ilen; ++i) {
           var result = results[i]
           var delegate = this.delegates[i]
           for (var endState in result) {
               if (!(endState in totals)) {
                   totals[endState] = 0
               }
               var instanceScore = result[endState]
               if (instanceScore > 1 || instanceScore < 0) {
                   this.logger.warn(delegate.robot.name, 'gave score', instanceScore)
               }
               totals[endState] += instanceScore * delegate.moveWeight
               if (totals[endState] > maxWeight) {
                   maxWeight = totals[endState]
                   selectedEndState = endState
               }
           }
       }
       return {totals, maxWeight, selectedEndState}
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
  , ZERO_SCORES
}