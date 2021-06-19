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
const Core      = require('../../lib/core')

const {intRange} = require('../../lib/util')
const {Colors, PointOrigins} = Constants
const {Board} = Core
const {ZERO_SCORES} = Base

const {UndecidedMoveError} = Robot

const PointMoves = {
    '6,1': [{point: 13, face: 6}, {point:  8, face: 1}]
  , '5,1': [{point: 13, face: 5}, {point: 24, face: 1}]
  , '4,1': [{point: 24, face: 4}, {point: 24, face: 1}]
  , '3,1': [{point:  8, face: 3}, {point:  6, face: 1}]
  , '2,1': [{point: 13, face: 2}, {point: 24, face: 1}]
  , '6,2': [{point: 24, face: 6}, {point: 13, face: 2}]
  , '5,2': [{point: 13, face: 5}, {point: 24, face: 2}]
  , '4,2': [{point:  8, face: 4}, {point:  6, face: 2}]
  , '3,2': [{point: 24, face: 3}, {point: 13, face: 2}]
  , '6,3': [{point: 24, face: 6}, {point: 18, face: 3}]
  , '5,3': [{point:  8, face: 5}, {point:  6, face: 3}]
  , '4,3': [{point: 24, face: 4}, {point: 24, face: 3}]
  , '6,4': [{point: 24, face: 6}, {point: 18, face: 4}]
  , '5,4': [{point: 24, face: 4}, {point: 20, face: 5}]
  , '6,5': [{point: 24, face: 6}, {point: 18, face: 5}]
}

// {color: {diceHash : {moveHashes, firstMoveEndState}}
const MoveIndex = {}

function populateMoveIndex(moveIndex, pointMoves) {

    const board = new Board

    for (var color in Colors) {
        moveIndex[color] = {}
        for (var diceHash in pointMoves) {
            board.setup()
            var moveHashes = pointMoves[diceHash].map(({point, face}) =>
                board.move(color, PointOrigins[color][point], face).hash
            )
            moveIndex[color][diceHash] = {
                moveHashes
              , firstMoveEndState : board.state28()
            }
        }
    }
}

populateMoveIndex(MoveIndex, PointMoves)

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
}

module.exports = FirstTurnRobot