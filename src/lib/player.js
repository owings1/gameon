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
const Constants = require('./constants')
const Core      = require('./core')
const Errors    = require('./errors')
const Logger    = require('./logger')

const {EventEmitter} = require('events')

const {Opponent} = Constants

const {NotImplementedError} = Errors

class Player extends EventEmitter {

    constructor(color) {

        super()

        this.logger = new Logger(this.constructor.name, {named: true})

        this.isPlayer = true

        this.name   = this.constructor.name
        this.color  = color
        this.holds  = []

        this.on('matchStart', (match, players) => {
            this.thisMatch = match
            this.opponent = players[Opponent[this.color]]
        })
        this.on('gameStart', (game, match, players) => {
            this.thisGame = game
            this.opponent = players[Opponent[this.color]]
        })
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
    }

    async destroy() {
        this.removeAllListeners()
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
}

module.exports = Player