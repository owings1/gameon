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
            if (game.checkFinished()) {
                return
            }
            if (!turn.isDoubleDeclined && turn.color == this.opponent.color) {
                const moves = turn.moves.map(move => move.coords())
                this.coordinator.holds.push(this.client.matchRequest('n_playRoll', {moves}))
            }
        })

        this.on('turnStart', (turn, game, match) => {
            this.coordinator.holds.push(this.client.matchRequest('nextTurn'))
        })

        this.on('doubleOffered', (turn, game, match) => {
            if (turn.color == this.opponent.color) {
                this.coordinator.holds.push(this.client.matchRequest('n_turnOption', {isDouble: true}))
            }
        })

        this.on('doubleAccepted', (turn, game, match) => {
            if (turn.color == this.color) {
                this.coordinator.holds.push(this.client.matchRequest('doubleResponse', {isAccept: true}))
            }
        })

        this.on('doubleDeclined', (turn, game, match) => {
            if (turn.color == this.color) {
                this.coordinator.holds.push(this.client.matchRequest('doubleResponse', {isAccept: false}))
            }
        })
    }

    async rollTurn(turn, game, match) {
        const {dice} = await this.client.matchRequest('n_rollTurn')
        turn.setRoll(dice)
    }

    async turnOption(turn, game, match) {
        const {isDouble} = await this.client.matchRequest('n_turnOption')
        if (isDouble) {
            turn.setDoubleOffered()
        }
    }

    async decideDouble(turn, game, match) {
        const {isAccept} = await this.client.matchRequest('doubleResponse')
        if (!isAccept) {
            turn.setDoubleDeclined()
        }
    }

    async playRoll(turn, game, match) {
        const {moves} = await this.client.matchRequest('n_playRoll')
        moves.forEach(move => turn.move(move.origin, move.face))
    }
}

module.exports = NetPlayer