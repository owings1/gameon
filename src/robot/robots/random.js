const Base = require('../player').ConfidenceRobot

class RandomRobot extends Base {

    async getRankings(turn, game, match) {
        return this.spreadRanking(this.zeroRankings(turn))
    }
}

module.exports = RandomRobot