const Base = require('../player').ConfidenceRobot

class OccupyRobot extends Base {

    // maximum number of points held
    async getRankings(turn, game, match) {
        if (turn.board.analyzer.isDisengaged()) {
            return this.zeroRankings(turn)
        }
        const pointCounts = {}
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = this.createBoard(endState)
            pointCounts[endState] = analyzer.slotsHeld(turn.color).length
        })
        return this.spreadRanking(pointCounts)
    }
}

module.exports = OccupyRobot