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

    async playMatch(match) {
        this.players.White.thisMatch = match
        this.players.Red.thisMatch = match
        return super.playMatch(match)
    }
    // @implement
    async playRoll(turn, game) {
        await this.players[turn.color].playRoll(turn, game)
    }

    // @override
    async playTurn(turn, game) {
        await this.players[turn.color].playTurn(turn, game)
    }

    // @abstract BasePlayer
    //async turnOption(turn, game)
    //async decideDouble(turn, game)

}


module.exports = DualPlayer