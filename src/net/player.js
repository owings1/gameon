/**
 * gameon - NetPlayer class
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
const Base      = require('../lib/player')
const Constants = require('../lib/constants')
const Core      = require('../lib/core')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')

const {White, Red} = Constants

const ClientListeners = {

    matchCanceled: function(err) {
        this.emit('matchCanceled', err)
    }

  , matchCreated: function(id, match) {
        // Set this earlier than the base player. In the case that matchCanceled
        // is emitted before matchStart, the base player will be able to call
        // match.cancel().
        this.logger.debug('matchCreated')
        this.thisMatch = match
    }

  , matchResponse: function(req, res) {
        this.emit('matchResponse', req, res)
    }
}

const Listeners = {

    gameStart: function(game, match, players) {
        this.holds.push(
            this.gameStart(game, match, players)
        )
    }

  , turnEnd: function(turn, game, match) {
        if (!turn.isDoubleDeclined && turn.color == this.opponent.color) {
            const moves = turn.moves.map(move => move.coords)
            this.holds.push(this.client.matchRequest('playRoll', {moves}))
        }
        game.checkFinished()
    }

  , turnStart: function(turn, game, match) {
        this.holds.push(this.client.matchRequest('nextTurn'))
    }

  , afterOption: function(turn, game, match) {
        if (turn.color != this.color && !turn.isDoubleOffered) {
            this.holds.push(this.client.matchRequest('turnOption'))
        }
    }

  , doubleOffered: function(turn, game, match) {
        if (turn.color == this.opponent.color) {
            this.holds.push(
                this.client.matchRequest('turnOption', {isDouble: true})
            )
        }
    }

  , doubleAccepted: function(turn, game, match) {
        if (turn.color == this.color) {
            this.holds.push(
                this.client.matchRequest('doubleResponse', {isAccept: true})
            )
        }
    }

  , doubleDeclined: function(turn, game, match) {
        if (turn.color == this.color) {
            this.holds.push(
                this.client.matchRequest('doubleResponse', {isAccept: false})
            )
        }
    }

  , matchCanceled: function(err) {
        this.client.cancelWaiting(err)
    }
}


class NetPlayer extends Base {
    
    constructor(client, ...args) {

        super(...args)

        this.client = client
        this.isNet = true

        this.dice = null

        this.clientListeners = Object.fromEntries(
            Object.entries(ClientListeners).map(([event, listener]) =>
                [event, listener.bind(this)]
            )
        )

        Object.entries(this.clientListeners).forEach(([event, listener]) =>
            this.client.on(event, listener)
        )

        Object.entries(Listeners).forEach(([event, listener]) =>
            this.on(event, listener)
        )
    }

    async rollTurn(turn, game, match) {
        const res = await this.client.matchRequest('rollTurn')
        if (this._checkCanceled(turn, game, match)) {
            return
        }
        this.dice = res.dice
        turn.roll()
    }

    async turnOption(turn, game, match) {
        const res = await this.client.matchRequest('turnOption')
        if (this._checkCanceled(turn, game, match)) {
            return
        }
        if (res.isDouble) {
            turn.setDoubleOffered()
        }
    }

    async decideDouble(turn, game, match) {
        const res = await this.client.matchRequest('doubleResponse')
        if (this._checkCanceled(turn, game, match)) {
            return
        }
        if (!res.isAccept) {
            turn.setDoubleDeclined()
        }
    }

    async playRoll(turn, game, match) {
        const res = await this.client.matchRequest('playRoll')
        if (this._checkCanceled(turn, game, match)) {
            return
        }
        res.moves.forEach(move => turn.move(move.origin, move.face))
    }

    get loglevel() {
        return super.loglevel
    }

    set loglevel(n) {
        super.loglevel = n
        this.client.loglevel = n
    }

    async gameStart(game, match, players) {
        if (this._checkCanceled(null, game, match)) {
            return
        }
        await this.client.matchRequest('nextGame')
        if (this._checkCanceled(null, game, match)) {
            return
        }
        game.opts.roller = () => this.dice
        const res = await this.client.matchRequest('firstTurn')
        if (this._checkCanceled(null, game, match)) {
            return
        }
        this.dice = res.dice
        this.opponent.rollTurn = async (turn, game, match) => {
            await this.rollTurn(turn, game, match)
        }
        /*
        return new Promise((resolve, reject) => {

            this.client.matchRequest('nextGame').then(() => {

                if (this._checkCanceled(null, game, match)) {
                    resolve()
                    return
                }

                game.opts.roller = () => this.dice

                this.client.matchRequest('firstTurn').then(res => {

                    if (this._checkCanceled(null, game, match)) {
                        resolve()
                        return
                    }

                    this.dice = res.dice

                    this.opponent.rollTurn = async (turn, game, match) => {
                        await this.rollTurn(turn, game, match)
                    }

                    resolve()

                }).catch(reject)

            }).catch(reject)
        })
        */
    }
    destroy() {
        Object.entries(Listeners).forEach(([event, listener]) =>
            this.removeListener(event, listener)
        )
        Object.entries(this.clientListeners).forEach(([event, listener]) =>
            this.client.removeListener(event, listener)
        )
        super.destroy()
    }

    _checkCanceled(turn, game, match) {
        let canceled = false
        if (match && match.isCanceled) {
            canceled = 'match'
        } else if (game && game.isCanceled) {
            canceled = 'game'
        } else if (turn && turn.isCanceled) {
            canceled = 'turn'
        }
        if (canceled) {
            this.logger.warn('The', canceled, 'has been canceled, abandoning turn.')
        }
        return canceled
    }
}

module.exports = NetPlayer