/**
 * gameon - test suite - Client
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
    expect,
    getError,
    getErrorAsync,
    requireSrc
} = Test

describe('-', () => {

    const Client = requireSrc('net/client')
    const Server = requireSrc('net/server')

    var server

    var client1
    var client2

    // alias for client1
    var client

    function createMatch() {
        client1.once('matchCreated', id => client2.joinMatch(id))
        return new Promise(resolve => {
            client2.once('matchJoined', resolve)
            client1.createMatch({total: 1})
        })
    }

    beforeEach(async () => {

        server = new Server

        server.loglevel = 1

        await server.listen()

        const serverUrl = 'http://localhost:' + server.port

        client1 = new Client({serverUrl})
        client2 = new Client({serverUrl})

        client1.loglevel = 1
        client2.loglevel = 1

        client = client1
    })

    afterEach(async () => {
        await client1.close()
        await client2.close()
        server.close()
    })

    describe('#connect', () => {

        it('should connect and set isHandshake=true', async () => {
            await client.connect()
            expect(client.isHandshake).to.equal(true)
        })

        it('should pass on second call', async () => {
            await client.connect()
            await client.connect()
        })

        it('should log error on conn error', async () => {
            client.loglevel = -1
            await client.connect()
            client.conn.emit('error', 'testError')
        })

        it('should reject when server is down', async () => {
            server.close()
            const err = await getErrorAsync(() => client.connect())
            expect(!!err).to.equal(true)
        })

        it('should reject when socketClient.connect throws', async () => {
            server.close()
            client.socketClient.connect = () => { throw new Error }
            const err = await getErrorAsync(() => client.connect())
            expect(!!err).to.equal(true)
        })
    })

    describe('#matchParams', () => {

        it('should return action for string', () => {
            const result = client.matchParams('testAction')
            expect(result.action).to.equal('testAction')
        })

        it('should return action for action', () => {
            const result = client.matchParams({action: 'testAction'})
            expect(result.action).to.equal('testAction')
        })
    })

    describe('#matchRequest', () => {
        it('should pass for nextGame', async () => {
            const match = await createMatch()
            client2.matchRequest('nextGame')
            await client1.matchRequest('nextGame')
        })
    })

    describe('#createMatch', () => {

        it('should return match', async () => {
            const match = await createMatch()
            expect(client.match.uuid).to.have.length(36).and.to.equal(match.uuid)
        })
    })

    describe('#sendAndWaitForResponse', () => {

        it('should throw when waitForResponse throws (coverage)', async () => {
            const e = new Error
            client.waitForResponse = () => {throw e}
            const err = await getErrorAsync(() => client.sendAndWaitForResponse())
            expect(err).to.equal(e)
        })

        it('should throw when sendMessage throws (coverage)', async () => {
            const e = new Error
            client.waitForResponse = () => {}
            client.sendMessage = () => {throw e}
            const err = await getErrorAsync(() => client.sendAndWaitForResponse())
            expect(err).to.equal(e)
        })
    })

    describe('#waitForMessage', () => {

        it('should reject with ConnectionClosedError when conn is lost', async () => {
            const conn = client.conn
            client.conn = null
            try {
                const err = await getErrorAsync(() => client.waitForMessage())
                expect(err.name).to.equal('ConnectionClosedError')
            } finally {
                client.conn = conn
            }
        })
    })

    describe('#waitForResponse', () => {

        beforeEach(async () => {
            await client.connect()
        })

        it('should throw error when response has isError=true', async () => {
            const p = getErrorAsync(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {isError: true, error: 'testErrorMessage'})
            const err = await p
            expect(err.message).to.equal('testErrorMessage')
        })

        it('should throw error when response has mismatched action', async () => {
            client.loglevel = 0
            const p = getErrorAsync(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {action: 'testErrorMessage'})
            const err = await p
            expect(err.isUnexpectedResponseError).to.equal(true)
        })

        it('should throw MatchCanceledError for response action=matchCanceled with reason as message', async () => {
            client.loglevel = -1
            const p = getErrorAsync(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {action: 'matchCanceled', reason: 'testReason'})
            const err = await p
            expect(err.name).to.equal('MatchCanceledError')
            expect(err.message).to.equal('testReason')
        })
    })
})
