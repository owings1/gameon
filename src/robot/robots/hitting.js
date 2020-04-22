const Base = require('../player').ConfidenceRobot

class HittingRobot extends Base {

    async getRankings(turn, game, match) {

        const baseline = turn.board.bars[turn.opponent].length

        const counts = {}
        //const zeros = []

        // TODO: quadrant/pip offset
        turn.allowedEndStates.forEach(endState => {
            const board = this.createBoard(endState)
            const added = board.bars[turn.opponent].length - baseline
            counts[endState] = added
            //if (added < 1) {
            //    zeros.push(endState)
            //}
        })

        const rankings = this.spreadRanking(counts)
        //zeros.forEach(endState => rankings[endState] = 0)

        return rankings
    }
}

module.exports = HittingRobot