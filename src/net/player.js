/**
 * gameon - NetPlayer class
 *
 * Copyright (C) 2020 Doug Owings
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
const Base   = require('../lib/player')
const Core   = require('../lib/core')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const {White, Red} = Core

class NetPlayer extends Base {
    
    constructor(client, ...args) {
        super(...args)
        this.client = client
        this.isNet = true

        this.on('gameStart', (game, match, players) => {
            this.holds.push(new Promise(async (resolve) => {
                await this.client.matchRequest('nextGame')
                const {dice} = await this.client.matchRequest('firstTurn')
                game._rollFirst = () => {
                    return dice
                }
                this.opponent.rollTurn = async (turn, game, match) => {
                    await this.rollTurn(turn, game, match)
                }
                resolve()
            }))
        })

        this.on('turnEnd', (turn, game, match) => {
            //if (game.checkFinished()) {
            //    return
            //}
            if (!turn.isDoubleDeclined && turn.color == this.opponent.color) {
                const moves = turn.moves.map(move => move.coords())
                this.logger.debug(['on turnEnd', 'before holds push', 'playRoll'])
                this.holds.push(this.client.matchRequest('playRoll', {moves}))
                this.logger.debug(['on turnEnd', 'after holds push', 'playRoll'])
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
    }

    async rollTurn(turn, game, match) {
        const {dice} = await this.client.matchRequest('rollTurn')
        turn.setRoll(dice)
    }

    async turnOption(turn, game, match) {
        const {isDouble} = await this.client.matchRequest('turnOption')
        if (isDouble) {
            turn.setDoubleOffered()
        }
    }

    async decideDouble(turn, game, match) {
        const {isAccept} = await this.client.matchRequest('doubleResponse')
        if (!isAccept) {
            turn.setDoubleDeclined()
        }
    }

    async playRoll(turn, game, match) {
        const {moves} = await this.client.matchRequest('playRoll')
        moves.forEach(move => turn.move(move.origin, move.face))
    }
}

module.exports = NetPlayer