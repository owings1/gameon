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
    makeRandomMoves,
    requireSrc
} = Test

describe('-', () => {

    const Client = requireSrc('net/client')
    const Server = requireSrc('net/server')

    const {ucfirst, update} = requireSrc('lib/util')

    const Errors = requireSrc('lib/errors')

    const {Red, White, MatchCancelRef} = requireSrc('lib/constants')

    const loglevel = 1

    beforeEach(async function () {

        const server = new Server

        server.loglevel = loglevel
        await server.listen()
        const serverUrl = 'http://localhost:' + server.port

        this.objects = {
            client1 : new Client({serverUrl})
          , client2 : new Client({serverUrl})
          , server
        }

        Object.entries(this.objects).forEach(([name, obj]) => {
            obj.logger.name = ucfirst(name)
        })

        this.setLoglevel = n => {
            Object.values(this.objects).forEach(it => {
                it.loglevel = n
            })
        }

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
            return server.matches[matchId]
        }

        this.setLoglevel(loglevel)

        this.fixture = {
            ...this.objects
          , client: this.objects.client1
        }
    })

    afterEach(function () {
        Object.values(this.objects).forEach(it => {
            it.close()
        })
    })

    describe('#connect', () => {

        it('should connect and set isHandshake=true', async function () {
            const {client} = this.fixture
            await client.connect()
            expect(client.isHandshake).to.equal(true)
        })

        it('should pass on second call', async function () {
            const {client} = this.fixture
            await client.connect()
            await client.connect()
        })

        it('should log error on conn error', async function () {
            const {client} = this.fixture
            this.setLoglevel(-1)
            await client.connect()
            client.conn.emit('error', 'testError')
        })

        it('should reject when server is down', async function () {
            const {client, server} = this.fixture
            server.close()
            const err = await getError(() => client.connect())
            expect(!!err).to.equal(true)
        })

        it('should reject when socketClient.connect throws', async function () {
            const {client, server} = this.fixture
            server.close()
            client.socketClient.connect = () => { throw new Error }
            const err = await getError(() => client.connect())
            expect(!!err).to.equal(true)
        })
    })

    describe('#handleMessage', () => {

        it('should emit matchCanceled with active match and handler', function (done) {
            const {client1, client2} = this.fixture
            
            client1.once('matchCanceled', err => {
                try  {
                    expect(err.isMatchCanceledError).to.equal(true)
                } catch (err) {
                    return done(err)
                }
                done()
            })
            client2.on('matchCanceled', err => {})
            this.createMatch().then(() => {
                client1.handleMessage({action: 'matchCanceled', reason: 'testing'})
            }).catch(done)
        })

        it('should emit unhandledMessage when no waiter', function (done) {
            const {client} = this.fixture
            const exp = 'bananas'
            client.once('unhandledMessage', data => {
                try  {
                    expect(data.action).to.equal(exp)
                } catch (err) {
                    return done(err)
                }
                done()
            })
            client.handleMessage({action: exp})
        })

        it('should emit unhandledMessage on matchCanceled with handler but no active match', function (done) {
            const {client} = this.fixture
            client.on('matchCanceled', err => done(new Error(err)))
            client.once('unhandledMessage', data => {
                try  {
                    expect(data.action).to.equal('matchCanceled')
                } catch (err) {
                    return done(err)
                }
                done()
            })
            client.handleMessage({action: 'matchCanceled', reason: 'giggles'})
        })

        it('should emit error with MatchCanceledError no other handler', function (done) {
            const {client} = this.fixture
            client.once('error', err => {
                try  {
                    expect(err.isMatchCanceledError).to.equal(true)
                } catch (e) {
                    return done(e)
                }
                done()
            })
            this.setLoglevel(0)
            client.handleMessage({action: 'matchCanceled', reason: 'giggles'})
        })

        it('should emit error with ClientError when no other handler', function (done) {
            const {client} = this.fixture
            client.once('error', err => {
                try  {
                    expect(err.isClientError).to.equal(true)
                } catch (e) {
                    return done(e)
                }
                done()
            })
            this.setLoglevel(0)
            client.handleMessage({action: 'fooo'})
        })

        it('should emit responseError on malformed JSON message from server', function (done) {
            const {client, server} = this.fixture
            client.once('responseError', err => {
                done()
            })
            client.connect().then(() => {
                Object.values(server.socketServer.conns)[0].sendUTF('{]')
            })
        })

        it('should not throw when no responseError listener on malformed message', async function () {
            const {client, server} = this.fixture
            await client.connect()
            client.loglevel = -1
            Object.values(server.socketServer.conns)[0].sendUTF('{]')
        })

        it('should close when server sends error with isClientShouldClose', async function () {
            const {client, server} = this.fixture
            client.loglevel = 0
            const err = new Errors.RequestError('test', {attrs: {isClientShouldClose: true}})
            let caught
            client.on('error', err => {
                caught = err
            })
            await client.connect()
            server.sendMessage(Object.values(server.socketServer.conns), err)
            await new Promise(resolve => setTimeout(resolve, 30))
            expect(client.isConnected).to.equal(false)
        })
    })

    describe('#matchParams', () => {

        it('should return action for string', function () {
            const {client} = this.fixture
            const result = client.matchParams('testAction')
            expect(result.action).to.equal('testAction')
        })

        it('should return action for action', function () {
            const {client} = this.fixture
            const result = client.matchParams({action: 'testAction'})
            expect(result.action).to.equal('testAction')
        })
    })

    describe('#matchRequest', () => {

        it('should pass for nextGame', async function () {

            const {client1, client2} = this.fixture
            const match = await this.createMatch()
            client2.matchRequest('nextGame')
            await client1.matchRequest('nextGame')
        })

        it('should throw and close client when sever cancels because of shutdown', async function () {

            const {client1, client2, server} = this.fixture
            const match = await this.createMatch()

            // We need a handler on client2, could also be on unhandledMessage
            client2.on('matchCanceled', () => {})
            // We don't need a handler here, but it prevents an error message,
            // and also covers an extra code branch.
            client1.on('matchCanceled', () => {})

            const prom = client1.matchRequest('nextGame')

            // Let the server receive the matchRequest before canceling,
            // otherwise we get a MatchNotFound warning.
            await new Promise(resolve => setTimeout(resolve))
            server.cancelMatchId(match.id, MatchCancelRef.serverShutdown)

            const err = await getError(() => prom)

            expect(err.isMatchCanceledError).to.equal(true)
            expect(client1.isConnected).to.equal(false)
        })
    })

    describe('#createMatch', () => {

        it('should return match with same uuids', async function () {
            const {client} = this.fixture
            const match = await this.createMatch()
            expect(client.match.uuid)
                .to.have.length(36).and
                .to.equal(match.uuid)
        })
    })

    describe('#sendAndWaitForResponse', () => {

        it('should throw when waitForResponse throws (coverage)', async function () {
            const {client} = this.fixture
            const e = new Error
            client.waitForResponse = () => {throw e}
            const err = await getError(() => client.sendAndWaitForResponse())
            expect(err).to.equal(e)
        })

        it('should throw when sendMessage throws (coverage)', async function () {
            const {client} = this.fixture
            const e = new Error
            client.waitForResponse = () => {}
            client.sendMessage = () => {throw e}
            const err = await getError(() => client.sendAndWaitForResponse())
            expect(err).to.equal(e)
        })
    })

    describe('#waitForMessage', () => {

        it('should reject with ConnectionClosedError when conn is lost', async function () {
            const {client} = this.fixture
            const conn = client.conn
            client.conn = null
            try {
                const err = await getError(() => client.waitForMessage())
                expect(err.name).to.equal('ConnectionClosedError')
            } finally {
                client.conn = conn
            }
        })

        it('should throw ParallelRequestError for duplicate calls', async function () {
            const {client} = this.fixture
            await client.connect()
            client.waitForMessage()
            const err = await getError(() => client.waitForMessage())
            expect(err.isParallelRequestError).to.equal(true)
        })

        it('should clear current match after match is finished', async function () {
            const {client1, client2} = this.fixture
            const match = await this.createMatch({total: 2})
            const {id} = match
            // white goes first
            match.opts.roller = () => [2, 1]
            const game = match.nextGame()
            makeRandomMoves(game.firstTurn()).finish()
            // red doubles
            game.nextTurn().setDoubleOffered()
            game.double()
            // red plays rolls
            makeRandomMoves(game.thisTurn.roll()).finish()
            // white doubles
            game.nextTurn().setDoubleOffered()
            // white waits for response
            client1.matchRequest('doubleResponse', {id, color: White})
            // red declines
            await client2.matchRequest('doubleResponse', {id, color: Red, isAccept: false})
            expect(match.isFinished).to.equal(true)
            expect(!!client2.match).to.equal(false)
        })
    })

    describe('#waitForResponse', () => {

        beforeEach(async function () {
            await this.fixture.client.connect()
        })

        it('should throw error when response has isError=true', async function () {
            const {client, server} = this.fixture
            const prom = getError(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {isError: true, error: 'testErrorMessage'})
            const err = await prom
            expect(err.message).to.equal('testErrorMessage')
        })

        it('should throw error when response has mismatched action', async function () {
            const {client, server} = this.fixture
            this.setLoglevel(-1)
            const prom = getError(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {action: 'testErrorMessage'})
            const err = await prom
            expect(err.isUnexpectedResponseError).to.equal(true)
        })

        it('should throw MatchCanceledError for response action=matchCanceled with reason as message', async function () {
            const {client, server} = this.fixture
            this.setLoglevel(-1)
            const prom = getError(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {action: 'matchCanceled', reason: 'testReason'})
            const err = await prom
            expect(err.name).to.equal('MatchCanceledError')
            expect(err.message).to.equal('testReason')
        })

        it('should close when server sends error with isClientShouldClose', async function () {
            const {client, server} = this.fixture
            await client.connect()
            const err = new Errors.RequestError('test', {attrs: {isClientShouldClose: true}})
            const prom = client.waitForResponse()
            server.sendMessage(Object.values(server.socketServer.conns), err)
            const caught = await getError(() => prom)
            await new Promise(resolve => setTimeout(resolve, 30))
            expect(Boolean(client.conn && client.conn.connected)).to.equal(false)
        })
    })
})
