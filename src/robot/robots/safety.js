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

const {ZERO_RANKINGS} = Base
const {intRange} = require('../../lib/util')

function quadrantMultiplier(point) {
    const quadrant = Math.ceil(point / 6)
    return (4 - quadrant) * 2
}

const QuadrantMultipliers = {}

intRange(1, 24).forEach(point =>
    QuadrantMultipliers[point] = quadrantMultiplier(point)
)

class SafetyRobot extends Base {

    // minimum number of blots left
    async getRankings(turn, game, match) {

        if (turn.board.analyzer.isDisengaged()) {
            return ZERO_RANKINGS
        }

        const scores = {}
        const zeros = []

        for (var i = 0, ilen = turn.allowedEndStates.length; i < ilen; ++i) {
            var endState = turn.allowedEndStates[i]
            var {score, directCount} = this._scoreBlots(
                turn.fetchBoard(endState).analyzer.blots(turn.color)
            )            
            scores[endState] = score
            if (directCount == 0) {
                zeros.push(endState)
            }
        }
        const rankings = this.spreadRanking(scores, true)
        for (var i = 0, ilen = zeros.length; i < ilen; ++i) {
            rankings[zeros[i]] = 1
        }
        return rankings
    }

    _scoreBlots(blots) {
        var score = 0
        var directCount = 0
        for (var i = 0, ilen = blots.length; i < ilen; ++i) {
            var blot = blots[i]
            directCount += blot.directCount
            score += blot.directCount * 4
            score += blot.indirectCount
            score *= QuadrantMultipliers[blot.point]
        }
        return {score, directCount}
    }
}

module.exports = SafetyRobot