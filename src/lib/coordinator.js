const Core   = require('../lib/core')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const fse   = require('fs-extra')
const merge = require('merge')
const path  = require('path')

const {White, Red, Opponent} = Core

class Coordinator {

    static defaults() {
        return {
            isRecord  : false
          , recordDir : null
        }
    }

    constructor(opts) {
        this.holds = []
        this.logger = new Logger
        this.opts = Util.defaults(Coordinator.defaults(), opts)
        if (this.opts.isRecord) {
            try {
                this.opts.recordDir = path.resolve(this.opts.recordDir)
            } catch (err) {
                throw new InvalidDirError('invalid recordDir', err)
            }
        }
    }

    async runMatch(match, white, red) {
        const players = {
            White : white
          , Red   : red
        }
        if (this.opts.isRecord) {
            var matchDir = path.resolve(this.opts.recordDir, ['match', match.uuid].join('_'))
            await fse.ensureDir(matchDir)
        }
        await this.emitAll(players, 'matchStart', match)
        do {
            await this.emitAll(players, 'beforeNextGame', match, players)
            await this.runGame(players, match.nextGame(), match)
            if (this.opts.isRecord) {
                var gameFile = path.resolve(matchDir, ['game', match.games.length].join('_') + '.json')
                await this.recordGame(match.thisGame, gameFile, players)
            }
            match.updateScore()
        } while (!match.hasWinner())

        await this.emitAll(players, 'matchEnd', match)
        if (this.opts.isRecord) {
            const matchFile = path.resolve(matchDir, 'match.json')
            await this.recordMatch(match, matchFile, players)
        }
    }

    async runGame(players, game, match) {

        await this.emitAll(players, 'gameStart', game, match, players)

        const firstTurn = game.firstTurn()
        await this.emitAll(players, 'firstRoll', firstTurn, game, match)
        await this.emitAll(players, 'afterRoll', firstTurn, game, match)

        await players[firstTurn.color].playRoll(firstTurn, game, match)
        firstTurn.finish()
        await this.emitAll(players, 'turnEnd', firstTurn, game, match)

        while (!game.checkFinished()) {

            var turn = game.nextTurn()
            await this.emitAll(players, 'turnStart', turn, game, match)

            if (game.canDouble(turn.color)) {
                await players[turn.color].turnOption(turn, game, match)
                await this.emitAll(players, 'afterOption', turn, game, match)
            }
            if (turn.isDoubleOffered) {
                await this.emitAll(players, 'doubleOffered', turn, game, match)
                this.logger.debug('decideDouble', turn.opponent)
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
            
        }

        await this.emitAll(players, 'gameEnd', game, match)
    }

    async recordMatch(match, file, players) {
        this.logger.info('Recording match')
        const meta = merge(match.meta(), {
            players : {
                White : players.White.meta()
              , Red   : players.Red.meta()
            }
        })
        await fse.writeJson(file, meta, {spaces: 2})
    }

    async recordGame(game, file, players) {
        this.logger.info('Recording game')
        const meta = merge(game.meta(), {
            players : {
                White : players.White.meta()
              , Red   : players.Red.meta()
            }
        })
        await fse.writeJson(file, meta, {spaces: 2})
    }

    async emitAll(emitters, ...args) {
        Object.values(emitters).forEach(it => {
            it.coordinator = this
            it.emit(...args)
        })
        await Promise.all(this.holds.splice(0))
    }
}

class InvalidDirError extends Error {
    constructor(...args) {
        super(...args)
        this.name = 'InvalidDirError'
    }
}
module.exports = Coordinator