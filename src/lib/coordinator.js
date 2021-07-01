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
const Constants = require('./constants')
const Errors    = require('./errors')
const Logger    = require('./logger')
const Util      = require('./util')

const fse   = require('fs-extra')
const path  = require('path')

const {InvalidDirError} = Errors

const {fileDateString, homeTilde} = Util

class Coordinator {

    static defaults() {
        return {
            isRecord  : false
          , recordDir : null
          , name      : 'Coordinator'
        }
    }

    constructor(opts) {

        this.opts = Util.defaults(Coordinator.defaults(), opts)
        this.logger = new Logger(this.opts.name, {named: true})

        if (this.opts.isRecord) {
            try {
                path.resolve(this.opts.recordDir)
            } catch (err) {
                throw new InvalidDirError('Invalid recordDir', err)
            }
        }
    }

    async runMatch(match, white, red) {

        const players = Coordinator.buildPlayers(white, red)

        await this.emitAll(players, 'matchStart', match, players)

        if (this.opts.isRecord) {
            var matchDir = this.getMatchDir(match)
            var gamePad = (match.total * 2 - 1).toString().length
        }

        var gameCount = 0

        do {

            gameCount += 1

            await this.emitAll(players, 'beforeNextGame', match, players)

            await this.runGame(players, match.nextGame(), match)

            if (this.opts.isRecord) {
                var gameFile = path.resolve(matchDir, 'game_' + gameCount.toString().padStart(gamePad, '0') + '.json')
                await this.recordGame(match.thisGame, gameFile)
            }

            match.updateScore()

        } while (!match.checkFinished())

        if (match.isCanceled) {
            this.logger.warn('The match was canceled')
        } else {
            await this.emitAll(players, 'matchEnd', match)
        }

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

            try {
                if (game.canDouble(turn.color)) {
                    await this.emitAll(players, 'beforeOption', turn, game, match)
                    await players[turn.color].turnOption(turn, game, match)
                    await this.emitAll(players, 'afterOption', turn, game, match)
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
            } catch (err) {
                if (err.isTurnCanceledError) {
                    if (match && match._cancelingCoordinator === this) {
                        this.logger.warn('The match has been canceled, throwing prior error')
                        err = match._coordinatorCancelError
                        delete match._coordinatorCancelError
                        delete match._cancelingCoordinator
                    } else if (game._cancelingCoordinator === this) {
                        this.logger.warn('The game has been canceled, throwing prior error')
                        err = game._coordinatorCancelError
                        delete game._coordinatorCancelError
                        delete game._cancelingCoordinator
                    }
                }
                throw err
            }

            turn.finish()

            await this.emitAll(players, 'turnEnd', turn, game, match)
        }

        if (game.isCanceled) {
            this.logger.warn('The game was canceled')
        } else {
            await this.emitAll(players, 'gameEnd', game, match)
        }
    }

    async cancelGame(game, players, err) {
        game._cancelingCoordinator = this
        game._coordinatorCancelError = err
        game.cancel()
        await this.emitAll(players, 'gameCanceled', err, game)
    }

    async cancelMatch(match, players, err) {
        match._cancelingCoordinator = this
        match._coordinatorCancelError = err
        match.cancel()
        await this.emitAll(players, 'matchCanceled', err, match)
    }

    async recordMatch(match, file, players) {
        const dir = path.dirname(file)
        this.logger.info('Recording match to', homeTilde(dir))
        await fse.ensureDir(dir)
        const meta = {
            ...match.meta()
          , players : {
                White : players.White.meta()
              , Red   : players.Red.meta()
            }
        }
        await fse.writeJson(file, meta, {spaces: 2})
    }

    async recordGame(game, file) {
        const dir = path.dirname(file)
        this.logger.info('Recording game')
        await fse.ensureDir(dir)
        const meta = {
            ...game.meta()
          , turnHistory : game.turnHistory
        }
        await fse.writeJson(file, meta, {spaces: 2})
    }

    async emitAll(emitters, ...args) {
        var holds = []
        try {
            for (var it of Object.values(emitters)) {
                it.emit(...args)
                holds = holds.concat(Util.castToArray(it.holds).splice(0))
            }
            for (var promise of holds.splice(0)) {
                await promise
            }
        } catch (err) {
            this.logger.error('Error on event', args[0], err)
            throw err
        }
        //Object.values(emitters).forEach(it => {
        //    it.emit(...args)
        //    holds = holds.concat(Util.castToArray(it.holds).splice(0))
        //})
        //await Promise.all(holds.splice(0))
    }

    getMatchDir(match) {
        const dateString = fileDateString(match.createDate).substring(0, 19)
        const idString = match.uuid.substring(0, 4)
        const dirname = ['match', dateString, idString].join('_')
        return path.resolve(this.opts.recordDir, 'matches', dirname)
    }

    static buildPlayers(white, red) {
        const players = {}
        if (Array.isArray(white)) {
            players.White = white[0]
            players.Red = white[1]
        } else if (white.isPlayer) {
            players.White = white
            players.Red = red
        } else {
            players.White = white.White
            players.Red = white.Red
        }
        return players
    }
}

module.exports = Coordinator