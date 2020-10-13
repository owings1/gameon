/**
 * gameon - FirstTurn Robot
 *
 * Copyright (C) 2020 Doug Owings
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
const Robot = require('../player')
const Base  = Robot.ConfidenceRobot

const {UndecidedMoveError} = Robot

class FirstTurnRobot extends Base {

    async getRankings(turn, game, match) {
        const rankings = this.zeroRankings(turn)
        if (!game || game.turns.length > 2 || turn.dice[0] == turn.dice[1]) {
            return rankings
        }
        const board = turn.board.copy()
        try {
            this.pointMoves(turn.diceSorted).forEach(({point, face}) => {
                board.move(turn.color, board.pointOrigin(turn.color, point), face)
            })
            rankings[board.stateString()] = 1 / game.turns.length
        } catch (err) {
            if (turn.isFirstTurn || !err.isIllegalMoveError) {
                throw err
            }
        }
        return rankings
    }

    pointMoves(diceSorted) {
        switch (diceSorted.join()) {
            case '6,1':
                return [{point: 13, face: 6}, {point: 8, face: 1}]
            case '5,1':
                return [{point: 13, face: 5}, {point: 24, face: 1}]
            case '4,1':
                return [{point: 24, face: 4}, {point: 24, face: 1}]
            case '3,1':
                return [{point: 8, face: 3}, {point: 6, face: 1}]
            case '2,1':
                return [{point: 13, face: 2}, {point: 24, face: 1}]
            case '6,2':
                return [{point: 24, face: 6}, {point: 13, face: 2}]
            case '5,2':
                return [{point: 13, face: 5}, {point: 24, face: 2}]
            case '4,2':
                return [{point: 8, face: 4}, {point: 6, face: 2}]
            case '3,2':
                return [{point: 24, face: 3}, {point: 13, face: 2}]
            case '6,3':
                return [{point: 24, face: 6}, {point: 18, face: 3}]
            case '5,3':
                return [{point: 8, face: 5}, {point: 6, face: 3}]
            case '4,3':
                return [{point: 24, face: 4}, {point: 24, face: 3}]
            case '6,4':
                return [{point: 24, face: 6}, {point: 18, face: 4}]
            case '5,4':
                return [{point: 24, face: 4}, {point: 20, face: 5}]
            case '6,5':
                return [{point: 24, face: 6}, {point: 18, face: 5}]
            default:
                throw new UndecidedMoveError('No first move for ' + diceSorted.join())
        }
    }
}

module.exports = FirstTurnRobot