const Base   = require('../lib/player')
const Core   = require('../lib/core')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const {White, Red} = Core

class NetPlayer extends Base {
    
    constructor(client, ...args) {
        super(...args)
        this.client = client
        this.logger = new Logger
        this.isNet = true

        this.on('gameStart', (game, match, players) => {
            this.coordinator.holds.push(new Promise(async (resolve) => {
                await this.client.matchRequest('nextGame')
                const {dice} = await this.client.matchRequest('firstTurn')
                this.logger.info({dice})
                game._rollFirst = () => {
                    return dice
                }
                this.opponent.rollTurn = async (turn, game, match) => {
                    await this.rollTurn(turn, game, match)
                }
                resolve()
            }))
        })
        this.on('turnEnd', (turn, game, match) => {
            if (turn.color == this.opponent.color) {
                const moves = turn.moves.map(move => move.coords())
                this.coordinator.holds.push(this.client.matchRequest('n_playRoll', {moves}))
            }
        })

        this.on('turnStart', (turn, game, match) => {
            this.coordinator.holds.push(this.client.matchRequest('nextTurn'))
        })
    }

    async rollTurn(turn, game, match) {
        const {dice} = await this.client.matchRequest('n_rollTurn')
        turn.setRoll(dice)
    }

    async turnOption(turn, game, match) {
        // to double, call turn.setDoubleOffered()
    }

    async decideDouble(turn, game, match) {
        // to decline, call turn.setDoubleDeclined()
    }

    async playRoll(turn, game, match) {
        const {moves} = await this.client.matchRequest('n_playRoll')
        moves.forEach(move => turn.move(move.origin, move.face))
    }
}

module.exports = NetPlayer