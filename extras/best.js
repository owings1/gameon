const Core = require('../src/lib/core')
const DualPlayer = require('../src/player/dual-player')
const MonoPlayer = require('../src/player/mono-player')

const {Game, White, Red} = Core
const {RandomBase} = MonoPlayer

var exp = '0|0|2:White|0:|0:|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|2:White|0:|4:White|2:White|0:|0:|0:|2:Red|0|0'

var player = new DualPlayer(new RandomBase, new RandomBase)
var game = new Game
game._rollFirst = () => [3, 1]
var firstTurn = game.firstTurn()
firstTurn.isFinished = true
var candidates = firstTurn.allowedEndStates
var scores = {}

;(async () => {
    for (var cand of candidates) {
        scores[cand] = 0
        for (var i = 0; i < 10; i++) {
            game.isFinished = false
            game.thisTurn = firstTurn
            game.board.setStateString(cand)
            while (true) {
                game.nextTurn().roll()
                player.playRoll(game.thisTurn, game)
                game.thisTurn.finish()
                if (game.checkFinished()) {
                    break
                }
            }
            if (game.getWinner() == White) {
                scores[cand] += 1
            }
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
    }
    console.log(scores)
})();








