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
/**
 * ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 * ┃ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ┃
 * ┃ ┃                                                                             ┃ ┃
 * ┃ ┃    Coordinator Events (emitted on players)                                  ┃ ┃
 * ┃ ┃                                                                             ┃ ┃
 * ┃ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ┃
 * ┣━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ matchCanceled   ┃  Emitted when cancelMatch() is called on the coordinator.     ┃
 * ┃                 ┃  The match is first canceled with match.cancel(). The error   ┃
 * ┃                 ┃  passed to cancelMatch() may or may not be thrown by either   ┃
 * ┃                 ┃  runMatch() or runGame(). NB that if match.cancel() is        ┃
 * ┃                 ┃  called independently, this event will not be propagated      ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                                                                                 ┃
 * ┃      ┏ * ━ * ━ * ━ * ━ * ━ * ━ *   N. B.   * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ┓      ┃
 * ┃      *                                                                   *      ┃
 * ┃      ┃  matchCanceled might be emitted at any point during the match     ┃      ┃
 * ┃      *                                                                   *      ┃
 * ┃      ┗ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ┛      ┃
 * ┃                                                                                 ┃
 * ┣━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ matchStart      ┃  Before any action on a new match.                            ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ beforeNextGame  ┃  Before match.nextGame() is called                            ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ gameStart       ┃  Before game.firstTurn() is called                            ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ firstRoll       ┃  After game.firstTurn() is called, which automatically rolls. ┃
 * ┃                 ┃  In this case, the next event will be afterRoll.              ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ turnStart       ┃  After game.nextTurn() is called, before rolling or option.   ┃
 * ┃                 ┃  this is not emitted for the first turn.                      ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ beforeOption    ┃  Before the player has the option to roll or double.          ┃
 * ┃                 ┃  This is only emitted if the player whose turn it is          ┃
 * ┃                 ┃  could double, so it is skipped if:                           ┃
 * ┃                 ┃      - it is the first turn of the game                       ┃
 * ┃                 ┃      - the player already owns the cube                       ┃
 * ┃                 ┃      - it is a crawford game                                  ┃
 * ┃                 ┃      - the cube is at its max value                           ┃
 * ┃                 ┃      - the cube is disabled                                   ┃
 * ┃                 ┃  The event is emitted on both players, but only the turn's    ┃
 * ┃                 ┃  player will have its turnOption() method called, where       ┃
 * ┃                 ┃  the player will either roll the turn, or setDoubleOffered    ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ afterOption     ┃  After the turn's player's turnOption() call is finished.     ┃
 * ┃                 ┃  At this point the turn will either be rolled, or have        ┃
 * ┃                 ┃  isDoubleOffered. So the next event will either be afterRoll  ┃
 * ┃                 ┃  or doubleOffered.                                            ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ doubleOffered   ┃  When a double was offereed after turnOption(), before the    ┃
 * ┃                 ┃  turn's opponent player's decideDouble() method is called.    ┃
 * ┃                 ┃  In this case, the next event will either be doubleDeclined,  ┃
 * ┃                 ┃  or doubleAccepted.                                           ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ doubleDeclined  ┃  After the turn's opponent player's decideDouble() and the    ┃
 * ┃                 ┃  turn has isDoubleDeclined. In this case, the next event      ┃
 * ┃                 ┃  will be turnEnd, followed by gameEnd.                        ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ doubleAccepted  ┃  After the turn's opponent player's decideDouble() and the    ┃
 * ┃                 ┃  turn does not have isDoubleDeclined. In this case the turn   ┃
 * ┃                 ┃  is immediately rolled, and the next event is afterRoll       ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ afterRoll       ┃  After a turn is rolled, including the first turn. For the    ┃
 * ┃                 ┃  first turn, this is emitted immediately after firstRoll.     ┃
 * ┃                 ┃  In cases where the turn's player may not double, this comes  ┃
 * ┃                 ┃  after turnStart. In cases where the turn's player chose      ┃
 * ┃                 ┃  not to double, this follows afterOption. If the player       ┃
 * ┃                 ┃  doubled, then it follow doubleAccepted. The turn's player's  ┃
 * ┃                 ┃  playRoll() method is then called.                            ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ turnEnd         ┃  When the turn is finished. Though this is typically after    ┃
 * ┃                 ┃  are completed, it is emitted after every turn, including     ┃
 * ┃                 ┃  when a double is declined, or the player cannot move. If     ┃
 * ┃                 ┃  this turn is canceled, this event is not emitted. If the     ┃
 * ┃                 ┃  game is finished, the next event is gameEnd, otherwise it    ┃
 * ┃                 ┃  is turnStart.                                                ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ gameEnd         ┃  After the game is finished, i.e. has a winner. This is not   ┃
 * ┃                 ┃  emitted when the game is canceled. The next event is either  ┃
 * ┃                 ┃  matchEnd, or beforeNextGame.                                 ┃
 * ┃                 ┃                                                               ┃
 * ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃                 ┃                                                               ┃
 * ┃ matchEnd        ┃  After the match is finished, i.e. has a winner. This is not  ┃
 * ┃                 ┃  emitted when the match is canceled.                          ┃
 * ┃                 ┃                                                               ┃
 * ┗━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 */
const Constants = require('./constants')
const Errors    = require('./errors')
const Logger    = require('./logger')
const Util      = require('./util')

const fse  = require('fs-extra')
const path = require('path')

const {InvalidDirError} = Errors

const {
    append
  , defaults
  , castToArray
  , fileDateString
  , homeTilde
} = Util

class Coordinator {

    /**
     * @returns Object
     */
    static defaults() {
        return {
            isRecord  : false
          , recordDir : null
          , name      : 'Coordinator'
        }
    }

    /**
     * @throws ArgumentError.InvalidDirError
     */
    constructor(opts) {

        this.opts = defaults(Coordinator.defaults(), opts)
        this.logger = new Logger(this.opts.name, {named: true})

        if (this.opts.isRecord) {
            try {
                path.resolve(this.opts.recordDir)
            } catch (err) {
                throw new InvalidDirError('Invalid recordDir', err)
            }
        }
    }

    /**
     * @async
     *
     * @throws Error
     */
    async runMatch(match, white, red) {

        const players = Coordinator.buildPlayers(white, red)

        this.checkCancel(match)

        await this.emitAll(players, 'matchStart', match, players)
        this.checkCancel(match)

        if (this.opts.isRecord) {
            var matchDir = this.getMatchDir(match)
            var gamePad = (match.total * 2 - 1).toString().length
        }

        let gameCount = 0

        do {

            gameCount += 1

            this.checkCancel(match)

            await this.emitAll(players, 'beforeNextGame', match, players)
            this.checkCancel(match)

            await this.runGame(players, match.nextGame(), match)
            this.checkCancel(match, match.thisGame)

            if (this.opts.isRecord) {
                var numStr = gameCount.toString().padStart(gamePad, '0')
                var gameFile = path.resolve(matchDir, 'game_' + numStr + '.json')
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

    /**
     * @async
     *
     * @throws Error
     */
    async runGame(players, game, match) {

        this.checkCancel(match, game)

        await this.emitAll(players, 'gameStart', game, match, players)
        this.checkCancel(match, game)

        const firstTurn = game.firstTurn()

        await this.emitAll(players, 'firstRoll', firstTurn, game, match)
        this.checkCancel(match, game, firstTurn)

        await this.emitAll(players, 'afterRoll', firstTurn, game, match)
        this.checkCancel(match, game, firstTurn)

        await players[firstTurn.color].playRoll(firstTurn, game, match)
        this.checkCancel(match, game, firstTurn)

        firstTurn.finish()

        await this.emitAll(players, 'turnEnd', firstTurn, game, match)
        this.checkCancel(match, game, firstTurn)

        while (!game.checkFinished()) {

            let turn = game.nextTurn()

            await this.emitAll(players, 'turnStart', turn, game, match)
            this.checkCancel(match, game, turn)

            try {
                if (game.canDouble(turn.color)) {

                    await this.emitAll(players, 'beforeOption', turn, game, match)
                    this.checkCancel(match, game, turn)

                    await players[turn.color].turnOption(turn, game, match)
                    this.checkCancel(match, game, turn)

                    await this.emitAll(players, 'afterOption', turn, game, match)
                    this.checkCancel(match, game, turn)
                }

                if (turn.isDoubleOffered) {

                    await this.emitAll(players, 'doubleOffered', turn, game, match)
                    this.checkCancel(match, game, turn)

                    await players[turn.opponent].decideDouble(turn, game, match)
                    this.checkCancel(match, game, turn)
                }

                if (turn.isDoubleDeclined) {
                    await this.emitAll(players, 'doubleDeclined', turn, game, match)
                    this.checkCancel(match, game, turn)
                } else {
                    if (turn.isDoubleOffered) {
                        game.double()
                        await this.emitAll(players, 'doubleAccepted', turn, game, match)
                        this.checkCancel(match, game, turn)
                    }

                    await players[turn.color].rollTurn(turn, game, match)
                    this.checkCancel(match, game, turn)

                    await this.emitAll(players, 'afterRoll', turn, game, match)
                    this.checkCancel(match, game, turn)

                    await players[turn.color].playRoll(turn, game, match)
                    this.checkCancel(match, game, turn)
                }
            } catch (err) {
                if (err.isTurnCanceledError) {
                    this.checkCancel(match, game, turn)
                }
                throw err
            }

            turn.finish()

            if (!turn.isCanceled) {
                await this.emitAll(players, 'turnEnd', turn, game, match)
                this.checkCancel(match, game, turn)
            }
        }

        if (game.isCanceled) {
            this.logger.warn('The game was canceled')
        } else {
            await this.emitAll(players, 'gameEnd', game, match)
            this.checkCancel(match, game)
        }
    }

    /**
     * @async
     *
     * @throws Error
     */
    async cancelMatch(match, players, err) {
        //match._cancelingCoordinator = this
        //match._coordinatorCancelError = err
        match.cancel(err)
        await this.emitAll(players, 'matchCanceled', err, match)
    }

    /**
     * @throws Error
     */
    checkCancel(...args) {
        for (let i = 0; i < args.length; ++i) {
            if (args[i] && args[i].isCanceled) {
                throw args[i].cancelError
            }
        }
    }

    /**
     * @async
     *
     * @throws Error
     */
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

    /**
     * @async
     *
     * @throws Error
     */
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

    /**
     * @async
     *
     * @throws Error
     */
    async emitAll(emitters, ...args) {
        const event = args[0]
        this.logger.debug('emitAll', event)
        const emittersArr = Object.values(emitters)
        try {
            const holds = []
            for (let i = 0; i < emittersArr.length; ++i) {
                emittersArr[i].emit(...args)
                append(holds, castToArray(emittersArr[i].holds).splice(0))
            }
            for (let j = 0; j < holds.length; ++j) {
                await holds[j]
            }
        } catch (err) {
            this.logger.debug('emitAll.catch', event, err.name)
            const emErrs = emittersArr.map((emitter, i) => {
                const name = emitter.name || emitter.constructor.name
                const eminfo = ['emitter', i + 1, 'of', emittersArr.length]
                if (err.isMatchCanceledError) {
                    if (emitter.emit('matchCanceled', err)) {
                        this.logger.debug('matchCanceled handled by', name, ...eminfo)
                        return false
                    }
                    this.logger.debug('matchCanceled unhandled by', name, ...eminfo)
                }
                return [name, eminfo, emitter]
            }).filter(it => it).map(([name, eminfo, emitter]) => {
                try {
                    emitter.emit('error', err)
                    this.logger.debug('generic error handled by', name, ...eminfo)
                    return false
                } catch (e) {
                    this.logger.warn('generic error unhandled by', name, ...eminfo)
                    return [name, eminfo, e]
                }
            }).filter(it => it)
            if (!emErrs.length) {
                return
            }
            emErrs.forEach(([name, eminfo, e]) => {
                this.logger.error(
                    `Error on event ${event} unhandled by ${name}`, ...eminfo, e
                )
            })
            throw err
        }
    }

    /**
     * @returns string
     */
    getMatchDir(match) {
        const dateString = fileDateString(match.createDate).substring(0, 19)
        const idString = match.uuid.substring(0, 4)
        const dirname = ['match', dateString, idString].join('_')
        return path.resolve(this.opts.recordDir, 'matches', dirname)
    }

    /**
     * @returns integer
     */
    get loglevel() {
        return this.logger.loglevel
    }

    /**
     *
     */
    set loglevel(n) {
        this.logger.loglevel = n
    }

    /**
     * @returns Object {string: Player}
     */
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