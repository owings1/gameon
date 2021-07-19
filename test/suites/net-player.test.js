/**
 * gameon - test suite - NetPlayer
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
const Test = require('../util')
const {
    expect
  , getError
  , newRando
  , requireSrc
} = Test

const Constants = requireSrc('lib/constants')
const Util      = requireSrc('lib/util')

const {Red, White} = Constants

const {destroyAll, ucfirst} = Util

describe('NetPlayer', () => {

    const loglevel = 1

    const Coordinator = requireSrc('lib/coordinator')
    const Client      = requireSrc('net/client')
    const Server      = requireSrc('net/server')
    const NetPlayer   = requireSrc('net/player')

    beforeEach(async function () {

        const server = new Server
        server.loglevel = loglevel
        await server.listen()

        const serverUrl = 'http://localhost:' + server.port

        this.objects = {
            client1: new Client({serverUrl})
          , client2: new Client({serverUrl})
          , server
        }

        this.logThings = []
        Object.entries(this.objects).forEach(([name, obj]) => {
            obj.logger.name = ucfirst(name)
            this.logThings.push(obj)
        })

        this.setLoglevel = n => {
            this.logThings.forEach(obj => obj.loglevel = n)
        }

        this.cleans = []

        this.eastAndWest = async function eastAndWest(opts) {

            opts = {total: 1, ...opts}

            const {client1, client2} = this.fixture

            const res = {
                west : {
                    players: {
                        White : newRando(White)
                      , Red   : new NetPlayer(client1, Red)
                    }
                  , coord: new Coordinator
                }
              , east : {
                    players: {
                        White : new NetPlayer(client2, White)
                      , Red   : newRando(Red)
                    }
                  , coord: new Coordinator
                }
            }

            Object.entries(res).forEach(([dir, it]) => {
                Object.values(it.players).forEach(player => {
                    player.logger.name += ucfirst(dir)
                    this.cleans.push(() => player.destroy())
                    this.logThings.push(player)
                })
                it.coord.logger.name += ucfirst(dir)
                this.logThings.push(it.coord)
            })

            this.setLoglevel(loglevel)

            let promise
            client1.on('matchCreated', id => {
                promise = client2.joinMatch(id)
            })
            res.west.match = await client1.createMatch(opts)
            res.east.match = await promise

            return res
        }

        this.setLoglevel(loglevel)
        this.fixture = {
            ...this.objects
          , client: this.objects.client1
        }
    })

    afterEach(async function () {
        Object.values(this.objects).forEach(obj => {
            obj.close()
        })
        for (let cleaner of this.cleans) {
            await cleaner()
        }
    })

    it('should play robot v robot over net', async function () {

        this.timeout(20000)

        const {east, west} = await this.eastAndWest({total: 1})

        await Promise.all([
            east.coord.runMatch(east.match, east.players),
            west.coord.runMatch(west.match, west.players)
        ])
    })

    it('should play robot v robot over net with double accept, decline', async function() {

        this.timeout(2000)

        const {east, west} = await this.eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        await Promise.all([
            east.coord.runMatch(east.match, east.players),
            west.coord.runMatch(west.match, west.players)
        ])
    })

    it('should play robot v robot over net with double after 3 moves accept, decline', async function() {

        this.timeout(2000)

        const {east, west} = await this.eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        east.players.Red.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        await Promise.all([
            east.coord.runMatch(east.match, east.players),
            west.coord.runMatch(west.match, west.players)
        ])
    })
})