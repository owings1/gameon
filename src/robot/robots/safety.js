/**
 * gameon - Safety Robot
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
const Base = require('../player').ConfidenceRobot
const Util = require('../../lib/util')

const Profiler = Util.Profiler.getDefaultInstance()

const {ZERO_SCORES} = Base
const {intRange} = Util

function quadrantMultiplier(point) {
    const quadrant = Math.ceil(point / 6)
    return (4 - quadrant) * 2
}

const QuadrantMultipliers = {}

intRange(1, 24).forEach(point =>
    QuadrantMultipliers[point] = quadrantMultiplier(point)
)

class SafetyRobot extends Base {

    static getClassVersions() {
        return {
            v1 : this
          , v2 : SafetyRobot_v2
          , v3 : SafetyRobot_v3
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

        for (var i = 0, ilen = turn.allowedEndStates.length; i < ilen; ++i) {
            var endState = turn.allowedEndStates[i]
            var {analyzer} = turn.fetchBoard(endState)
            
            var blots = this._fetchBlots(analyzer, turn.color)
            var {score, directCount} = this._scoreBlots(blots)

            scores[endState] = score
            if (directCount == 0) {
                zeros.push(endState)
            }
        }
        const finalScores = this.spreadScore(scores, true)
        for (var i = 0, ilen = zeros.length; i < ilen; ++i) {
            finalScores[zeros[i]] = 1
        }
        return finalScores
    }

    _fetchBlots(analyzer, color) {
        return analyzer.blots(color, this.isIncludeAllBlots)
    }

    _scoreBlots(blots) {
        var score = 0
        var directCount = 0
        for (var i = 0, ilen = blots.length; i < ilen; ++i) {
            var blot = blots[i]
            directCount += blot.directCount
            score += (blot.directCount * 4 + blot.indirectCount) * QuadrantMultipliers[blot.point]
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

module.exports = SafetyRobot

// interesting idea, but not so quick
/*
        //const quickCache = {}
            Profiler.start('blots.safetyRobot.quickHash')
            var quickHash = this._quickHash(analyzer, turn)
            Profiler.stop('blots.safetyRobot.quickHash')
            if (!quickCache[quickHash]) {
                Profiler.inc('blots.safetyRobot.cache.miss')
                var blots = this._fetchBlots(analyzer, turn.color)
                quickCache[quickHash] = this._scoreBlots(blots)
                //quickCache[quickHash].blots = blots
                //quickCache[quickHash].endState = endState
            } else {
                Profiler.inc('blots.safetyRobot.cache.hit')
    
            }
            // validate
            /*
            var blotsCheck = this._fetchBlots(analyzer, turn.color)
            if (JSON.stringify(blotsCheck) != JSON.stringify(quickCache[quickHash].blots)) {
                console.log(turn.color, turn.dice, turn.startState)
                console.log(endState, blotsCheck)
                console.log(quickCache[quickHash].endState, quickCache[quickHash].blots)
                throw new Error('fail')
            }
            var {score, directCount} = quickCache[quickHash]
*/
/*
    _quickHash(analyzer, turn) {
        const o1 = analyzer.blotOrigins(turn.color)
        const o2 = analyzer.originsOccupied(turn.opponent)
        const b1 = analyzer.hasBar(turn.color)
        const b2 = analyzer.hasBar(turn.opponent)
        return this._quickHashNumber(o1, b1) + '/' + this._quickHashNumber(o2, b2)
    }

    _quickHashNumber(origins, hasBar) {
        var n = +hasBar
        for (var i = 0, ilen = origins.length; i < ilen; ++i) {
            n = n | (1 << (origins[i] + 2))
        }
        return n
    }
*/