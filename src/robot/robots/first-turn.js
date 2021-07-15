/**
 * gameon - FirstTurn Robot
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
const Robot     = require('../player')
const Base      = Robot.ConfidenceRobot
const Constants = require('../../lib/constants')

const {Colors, PointOrigins} = Constants
const {ZERO_SCORES} = Base

const MoveIndex = require('./res/first-turn.config')

class FirstTurnRobot extends Base {

    static getFirstTurnMoveIndex() {
        return MoveIndex
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
        const {moveHashes, firstMoveEndState} = MoveIndex[turn.color][diceHash]
        // check if the anticipated end state is allowed
        if (firstMoveEndState in turn.endStatesToSeries) {
            scores[firstMoveEndState] = 1
        } else {
            // check the allowedMoveIndex for the available moves
            var store = turn.allowedMoveIndex[moveHashes[0]]
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
        for (let color in Colors) {
            moveIndex[color] = {}
            for (let diceHash in pointMoves) {
                board.setup()
                let moveHashes = pointMoves[diceHash].map(({point, face}) =>
                    board.move(color, PointOrigins[color][point], face).hash
                )
                moveIndex[color][diceHash] = {
                    moveHashes
                  , firstMoveEndState : board.state28()
                }
            }
        }
        return moveIndex
    }
}

module.exports = FirstTurnRobot