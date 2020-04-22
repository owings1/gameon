const Base = require('../player').ConfidenceRobot

class BearoffRobot extends Base {

    async getRankings(turn, game, match) {

        const baseline = turn.board.analyzer.piecesHome(turn.color)

        const scores = {}
        var hasBearoff = false
        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = this.createBoard(endState)
            if (!analyzer.board.mayBearoff(turn.color)) {
                scores[endState] = 0
                return
            }
            hasBearoff = true
            const homes = analyzer.piecesHome(turn.color) - baseline
            scores[endState] = homes * 10
            if (analyzer.isDisengaged()) {
                const pointsCovered = analyzer.pointsOccupied(turn.color).length
                scores[endState] += pointsCovered
            }
        })
        return hasBearoff ? this.spreadRanking(scores) : this.zeroRankings(turn)
    }
}

module.exports = BearoffRobot