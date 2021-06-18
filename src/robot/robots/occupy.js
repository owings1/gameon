/**
 * gameon - Occupy Robot
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

class OccupyRobot extends Base {

    // maximum number of points held
    async getRankings(turn, game, match) {
        if (turn.board.analyzer.isDisengaged()) {
            return ZERO_RANKINGS
        }
        const pointCounts = {}
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = turn.fetchBoard(endState)
            pointCounts[endState] = analyzer.originsHeld(turn.color).length
        })
        return this.spreadScore(pointCounts)
    }
}

module.exports = OccupyRobot