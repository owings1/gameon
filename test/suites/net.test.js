/**
 * gameon - test suite - net classes
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
    makeRandomMoves,
    parseKey,
    parseCookies,
    randomElement,
    requireSrc,
    States
} = Test

const Auth        = requireSrc('net/auth')
const Client      = requireSrc('net/client')
const Constants   = requireSrc('lib/constants')
const Coordinator = requireSrc('lib/coordinator')
const Core        = requireSrc('lib/core')
const Errors      = requireSrc('lib/errors')
const NetPlayer   = requireSrc('net/player')
const Robot       = requireSrc('robot/player')
const Server      = requireSrc('net/server')
const Util        = requireSrc('lib/util')

const {White, Red}  = Constants
const {Match, Dice} = Core

const AWS   = require('aws-sdk')
const fetch = require('node-fetch')
const fs    = require('fs')
const fse   = require('fs-extra')
const tmp   = require('tmp')

const {URLSearchParams} = require('url')

function newRando(...args) {
    return Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
}

function getParams(obj) {
    obj = obj || {}
    const params = new URLSearchParams
    for (var k in obj) {
        params.append(k, obj[k])
    }
    return params
}

describe('Client', () => {

    var serverUrl
    var client
    var client2

    var server

    async function createMatch() {
        const p = client.createMatch({total: 1})
        var id
        await new Promise(resolve => setTimeout(() => {
            id = Object.keys(server.matches)[0]
            client2.joinMatch(id).then(resolve)
        }, 10))
        const match = await p
        match.id = id
        return match
    }

    beforeEach(async () => {
        server = new Server
        server.logger.loglevel = 1
        // hack so no req logging
        server.getLoggingMiddleware = () => (req, res, next) => next()
        server.app = server.createApp()
        await server.listen()
        serverUrl = 'ws://localhost:' + server.port
        client = new Client(serverUrl)
        client2 = new Client(serverUrl)
        client.logger.loglevel = 1
        client2.logger.loglevel = 1
    })

    afterEach(async () => {
        await client.close()
        await client2.close()
        server.close()
    })

    describe('#buildError', function () {

        this.timeout(5000)

        it('should return ClientError', () => {
            const result = Client.buildError({error: 'test'})
            expect(result.name).to.equal('ClientError')
        })

        it('should set message to fallbackMessage', () => {
            const result = Client.buildError({}, 'fallback')
            expect(result.message).to.equal('fallback')
        })

        it('should set message with no fallback', () => {
            const result = Client.buildError({})
            expect(result.message).to.have.length.greaterThan(0)
        })

        it('should set name property of error', () => {
            const result = Client.buildError({name: 'testName'})
            expect(result.name).to.equal('testName')
        })
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
            client.logger.loglevel = -1
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
            await client.matchRequest('nextGame')
        })
    })

    describe('#createMatch', () => {

        it('should return match', async () => {
            const match = await createMatch()
            expect(client.matchId).to.equal(match.id)
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

        it('should throw error when response has error property', async () => {
            await client.connect()
            const p = getErrorAsync(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {error: 'testErrorMessage'})
            const err = await p
            expect(err.message).to.equal('testErrorMessage')
        })

        it('should throw error when response has mismatched action', async () => {
            await client.connect()
            const p = getErrorAsync(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {action: 'testErrorMessage'})
            const err = await p
            expect(err.name).to.equal('ClientError')
        })

        it('should throw MatchCanceledError for response action=matchCanceled with reason as message', async () => {
            await client.connect()
            client.logger.loglevel = -1
            const p = getErrorAsync(() => client.waitForResponse('test'))
            const conns = Object.values(server.socketServer.conns)
            server.sendMessage(conns, {action: 'matchCanceled', reason: 'testReason'})
            const err = await p
            expect(err.name).to.equal('MatchCanceledError')
            expect(err.message).to.equal('testReason')
        })
    })
})

describe('Server', () => {

    var server
    var serverUrl
    var metricsUrl
    var client
    var client2

    var authDir
    var authServer
    var authServerUrl
    var authClient
    
    async function createMatch() {
        await Promise.all([client.connect(), client2.connect()])
        const res = await client.sendAndWait({action: 'createMatch', total: 1})
        const id = res.id
        const p = client.waitForMessage()
        await client2.sendAndWait({action: 'joinMatch', id})
        await p
        return server.matches[id]
    }

    async function sendAndWait(msg) {
        const p = this.waitForMessage()
        this.sendMessage(msg)
        return await p
    }

    beforeEach(async () => {
        server = new Server()
        server.api.logger.loglevel = 1
        server.logger.loglevel = 1
        // hack so no req logging
        server.getLoggingMiddleware = () => (req, res, next) => next()
        server.app = server.createApp()
        await server.listen()
        serverUrl = 'http://localhost:' + server.port
        metricsUrl = 'http://localhost:' + server.metricsPort
        client = new Client(serverUrl)
        client.logger.loglevel = 1
        client2 = new Client(serverUrl)
        client2.logger.loglevel = 1
        client.sendAndWait = sendAndWait
        client2.sendAndWait = sendAndWait

        authDir = tmp.dirSync().name
        authServer = new Server({
            authType: 'directory',
            authDir,
            sessionInsecure : true
        })
        //console.log({authDir})
        authServer.logger.loglevel = 1
        authServer.auth.logger.loglevel = 1
        // hack so no req logging
        authServer.getLoggingMiddleware = () => (req, res, next) => next()
        authServer.app = authServer.createApp()
        await authServer.listen()
        authServerUrl = 'http://localhost:' + authServer.port
        authClient = new Client(authServerUrl)
        authClient.logger.loglevel = 1
    })

    afterEach(async () => {
        await client.close()
        await client2.close()
        await server.close()

        await fse.remove(authDir)
        await authServer.close()
    })

    describe('Server', () => {

        it('should authenticate with token', async () => {
            const username = 'nobody@nowhere.example'
            const password = 'fcw4ERXs'
            await authServer.auth.createUser(username, password, true)
            const token = authServer.auth.getToken(username, password)
            authClient.username = null
            authClient.password = null
            authClient.token = token
            await authClient.connect()
        })

        it('should construct with opt webEnabled=false', () => {
            const s2 = new Server({webEnabled: false})
            expect(s2.opts.webEnabled).to.equal(false)
        })

        describe('#checkMatchFinished', () => {

            it('should delete match from matches when finished', async () => {
                const match = await createMatch()
                const game = match.nextGame()
                game.board.setStateString(States.WhiteWin)
                makeRandomMoves(game.firstTurn()).finish()
                server.checkMatchFinished(match)
                expect(Object.keys(server.matches)).to.not.contain(match.id)
            })
        })

        describe('#checkSync', () => {

            it('should call for white and red equal', () => {
                var isCalled = false
                Server.checkSync({White: 'value', Red: 'value'}, () => isCalled = true)
                expect(isCalled).to.equal(true)
            })

            it('should not call for white and red unequal', () => {
                var isCalled = false
                Server.checkSync({White: 'value', Red: 'other'}, () => isCalled = true)
                expect(isCalled).to.equal(false)
            })
        })

        describe('#close', () => {

            it('should pass when socketServer, httpServer, and metricsHttpServer are null', () => {
                // coverage
                server.close()
                server.socketServer = null
                server.httpServer = null
                server.metricsHttpServer = null
                server.close()
            })
        })

        describe('#listen', () => {

            it('should have non-null socketServer', () => {
                expect(!!server.socketServer).to.equal(true)
            })

            it('should accept connection', async () => {
                await client.connect()
                expect(!!client.conn).to.equal(true)
            })

            it('should throw when createSocketServer throws for mock method', async () => {
                server.close()
                const e = new Error
                server.createSocketServer = () => {
                    throw e
                }
                const err = await getErrorAsync(() => server.listen())
                expect(err).to.equal(e)
            })

            it('should throw when app.listen throws for mock method', async () => {
                server.close()
                const e = new Error
                server.app.listen = () => { throw e }
                const err = await getErrorAsync(() => server.listen())
                expect(err).to.equal(e)
            })
        })

        describe('#logActive', () => {

            it('should pass when socketServer is null', () => {
                // coverage
                server.close()
                server.socketServer = null
                server.logActive()
            })
        })

        describe('#getMatchForRequest', () => {

            it('should throw MatchNotFoundError for non-existent match', () => {
                const err = getError(() => server.getMatchForRequest({color: White, id: '12345678'}))
                expect(err.name).to.equal('MatchNotFoundError')
            })

            it('should throw HandshakeError for mismatched secret', async () => {
                const {id} = await createMatch()
            
                const err = getError(() => server.getMatchForRequest({color: White, id, secret: 'badSecret'}))
                expect(err.name).to.equal('HandshakeError')
            })
        })

        describe('#matchIdFromSecret', () => {
    
        })

        describe('#response', () => {

            async function bareConn(client) {
                const p = new Promise(resolve => client.socketClient.on('connect', conn => {
                    client.conn = conn
                    conn.on('message', msg => {
                        const data = JSON.parse(msg.utf8Data)
                        if (client.messageResolve) {
                            client.messageResolve(data)
                            client.messageResolve = null
                        } else {
                            throw new Error('unhandled message', msg)
                        }
                    })
                    resolve()
                }))
                client.socketClient.connect(client.serverSocketUrl)
                await p
            }

            it('should return HandshakeError for missing secret in message', async () => {
                server.api.logger.loglevel = -1
                server.logger.loglevel = -1
                await client.connect()
                const res = await client.sendAndWait({secret: null})
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })

            it('should return HandshakeError for missing secret on server', async () => {
                server.api.logger.loglevel = -1
                server.logger.loglevel = -1
                await bareConn(client)                
                const res = await client.sendAndWait({secret: 'abc'})
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })

            describe('establishSecret', () => {

                it('should return HandshakeError for secret of length 23', async () => {
                    server.api.logger.loglevel = -1
                    server.logger.loglevel = -1
                    const msg = {secret: 'abcdefghijklmnopqrstuvw', action: 'establishSecret'}
                    await bareConn(client)
                    const res = await client.sendAndWait(msg)
                    expect(res.isError).to.equal(true)
                    expect(res.name).to.equal('HandshakeError')
                })

                it('should return HandshakeError for mismatch secret', async () => {
                    server.api.logger.loglevel = -1
                    server.logger.loglevel = -1
                    await client.connect()
                    const msg = {secret: Client.generateSecret(), action: 'establishSecret'}
                    const res = await client.sendAndWait(msg)
                    expect(res.isError).to.equal(true)
                    expect(res.name).to.equal('HandshakeError')
                })
            })

            describe('createMatch', () => {

                it('should return matchCreated with id of new match with total 1', async () => {
                    await client.connect()
                    const msg = {action: 'createMatch', total: 1}
                    const res = await client.sendAndWait(msg)
                    expect(res.action).to.equal('matchCreated')
                    expect(typeof(res.id)).to.equal('string')
                })

                it('should return ArgumentError for match with total -1', async () => {
                    server.api.logger.loglevel = -1
                    server.logger.loglevel = -1
                    await client.connect()
                    const msg = {action: 'createMatch', total: -1}
                    const res = await client.sendAndWait(msg)
                    expect(res.name).to.equal('ArgumentError')
                })
            })

            describe('joinMatch', () => {

                it('should return matchJoined and opponentJoind with id of new match with total 1', async () => {
                    await client.connect()
                    const {id} = await client.sendAndWait({action: 'createMatch', total: 1})
                    var p = client.waitForMessage()
                    await client2.connect()
                    const msg = {action: 'joinMatch', id}
                    const res2 = await client2.sendAndWait(msg)
                    const res = await p
                    expect(res.action).to.equal('opponentJoined')
                    expect(res2.action).to.equal('matchJoined')
                    expect(res2.id).to.equal(res.id)
                })

                it('should return MatchNotFoundError for unknown match id', async () => {
                    server.api.logger.loglevel = -1
                    server.logger.loglevel = -1
                    await client.connect()
                    const msg = {action: 'joinMatch', id: '12345678'}
                    const res = await client.sendAndWait(msg)
                    expect(res.name).to.equal('MatchNotFoundError')
                })

                it('should return MatchAlreadyJoinedError when already joined', async () => {
                    server.api.logger.loglevel = -1
                    server.logger.loglevel = -1
                    await client.connect()
                    const {id} = await client.sendAndWait({action: 'createMatch', total: 1})
                    var p = client.waitForMessage()
                    await client2.connect()
                    const msg = {action: 'joinMatch', id}
                    await client2.sendAndWait(msg)
                    await p
                    const res = await client2.sendAndWait(msg)
                    expect(res.name).to.equal('MatchAlreadyJoinedError')
                })
            })
        })

        describe('#matchResponse', () => {

            var id

            var rolls
            var roller

            beforeEach(async () => {
                const match = await createMatch()
                rolls = []
                match.opts.roller = () => rolls.shift() || Dice.rollTwo()
                match.total = 3
                id = match.id
            })

            it('should pass for bad action', async () => {
                server.logger.loglevel = 0
                server.matchResponse({id, color: White, secret: client.secret})
            })

            describe('nextGame', () => {

                it('should reply with nextGame for correct color and id', async () => {
                    client.sendAndWait({action: 'nextGame', color: White, id})
                    const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
                    expect(res.action).to.equal('nextGame')
                })

                it('should return GameNotFinishedError when both make second call', async () => {
                    const pr1 = client.sendAndWait({action: 'nextGame', color: White, id})
                    await client2.sendAndWait({action: 'nextGame', color: Red, id})
                    const pr2 = client.sendAndWait({action: 'nextGame', color: White, id})
                    server.logger.loglevel = -1
                    client.logger.loglevel = -1
                    const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
                    await pr1
                    const errOk = new Error
                    try {
                        client.cancelWaiting(errOk)
                        await pr2
                    } catch (err) {
                        if (err !== errOk) {
                            throw err
                        }
                    }
                    // alternative to try/await/catch
                    //client.messageReject = null

                    expect(res.name).to.equal('GameNotFinishedError')
                })
            })

            describe('firstTurn', () => {

                it('should reply with same dice for started game', async () => {
                    server.matches[id].nextGame()
                    const p = client.sendAndWait({action: 'firstTurn', color: White, id})
                    const res = await client2.sendAndWait({action: 'firstTurn', color: Red, id})
                    const res2 = await p
                    expect(res.dice).to.have.length(2)
                    expect(res.dice).to.jsonEqual(res2.dice)
                })
            })

            describe('playRoll', () => {

                it('should reply with same moves', async () => {
                    const game = server.matches[id].nextGame()
                    rolls = [[2, 1]]
                    game.firstTurn()
                    client2.sendAndWait({action: 'playRoll', color: Red, id})
                    const moves = [
                        {origin: 0, face: 1},
                        {origin: 0, face: 2}
                    ]
                    const res = await client.sendAndWait({action: 'playRoll', color: White, id, moves})
                    expect(res.moves).to.jsonEqual(moves)
                })

                it('should return RequestError for missing moves', async () => {
                    const game = server.matches[id].nextGame()
                    game.firstTurn()
                    client2.sendAndWait({action: 'playRoll', color: Red, id})
                    const res = await client.sendAndWait({action: 'playRoll', color: White, id})
                    expect(res.isRequestError).to.equal(true)
                })
            })

            describe('nextTurn', () => {
                it('should reply for valid case', async () => {
                    makeRandomMoves(server.matches[id].nextGame().firstTurn()).finish()
                    client2.sendAndWait({action: 'nextTurn', color: Red, id})
                    const res = await client.sendAndWait({action: 'nextTurn', color: White, id})
                    expect(res.action).to.equal('nextTurn')
                })
            })

            describe('turnOption', () => {

                it('should return isDouble for isDouble=false', async () => {
                    const game = server.matches[id].nextGame()
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn()
                    client2.sendAndWait({action: 'turnOption', isDouble: false, color: Red, id})
                    const res = await client.sendAndWait({action: 'turnOption', color: White, id})
                    expect(res.isDouble).to.equal(false)
                })

                it('should return isDouble=true for isDouble=true', async () => {
                    const game = server.matches[id].nextGame()
                    rolls = [[2, 1]]
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn()
                    client2.sendAndWait({action: 'turnOption', color: Red, id, isDouble: true})
                    const res = await client.sendAndWait({action: 'turnOption', color: White, id})
                    expect(res.isDouble).to.equal(true)
                })
            })

            describe('doubleResponse', () => {

                it('should set double declined for isAccept=false', async () => {
                    const game = server.matches[id].nextGame()
                    rolls = [[2, 1]]
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn().setDoubleOffered()
                    client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                    const res = await client.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: false})
                    expect(game.thisTurn.isDoubleDeclined).to.equal(true)
                    expect(res.isAccept).to.equal(false)
                })

                it('should double game for isAccept=true', async () => {
                    const game = server.matches[id].nextGame()
                    rolls = [[2, 1]]
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn().setDoubleOffered()
                    client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                    const res = await client.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: true})
                    expect(game.cubeValue).to.equal(2)
                    expect(res.isAccept).to.equal(true)
                })
            })

            describe('rollTurn', () => {
                it('should return same dice', async () => {
                    const game = server.matches[id].nextGame()
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn()
                    const p = client2.sendAndWait({action: 'rollTurn', color: Red, id})
                    const res = await client.sendAndWait({action: 'rollTurn', color: White, id})
                    const res2 = await p
                    expect(res.dice.length).to.equal(2)
                    expect(res.dice).to.jsonEqual(res2.dice)
                })
            })
        })

        describe('#roll', () => {
            it('should return 2 length array', () => {
                const result = server.roll()
                expect(result).to.have.length(2)
            })
        })

        describe('#validateColor', () => {

            it('should pass for White', () => {
                Server.validateColor(White)
            })

            it('should pass for Red', () => {
                Server.validateColor(Red)
            })

            it('should throw server error for Brown', () => {
                const err = getError(() => Server.validateColor('Brown'))
                expect(err.isRequestError).to.equal(true)
            })
        })
    })

    describe('api', () => {

        describe('signup', () => {

            it('should return 201', async () => {
                const username = 'nobody@nowhere.example'
                const password = '6pN3pHeZ'
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                expect(res.status).to.equal(201)
            })

            it('should create a user and userExists() = true', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'udb2SZbK'
                await authClient.postJson('/api/v1/signup', {username, password})
                const res = await authServer.auth.userExists(username)
                expect(res).to.equal(true)
            })

            it('should send confirm email', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'C98FCQxU'
                await authClient.postJson('/api/v1/signup', {username, password})
                expect(authServer.auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should return 400 for bad email', async () => {
                const username = 'nobody-bad-email'
                const password = 'EbaD99wa'
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                expect(res.status).to.equal(400)
            })

            it('should have error.name=ValidateError for bad email', async () => {
                authServer.api.logger.loglevel = -1
                const username = 'nobody-bad-email'
                const password = 'EbaD99wa'
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                const body = await res.json()
                expect(body.error.name).to.equal('ValidateError')
            })

            it('should return 400 for bad password', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'password'
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                expect(res.status).to.equal(400)
            })

            it('should have error.name=ValidateError for bad password', async () => {
                authServer.api.logger.loglevel = -1
                const username = 'nobody@nowhere.example'
                const password = 'password'
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                const body = await res.json()
                expect(body.error.name).to.equal('ValidateError')
            })

            it('should return 500 when sendConfirmEmail throws', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'H6WJmuyZ'
                authServer.auth.sendConfirmEmail = () => {throw new Error}
                authServer.logger.loglevel = -1
                authServer.api.logger.loglevel = -1
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                expect(res.status).to.equal(500)
            })

            it('should have error.name=InternalError when sendConfirmEmail rejects', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'zQ2EzTRx'
                authServer.auth.sendConfirmEmail = () => new Promise((resolve, reject) => reject(new Error))
                authServer.logger.loglevel = -1
                authServer.api.logger.loglevel = -1
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                const body = await res.json()
                expect(body.error.name).to.equal('InternalError')
            })
        })

        describe('send-confirm-email', () => {

            it('should return 200 for non existent user', async () => {
                const username = 'nobody@nowhere.example'
                authServer.logger.loglevel = 0
                authServer.api.logger.loglevel = 0
                const res = await authClient.postJson('/api/v1/send-confirm-email', {username})
                expect(res.status).to.equal(200)
            })

            it('should return 400 for bad username', async () => {
                const username = 'bad-username'
                authServer.logger.loglevel = 0
                authServer.api.logger.loglevel = 0
                const res = await authClient.postJson('/api/v1/send-confirm-email', {username})
                expect(res.status).to.equal(400)
            })

            it('should send email for unconfirmed user', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'cbSx6gnx'
                await authServer.auth.createUser(username, password)
                const res = await authClient.postJson('/api/v1/send-confirm-email', {username})
                expect(authServer.auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should return 500 when email sending fails', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'SqY3ExtF'
                await authServer.auth.createUser(username, password)
                authServer.logger.loglevel = -1
                authServer.api.logger.loglevel = -1
                authServer.auth.email.impl.send = () => {throw new Error}
                const res = await authClient.postJson('/api/v1/send-confirm-email', {username})
                expect(res.status).to.equal(500)
            })
        })

        describe('forgot-password', () => {

            it('should return 200 for non existent user', async () => {
                const username = 'nobody@nowhere.example'
                authServer.api.logger.loglevel = 0
                authServer.logger.loglevel = 0
                const res = await authClient.postJson('/api/v1/forgot-password', {username})
                expect(res.status).to.equal(200)
            })

            it('should return 400 for bad username', async () => {
                const username = 'bad-username'
                authServer.api.logger.loglevel = 0
                authServer.logger.loglevel = 0
                const res = await authClient.postJson('/api/v1/forgot-password', {username})
                expect(res.status).to.equal(400)
            })

            it('should send email for confirmed user', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'n2sLvf4b'
                await authServer.auth.createUser(username, password, true)
                const res = await authClient.postJson('/api/v1/forgot-password', {username})
                expect(authServer.auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })
        })

        describe('confirm-acount', () => {

            it('should return 200 and confirm user for valid key', async () => {
                const username = 'nobody@nowhere.example'
                const password = '5btmHKfG'
                await authServer.auth.createUser(username, password)
                await authServer.auth.sendConfirmEmail(username)
                const confirmKey = parseKey(authServer.auth.email.impl.lastEmail)
                const res = await authClient.postJson('/api/v1/confirm-account', {username, confirmKey})
                expect(res.status).to.equal(200)
                const user = await authServer.auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should return 400 for bad username', async () => {
                const username = 'bad-username'
                authServer.logger.loglevel = 0
                const confirmKey = 'whatever'
                const res = await authClient.postJson('/api/v1/confirm-account', {username, confirmKey})
                expect(res.status).to.equal(400)
            })
        })

        describe('change-password', () => {

            it('should return 200 and authenticate for confirmed user', async () => {
                const username = 'nobody@nowhere.example'
                const oldPassword = '2qgN4Cxd'
                await authServer.auth.createUser(username, oldPassword, true)
                const newPassword = '8LtMu24j'
                const res = await authClient.postJson('/api/v1/change-password', {username, oldPassword, newPassword})
                expect(res.status).to.equal(200)
                await authServer.auth.authenticate(username, newPassword)
            })

            it('should return 400 for bad username', async () => {
                const username = 'bad-username'
                const oldPassword = '2qgN4Cxd'
                const newPassword = '8LtMu24j'
                const res = await authClient.postJson('/api/v1/change-password', {username, oldPassword, newPassword})
                expect(res.status).to.equal(400)
            })
        })

        describe('reset-password', () => {

            it('should return 200 and authenticate for good key', async () => {
                const username = 'nobody@nowhere.example'
                const oldPassword = 'nRGJb9rA'
                await authServer.auth.createUser(username, oldPassword, true)
                await authServer.auth.sendResetEmail(username)
                const resetKey = parseKey(authServer.auth.email.impl.lastEmail)
                const password = 'F86ezYsU'
                const res = await authClient.postJson('/api/v1/reset-password', {username, password, resetKey})
                expect(res.status).to.equal(200)
                await authServer.auth.authenticate(username, password)
            })

            it('should return 400 for bad key', async () => {
                const username = 'nobody@nowhere.example'
                const oldPassword = 'swaU93BL'
                await authServer.auth.createUser(username, oldPassword, true)
                const resetKey = 'bad-key'
                const password = 'Spng4EAC'
                const res = await authClient.postJson('/api/v1/reset-password', {username, password, resetKey})
                expect(res.status).to.equal(400)
            })
        })        
    })

    describe('metrics', () => {

        describe('GET /metrics', () => {
            it('should return 200', async () => {
                const res = await fetch(metricsUrl + '/metrics')
                expect(res.status).to.equal(200)
            })
            it('should return 500 when fetchMetrics throws', async () => {
                server.fetchMetrics = () => {throw new Error('test')}
                const res = await fetch(metricsUrl + '/metrics')
                expect(res.status).to.equal(500)
            })
        })
    })

    describe('web', () => {

        describe('GET /health', () => {
            it('should return 200', async () => {
                const res = await fetch(serverUrl + '/health')
                expect(res.status).to.equal(200)
            })
        })

        describe('GET /', () => {

            it('should return 200', async () => {
                const res = await fetch(serverUrl + '/')
                expect(res.status).to.equal(200)
            })

            it('should have text Gameon in body', async () => {
                const res = await fetch(serverUrl + '/')
                const body = await res.text()
                expect(body).to.contain('Gameon')
            })

            it('should clear invalid session cookie', async () => {
                const res = await fetch(serverUrl + '/', {
                    headers: {
                        cookie: ['gasid=abcd']
                    }
                })
                const parsedCookies = parseCookies(res)
                expect(parsedCookies).to.contain('gasid=').and.to.not.contain('gasid=abcd')
            })
        })
        
        describe('GET /nowhere', () => {

            it('should return 404', async () => {
                const res = await fetch(serverUrl + '/nowhere')
                expect(res.status).to.equal(404)
            })
        })

        describe('GET /login', () => {

            it('should return 200', async () => {
                const res = await fetch(authServerUrl + '/login')
                expect(res.status).to.equal(200)
            })
        })

        describe('POST /login', () => {

            it('should return 400 with bad credentials', async () => {
                const username = 'nobody@nowhere.example'
                const password = 's8Kfjsdk9'
                const params = getParams({username, password})
                authServer.auth.logger.loglevel = -1
                const res = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params
                })
                expect(res.status).to.equal(400)
            })

            it('should return 400 with no data', async () => {
                const params = getParams()
                const res = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params
                })
                expect(res.status).to.equal(400)
            })

            it('should return 500 when authenticate throws Error', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'tz7TcUUm'
                const params = getParams({username, password})
                authServer.auth.authenticate = async () => { throw new Error }
                const res = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params
                })
                expect(res.status).to.equal(500)
            })

            it('should return 302 to /dashboard with good credentials', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'M3nGUmSF'
                const params = getParams({username, password})
                authServer.auth.createUser(username, password, true)
                const res = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params,
                    redirect: 'manual'
                })
                expect(res.status).to.equal(302)
                expect(res.headers.get('location')).to.equal(authServerUrl + '/dashboard')
            })
        })

        
        describe('GET /logout', () => {

            it('should return 302 to / with no login session', async () => {
                const res = await fetch(authServerUrl + '/logout', {
                    redirect: 'manual'
                })
                expect(res.status).to.equal(302)
                expect(res.headers.get('location')).to.equal(authServerUrl + '/')
            })

            it('should return 302 to / with login session', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'VuVahF43'
                const params = getParams({username, password})
                authServer.auth.createUser(username, password, true)
                const loginRes = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params,
                    redirect: 'manual'
                })
                const parsedCookies = parseCookies(loginRes)
                const res = await fetch(authServerUrl + '/logout', {
                    redirect: 'manual',
                    headers: {
                        cookie: parsedCookies
                    }
                })
                expect(res.status).to.equal(302)
                expect(res.headers.get('location')).to.equal(authServerUrl + '/')
            })
        })

        describe('GET /dashboard', () => {

            it('should return 200 for logged in', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'DtgZ77mU'
                const params = getParams({username, password})
                authServer.auth.createUser(username, password, true)
                //console.log(authServer.auth)
                const loginRes = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params,
                    redirect: 'manual'
                })
                const parsedCookies = parseCookies(loginRes)
                const res = await fetch(authServerUrl + '/dashboard', {
                    redirect: 'manual',
                    headers: {
                        cookie: parsedCookies
                    }
                })
                //console.log(await loginRes.text())
                //console.log(await res.text())
                expect(res.status).to.equal(200)
            })

            it('should redirect to /login when not logged in', async () => {
                const res = await fetch(authServerUrl + '/dashboard', {
                    redirect: 'manual'
                })
                expect(res.status).to.equal(302)
                expect(res.headers.get('location')).to.equal(authServerUrl + '/login')
            })
        })

        describe('GET /play', () => {

            it('should return 200 for logged in', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'sj8GWDuJ'
                const params = getParams({username, password})
                authServer.auth.createUser(username, password, true)
                const loginRes = await fetch(authServerUrl + '/login', {
                    method: 'POST',
                    body: params,
                    redirect: 'manual'
                })
                const parsedCookies = parseCookies(loginRes)
                const res = await fetch(authServerUrl + '/play', {
                    redirect: 'manual',
                    headers: {
                        cookie: parsedCookies
                    }
                })
                expect(res.status).to.equal(200)
            })

            it('should redirect to /login when not logged in', async () => {
                const res = await fetch(authServerUrl + '/play', {
                    redirect: 'manual'
                })
                expect(res.status).to.equal(302)
                expect(res.headers.get('location')).to.equal(authServerUrl + '/login')
            })
        })
    })
})

describe('NetPlayer', () => {

    var serverUrl
    var client1
    var client2
    var client // alias for client1

    var server

    beforeEach(async () => {
        server = new Server
        server.logger.loglevel = 1
        // hack so no req logging
        server.getLoggingMiddleware = () => (req, res, next) => next()
        server.app = server.createApp()
        await server.listen()
        serverUrl = 'ws://localhost:' + server.port
        client1 = new Client(serverUrl)
        client = client1
        client2 = new Client(serverUrl)
        client1.logger.loglevel = 1
        client2.logger.loglevel = 1
    })

    afterEach(async () => {
        await client1.close()
        await client2.close()
        server.close()
    })

    async function eastAndWest(opts) {
        opts = {total: 1, ...opts}
        await client1.connect()
        await client2.connect()
        const playersWest = {
            White : newRando(White)
          , Red   : new NetPlayer(client1, Red)
        }
        const playersEast = {
            White : new NetPlayer(client2, White)
          , Red   : newRando(Red)
        }
        const coordWest = new Coordinator
        const coordEast = new Coordinator
        const p = client1.createMatch(opts)
        await new Promise(resolve => setTimeout(resolve, 10))
        const matchEast = await client2.joinMatch(client1.matchId)
        const matchWest = await p
        return {
            east : {players: playersEast, coord: coordEast, match: matchEast},
            west : {players: playersWest, coord: coordWest, match: matchWest}
        }
    }

    it('should play robot v robot over net', async function () {

        this.timeout(20000)

        const {east, west} = await eastAndWest({total: 1})

        try {
            await Promise.all([
                east.coord.runMatch(east.match, east.players.White, east.players.Red),
                west.coord.runMatch(west.match, west.players.White, west.players.Red)
            ])
        } finally {
            await Util.destroyAll(east.players)
            await Util.destroyAll(west.players)
        }
    })

    it('should play robot v robot over net with double accept, decline', async function() {
        this.timeout(2000)
        //server.logger.loglevel = 4

        const {east, west} = await eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        const p1 = east.coord.runMatch(east.match, east.players.White, east.players.Red)
        const p2 = west.coord.runMatch(west.match, west.players.White, west.players.Red)

        try {
            await p1
            await p2
        } finally {
            await Util.destroyAll(east.players)
            await Util.destroyAll(west.players)
        }
    })

    it('should play robot v robot over net with double after 3 moves accept, decline', async function() {
        this.timeout(2000)
        //server.logger.loglevel = 4

        const {east, west} = await eastAndWest({total: 2, isCrawford: false})

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

        const p1 = east.coord.runMatch(east.match, east.players.White, east.players.Red)
        const p2 = west.coord.runMatch(west.match, west.players.White, west.players.Red)

        try {
            await p1
            await p2
        } finally {
            await Util.destroyAll(east.players)
            await Util.destroyAll(west.players)
        }
    })

    describe('timing experiments', () => {
        it('')
    })
})

describe('Auth', () => {


    describe('#defaults', () => {

        it('should set passwordHelp to non default when regex defined', () => {
            const d1 = Auth.defaults({})
            const d2 = Auth.defaults({AUTH_PASSWORD_REGEX: '.*'})
            expect(d2.passwordHelp).to.not.equal(d1.passwordHelp)
        })
    })

    describe('#validateUsername', () => {

        it('should throw ValidateError for empty', () => {
            const auth = new Auth('anonymous')
            const input = ''
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for bar char ?', () => {
            const auth = new Auth('anonymous')
            const input = 'foo?@example.example'
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for bad email chunky', () => {
            const auth = new Auth('anonymous')
            const input = 'chunky'
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should pass for nobody@nowhere.example', () => {
            const auth = new Auth('anonymous')
            const input = 'nobody@nowhere.example'
            auth.validateUsername(input)
        })
    })

    describe('#validatePassword', () => {

        it('should throw ValidateError for empty', () => {
            const auth = new Auth('anonymous')
            const input = ''
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for length 7', () => {
            const auth = new Auth('anonymous')
            const input = '5ZycJj3'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for missing number', () => {
            const auth = new Auth('anonymous')
            const input = 'aDlvkdoslK'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for start with encrypted_', () => {
            const auth = new Auth('anonymous')
            const input = 'encrypted_aDlvkdoslK'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        const passCases = [
            'dbHg5eva'
          , 'dY@a45-S'
          , '=Bwx4r%aWB_T'
          , 'a1d//////G'
        ]

        passCases.forEach(input => {
            it('should pass for ' + input, () => {
                const auth = new Auth('anonymous')
                auth.validatePassword(input)
            })
        })
    })

    describe('Anonymous', () => {

        it('should accept blank username/password', async () => {
            const auth = new Auth('anonymous')
            await auth.authenticate()
        })

        const nimps = [
            'createUser'
          , 'readUser'
          , 'updateUser'
          , 'deleteUser'
          , 'userExists'
          , 'listAllUsers'
        ]

        nimps.forEach(method => {
            it('should throw NotImplementedError for ' + method, async () => {
                const auth = new Auth('anonymous')
                const err = await getErrorAsync(() => auth.impl[method]())
                expect(err.name).to.equal('NotImplementedError')
            })
        })

        describe('#authenticate', () => {
            it('should return passwordEncrypted when password non-empty', async () => {
                const auth = new Auth('anonymous')
                const user = await auth.authenticate(null, 'a')
                expect(user.passwordEncrypted).to.have.length.greaterThan(0)
            })
        })
    })

    describe('Directory', () => {

        var authDir

        beforeEach(() => {
            authDir = tmp.dirSync().name
        })

        afterEach(async () => {
            await fse.remove(authDir)
        })

        it('should fail with no directory specified', () => {
            const err = getError(() => { new Auth('directory')})
            expect(err instanceof Error).to.equal(true)
        })

        it('should file with non-existent directory', () => {
            const opts = {authDir: '/non-existent'}
            const err = getError(() => { new Auth('directory', opts)})
            expect(err instanceof Error).to.equal(true)
        })

        it('should pass with diretory specified', () => {
            const opts = {authDir}
            const auth = new Auth('directory', opts)
        })

        function newAuth() {
            const opts = {authDir}
            const auth = new Auth('directory', opts)
            auth.logger.loglevel = 0
            return auth
        }

        describe('#createUser', () => {

            it('should return user data with username', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Daz5zGAZa'
                const user = await auth.createUser(username, password, true)
                expect(user.username).to.equal(username)
            })

            it('should throw UserExistsError for duplicate user case insensitive', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Daz5zGAZa'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.createUser(username.toUpperCase(), password, true))
                expect(err.name).to.equal('UserExistsError')
            })
        })

        describe('#readUser', () => {

            it('should return user data with username', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'vALkke5N'
                await auth.createUser(username, password, true)
                const user = await auth.readUser(username)
                expect(user.username).to.equal(username)
            })

            it('should throw UserNotFoundError', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const err = await getErrorAsync(() => auth.readUser(username))
                expect(err.name).to.equal('UserNotFoundError')
            })

            it('should throw InternalError cause by SyntaxError when malformed json', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'mUad3h8b'
                await auth.createUser(username, password, true)
                // hack file
                fs.writeFileSync(auth.impl._userFile(username), '{]')
                const err = await getErrorAsync(() => auth.readUser(username))
                expect(err.name).to.equal('InternalError')
                expect(err.cause.name).to.equal('SyntaxError')
            })
        })

        describe('#deleteUser', () => {

            it('should throw UserNotFoundError', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const err = await getErrorAsync(() => auth.deleteUser(username))
                expect(err.name).to.equal('UserNotFoundError')
            })

            it('should delete user, and then user should not exist', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'PPt7HKvP'
                await auth.createUser(username, password, true)
                await auth.deleteUser(username)
                const result = await auth.userExists(username)
                expect(result).to.equal(false)
            })
        })

        describe('#listAllUsers', () => {

            it('should return empty list', async () => {
                const auth = newAuth()
                const result = await auth.listAllUsers()
                expect(result).to.have.length(0)
            })

            it('should return singleton of created user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Sa32q9QT'
                await auth.createUser(username, password, true)
                const result = await auth.listAllUsers()
                expect(result).to.have.length(1)
                expect(result).to.contain(username)
            })

            it('should throw InternalError caused by ENOENT when directory gets nuked', async () => {
                const auth = newAuth()
                await fse.remove(auth.impl.opts.authDir)
                const err = await getErrorAsync(() => auth.listAllUsers())
                expect(err.name).to.equal('InternalError')
                expect(err.cause.code).to.equal('ENOENT')
            })

            it('should return empty after user deleted', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'rGnPNs54'
                await auth.createUser(username, password, true)
                await auth.deleteUser(username)
                const result = await auth.listAllUsers()
                expect(result).to.have.length(0)
            })
        })

        describe('#authenticate', () => {

            it('should pass for created user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'AgJ7jfr9'
                await auth.createUser(username, password, true)
                await auth.authenticate(username, password)
            })

            it('should throw BadCredentialsError for bad password', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Sfekx6Yx'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.authenticate(username, password + 'x'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for non-existent user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Nm4PcTHe'
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw InternalError when impl throws', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'g3AkYhC6'
                const e = new Error
                auth.impl.readUser = () => { throw e }
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.isInternalError).to.equal(true)
                expect(err.cause).to.equal(e)
            })

            it('should throw UserLockedError for user locked', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'vu3a8EZm'
                await auth.createUser(username, password, true)
                await auth.lockUser(username)
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.name).to.equal('UserLockedError')
            })

            it('should pass for user locked then unlocked', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'vu3a8EZm'
                await auth.createUser(username, password, true)
                await auth.lockUser(username)
                await auth.unlockUser(username)
                await auth.authenticate(username, password)
            })

            it('should accept encrypted password', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 't6jn5Xwa'
                const user = await auth.createUser(username, password, true)
                await auth.authenticate(username, user.passwordEncrypted)
            })

            it('should throw UserNotConfirmedError for unconfirmed user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'c9dxCZRL'
                await auth.createUser(username, password)
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.name).to.equal('UserNotConfirmedError')
            })
        })

        describe('#sendConfirmEmail', () => {

            it('should set lastEmail in mock email', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'mAGP6hsZ'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                expect(auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should throw UserConfirmedError if user confirmed', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'QEAY8baN'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.sendConfirmEmail(username))
                expect(err.name).to.equal('UserConfirmedError')
            })
        })

        describe('#sendResetEmail', () => {

            it('should set lastEmail in mock email', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Q6rzSPnk'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                expect(auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should throw UserNotConfirmedError if user not confirmed', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'rwF84M82'
                await auth.createUser(username, password)
                const err = await getErrorAsync(() => auth.sendResetEmail(username))
                expect(err.name).to.equal('UserNotConfirmedError')
            })
        })

        describe('#confirmUser', () => {

            it('should confirm user with key sent in email', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'j7VHVRUd'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                // parse key from email
                const confirmKey = parseKey(auth.email.impl.lastEmail)
                await auth.confirmUser(username, confirmKey)
                const user = await auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should throw BadCredentialsError for bad key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'JkrsX89y'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                const err = await getErrorAsync(() => auth.confirmUser(username, 'badkey'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for expired key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'HGLV5gHT'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                const confirmKey = parseKey(auth.email.impl.lastEmail)
                // hack expiry setting
                auth.opts.confirmExpiry = -1
                const err = await getErrorAsync(() => auth.confirmUser(username, confirmKey))
                expect(err.name).to.equal('BadCredentialsError')
                expect(err.message.toLowerCase()).to.contain('expire')
            })
        })

        describe('#resetPassword', () => {

            it('should reset password and authenticate', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'TGVN4pxL'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const resetKey = parseKey(auth.email.impl.lastEmail)
                const newPassword = 'k8hWfxC8'
                await auth.resetPassword(username, newPassword, resetKey)
                await auth.authenticate(username, newPassword)
            })

            it('should throw BadCredentialsError for bad key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'JkrsX89y'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const newPassword = 'H69Xwqwu'
                const err = await getErrorAsync(() => auth.resetPassword(username, newPassword, 'badkey'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for expired key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'HGLV5gHT'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const newPassword = '2vy2WM5c'
                const confirmKey = parseKey(auth.email.impl.lastEmail)
                // hack expiry setting
                auth.opts.resetExpiry = -1
                const err = await getErrorAsync(() => auth.resetPassword(username, newPassword, confirmKey))
                expect(err.name).to.equal('BadCredentialsError')
                expect(err.message.toLowerCase()).to.contain('expire')
            })
        })

        describe('#changePassword', () => {

            it('should change password and authenticate', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'AjD4eEFn'
                const newPassword = 'mFUHv2we'
                await auth.createUser(username, password, true)
                await auth.changePassword(username, password, newPassword)
                await auth.authenticate(username, newPassword)
            })

            it('should throw BadCredentialsError for bad old password', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'AjD4eEFn'
                const newPassword = 'mFUHv2we'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.changePassword(username, newPassword, newPassword))
                expect(err.name).to.equal('BadCredentialsError')
            })
        })

        describe('#parseToken', () => {

            it('should return initial value for getToken', () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'gck3fRYu'
                const res = auth.parseToken(auth.getToken(username, password))
                expect(res.username).to.equal(username)
                expect(res.password).to.equal(password)
            })
        })
    })

    function s3Suite(s3_bucket) {

        return function() {

            this.timeout(10000)

            const s3_prefix = 'test/' + +new Date + '/'

            function newAuth() {
                const opts = {s3_bucket, s3_prefix}
                const auth = new Auth('s3', opts)
                auth.logger.loglevel = 1
                return auth
            }

            var s3

            before(() => {
                s3 = new AWS.S3()
            })

            describe('#createUser', () => {

                it('should create user', async () => {
                    const auth = newAuth()
                    const username = 'nobody1@nowhere.example'
                    const password = 'a7CGQSdV'
                    await auth.createUser(username, password, true)
                    // cleanup
                    await auth.deleteUser(username)
                })
            })

            describe('#readUser', () => {

                it('should read user case insensitive', async () => {
                    const auth = newAuth()
                    const username = 'nobody2@nowhere.example'
                    const password = '2SnMTw6M'
                    await auth.createUser(username, password, true)
                    try {
                        const user = await auth.readUser(username.toUpperCase())
                        expect(user.username).to.equal(username)
                    } finally {
                        // cleanup
                        await auth.deleteUser(username)
                    }
                })

                it('should throw UserNotFoundError', async () => {
                    const auth = newAuth()
                    const username = 'nobody3@nowhere.example'
                    const err = await getErrorAsync(() => auth.readUser(username))
                    expect(err.name).to.equal('UserNotFoundError')
                })

                it('should throw InternalError caused by SyntaxError when malformed json', async () => {
                    const auth = newAuth()
                    const username = 'nobody-syntax-err@nowhere.example'
                    const password = 'VBvUa7TX'
                    await auth.createUser(username, password, true)
                    try {
                        // hack object
                        await auth.impl.s3.putObject({
                            Bucket : s3_bucket,
                            Key : auth.impl._userKey(username),
                            Body: Buffer.from('{]')
                        }).promise()
                        const err = await getErrorAsync(() => auth.readUser(username))
                        expect(err.name).to.equal('InternalError')
                        expect(err.cause.name).to.equal('SyntaxError')
                    } finally {
                        // cleanup
                        await auth.deleteUser(username)
                    }
                })
            })

            describe('#userExists', () => {

                it('should return true for created user', async () => {
                    const auth = newAuth()
                    const username = 'nobody4@nowhere.example'
                    const password = 'gB3tbM96'
                    await auth.createUser(username, password, true)
                    try {
                        const result = await auth.userExists(username)
                        expect(result).to.equal(true)
                    } finally {
                        // cleanup
                        await auth.deleteUser(username)
                    }
                })

                it('should return false for non existent', async () => {
                    const auth = newAuth()
                    const username = 'nobody5@nowhere.example'
                    const result = await auth.userExists(username)
                    expect(result).to.equal(false)
                })

                it('should throw InternalError with cause BadRequest when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    const err = await getErrorAsync(() => auth.userExists(username))
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('BadRequest')
                })
            })

            describe('#deleteUser', () => {

                it('should throw UserNotFoundError for bad user', async () => {
                    const auth = newAuth()
                    const username = 'bad-delete-user@nowhere.example'
                    const err = await getErrorAsync(() => auth.deleteUser(username))
                    expect(err.name).to.equal('UserNotFoundError')
                })

                it('should throw InvalidBucketName when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getErrorAsync(() => auth.impl.deleteUser(username))
                    expect(err.name).to.equal('InvalidBucketName')
                })
            })

            describe('#updateUser', () => {
                it('should throw InvalidBucketName when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucke-update-user@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getErrorAsync(() => auth.impl.updateUser(username, {}))
                    expect(err.name).to.equal('InvalidBucketName')
                })
            })

            describe('#listAllUsers', () => {
                it('should throw InternalError with cause NotImplementedError', async () => {
                    const auth = newAuth()
                    const err = await getErrorAsync(() => auth.listAllUsers())
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('NotImplementedError')
                })
            })
        }
        
    }

    if (process.env.TEST_AUTH_S3_BUCKET) {
        describe('S3', s3Suite(process.env.TEST_AUTH_S3_BUCKET))
    } else {
        describe.skip('S3', s3Suite())
    }
})