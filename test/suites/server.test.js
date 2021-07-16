/**
 * gameon - test suite - Server
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
    requireSrc,
    States,
    tmpDir
} = Test

const fetch = require('node-fetch')
const fs    = require('fs')
const fse   = require('fs-extra')

const {URLSearchParams} = require('url')

describe('-', () => {

    const Auth        = requireSrc('net/auth')
    const Client      = requireSrc('net/client')
    const Core        = requireSrc('lib/core')
    const Constants   = requireSrc('lib/constants')
    const Dice        = requireSrc('lib/dice')
    const Server      = requireSrc('net/server')
    const Util        = requireSrc('lib/util')

    const {White, Red}  = Constants
    const {Match} = Core

    var server
    var serverUrl
    var metricsUrl

    var client1
    var client2
    var client // alias for client1

    var authDir
    var authServer
    var authServerUrl
    var authClient
    
    function getParams(obj) {
        obj = obj || {}
        const params = new URLSearchParams
        for (var k in obj) {
            params.append(k, obj[k])
        }
        return params
    }

    async function createMatch() {
        await Promise.all([client1.connect(), client2.connect()])
        const res = await client1.sendAndWait({action: 'createMatch', total: 1})
        const id = res.id
        const p = client1.waitForMessage()
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

        authDir = tmpDir()

        server = new Server
        authServer = new Server({authType: 'directory', authDir, sessionInsecure : true})

        server.loglevel = 1
        authServer.loglevel = 1

        await server.listen()
        await authServer.listen()

        serverUrl = 'http://localhost:' + server.port
        metricsUrl = 'http://localhost:' + server.metricsPort
        authServerUrl = 'http://localhost:' + authServer.port

        client1 = new Client({serverUrl})
        client2 = new Client({serverUrl})
        authClient = new Client({serverUrl: authServerUrl})

        client1.logger.name = 'Client1'
        client2.logger.name = 'Client2'
        authClient.logger.name = 'AuthClient'

        client1.loglevel = 1
        client2.loglevel = 1
        authClient.loglevel = 1

        client1.sendAndWait = sendAndWait
        client2.sendAndWait = sendAndWait
        client = client1        
    })

    afterEach(async () => {
        await client1.close()
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
                const secret = Client.generateSecret()
                const err = getError(() => server.getMatchForRequest({color: White, id: '12345678', secret}))
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
                server.loglevel = -1
                await client.connect()
                const res = await client.sendAndWait({secret: null})
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })

            it('should return HandshakeError for missing secret on server', async () => {
                server.loglevel = -1
                await bareConn(client)                
                const res = await client.sendAndWait({secret: 'abc'})
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })

            describe('establishSecret', () => {

                it('should return HandshakeError for secret of length 23', async () => {
                    server.loglevel = -1
                    const msg = {secret: 'abcdefghijklmnopqrstuvw', action: 'establishSecret'}
                    await bareConn(client)
                    const res = await client.sendAndWait(msg)
                    expect(res.isError).to.equal(true)
                    expect(res.name).to.equal('HandshakeError')
                })

                it('should return HandshakeError for mismatch secret', async () => {
                    server.loglevel = -1
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

                it('should return ArgumentError for match with total -1', async function() {
                    server.loglevel = 0
                    await client.connect()
                    const req = {total: -1}
                    const err = await getErrorAsync(() => client.createMatch(req))
                    expect(err.isArgumentError).to.equal(true)
                })
            })

            describe('joinMatch', () => {

                it('should return matchJoined and opponentJoind with id of new match with total 1', async function () {

                    await client1.connect()
                    await client2.connect()

                    let promise
                    client1.on('response', ({action, id}) => {
                        if (action == 'matchCreated') {
                            promise = client2.sendMessage({action: 'joinMatch', id}).waitForResponse()
                        }
                    })

                    await client1.sendMessage({action: 'createMatch', total: 1}).waitForResponse()

                    const res1 = await client1.waitForResponse()
                    const res2 = await promise

                    expect(res1.action).to.equal('opponentJoined')
                    expect(res2.action).to.equal('matchJoined')
                    expect(res1.id).to.equal(res2.id)
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
            var match

            var rolls
            var roller

            beforeEach(async () => {
                match = await createMatch()
                rolls = []
                match.opts.roller = () => rolls.shift() || Dice.rollTwo()
                match.total = 3
                id = match.id
            })

            
            it('should pass for bad action', function (done) {
                client1.once('unhandledMessage', () => done())
                server.loglevel = 0
                server.matchResponse({id, color: White, secret: client.secret})
            })

            describe('nextGame', () => {

                it('should reply with nextGame for correct color and id', async () => {
                    client1.sendAndWait({action: 'nextGame', color: White, id})
                    const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
                    expect(res.action).to.equal('nextGame')
                })

                it('should return GameNotFinishedError when both make second call', async () => {
                    const pr1 = client1.sendAndWait({action: 'nextGame', color: White, id})
                    await client2.sendAndWait({action: 'nextGame', color: Red, id})
                    const pr2 = client1.sendAndWait({action: 'nextGame', color: White, id})
                    server.loglevel = -1
                    client1.loglevel = -1
                    const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
                    await pr1
                    const errOk = new Error
                    try {
                        client1.cancelWaiting(errOk)
                        await pr2
                    } catch (err) {
                        if (err !== errOk) {
                            throw err
                        }
                    }
                    // alternative to try/await/catch
                    //client.messageReject = null

                    expect(res.isGameNotFinishedError).to.equal(true)
                })
            })

            describe('firstTurn', () => {

                it('should reply with same dice for started game', function (done) {

                    let isDebug = false

                    if (isDebug) {
                        server.loglevel = 4
                        client1.loglevel = 4
                        client2.loglevel = 4
                    }

                    match.nextGame()

                    client1.matchRequest('firstTurn', {color: White, id}).then(res => {
                        expect(res.dice).to.have.length(2)
                        next(null, res)
                    }).catch(next)

                    client2.matchRequest('firstTurn', {color: Red, id}).then(res => {
                        expect(res.dice).to.have.length(2)
                        next(null, res)
                    }).catch(next)

                    const results = []
                    const errors = []

                    function next(err, res) {

                        results.push(res)
                        if (err) {
                            errors.push(err)
                        }

                        if (results.length < 2) {
                            return
                        }

                        if (errors.length) {
                            if (errors.length > 1) {
                                console.error('Secondary errors', ...errors.slice(1))
                            }
                            return done(errors[0])
                        }

                        try {
                            const [res1, res2] = results
                            expect(res1.dice).to.jsonEqual(res2.dice)
                        } catch (err) {
                            return done(err)
                        }

                        done()
                    }
                })
            })

            describe('playRoll', () => {

                it('should reply with same moves', async () => {
                    const game = match.nextGame()
                    rolls = [[2, 1]]
                    game.firstTurn()
                    client2.sendAndWait({action: 'playRoll', color: Red, id})
                    const moves = [
                        {origin: 0, face: 1},
                        {origin: 0, face: 2}
                    ]
                    const res = await client1.sendAndWait({action: 'playRoll', color: White, id, moves})
                    expect(res.moves).to.jsonEqual(moves)
                })

                it('should return RequestError for missing moves', async () => {
                    const game = match.nextGame()
                    rolls = [[2, 1]]
                    game.firstTurn()
                    const res = await client1.sendAndWait({action: 'playRoll', color: White, id})
                    expect(res.isRequestError).to.equal(true)
                })
            })

            describe('nextTurn', () => {
                it('should reply for valid case', async () => {
                    makeRandomMoves(match.nextGame().firstTurn()).finish()
                    client2.sendAndWait({action: 'nextTurn', color: Red, id})
                    const res = await client1.sendAndWait({action: 'nextTurn', color: White, id})
                    expect(res.action).to.equal('nextTurn')
                })
            })

            describe('turnOption', () => {

                it('should return isDouble for isDouble=false', async () => {
                    const game = match.nextGame()
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn()
                    client2.sendAndWait({action: 'turnOption', isDouble: false, color: Red, id})
                    const res = await client1.sendAndWait({action: 'turnOption', color: White, id})
                    expect(res.isDouble).to.equal(false)
                })

                it('should return isDouble=true for isDouble=true', async () => {
                    const game = match.nextGame()
                    rolls = [[2, 1]]
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn()
                    client2.sendAndWait({action: 'turnOption', color: Red, id, isDouble: true})
                    const res = await client1.sendAndWait({action: 'turnOption', color: White, id})
                    expect(res.isDouble).to.equal(true)
                })
            })

            describe('doubleResponse', () => {

                it('should set double declined for isAccept=false', async () => {
                    const game = match.nextGame()
                    rolls = [[2, 1]]
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn().setDoubleOffered()
                    client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                    const res = await client1.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: false})
                    expect(game.thisTurn.isDoubleDeclined).to.equal(true)
                    expect(res.isAccept).to.equal(false)
                })

                it('should double game for isAccept=true', async () => {
                    const game = match.nextGame()
                    rolls = [[2, 1]]
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn().setDoubleOffered()
                    client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                    const res = await client1.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: true})
                    expect(game.cubeValue).to.equal(2)
                    expect(res.isAccept).to.equal(true)
                })
            })

            describe('rollTurn', () => {
                it('should return same dice', async () => {
                    const game = match.nextGame()
                    makeRandomMoves(game.firstTurn(), true)
                    game.nextTurn()
                    const p = client2.sendAndWait({action: 'rollTurn', color: Red, id})
                    const res = await client1.sendAndWait({action: 'rollTurn', color: White, id})
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
                expect(authServer.api.auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
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
                authServer.api.auth.sendConfirmEmail = () => {throw new Error}
                authServer.logger.loglevel = -1
                authServer.api.logger.loglevel = -1
                const res = await authClient.postJson('/api/v1/signup', {username, password})
                expect(res.status).to.equal(500)
            })

            it('should have error.name=InternalError when sendConfirmEmail rejects', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'zQ2EzTRx'
                authServer.api.auth.sendConfirmEmail = () => new Promise((resolve, reject) => reject(new Error))
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
                expect(authServer.api.auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should return 500 when email sending fails', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'SqY3ExtF'
                await authServer.auth.createUser(username, password)
                authServer.logger.loglevel = -1
                authServer.api.logger.loglevel = -1
                authServer.api.auth.email.impl.send = () => {throw new Error}
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
                expect(authServer.api.auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
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
                authServer.web.auth.logger.loglevel = -1
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
                authServer.web.auth.authenticate = async () => { throw new Error }
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
