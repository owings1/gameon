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
import {expect} from 'chai'
import {newRando} from '../util.js'
import clientServer from '../util/client-server.js'

import {extend} from '@quale/core/arrays.js'
import {ucfirst} from '@quale/core/strings.js'

import Coordinator from '../../src/lib/coordinator.js'
import {Red, White} from '../../src/lib/constants.js'
import Server from '../../src/net/server.js'
import NetPlayer from '../../src/net/player.js'

describe('NetPlayer', () => {

    const logLevel = 1

    beforeEach(async function () {

        this.objects = []

        this.servers = {
            anon : new Server
        }

        await clientServer.call(this, logLevel)

        this.fixture = {
            server : this.servers.anon
          , ...this.clients.anon
        }

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
                    this.objects.push(player)
                })
                it.coord.logger.name += ucfirst(dir)
                this.objects.push(it.coord)
            })

            this.setLoglevel(logLevel)

            let promise
            client1.once('matchCreated', id => {
                promise = client2.joinMatch(id)
            })
            res.west.match = await client1.createMatch(opts)
            res.east.match = await promise

            return res
        }

        this.setLoglevel(logLevel)
    })

    afterEach(function () {
        this.closeObjects()
    })

    it('should set logLevel to 0', function () {
        // coverage for logLevel getter
        const {client} = this.fixture
        const player = new NetPlayer(client, Red)
        this.objects.push(player)
        player.logLevel = 0
        expect(player.logLevel).to.equal(0)
    })

    it('should emit matchCanceled on opponent if server shuts down before opponent joins', function (done) {
        const {client1, client2, server} = this.fixture
        const p1 = new NetPlayer(client1, White)
        const p2 = new NetPlayer(client2, White)
        extend(this.objects, [p1, p2])
        p1.opponent = p2
        p2.once('matchCanceled', () => done())
        client1.once('matchCreated', () => server.close())
        client1.createMatch({total: 1}).catch(err => {})
    })

    it('should not barf when no opponent if server shuts down before opponent joins', function (done) {
        // coverage
        const {client, server} = this.fixture
        const p1 = new NetPlayer(client, White)
        this.objects.push(p1)
        client.once('matchCreated', () => server.close())
        client.createMatch({total: 1}).catch(err => done())
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