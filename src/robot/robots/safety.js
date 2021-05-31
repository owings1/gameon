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

class SafetyRobot extends Base {

    // minimum number of blots left
    async getRankings(turn, game, match) {

        if (turn.board.analyzer.isDisengaged()) {
            return this.zeroRankings(turn)
        }

        const scores = {}
        const zeros = []
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = turn.fetchBoard(endState)
            const blots = analyzer.blots(turn.color)
            var score = 0
            var directCount = 0
            blots.forEach(blot => {
                directCount += blot.directCount
                score += blot.directCount * 4
                score += blot.indirectCount
                score *= this.quadrantMultiplier(blot.point)
            })
            scores[endState] = score
            if (directCount == 0) {
                zeros.push(endState)
            }
        })
        const rankings = this.spreadRanking(scores, true)
        zeros.forEach(endState => rankings[endState] = 1)
        return rankings
    }

    quadrantMultiplier(point) {
        const quadrant = Math.ceil(point / 6)
        return (4 - quadrant) * 2
    }
}

module.exports = SafetyRobot