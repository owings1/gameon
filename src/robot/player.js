const Base   = require('../lib/player')
const Util   = require('../lib/util')

const merge = require('merge')

class Robot extends Base {

    constructor(color, opts) {
        super(color)
        this.isRobot = true
        this.opts = merge({}, opts)
    }

    async playRoll(turn, game, match) {
        const moves = await this.getMoves(turn, game, match)
        for (var move of moves) {
            turn.move(move)
        }
    }

    async getMoves(turn, game, match) {
        throw new Error('NotImplemented')
    }
}

class RandomRobot extends Robot {
    
    async getMoves(turn, game, match) {
        return Util.castToArray(Util.randomElement(turn.allowedMoveSeries)).map(move => move.coords())
    }
}


module.exports = {
    Robot
  , RandomRobot
}