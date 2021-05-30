/**
 * gameon - Coordinator class
 *
 * Copyright (C) 2020-2021 Doug Owings
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
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
            this.logger.debug(['afterRunGame'])
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
                await this.emitAll(players, 'beforeOption', turn, game, match)
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
        const meta = merge({
            players : {
                White : players.White.meta()
              , Red   : players.Red.meta()
            }
        }, match.meta())
        await fse.writeJson(file, meta, {spaces: 2})
    }

    async recordGame(game, file, players) {
        this.logger.info('Recording game')
        const meta = merge({
            players : {
                White : players.White.meta()
              , Red   : players.Red.meta()
            }
        }, game.meta())
        meta.turnHistory = game.turnHistory
        await fse.writeJson(file, meta, {spaces: 2})
    }

    async emitAll(emitters, ...args) {
        var holds = []
        for (var it of Object.values(emitters)) {
            await it.emit(...args)
            holds = holds.concat(Util.castToArray(it.holds).splice(0))
        }
        for (var promise of holds.splice(0)) {
            await promise
        }
        //Object.values(emitters).forEach(it => {
        //    it.emit(...args)
        //    holds = holds.concat(Util.castToArray(it.holds).splice(0))
        //})
        //await Promise.all(holds.splice(0))
    }
}

class InvalidDirError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}
module.exports = Coordinator