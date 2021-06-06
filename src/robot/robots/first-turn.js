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
const Core  = require('../../lib/core')
const Robot = require('../player')
const Base  = Robot.ConfidenceRobot

const {intRange} = require('../../lib/util')
const {Colors, Board} = Core
const {ZERO_RANKINGS} = Base

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
                board.move(color, board.analyzer.pointOrigin(color, point), face).hash
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

    async getRankings(turn, game, match) {
        // initialize rankings
        const turnCount = game.getTurnCount()
        // skip non-game, greater than second turn, and doubles
        if (!game || turnCount > 2 || turn.dice[0] == turn.dice[1]) {
            return ZERO_RANKINGS
        }
        const rankings = this.zeroRankings(turn)
        const diceHash = turn.diceSorted.join(',')
        // we only have one potential move series
        const {moveHashes, firstMoveEndState} = MoveIndex[turn.color][diceHash]
        // if this is the first move, we must be ok
        if (turnCount == 1) {
            rankings[firstMoveEndState] = 1
        } else {
            // check the allowedMoveIndex for the available moves
            var store = turn.allowedMoveIndex[moveHashes[0]]
            if (store) {
                store = store.index[moveHashes[1]]
                if (store) {
                    rankings[store.move.board.state28()] = 1 / turnCount
                }
            }
        }
        return rankings
    }
}

module.exports = FirstTurnRobot