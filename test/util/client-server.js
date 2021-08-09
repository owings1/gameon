/**
 * gameon - client-server test utils
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
const {
    arrays : {append},
    objects: {update},
    strings: {ucfirst},
} = require('utils-h')

const {nmap} = require('../../src/lib/util.js')

const Client = require('../../src/net/client.js')

function initServers(servers, logLevel) {
    return Promise.all(
        Object.entries(servers).map(([name, server]) => {
            server.logger.name = 'Server.' + ucfirst(name)
            server.logLevel = logLevel
            return server.listen().then(() => {
                server.testUrl = 'http://localhost:' + server.port
                server.testMetricsUrl = 'http://localhost:' + server.metricsPort
            })
        })
    )
}

function createClients(server, count = 2) {

    const clients = Object.fromEntries(
        nmap(count, i => {
            const key = 'client' + (i + 1)
            const client = new Client({serverUrl: 'http://localhost:' + server.port})
            client.logger.name = ucfirst(key)
            client.logLevel = server.logLevel
            return [key, client]
        })
    )
    clients.client = clients.client1
    return clients
}

module.exports = {

    testInit : async function(logLevel, numClients = 2) {

        await initServers(this.servers, logLevel)

        this.objects = this.objects || []
        this.clients = this.clients || {}

        update(this.clients, Object.fromEntries(
            Object.entries(this.servers).map(([name, server]) =>
                [name, createClients(server, numClients)]
            )
        ))

        append(this.objects, Object.values(this.servers).concat(
            Object.values(this.clients).map(Object.values).flat()
        ))

        if (!this.setLoglevel) {
            this.setLoglevel = n => {
                this.objects.forEach(obj => obj.logLevel = n)
            }
        }

        if (!this.closeObjects) {
            this.closeObjects = function (objects) {
                objects = objects || this.objects
                objects.forEach(obj => {
                    if (typeof obj.close == 'function') {
                        obj.close()
                    }
                    if (typeof obj.destroy == 'function') {
                        obj.destroy()
                    }
                })
            }
        }
        if (!this.createMatch) {
            // Returns the server's match instance
            this.createMatch = async function (opts) {
                opts = {total: 1, ...opts}
                const {client1, client2} = this.fixture
                let promise
                let matchId
                client1.once('matchCreated', id => {
                    matchId = id
                    promise = client2.joinMatch(id)
                })
                await client1.createMatch(opts)
                await promise
                return this.fixture.server.matches[matchId]
            }
        }
    }
}