const Base   = require('./base-player')
const Core   = require('../lib/core')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const {White, Red, Opponent} = Core

class DualPlayer extends Base {

    constructor(white, red) {
        super()
        this.players = {
            White : white
          , Red   : red
        }
        this.players.White.opponent = red
        this.players.Red.opponent = white
    }

    // @implement
    async playTurn(turn, game) {
        await this.players[turn.color].playTurn(turn, game)
    }

    // @implement
    async playRoll(turn, game) {
        await this.players[turn.color].playRoll(turn, game)
    }
}


module.exports = DualPlayer