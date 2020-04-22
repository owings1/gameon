const Base = require('../player').ConfidenceRobot

class PrimeRobot extends Base {

    async getRankings(turn, game, match) {

        if (turn.board.analyzer.isDisengaged()) {
            return this.zeroRankings(turn)
        }

        const scores = {}
        const zeros = []

        turn.allowedEndStates.forEach(endState => {
            const {analyzer} = this.createBoard(endState)
            const primes = analyzer.primes(turn.color)
            if (primes.length) {
                const maxSize = Math.max(...primes.map(prime => prime.size))
                scores[endState] = maxSize + this.sizeBonus(maxSize)
            } else {
                scores[endState] = 0
                zeros.push(endState)
            }
        })

        const rankings = this.spreadRanking(scores)
        zeros.forEach(endState => rankings[endState] = 0)

        return rankings
    }

    sizeBonus(size) {
        return (size - 2) * 2
    }
}

module.exports = PrimeRobot