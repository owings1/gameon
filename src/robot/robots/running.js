/**
 * gameon - Running Robot
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

const {intRange} = require('../../lib/util')

function quadrantMultiplier(point) {
    const quadrant = Math.ceil(point / 6)
    if (quadrant == 4) {
        return 8
    }
    return (quadrant - 1) / 2
}

const QuadrantMultipliers = {}

intRange(1, 24).forEach(point =>
    QuadrantMultipliers[point] = quadrantMultiplier(point)
)

class RunningRobot extends Base {

    async getRankings(turn, game, match) {
        const scores = {}
        const len = turn.allowedEndStates.length
        for (var i = 0; i < len; i++) {
            var endState = turn.allowedEndStates[i]
            scores[endState] = this._rankEndState(turn, endState)
        }
        // Inverse ranking
        return this.spreadScore(scores, true)
    }

    _rankEndState(turn, endState) {
        const {analyzer} = turn.fetchBoard(endState)
        const points = analyzer.pointsOccupied(turn.color)
        const len = points.length
        var score = 0
        for (var i = 0; i < len; i++) {
            var point = points[i]
            score += point * analyzer.piecesOnPoint(turn.color, point) * QuadrantMultipliers[point]
        }
        return score
    }
}

module.exports = RunningRobot