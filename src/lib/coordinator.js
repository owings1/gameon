const Core = require('../lib/core')

const {White, Red, Opponent} = Core

class Coordinator {

    constructor() {
        this.holds = []
    }

    async runMatch(match, white, red) {
        const players = {
            White : white
          , Red   : red
        }
        await this.emitAll(players, 'matchStart', match)
        do {
            await this.emitAll(players, 'beforeNextGame', match, players)
            await this.runGame(players, match.nextGame(), match)
            match.updateScore()
        } while (!match.hasWinner())

        await this.emitAll(players, 'matchEnd', match)
    }

    async runGame(players, game, match) {
        players.White.opponent = players.Red
        players.Red.opponent = players.White
        await this.emitAll(players, 'gameStart', game, match, players)

        const firstTurn = game.firstTurn()
        await this.emitAll(players, 'firstRoll', firstTurn, game, match)
        await this.emitAll(players, 'afterRoll', firstTurn, game, match)

        await players[firstTurn.color].playRoll(firstTurn, game, match)
        firstTurn.finish()
        await this.emitAll(players, 'turnEnd', firstTurn, game, match)

        do {
            var turn = game.nextTurn()
            await this.emitAll(players, 'turnStart', turn, game, match)

            if (game.canDouble(turn.color)) {
                await players[turn.color].turnOption(turn, game, match)
            }
            if (turn.isDoubleOffered) {
                await this.emitAll(players, 'doubleOffered', turn, game, match)
                await players[turn.opponent].decideDouble(turn, game, match)
            }
            if (turn.isDoubleDeclined) {
                await this.emitAll(players, 'doubleDeclined', turn, game, match)
            } else {
                if (turn.isDoubleOffered) {
                    game.double()
                    await this.emitAll(players, 'doubleAccepted', turn, game, match)
                }
                await players[turn.color].rollTurn(turn, game, match)
                await this.emitAll(players, 'afterRoll', turn, game, match)
                await players[turn.color].playRoll(turn, game, match)
            }

            turn.finish()
            await this.emitAll(players, 'turnEnd', turn, game, match)
            
        } while (!game.checkFinished())

        await this.emitAll(players, 'gameEnd', game, match)
    }

    async emitAll(emitters, ...args) {
        Object.values(emitters).forEach(it => {
            it.coordinator = this
            it.emit(...args)
        })
        await Promise.all(this.holds)
        this.holds.splice(0)
    }
}

module.exports = Coordinator