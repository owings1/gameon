/**
 * gameon - Player class
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
import {EventEmitter} from 'events'
import {Opponent} from './constants.js'
import {NotImplementedError} from './errors.js'
import {createLogger, uuid} from './util.js'

const Listeners = {

    /**
     * @param {Match} match
     * @param {object} players
     */
    matchStart: function(match, players) {
        this.logger.debug('event.matchStart')
        this.thisMatch = match
        this.opponent = players[Opponent[this.color]]
    },

    /**
     * @param {Game} game
     * @param {Match} match
     * @param {object} players
     */
    gameStart: function(game, match, players) {
        this.logger.debug('event.gameStart')
        this.thisGame = game
        this.opponent = players[Opponent[this.color]]
    },

    /**
     * @param {Error} err
     */
    matchCanceled: function(err) {
        this.logger.debug('event.matchCanceled')
        // NB: If matchCanceled is emitted before matchStart, then this will not help.
        if (this.thisMatch) {
            this.thisMatch.cancel(err)
            this.opponent = null
            this.thisMatch = null
            this.thisGame = null
        }
    },

    /**
     * @param {Error} err
     */
    matchEnd: function(err) {
        this.logger.debug('event.matchEnd')
        if (this.thisMatch) {
            this.opponent = null
            this.thisMatch = null
            this.thisGame = null
        }
    },
}

export default class Player extends EventEmitter {

    /**
     * @param {String} color
     */
    constructor(color) {
        super()
        this.id = uuid()
        this.logger = createLogger(this, {type: 'named'})
        this.isPlayer = true
        this.name = this.constructor.name
        this.color = color
        this.holds = []
        Object.entries(Listeners).forEach(([event, listener]) => {
            this.on(event, listener)
        })
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
        throw new NotImplementedError('NotImplemented')
    }

    meta() {
        return {name: this.name, color: this.color}
    }

    destroy() {
        this.logger.debug('destroy')
        Object.entries(Listeners).forEach(([event, listener]) => {
            this.removeListener(event, listener)
        })
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
    }
}
