const Base = require('../player').ConfidenceRobot

class RandomRobot extends Base {

    static getClassVersions() {
        return {
            v1 : this
          , v2 : RandomRobot_v2
        }
    }

    async getRankings(turn, game, match) {
        return this.spreadRanking(this.zeroRankings(turn))
    }
}

class RandomRobot_v2 extends Base {

    async getRankings(turn, game, match) {
        const scores = {}
        turn.allowedEndStates.forEach(endState => {
            scores[endState] = Math.random()
        })
        return this.spreadRanking(scores)
    }
}

module.exports = RandomRobot