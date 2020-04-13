const Core = require('./core')

const {EventEmitter} = require('events')

const {White, Red, Opponent} = Core

class Player extends EventEmitter {

    constructor(color) {
        super()
        this.name = this.constructor.name
        this.color = color
        this.on('matchStart', match => this.thisMatch = match)
        this.on('gameStart', (game, match, players) => {
            this.thisGame = game
        })
    }

    destroy() {
        this.removeAllListeners()
    }

    async rollTurn(turn, game, match) {
        turn.roll()
    }

    async turnOption(turn, game, match) {
        // to double, call turn.setDoubleOffered()
    }

    async decideDouble(turn, game, match) {
        // to decline, call turn.setDoubleDeclined()
    }

    async playRoll(turn, game, match) {
        throw new Error('NotImplemented')
    }

    meta() {
        return {name: this.name, color: this.color}
    }
}

module.exports = Player