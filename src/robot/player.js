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
import Base from '../lib/player.js'
import {DefaultProfiler as Profiler} from '../lib/util/profiler.js'
import {intRange, spreadScore} from '../lib/util.js'
import {
    HasNotRolledError,
    InvalidRobotError,
    InvalidRobotVersionError,
    InvalidWeightError,
    NoDelegatesError,
    NotImplementedError,
    UndecidedMoveError,
} from '../lib/errors.js'
import {Opponent, Colors, PointOrigins} from '../lib/constants.js'
import FirstTurns from './res/first-turns.js'

export const ZERO_SCORES = 'ZERO_SCORES'

export class Robot extends Base {

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
export default Robot

export class ConfidenceRobot extends Robot {

    // default
    static getClassVersions() {
        return {v1: this}
    }

    static getClassMeta(name) {
        const classMeta = KnownRobots[name]
        if (!classMeta) {
            throw new InvalidRobotError(`Unknown robot: ${name}`)
        }
        if (!classMeta.versions) {
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
        const stateString = Object.keys(scores).find(str => scores[str] === maxScore)
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
        const cmp = a.myRank - b.myRank
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
        cmp = (b === result.selectedEndState) - (a === result.selectedEndState)
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

export class RobotDelegator extends Robot {

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
        return this.forConfigs(this.getDefaultConfigs(), ...args)
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
        if (this.delegates.length === 0) {
            throw new NoDelegatesError('No delegates to consult')
        }
        Profiler.start('RobotDelegator.getDoubleConfidence')
        // sum(response_n * weight_n for each n) / sum(weight_n for each n)
        let weightedSum = 0
        let weightsSum = 0
        for (const delegate of this.delegates) {
            const response = await delegate.robot.getDoubleConfidence(turn, game, match)
            weightedSum += response * delegate.doubleWeight
            weightsSum += delegate.doubleWeight
        }
        Profiler.stop('RobotDelegator.getDoubleConfidence')
        if (weightsSum === 0) {
            // don't divide by zero
            return 0
        }
        return weightedSum / weightsSum
    }

    async getAcceptDoubleConfidence(turn, game, match) {
        if (this.delegates.length === 0) {
            throw new NoDelegatesError('No delegates to consult')
        }
        // sum(response_n * weight_n for each n) / sum(weight_n for each n)
        let weightedSum = 0
        let weightsSum = 0
        for (const delegate of this.delegates) {
            const response = await delegate.robot.getAcceptDoubleConfidence(turn, game, match)
            weightedSum += response * delegate.doubleWeight
            weightsSum += delegate.doubleWeight
        }
        if (weightsSum === 0) {
            // don't divide by zero
            return 1
        }
        return weightedSum / weightsSum
    }

    destroy() {
        this.delegates.forEach(delegate => delegate.robot.destroy())
        this.delegates.splice(0)
        super.destroy()
    }

    meta() {
        return {
            ...super.meta(),
            delegates : this.delegates.map(({robot, moveWeight, doubleWeight}) => {
                return {moveWeight, doubleWeight, ...robot.meta()}
            })
        }
    }

    validateWeight(...args) {
        RobotDelegator.validateWeight(...args)
    }

    static validateWeight(value) {
        if (typeof(value) != 'number' || isNaN(value) || Math.abs(value) === Infinity) {
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
                if (res[endState] === 0) {
                    // but if it's also first, i gave no rankings, so null
                    // is more appropriate
                    if (i === 0 || myRankTrack == null) {
                        myRankTrack = null
                    } else {
                        myRankTrack = myRankedStates.length
                    }
                    myRankedStatesMap[endState] = myRankTrack
                    return
                }
                if (i === 0) {
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
                name       : delegate.robot.name,
                moveWeight : delegate.moveWeight,
                rankings   : myRankedStates.map((endState, i) => {
                    return {
                        endState,
                        moves       : result.turn.endStatesToSeries[endState],
                        // just for reference
                        myScore     : res[endState],
                        actualScore : result.totals[endState],
                        // what the delegator said
                        actualRank  : overallRankingsMap[endState],
                        // what i said
                        myRank      : myRankedStatesMap[endState],
                    }
                }),
            }
            info.rankings.sort(Sorters.delegateRankings)
            return info
        })
        const rankList = overallRankings.map(endState => {
            const rank = overallRankingsMap[endState]
            const info = {
                endState,
                finalScore : result.totals[endState],
                rank       : rank,
                rankCount  : overallRankCounts[rank],
                moves      : result.turn.endStatesToSeries[endState],
                isChosen   : endState === result.selectedEndState,
                delegates  : this.delegates.map((delegate, i) => {
                    const myScore = result.results[i][endState]
                    const myRank = delegateRankedStatesMaps[i][endState]
                    return {
                        name     : delegate.robot.name,
                        weighted : myScore * delegate.moveWeight,
                        myScore,
                        myRank,
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


/** @deprecated */
Robot.RobotDelegator = RobotDelegator
/** @deprecated */
Robot.ConfidenceRobot = ConfidenceRobot


class BearoffRobot extends ConfidenceRobot {

    async getScores(turn, game, match) {
        const baseline = turn.board.analyzer.piecesHome(turn.color)
        const scores = {}
        let hasBearoff = false
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = turn.fetchBoard(endState)
            if (!analyzer.mayBearoff(turn.color)) {
                scores[endState] = 0
                return
            }
            hasBearoff = true
            const homes = analyzer.piecesHome(turn.color) - baseline
            scores[endState] = homes * 10
            if (analyzer.isDisengaged()) {
                const pointsCovered = analyzer.pointsOccupied(turn.color).length
                scores[endState] += pointsCovered
            }
        })
        return hasBearoff ? this.spreadScore(scores) : ZERO_SCORES
    }
}

class DoubleRobot extends ConfidenceRobot {

    async getScores(turn, game, match) {
        return ZERO_SCORES
    }

    async getDoubleConfidence(turn, game, match) {
        const {analyzer} = turn.board
        // naive implementation: pip count <= 75% of opponent's
        const myPipCount = analyzer.pipCount(this.color)
        const opponentPipCount = analyzer.pipCount(Opponent[this.color])
        return myPipCount < opponentPipCount * 0.75
    }

    async getAcceptDoubleConfidence(turn, game, match) {
        const {analyzer} = turn.board
        // naive implementation: pip count <= 120% of opponent's
        const myPipCount = analyzer.pipCount(this.color)
        const opponentPipCount = analyzer.pipCount(Opponent[this.color])
        return myPipCount < opponentPipCount * 1.2
    }
}

class FirstTurnRobot extends ConfidenceRobot {

    static getFirstTurnMoveIndex() {
        return FirstTurns
    }

    async getScores(turn, game, match) {
        // skip non-game, greater than second turn, and doubles
        if (!game) {
            return ZERO_SCORES
        }
        const turnCount = game.getTurnCount()
        if (turnCount > 2 || turn.dice[0] == turn.dice[1]) {
            return ZERO_SCORES
        }
        const scores = this.zeroScores(turn)
        const diceHash = turn.diceSorted.join(',')
        // we only have one potential move series
        const {moveHashes, firstMoveEndState} = FirstTurns[turn.color][diceHash]
        // check if the anticipated end state is allowed
        if (firstMoveEndState in turn.endStatesToSeries) {
            scores[firstMoveEndState] = 1
        } else {
            // check the allowedMoveIndex for the available moves
            let store = turn.allowedMoveIndex[moveHashes[0]]
            if (store) {
                store = store.index[moveHashes[1]]
                if (store) {
                    scores[store.move.board.state28()] = 1 / turnCount
                }
            }
        }
        return scores
    }

    static generateMoveIndex(pointMoves, board) {
        const moveIndex = {}
        for (const color in Colors) {
            moveIndex[color] = {}
            for (const diceHash in pointMoves) {
                board.setup()
                const moveHashes = pointMoves[diceHash].map(({point, face}) =>
                    board.move(color, PointOrigins[color][point], face).hash
                )
                moveIndex[color][diceHash] = {
                    moveHashes,
                    firstMoveEndState : board.state28(),
                }
            }
        }
        return moveIndex
    }
}


class HittingRobot extends ConfidenceRobot {

    async getScores(turn, game, match) {
        const baseline = turn.board.bars[turn.opponent].length
        const counts = {}
        //const zeros = []
        // TODO: quadrant/pip offset
        turn.allowedEndStates.forEach(endState => {
            const board = turn.fetchBoard(endState)
            const added = board.bars[turn.opponent].length - baseline
            counts[endState] = added
            //if (added < 1) {
            //    zeros.push(endState)
            //}
        })
        const scores = this.spreadScore(counts)
        //zeros.forEach(endState => scores[endState] = 0)
        return scores
    }
}

class OccupyRobot extends ConfidenceRobot {

    // maximum number of points held
    async getScores(turn, game, match) {
        if (turn.board.analyzer.isDisengaged()) {
            return ZERO_SCORES
        }
        const pointCounts = {}
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = turn.fetchBoard(endState)
            pointCounts[endState] = analyzer.originsHeld(turn.color).length
        })
        return this.spreadScore(pointCounts)
    }
}

class PrimeRobot extends ConfidenceRobot {

    async getScores(turn, game, match) {
        if (turn.board.analyzer.isDisengaged()) {
            return ZERO_SCORES
        }
        const scores = {}
        const zeros = []
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = turn.fetchBoard(endState)
            const primes = analyzer.primes(turn.color)
            if (primes.length) {
                const maxSize = Math.max(...primes.map(prime => prime.size))
                scores[endState] = maxSize + this.sizeBonus(maxSize)
            } else {
                scores[endState] = 0
                zeros.push(endState)
            }
        })
        const finalScores = this.spreadScore(scores)
        zeros.forEach(endState => finalScores[endState] = 0)
        return finalScores
    }

    sizeBonus(size) {
        return (size - 2) * 2
    }
}


class RandomRobot extends ConfidenceRobot {

    static getClassVersions() {
        return {
            v1 : this,
            v2 : RandomRobot_v2,
            v3 : RandomRobot_v3,
        }
    }

    async getScores(turn, game, match) {
        return this.spreadScore(this.zeroScores(turn))
    }
}

class RandomRobot_v2 extends ConfidenceRobot {

    async getScores(turn, game, match) {
        const scores = {}
        turn.allowedEndStates.forEach(endState => {
            scores[endState] = Math.random()
        })
        return this.spreadScore(scores)
    }
}

class RandomRobot_v3 extends ConfidenceRobot {

    async getScores(turn, game, match) {
        return ZERO_SCORES
    }
}


class RunningRobot extends ConfidenceRobot {

    async getScores(turn, game, match) {
        const scores = {}
        const len = turn.allowedEndStates.length
        for (let i = 0; i < len; i++) {
            const endState = turn.allowedEndStates[i]
            scores[endState] = this._scoreEndState(turn, endState)
        }
        // Inverse scoring
        return this.spreadScore(scores, true)
    }

    _scoreEndState(turn, endState) {
        const {analyzer} = turn.fetchBoard(endState)
        const points = analyzer.pointsOccupied(turn.color)
        const len = points.length
        let score = 0
        for (let i = 0; i < len; i++) {
            const point = points[i]
            score += point * analyzer.piecesOnPoint(turn.color, point) * RunningRobot.QM[point]
        }
        return score
    }
}

RunningRobot.QM = {}

intRange(1, 24).forEach(point => {
    let qm
    const quadrant = Math.ceil(point / 6)
    if (quadrant === 4) {
        qm = 8
    } else {
        qm = (quadrant - 1) / 2
    }
    RunningRobot.QM[point] = qm
})


class SafetyRobot extends ConfidenceRobot {

    static getClassVersions() {
        return {
            v1 : this,
            v2 : SafetyRobot_v2,
            v3 : SafetyRobot_v3,
        }
    }

    constructor(...args) {
        super(...args)
        this.isIncludeAllBlots = true
    }

    async getScores(turn, game, match) {

        if (turn.board.analyzer.isDisengaged()) {
            return ZERO_SCORES
        }

        const scores = {}
        const zeros = []

        for (let i = 0, ilen = turn.allowedEndStates.length; i < ilen; ++i) {
            const endState = turn.allowedEndStates[i]
            const {analyzer} = turn.fetchBoard(endState)
            
            const blots = this._fetchBlots(analyzer, turn.color)
            const {score, directCount} = this._scoreBlots(blots)

            scores[endState] = score
            if (directCount == 0) {
                zeros.push(endState)
            }
        }
        const finalScores = this.spreadScore(scores, true)
        for (let i = 0, ilen = zeros.length; i < ilen; ++i) {
            finalScores[zeros[i]] = 1
        }
        return finalScores
    }

    _fetchBlots(analyzer, color) {
        return analyzer.blots(color, this.isIncludeAllBlots)
    }

    _scoreBlots(blots) {
        let score = 0
        let directCount = 0
        for (let i = 0, ilen = blots.length; i < ilen; ++i) {
            const blot = blots[i]
            directCount += blot.directCount
            score += (blot.directCount * 4 + blot.indirectCount) * SafetyRobot.QM[blot.point]
        }
        return {score, directCount}
    }
}

class SafetyRobot_v2 extends SafetyRobot {

    constructor(...args) {
        super(...args)
        this.isIncludeAllBlots = false
    }
}

class SafetyRobot_v3 extends SafetyRobot_v2 {

    // Enforces spread on scores
    async getScores(turn, game, match) {
        return this.spreadScore(await super.getScores(turn, game, match))
    }
}

SafetyRobot.QM = {}

intRange(1, 24).forEach(point => {
    const quadrant = Math.ceil(point / 6)
    const qm = (4 - quadrant) * 2
    SafetyRobot.QM[point] = qm
})

const KnownRobots = {
    BearoffRobot: {
        class: BearoffRobot,
        defaults: {
            moveWeight   : 0.6,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    FirstTurnRobot: {
        class: FirstTurnRobot,
        defaults: {
            moveWeight   : 1.0,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    HittingRobot   : {
        class: HittingRobot,
        isCalibrate: true,
        defaults: {
            moveWeight   : 0.4,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    OccupyRobot: {
        class: OccupyRobot,
        isCalibrate : true,
        defaults : {
            moveWeight   : 0.45,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    PrimeRobot: {
        class: PrimeRobot,
        isCalibrate: true,
        defaults: {
            moveWeight   : 0.55,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    RandomRobot: {
        class: RandomRobot,
        defaults: {
            moveWeight   : 0,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    RunningRobot: {
        class: RunningRobot,
        isCalibrate: true,
        defaults: {
            moveWeight   : 0.44,
            doubleWeight : 0,
            version      : 'v1',
        },
    },
    SafetyRobot: {
        class: SafetyRobot,
        isCalibrate: true,
        defaults: {
            moveWeight   : 0.5,
            doubleWeight : 0,
            version      : 'v2',
        },
    },
    DoubleRobot: {
        class: DoubleRobot,
        defaults: {
            moveWeight   : 0,
            doubleWeight : 1,
            version      : 'v1',
        },
    },
}