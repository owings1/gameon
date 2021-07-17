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

class NetPlayer extends Base {
    
    constructor(client, ...args) {
        super(...args)

        this.client = client
        this.isNet = true

        this.dice = null
        this.loadHandlers()
    }

    loadHandlers() {

        this.on('gameStart', (game, match, players) => {
            this.holds.push(new Promise((resolve, reject) => {
                this.client.matchRequest('nextGame').then(() => {
                    game.opts.roller = () => this.dice
                    this.client.matchRequest('firstTurn').then(({dice}) => {
                        this.dice = dice
                        this.opponent.rollTurn = async (turn, game, match) => {
                            await this.rollTurn(turn, game, match)
                        }
                        resolve()
                    }).catch(reject)
                }).catch(reject)
            }))
        })

        this.on('turnEnd', (turn, game, match) => {
            if (!turn.isDoubleDeclined && turn.color == this.opponent.color) {
                const moves = turn.moves.map(move => move.coords)
                this.holds.push(this.client.matchRequest('playRoll', {moves}))
            }
            game.checkFinished()
        })

        this.on('turnStart', (turn, game, match) => {
            this.holds.push(this.client.matchRequest('nextTurn'))
        })

        this.on('afterOption', (turn, game, match) => {
            if (turn.color != this.color && !turn.isDoubleOffered) {
                this.holds.push(this.client.matchRequest('turnOption'))
            }
        })

        this.on('doubleOffered', (turn, game, match) => {
            if (turn.color == this.opponent.color) {
                this.holds.push(this.client.matchRequest('turnOption', {isDouble: true}))
            }
        })

        this.on('doubleAccepted', (turn, game, match) => {
            if (turn.color == this.color) {
                this.holds.push(this.client.matchRequest('doubleResponse', {isAccept: true}))
            }
        })

        this.on('doubleDeclined', (turn, game, match) => {
            if (turn.color == this.color) {
                this.holds.push(this.client.matchRequest('doubleResponse', {isAccept: false}))
            }
        })

        this.client.on('matchCanceled', err => {
            this.emit('matchCanceled', err)
        })

        this.client.on('matchResponse', (req, res) => {
            this.emit('matchResponse', req, res)
        })

        this.on('matchCanceled', (err, match) => {
            this.client.cancelWaiting(err)
        })
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