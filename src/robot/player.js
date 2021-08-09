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
const path = require('path')
const Base = require('../lib/player.js')
const Profiler = require('../lib/util/profiler.js').getDefaultInstance()
const {spreadScore} = require('../lib/util.js')
const {KnownRobots} = require('./res/robots.config.js')
const {
    HasNotRolledError,
    InvalidRobotError,
    InvalidRobotVersionError,
    InvalidWeightError,
    NoDelegatesError,
    NotImplementedError,
    RobotError,
    UndecidedMoveError,
} = require('../lib/errors')

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
        for (const move of moves) {
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
        throw new NotImplementedError('NotImplemented')
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

class ConfidenceRobot extends Robot {

    // default
    static getClassVersions() {
        return {v1: this}
    }

    static getClassMeta(name) {
        const classMeta = KnownRobots[name]
        if (!classMeta) {
            throw new InvalidRobotError(`Unknown robot: ${name}`)
        }
        if (!classMeta.class) {
            classMeta.class = require('./robots/' + path.basename(classMeta.filename))
            classMeta.versions = classMeta.class.getClassVersions()
        }
        // make a copy
        return {
            ...classMeta,
            defaults: {...classMeta.defaults},
        }
    }

    static getClassVersion(name, version) {
        const classMeta = this.getClassMeta(name)
        const Class = classMeta.versions[version]
        if (!Class) {
            throw new InvalidRobotVersionError(`Unknown version for ${name}: ${version}`)
        }
        return Class
    }

    static getClassDefault(name) {
        const {defaults} = this.getClassMeta(name)
        return this.getClassVersion(name, defaults.version)
    }

    static getVersionInstance(name, version, ...args) {
        const Class = this.getClassVersion(name, version)
        return new Class(...args)
    }

    static getDefaultInstance(name, ...args) {
        const Class = this.getClassDefault(name)
        return new Class(...args)
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
        const scores = await this.getScores(turn, game, match)
        if (scores.length == 0) {
            throw new UndecidedMoveError('No moves returned from getScores')
        }
        const maxScore = Math.max(...Object.values(scores))
        const stateString = Object.keys(scores).find(str => scores[str] == maxScore)
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
    async getScores(turn, game, match) {
        throw new NotImplementedError('NotImplemented')
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
        return spreadScore(...args)
    }

    static zeroScores(turn) {
        Profiler.inc('ConfidenceRobot.zeroScores')
        const scores = {}
        turn.allowedEndStates.forEach(endState => scores[endState] = 0)
        return scores
    }
}

ConfidenceRobot.ZERO_SCORES = ZERO_SCORES

const Sorters = {
    delegateRankings : (a, b) => {
        let cmp = a.myRank - b.myRank
        if (cmp) {
            return cmp
        }
        return a.actualRank - b.actualRank
    },
    overallRankings : result => (a, b) => {
        let cmp = result.totals[b] - result.totals[a]
        if (cmp) {
            return cmp
        }
        cmp = (b == result.selectedEndState) - (a == result.selectedEndState)
        if (cmp) {
            return cmp
        }
        return a.localeCompare(b)
    },
    rankListDelegates: (a, b) => {
        let cmp = b.weighted - a.weighted
        if (cmp) {
            return cmp
        }
        cmp = b.rawScore - a.rawScore
        if (cmp) {
            return cmp
        }
        return a.name.localeCompare(b.name)
    },
}

class RobotDelegator extends Robot {

    static listClassNames() {
        return Object.keys(KnownRobots)
    }

    static forConfigs(configs, ...args) {
        const robot = new this(...args)
        configs.forEach(({name, version, moveWeight, doubleWeight}) => {
            const delegate = ConfidenceRobot.getVersionInstance(name, version, ...args)
            robot.addDelegate(delegate, moveWeight, doubleWeight)
        })
        robot.logger.debug({configs})
        return robot
    }

    // accept object {name: config}
    static forSettings(settings, ...args) {
        const configs = Object.entries(settings).map(([name, config]) => {
            return {name, ...config}
        })
        return RobotDelegator.forConfigs(configs, ...args)
    }

    static forDefaults(...args) {
        const configs = this.getDefaultConfigs()
        return this.forConfigs(configs, ...args)
    }

    static getDefaultConfigs() {
        return this.listClassNames().map(name => {
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
        this.delegates.push({robot, moveWeight, doubleWeight, scoreTimerName: 'getScores.' + robot.name})
    }

    async getMoves(turn, game, match) {
        Profiler.start('RobotDelegator.getMoves')
        try {
            if (this.delegates.length === 0) {
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
                    totals,
                    maxWeight,
                    selectedEndState,
                    results,
                    turn,
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

    destroy() {
        this.delegates.forEach(delegate =>
            delegate.robot.destroy()
        )
        this.delegates.splice(0)
        return super.destroy()
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
        overallRankings.sort(Sorters.overallRankings(result))
        const overallRankingsMap = {}
        let rankTrack = 1
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
            let myRankTrack = 1
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
            info.rankings.sort(Sorters.delegateRankings)

            return info
        })

        const rankList = overallRankings.map(endState => {
            const rank = overallRankingsMap[endState]
            const info = {
                endState
              , finalScore : result.totals[endState]
              , rank       : rank
              , rankCount  : overallRankCounts[rank]
              , moves      : result.turn.endStatesToSeries[endState]
              , isChosen   : endState == result.selectedEndState
              , delegates  : this.delegates.map((delegate, i) => {
                    const myScore = result.results[i][endState]
                    const myRank = delegateRankedStatesMaps[i][endState]
                    return {
                        name     : delegate.robot.name
                      , weighted : myScore * delegate.moveWeight
                      , myScore
                      , myRank
                    }
                })
            }
            info.delegates.sort(Sorters.rankListDelegates)
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
       for (let i = 0, ilen = this.delegates.length; i < ilen; ++i) {
           const delegate = this.delegates[i]
           Profiler.start(delegate.scoreTimerName)
           let scores
           if (delegate.moveWeight == 0) {
               scores = zeroScores
           } else {
               scores = await delegate.robot.getScores(turn, game, match)
               if (scores === ZERO_SCORES) {
                   scores = zeroScores
               }
           }
           results.push(scores)
           Profiler.stop(delegate.scoreTimerName)
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
       // Don't assume delegates will give good scores >= 0. Instead log a warning,
       // but still allow selecting the moves with the max score.
       let maxWeight = -Infinity
       let selectedEndState
       for (let i = 0, ilen = results.length; i < ilen; ++i) {
           const result = results[i]
           const delegate = this.delegates[i]
           for (const endState in result) {
               if (!(endState in totals)) {
                   totals[endState] = 0
               }
               const instanceScore = result[endState]
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

RobotDelegator.Sorters = Sorters

module.exports = {
    Robot,
    ConfidenceRobot,
    RobotDelegator,
    ZERO_SCORES,
}