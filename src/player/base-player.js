const Logger = require('../lib/logger')

class Player extends Logger {

    constructor() {
        super()
        this.thisMatch = null
    }

    async playMatch(match) {
        this.thisMatch = match
        this.info('Starting match')
        while (true) {
            var game = await this.nextGame()
            await this.playGame(game)
            await this.updateScore()
            if (match.hasWinner()) {
                break
            }
        }
        const winner = match.getWinner()
        const loser = match.getLoser()
        this.info(winner, 'wins the match', match.scores[winner], 'to', match.scores[loser])
        await this.endMatch()        
    }

    async playGame(game) {

        this.info('Starting game')
        const firstTurn = await this.firstTurn(game)
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())

        await this.playRoll(firstTurn, game)

        while (true) {

            var turn = await this.nextTurn(game)

            this.info(turn.color + "'s turn")

            await this.playTurn(turn, game)

            if (game.checkFinished()) {
                break
            }
        }

        await this.endGame(game)

        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async playTurn(turn, game) {
        if (game.canDouble(turn.color)) {
            var action = await this.turnOption(turn, game)
        }
        if (action == 'double') {
            await this.offerDouble(turn, game)
            const opponent = this.opponent || this
            await opponent.decideDouble(turn, game)
            if (turn.isDoubleDeclined) {
                return
            } else {
                game.double()
            }
            this.info('Opponent accepted the double')
        }
        await this.rollTurn(turn, game)
        await this.playRoll(turn, game)
    }

    async endMatch() {
        
    }

    async endGame(game) {
        
    }

    async abortMatch() {
        
    }

    async nextGame() {
        return this.thisMatch.nextGame()
    }

    async updateScore() {
        this.thisMatch.updateScore()
    }

    // @default
    async firstTurn(game) {
        return game.firstTurn()
    }

    // @default
    async nextTurn(game) {
        return game.nextTurn()
    }

    // @default
    async rollTurn(turn, game) {
        turn.roll()
    }

    // @abstract
    async turnOption(turn, game) {
        throw new Error('NotImplemented')
    }

    // @abstract
    async offerDouble(turn, game) {
        throw new Error('NotImplemented')
    }

    // @abstract
    async decideDouble(turn, game) {
        throw new Error('NotImplemented')
    }
        
}

module.exports = Player