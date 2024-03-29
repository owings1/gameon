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
import fse from 'fs-extra'
import path from 'path'
import {extend} from '@quale/core/arrays.js'
import {castToArray} from '@quale/core/types.js'
import {InvalidDirError} from './errors.js'

import {
    defaults,
    createLogger,
    fileDateString,
    homeTilde,
} from './util.js'

export default class Coordinator {

    /**
     * Get the default options.
     *
     * @return {object} The default options
     */
    static defaults() {
        return {
            isRecord  : false,
            recordDir : null,
        }
    }

    /**
     * Constructor
     *
     * @param {object} opts The options
     *
     * @throws {InvalidDirError}
     */
    constructor(opts = undefined) {
        this.opts = defaults(Coordinator.defaults(), opts)
        this.name = this.constructor.name
        this.logger = createLogger(this, {type: 'named'})
        if (this.opts.isRecord) {
            try {
                path.resolve(this.opts.recordDir)
            } catch (err) {
                throw new InvalidDirError('Invalid recordDir', err)
            }
        }
    }

    /**
     * Run a match.
     *
     * @async
     *
     * @param {Match} match The match to run
     * @param {{Player}|Player[]|Player} players The players
     *
     * @throws
     */
    async runMatch(match, ...players) {
        players = Coordinator.buildPlayers(...players)
        this.checkCancel(match)
        await this.emitWaitAndCheck(players, 'matchStart', match, players)
        let gamePad
        let matchDir
        if (this.opts.isRecord) {
            matchDir = this.getMatchDir(match)
            gamePad = (match.total * 2 - 1).toString().length
        }
        let gameCount = 0
        do {
            gameCount += 1
            this.checkCancel(match)
            await this.emitWaitAndCheck(players, 'beforeNextGame', match, players)
            await this.runGame(players, match.nextGame(), match)
            this.checkCancel(match, match.thisGame)
            if (this.opts.isRecord) {
                const numStr = gameCount.toString().padStart(gamePad, '0')
                const gameFile = path.resolve(matchDir, 'game_' + numStr + '.json')
                await this.recordGame(match.thisGame, gameFile)
            }
            match.updateScore()
        } while (!match.checkFinished())
        await this.emitAndWait(players, 'matchEnd', match)
        if (this.opts.isRecord) {
            const matchFile = path.resolve(matchDir, 'match.json')
            await this.recordMatch(match, matchFile, players)
        }
    }

    /**
     * Run a game.
     *
     * @async
     *
     * @param {object{color: Player}} players Players object
     * @param {Game} game The game to run
     * @param {Match} match The match of the game
     *
     * @throws
     */
    async runGame(players, game, match = undefined) {
        this.checkCancel(match, game)
        await this.emitWaitAndCheck(players, 'gameStart', game, match, players)
        const firstTurn = game.firstTurn()
        await this.emitWaitAndCheck(players, 'firstRoll', firstTurn, game, match)
        await this.emitWaitAndCheck(players, 'afterRoll', firstTurn, game, match)
        await players[firstTurn.color].playRoll(firstTurn, game, match)
        this.checkCancel(match, game, firstTurn)
        firstTurn.finish()
        await this.emitWaitAndCheck(players, 'turnEnd', firstTurn, game, match)
        while (!game.checkFinished()) {
            const turn = game.nextTurn()
            await this.emitWaitAndCheck(players, 'turnStart', turn, game, match)
            if (game.canDouble(turn.color)) {
                await this.emitWaitAndCheck(players, 'beforeOption', turn, game, match)
                await players[turn.color].turnOption(turn, game, match)
                this.checkCancel(match, game, turn)
                await this.emitWaitAndCheck(players, 'afterOption', turn, game, match)
            }
            if (turn.isDoubleOffered) {
                await this.emitWaitAndCheck(players, 'doubleOffered', turn, game, match)
                await players[turn.opponent].decideDouble(turn, game, match)
                this.checkCancel(match, game, turn)
            }
            if (turn.isDoubleDeclined) {
                await this.emitWaitAndCheck(players, 'doubleDeclined', turn, game, match)
            } else {
                if (turn.isDoubleOffered) {
                    game.double()
                    await this.emitWaitAndCheck(players, 'doubleAccepted', turn, game, match)
                }
                await players[turn.color].rollTurn(turn, game, match)
                this.checkCancel(match, game, turn)
                await this.emitWaitAndCheck(players, 'afterRoll', turn, game, match)
                await players[turn.color].playRoll(turn, game, match)
                this.checkCancel(match, game, turn)
            }
            turn.finish()
            await this.emitWaitAndCheck(players, 'turnEnd', turn, game, match)
        }
        await this.emitWaitAndCheck(players, 'gameEnd', game, match)
    }

    /**
     * Cancel a match.
     *
     * @async
     *
     * @param {Match} match The match to cancel
     * @param {{Player}Player[]} players The players
     * @param {Error} err The reason the match is canceled
     *
     * @throws
     */
    cancelMatch(match, players, err) {
        match.cancel(err)
        return this.emitAndWait(players, 'matchCanceled', err, match)
    }

    /**
     * Check all arguments for isCanceled property, and throw the cancelError.
     *
     * @param {*...} args Objects to check for isCanceled
     *
     * @throws
     */
    checkCancel(...args) {
        for (let i = 0; i < args.length; ++i) {
            if (args[i] && args[i].isCanceled) {
                throw args[i].cancelError
            }
        }
    }

    /**
     * Record match information to a file.
     *
     * @async
     *
     * @param {Match} match The match to record
     * @param {String} file Output file
     * @param {{Player}} players The players of the match
     *
     * @throws
     */
    async recordMatch(match, file, players) {
        const dir = path.dirname(file)
        this.logger.info('Recording match to', homeTilde(dir))
        await fse.ensureDir(dir)
        const meta = {
            ...match.meta(),
            players : {
                White : players.White.meta(),
                Red   : players.Red.meta(),
            }
        }
        await fse.writeJson(file, meta, {spaces: 2})
    }

    /**
     * Record game information to a file.
     *
     * @async
     *
     * @param {Game} game The game to record
     * @param {String} file The output file
     *
     * @throws
     */
    async recordGame(game, file) {
        const dir = path.dirname(file)
        this.logger.info('Recording game')
        await fse.ensureDir(dir)
        const meta = {
            ...game.meta(),
            turnHistory: game.turnHistory
        }
        await fse.writeJson(file, meta, {spaces: 2})
    }

    /**
     * Emit an event on all the players, await any holds, and check for canceled.
     *
     * @async
     * 
     * @param {object|Player[]} players The players to emit
     * @param {String} event Event name
     * @param {...*} args Arguments for the listener
     *
     * @throws
     */
    async emitWaitAndCheck(players, event, ...args) {
        await this.emitAndWait(players, event, ...args)
        this.checkCancel(...args)
    }

    /**
     * Emit an event on all the players, and await any holds.
     *
     * @async
     *
     * @param {object|Player[]} players The players to emit
     * @param {String} event Event name
     * @param {...*} args... Arguments for the listener
     *
     * @throws
     */
    async emitAndWait(players, event, ...args) {
        this.logger.debug('emitAndWait', event)
        const emitters = Object.values(players)
        try {
            const holds = []
            for (let i = 0; i < emitters.length; ++i) {
                emitters[i].emit(event, ...args)
                extend(holds, castToArray(emitters[i].holds).splice(0))
            }
            await Promise.all(holds)
        } catch (err) {
            this.logger.debug('emitAndWait.catch', event, err.name)
            const errors = emitters.map((emitter, i) => {
                // If the error is a MatchCanceledError, emit the `matchCanceled`
                // event on the players. If a player has an attached listener,
                // consider the error handled.
                const {name} = emitter
                const info = ['emitter', i + 1, 'of', emitters.length]
                if (err.isMatchCanceledError) {
                    if (emitter.emit('matchCanceled', err)) {
                        this.logger.debug('emitAndWait.matchCanceled.handled', name, ...info)
                        return false
                    }
                    this.logger.debug('emitAndWait.matchCanceled.unhandled', name, ...info)
                }
                return [name, info, emitter]
            }).filter(Boolean).map(([name, info, emitter]) => {
                // Emit a generic `error` for any error not already handled. If
                // a player does not have an attached listener, catch the error
                // for throwing later
                try {
                    emitter.emit('error', err)
                    this.logger.debug('emitAndWait.error.handled', name, ...info)
                    return false
                } catch (err) {
                    this.logger.warn('emitAndWait.error.unhandled', name, ...info)
                    return [name, info, err]
                }
            }).filter(Boolean)
            if (!errors.length) {
                return
            }
            errors.forEach(([name, info, e], i) => {
                if (i > 0 || e !== err) {
                    // Skip logging if there is only one error and it is the
                    // same as the original error, since it will be thrown at
                    // the end.
                    this.logger.error(
                        `Error on event ${event} unhandled by ${name}`, ...info, e
                    )
                }
            })
            throw err
        }
    }

    /**
     * Get the directory to record match information.
     *
     * @param {Match} match
     * @return {String}
     */
    getMatchDir(match) {
        const dateString = fileDateString(match.createDate).substring(0, 19)
        const idString = match.uuid.substring(0, 4)
        const dirname = ['match', dateString, idString].join('_')
        return path.resolve(this.opts.recordDir, 'matches', dirname)
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
    }

    /**
     * Build the players object from the arguments.
     *
     * @param {object|Player[]|Player} player The players of the
     *        match, or the White player.
     * @param {Player} player2 The Red player, if the White player was
     *        passed as the first argument.
     *
     * @return {object} Players map {White: Player, Red: Player}
     */
    static buildPlayers(white, red) {
        const players = {}
        if (Array.isArray(white)) {
            // One argument, array of players [white, red]
            players.White = white[0]
            players.Red = white[1]
        } else if (white.isPlayer) {
            // Each argument is a player, white, red
            players.White = white
            players.Red = red
        } else {
            // One argument, object {color: Player}
            players.White = white.White
            players.Red = white.Red
        }
        return players
    }
}
