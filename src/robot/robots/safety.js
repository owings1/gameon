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
            const {analyzer} = this.createBoard(endState)
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