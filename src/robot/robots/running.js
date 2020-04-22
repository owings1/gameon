const Base = require('../player').ConfidenceRobot

const {sumArray}  = require('../../lib/util')

class RunningRobot extends Base {

    async getRankings(turn, game, match) {
        const scores = {}
        //const bkBefore = turn.board.analyzer.countPiecesInPointRange(turn.color, 19, 24)
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = this.createBoard(endState)
            scores[endState] = sumArray(analyzer.pointsOccupied(turn.color).map(point =>
                point * analyzer.piecesOnPoint(turn.color, point) * this.quadrantMultiplier(point)
            ))
        })
        return this.spreadRanking(scores, true)
    }

    quadrantMultiplier(point) {
        const quadrant = Math.ceil(point / 6)
        if (quadrant == 4) {
            return 8
        }
        return (quadrant - 1) / 2
    }
}

module.exports = RunningRobot