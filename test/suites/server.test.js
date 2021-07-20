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
    httpFixture,
    makeRandomMoves,
    parseKey,
    requireSrc,
    States,
    tmpDir
} = Test

const fse = require('fs-extra')

describe('-', () => {

    const Client = requireSrc('net/client')
    const Server = requireSrc('net/server')

    const Dice      = requireSrc('lib/dice')
    const {Match}   = requireSrc('lib/core')

    const {White, Red}      = requireSrc('lib/constants')
    const {ucfirst, update} = requireSrc('lib/util')

    const loglevel = 1

    beforeEach(async function () {

        // Create servers.
        this.objects = {
            server      : new Server
          , authServer  : new Server({
                authType: 'directory'
              , authDir : tmpDir()
              , sessionInsecure : true
            })
        }

        // Set servers loglevel, logger name, and listen.
        for (let [name, server] of Object.entries(this.objects)) {
            server.loglevel = loglevel
            server.logger.name = ucfirst(name)
            await server.listen()
            // Monkey patch for tests
            server.testUrl = 'http://localhost:' + server.port
            server.testMetricsUrl = 'http://localhost:' + server.metricsPort
        }

        // Create clients. Set loglevel and logger name.
        Object.entries({
            client1    : 'server'
          , client2    : 'server'
          , authClient : 'authServer'
        }).forEach(([name, serverName]) => {
            const server = this.objects[serverName]
            const client = new Client({serverUrl: server.testUrl})
            client.loglevel = loglevel
            client.logger.name = ucfirst(name)
            this.objects[name] = client
        })

        this.setLoglevel = n => {
            Object.values(this.objects).forEach(obj => {
                obj.loglevel = n
            })
        }

        this.fixture = {}
    })

    afterEach(async function() {
        // Close objects.
        Object.values(this.objects).forEach(obj => {
            obj.close()
        })
        // Remove authDir.
        const {auth} = this.objects.authServer
        await fse.remove(auth.impl.opts.authDir)
    })

    describe('Static', () => {

        describe('#validateColor', () => {

            it('should pass for White and return White', function () {
                const res = Server.validateColor(White)
                expect(res).to.equal(White)
            })

            it('should pass for Red and return Red', function () {
                const res = Server.validateColor(Red)
                expect(res).to.equal(Red)
            })

            it('should throw RequestError/ValidateError error for Brown', function () {
                const err = getError(() => Server.validateColor('Brown'))
                expect(err.isRequestError).to.equal(true)
                expect(err.isValidateError).to.equal(true)
            })
        })
    })

    describe('#constructor', () => {

        it('should construct with opt webEnabled=false', function () {
            const s2 = new Server({webEnabled: false})
            expect(s2.opts.webEnabled).to.equal(false)
        })
    })

    describe('Socket', () => {

        describe('Anonymous', () => {

            beforeEach(function () {

                const {server, client1, client2} = this.objects

                update(this.fixture, {
                    client : client1
                  , client1
                  , client2
                  , server
                })

                // Returns the server's match instance
                this.createMatch = async function (opts) {
                    opts = {total: 1, ...opts}
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
            })

            describe('#checkMatchFinished', () => {

                it('should delete match from matches when finished and return true', async function () {
                    const {server} = this.fixture
                    const match = await this.createMatch()
                    const game = match.nextGame()
                    game.board.setStateString(States.WhiteWin)
                    makeRandomMoves(game.firstTurn()).finish()
                    const res = server.checkMatchFinished(match)
                    expect(Object.keys(server.matches)).to.not.contain(match.id)
                    expect(res).to.equal(true)
                })
            })

            describe('#close', () => {

                it('should pass when socketServer, httpServer, and metricsHttpServer are null', function () {
                    // coverage
                    const {server} = this.fixture
                    server.close()
                    update(server, {
                        socketServer      : null
                      , httpServer        : null
                      , metricsHttpServer : null
                    })
                    server.close()
                })
            })

            describe('#listen', () => {

                it('should have non-null socketServer', function () {
                    const {server} = this.fixture
                    expect(!!server.socketServer).to.equal(true)
                })

                it('should accept connection', async function () {
                    const {client} = this.fixture
                    await client.connect()
                    expect(!!client.conn).to.equal(true)
                })

                it('should throw when createSocketServer throws for mock method', async function () {
                    const {server} = this.fixture
                    server.close()
                    const e = new Error
                    server.createSocketServer = () => {
                        throw e
                    }
                    const err = await getError(() => server.listen())
                    expect(err).to.equal(e)
                })

                it('should throw when app.listen throws for mock method', async function () {
                    const {server} = this.fixture
                    server.close()
                    const e = new Error
                    server.app.listen = () => { throw e }
                    const err = await getError(() => server.listen())
                    expect(err).to.equal(e)
                })
            })

            describe('#logActive', () => {

                it('should pass when socketServer is null', function () {
                    // coverage
                    const {server} = this.fixture
                    server.close()
                    server.socketServer = null
                    server.logActive()
                })
            })

            describe('#getMatchForRequest', () => {

                it('should throw MatchNotFoundError for non-existent match', function () {
                    const {server} = this.fixture
                    const secret = Client.generateSecret()
                    const req = {color: White, id: '12345678', secret}
                    const err = getError(() =>
                        server.getMatchForRequest(req)
                    )
                    expect(err.isMatchNotFoundError).to.equal(true)
                })

                it('should throw HandshakeError for mismatched secret', async function () {
                    const {server} = this.fixture
                    const {id} = await this.createMatch()
                    const req = {color: White, id, secret: 'badSecret'}
                    const err = getError(() =>
                        server.getMatchForRequest(req)
                    )
                    expect(err.isHandshakeError).to.equal(true)
                })
            })

            describe('#response', () => {

                function bareConn(client) {
                    return new Promise(resolve => {
                        client.socketClient.on('connect', conn => {
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
                            resolve(conn)
                        })
                        client.socketClient.connect(client.serverSocketUrl)
                    })
                }

                it('should return HandshakeError for missing secret in message', async function () {
                    const {client} = this.fixture
                    this.setLoglevel(-1)
                    await client.connect()
                    const err = await getError(() =>
                        client._sendAndWaitForResponse({secret: null})
                    )
                    expect(err.isHandshakeError).to.equal(true)
                })

                it('should return HandshakeError for missing secret on server', async function () {
                    const {client} = this.fixture
                    this.setLoglevel(-1)
                    await bareConn(client)
                    const err = await getError(() =>
                        client._sendAndWaitForResponse({secret: 'abc'})
                    )
                    expect(err.isHandshakeError).to.equal(true)
                })

                describe('establishSecret', () => {

                    it('should return HandshakeError for secret of length 23', async function () {
                        const {client} = this.fixture
                        this.setLoglevel(-1)
                        await bareConn(client)
                        const req = {secret: 'abcdefghijklmnopqrstuvw', action: 'establishSecret'}
                        const err = await getError(() =>
                            client._sendAndWaitForResponse(req)
                        )
                        expect(err.isHandshakeError).to.equal(true)
                    })

                    it('should return HandshakeError for mismatch secret', async function () {
                        const {client} = this.fixture
                        this.setLoglevel(-1)
                        await client.connect()
                        const req = {secret: Client.generateSecret(), action: 'establishSecret'}
                        const err = await getError(() =>
                            client._sendAndWaitForResponse(req)
                        )
                        expect(err.isHandshakeError).to.equal(true)
                    })
                })

                describe('createMatch', () => {

                    it('should return matchCreated with id of new match with total 1', async function () {
                        const {client} = this.fixture
                        await client.connect()
                        const req = {action: 'createMatch', total: 1}
                        const res = await client._sendAndWaitForResponse(req)
                        expect(res.action).to.equal('matchCreated')
                        expect(typeof res.id).to.equal('string')
                        expect(res.id).to.have.length(8)
                    })

                    it('should return ValidateError for match with total -1', async function() {
                        const {client} = this.fixture
                        this.setLoglevel(0)
                        await client.connect()
                        const req = {total: -1}
                        const err = await getError(() => client.createMatch(req))
                        expect(err.isValidateError).to.equal(true)
                    })
                })

                describe('joinMatch', () => {

                    it('should return matchJoined and opponentJoind with id of new match with total 1', async function () {

                        const {client1, client2} = this.fixture

                        await client1.connect()
                        await client2.connect()

                        let promise
                        client1.on('response', ({action, id}) => {
                            if (action == 'matchCreated') {
                                promise = client2._sendMessage({action: 'joinMatch', id})._waitForResponse()
                            }
                        })

                        await client1._sendMessage({action: 'createMatch', total: 1})._waitForResponse()

                        const res1 = await client1._waitForResponse()
                        const res2 = await promise

                        expect(res1.action).to.equal('opponentJoined')
                        expect(res2.action).to.equal('matchJoined')
                        expect(res1.id).to.equal(res2.id)
                    })

                    it('should return MatchNotFoundError for unknown match id', async function () {
                        const {client} = this.fixture
                        this.setLoglevel(-1)
                        await client.connect()
                        const req = {action: 'joinMatch', id: '12345678'}
                        const err = await getError(() =>
                            client._sendAndWaitForResponse(req)
                        )
                        expect(err.isMatchNotFoundError).to.equal(true)
                    })

                    it('should return MatchAlreadyJoinedError when already joined', async function () {
                        const {client2} = this.fixture
                        this.setLoglevel(-1)
                        const {id} = await this.createMatch()
                        const err = await getError(() =>
                            client2.joinMatch(id)
                        )
                        expect(err.isMatchAlreadyJoinedError).to.equal(true)
                    })
                })
            })

            describe('#matchPlayResponse', () => {

                beforeEach(async function () {
                    const match = await this.createMatch({total: 3})
                    const id = match.id
                    const rolls = []
                    const mr1 = {color: White, id}
                    const mr2 = {color: Red, id}
                    match.opts.roller = () => rolls.shift() || Dice.rollTwo()
                    update(this.fixture, {match, rolls, id, mr1, mr2})
                })

                it('should pass for bad action', function (done) {
                    const {client, server, id} = this.fixture
                    client.once('unhandledMessage', () => done())
                    server.matchPlayResponse({id, color: White, secret: client.secret})
                })

                describe('nextGame', () => {

                    it('should reply with nextGame for correct color and id', async function () {
                        const {client1, client2, mr1, mr2} = this.fixture
                        client1.matchRequest('nextGame', mr1)
                        const res = await client2.matchRequest('nextGame', mr2)
                        expect(res.action).to.equal('nextGame')
                    })

                    it('should return GameNotFinishedError when both make second call', async function () {

                        const {client1, client2, mr1, mr2} = this.fixture

                        client1.matchRequest('nextGame', mr1)
                        await client2.matchRequest('nextGame', mr2)
                    
                        const err = await getError(() =>
                            client1.matchRequest('nextGame', mr1)
                        )
                        expect(err.isGameNotFinishedError).to.equal(true)
                    })
                })

                describe('firstTurn', () => {

                    it('should reply with same dice for started game', function (done) {

                        const {client1, client2, server, match, mr1, mr2} = this.fixture

                        let isDebug = false

                        if (isDebug) {
                            this.setLoglevel(4)
                        }

                        match.nextGame()

                        client1.matchRequest('firstTurn', mr1).then(res => {
                            expect(res.dice).to.have.length(2)
                            next(null, res)
                        }).catch(next)

                        client2.matchRequest('firstTurn', mr2).then(res => {
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

                    it('should reply with same moves', async function () {

                        const {client1, client2, rolls, match, mr1, mr2} = this.fixture

                        rolls.push([2, 1])
                        match.nextGame().firstTurn()

                        client2.matchRequest('playRoll', mr2)

                        const moves = [
                            {origin: 0, face: 1},
                            {origin: 0, face: 2}
                        ]
                        const req = {...mr1, moves}
                        const res = await client1.matchRequest('playRoll', req)

                        expect(res.moves).to.jsonEqual(moves)
                    })

                    it('should return RequestError for missing moves', async function () {

                        const {client1, match, rolls, mr1} = this.fixture

                        rolls.push([2, 1])
                        match.nextGame().firstTurn()

                        const err = await getError(() =>
                            client1.matchRequest('playRoll', mr1)
                        )

                        expect(err.isRequestError).to.equal(true)
                    })
                })

                describe('nextTurn', () => {

                    it('should reply for valid case', async function () {

                        const {client1, client2, match, mr1, mr2} = this.fixture

                        makeRandomMoves(match.nextGame().firstTurn()).finish()

                        client1.matchRequest('nextTurn', mr1)
                        const res = await client2.matchRequest('nextTurn', mr2)

                        expect(res.action).to.equal('nextTurn')
                    })
                })

                describe('turnOption', () => {

                    it('should return isDouble for isDouble=false', async function () {

                        const {client1, client2, match, mr1, mr2, rolls} = this.fixture

                        rolls.push([2, 1])
                        const game = match.nextGame()
                        makeRandomMoves(game.firstTurn()).finish()
                        game.nextTurn()

                        const req = {...mr2, isDouble: false}
                        client2.matchRequest('turnOption', req)

                        const res = await client1.matchRequest('turnOption', mr1)

                        expect(res.isDouble).to.equal(false)
                    })

                    it('should return isDouble=true for isDouble=true', async function () {

                        const {client1, client2, match, mr1, mr2, rolls} = this.fixture

                        rolls.push([2, 1])
                        const game = match.nextGame()
                        makeRandomMoves(game.firstTurn()).finish()
                        game.nextTurn()

                        const req = {...mr2, isDouble: true}
                        client2.matchRequest('turnOption', req)

                        const res = await client1.matchRequest('turnOption', mr1)

                        expect(res.isDouble).to.equal(true)
                    })
                })

                describe('doubleResponse', () => {

                    it('should set double declined for isAccept=false', async function () {

                        const {client1, client2, match, id, rolls} = this.fixture

                        rolls.push([2, 1])
                        const game = match.nextGame()
                        makeRandomMoves(game.firstTurn()).finish()
                        game.nextTurn().setDoubleOffered()

                        client2.matchRequest('doubleResponse', {color: Red, id})

                        const req = {color: White, id, isAccept: false}
                        const res = await client1.matchRequest('doubleResponse', req)

                        expect(res.isAccept).to.equal(false)
                    })

                    it('should double game for isAccept=true', async function () {

                        const {client1, client2, match, id, rolls} = this.fixture

                        rolls.push([2, 1])
                        const game = match.nextGame()
                        makeRandomMoves(game.firstTurn()).finish()
                        game.nextTurn().setDoubleOffered()

                        client2.matchRequest('doubleResponse', {color: Red, id})
                        const req = {color: White, id, isAccept: true}
                        const res = await client1.matchRequest('doubleResponse', req)

                        expect(res.isAccept).to.equal(true)
                        expect(game.cubeValue).to.equal(2)
                    })
                })

                describe('rollTurn', () => {

                    it('should return same dice', async function () {

                        const {client1, client2, match, mr1, mr2} = this.fixture

                        const game = match.nextGame()
                        makeRandomMoves(game.firstTurn(), true)
                        game.nextTurn()

                        const prom = client2.matchRequest('rollTurn', mr2)

                        const res1 = await client1.matchRequest('rollTurn', mr1)
                        const res2 = await prom

                        expect(res1.dice.length).to.equal(2)
                        expect(res1.dice).to.jsonEqual(res2.dice)
                    })
                })
            })
        })

        describe('Auth', () => {

            beforeEach(function () {
                const {authServer, authClient} = this.objects
                update(this.fixture, {
                    client : authClient
                  , server : authServer
                  , auth   : authServer.auth
                })
            })

            it('should authenticate with token', async function () {
                const {auth, client} = this.fixture
                const username = 'nobody@nowhere.example'
                const password = 'fcw4ERXs'
                await auth.createUser(username, password, true)
                const token = auth.getToken(username, password)
                update(client, {
                    username: null
                  , password: null
                  , token
                })

                await client.connect()
            })
        })
    })

    describe('HTTP', () => {

        const {parseCookies} = Test

        beforeEach(function() {

            const {server} = this.objects

            update(this.fixture, {
                server
              , baseUrl : server.testUrl
              , uri     : ''
              , method  : 'GET'
              , opts    : {}
              , headers : {}
              , json    : false
            })

            update(this, httpFixture)
        })

        describe('api', () => {

            beforeEach(function () {
                const server = this.objects.authServer
                const {auth} = server
                update(this.fixture, {
                    server
                  , auth
                  , baseUrl : server.testUrl
                  , uri     : '/api/v1'
                  , method  : 'POST'
                  , json    : true
                })

                this.lastEmail = () => auth.email.impl.lastEmail
            })

            describe('POST /api/v1/signup', () => {

                beforeEach(function() {
                    this.fixture.uri += '/signup'
                })

                it('should return 201', async function () {
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: '6pN3pHeZ'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(201)
                })

                it('should create a user and userExists() = true', async function () {
                    const {auth} = this.fixture
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: 'udb2SZbK'
                    }
                    await this.req(req)
                    const res = await auth.userExists(req.username)
                    expect(res).to.equal(true)
                })

                it('should send confirm email', async function () {
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: 'C98FCQxU'
                    }
                    await this.req(req)
                    const email = this.lastEmail()
                    expect(email.Destination.ToAddresses)
                        .to.have.length(1).and
                        .to.contain(req.username)
                })

                it('should return 400 for bad email', async function () {
                    const req = {
                        username: 'nobody-bad-email'
                      , password: 'EbaD99wa'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })

                it('should have error.name=ValidateError for bad email', async function () {
                    this.setLoglevel(-1)
                    const req = {
                        username: 'nobody-bad-email'
                      , password: 'EbaD99wa'
                    }
                    const res = await this.req(req)
                    const body = await res.json()
                    expect(body.error.name).to.equal('ValidateError')
                })

                it('should return 400 for bad password', async function () {
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: 'password'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })

                it('should have error.name=ValidateError for bad password', async function () {
                    this.setLoglevel(-1)
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: 'password'
                    }
                    const res = await this.req(req)
                    const body = await res.json()
                    expect(body.error.name).to.equal('ValidateError')
                })

                it('should return 500 when sendConfirmEmail throws', async function () {
                    const {auth} = this.fixture
                    this.setLoglevel(-1)
                    auth.sendConfirmEmail = () => {throw new Error}
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: 'H6WJmuyZ'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(500)
                })

                it('should have error.name=InternalError when sendConfirmEmail rejects', async function () {
                    const {auth} = this.fixture
                    this.setLoglevel(-1)
                    auth.sendConfirmEmail = () => new Promise(
                        (resolve, reject) => reject(new Error)
                    )
                    const req = {
                        username: 'nobody@nowhere.example'
                      , password: 'zQ2EzTRx'
                    }
                    const res = await this.req(req)
                    const body = await res.json()
                    expect(body.error.name).to.equal('InternalError')
                })
            })

            describe('POST /api/v1/send-confirm-email', () => {

                beforeEach(function() {
                    this.fixture.uri += '/send-confirm-email'
                })

                it('should return 200 for non-existent user', async function () {
                    this.setLoglevel(0)
                    const req = {
                        username: 'nobody@nowhere.example'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(200)
                })

                it('should return 400 for bad username', async function () {
                    this.setLoglevel(0)
                    const req = {
                        username: 'bad-username'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })

                it('should send email for unconfirmed user', async function () {
                    const {auth} = this.fixture
                    const req = {
                        username: 'nobody@nowhere.example'
                    }
                    const password = 'cbSx6gnx'
                    await auth.createUser(req.username, password)
                    const res = await this.req(req)
                    const email = this.lastEmail()
                    expect(email.Destination.ToAddresses)
                        .to.have.length(1).and
                        .to.contain(req.username)
                })

                it('should return 500 when email sending fails', async function () {
                    const {auth} = this.fixture
                    auth.email.impl.send = () => {throw new Error}
                    const req = {
                        username: 'nobody@nowhere.example'
                    }
                    const password = 'SqY3ExtF'
                    await auth.createUser(req.username, password)
                    this.setLoglevel(-1)
                    const res = await this.req(req)
                    expect(res.status).to.equal(500)
                })
            })

            describe('POST /api/v1/forgot-password', () => {

                beforeEach(function() {
                    this.fixture.uri += '/forgot-password'
                })

                it('should return 200 for non existent user', async function () {
                    this.setLoglevel(0)
                    const req = {
                        username: 'nobody@nowhere.example'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(200)
                })

                it('should return 400 for bad username', async function () {
                    this.setLoglevel(0)
                    const req = {
                        username: 'bad-username'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })

                it('should send email for confirmed user', async function () {
                    const {auth} = this.fixture
                    const req = {
                        username: 'nobody@nowhere.example'
                    }
                    const password = 'n2sLvf4b'
                    await auth.createUser(req.username, password, true)
                    const res = await this.req(req)
                    const email = this.lastEmail()
                    expect(email.Destination.ToAddresses)
                        .to.have.length(1).and
                        .to.contain(req.username)
                })
            })

            describe('POST /api/v1/confirm-account', () => {

                beforeEach(function() {
                    this.fixture.uri += '/confirm-account'
                })

                it('should return 200 and confirm user for valid key', async function () {
                    const {auth} = this.fixture
                    const username = 'nobody@nowhere.example'
                    const password = '5btmHKfG'
                    await auth.createUser(username, password)
                    await auth.sendConfirmEmail(username)
                    const req = {
                        username
                      , confirmKey: parseKey(this.lastEmail())
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(200)
                    const user = await auth.readUser(username)
                    expect(user.confirmed).to.equal(true)
                })

                it('should return 400 for bad username', async function () {
                    this.setLoglevel(0)
                    const req = {
                        username   : 'bad-username'
                      , confirmKey : 'whatever'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })
            })

            describe('POST /api/v1/change-password', () => {

                beforeEach(function() {
                    this.fixture.uri += '/change-password'
                })

                it('should return 200 and authenticate for confirmed user', async function () {
                    const {auth} = this.fixture
                    const req = {
                        username    : 'nobody@nowhere.example'
                      , oldPassword : '2qgN4Cxd'
                      , newPassword : '8LtMu24j'
                    }
                    await auth.createUser(req.username, req.oldPassword, true)
                    const res = await this.req(req)
                    expect(res.status).to.equal(200)
                    const user = await auth.authenticate(req.username, req.newPassword)
                    expect(user.username).to.equal(req.username)
                })

                it('should return 400 for bad username', async function () {
                    const req = {
                        username    : 'bad-username'
                      , oldPassword : '2qgN4Cxd'
                      , newPassword : '8LtMu24j'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })
            })

            describe('POST /api/v1/reset-password', () => {

                beforeEach(function() {
                    this.fixture.uri += '/reset-password'
                })

                it('should return 200 and authenticate for good key',async function () {
                    const {auth} = this.fixture
                    const username = 'nobody@nowhere.example'
                    const oldPassword = 'nRGJb9rA'
                    await auth.createUser(username, oldPassword, true)
                    await auth.sendResetEmail(username)
                    const req = {
                        username
                      , password : 'F86ezYsU'
                      , resetKey : parseKey(this.lastEmail())
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(200)
                    const user = await auth.authenticate(req.username, req.password)
                    expect(user.username).to.equal(req.username)
                })

                it('should return 400 for bad key',async function () {
                    const {auth} = this.fixture
                    const username = 'nobody@nowhere.example'
                    const oldPassword = 'swaU93BL'
                    await auth.createUser(username, oldPassword, true)
                    const req = {
                        username
                      , password : 'Spng4EAC'
                      , resetKey : 'bad-key'
                    }
                    const res = await this.req(req)
                    expect(res.status).to.equal(400)
                })
            })        
        })

        describe('metrics', () => {

            beforeEach(function () {
                const {server} = this.fixture
                this.fixture.baseUrl = server.testMetricsUrl
            })

            describe('GET /metrics', () => {

                beforeEach(function () {
                    this.fixture.uri += '/metrics'
                })

                it('should return 200', async function () {
                    const res = await this.req()
                    expect(res.status).to.equal(200)
                })

                it('should return 500 when fetchMetrics throws', async function () {
                    const {server} = this.fixture
                    server.fetchMetrics = () => {throw new Error('test')}
                    const res = await this.req()
                    expect(res.status).to.equal(500)
                })
            })
        })

        describe('web', () => {

            describe('Anonymous', () => {

                describe('GET /health', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/health'
                    })

                    it('should return 200', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(200)
                    })
                })

                describe('GET /', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/'
                    })

                    it('should return 200', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(200)
                    })

                    it('should have text Gameon in body', async function () {
                        const res = await this.req()
                        const body = await res.text()
                        expect(body).to.contain('Gameon')
                    })

                    it('should clear invalid session cookie', async function () {
                        const opts = {
                            headers: {
                                cookie: ['gasid=abcd']
                            }
                        }
                        const res = await this.req(opts)
                        expect(parseCookies(res))
                            .to.contain('gasid=').and
                            .to.not.contain('gasid=abcd')
                    })
                })
        
                describe('GET /nowhere', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/nowhere'
                    })

                    it('should return 404', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(404)
                    })
                })
            })

            describe('Auth', () => {

                beforeEach(async function () {
                    const server = this.objects.authServer
                    const {auth} = server
                    update(this.fixture, {
                        server
                      , auth
                      , baseUrl : server.testUrl
                      , opts    : {redirect: 'manual'}
                    })
                    const user = {
                        username: 'fixture@nowhere.example'
                      , password: 'BXQ8Ya2TpZEMm3W3'
                    }
                    await auth.createUser(...Object.values(user), true)
                    const login = await this.post('/login', user)
                    const cookie = parseCookies(login)
                    update(this.fixture, {cookie, user})
                })

                describe('GET /login', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/login'
                    })

                    it('should return 200', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(200)
                    })
                })

                describe('POST /login', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/login'
                        this.fixture.method = 'POST'
                    })

                    it('should return 400 with bad credentials', async function () {
                        this.setLoglevel(0)
                        const params = {
                            username : 'nobody@nowhere.example'
                          , password : 's8Kfjsdk9'
                        }
                        const res = await this.req(params)
                        expect(res.status).to.equal(400)
                    })

                    it('should return 400 with no data', async function () {
                        this.setLoglevel(0)
                        const res = await this.req()
                        expect(res.status).to.equal(400)
                    })

                    it('should return 500 when authenticate throws Error', async function () {
                        const {auth} = this.fixture
                        auth.authenticate = async () => {throw new Error}
                        const params = {
                            username : 'nobody@nowhere.example'
                          , password : 'tz7TcUUm'
                        }
                        const res = await this.req(params)
                        expect(res.status).to.equal(500)
                    })

                    it('should return 302 to /dashboard with good credentials', async function () {
                        const res = await this.req(this.fixture.user)
                        expect(res.status).to.equal(302)
                        expect(res.headers.get('location'))
                            .to.equal(this.url('/dashboard'))
                    })
                })

        
                describe('GET /logout', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/logout'
                    })

                    it('should return 302 to / with no login session', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(302)
                        expect(res.headers.get('location'))
                            .to.equal(this.url('/'))
                    })

                    it('should return 302 to / with login session', async function () {
                        const {cookie} = this.fixture
                        const res = await this.req({headers: {cookie}})
                        expect(res.status).to.equal(302)
                        expect(res.headers.get('location'))
                            .to.equal(this.url('/'))
                    })
                })

                describe('GET /dashboard', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/dashboard'
                    })

                    it('should return 200 for logged in', async function () {
                        const {cookie} = this.fixture
                        const res = await this.req({headers: {cookie}})
                        expect(res.status).to.equal(200)
                    })

                    it('should redirect to /login when not logged in', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(302)
                        expect(res.headers.get('location'))
                            .to.equal(this.url('/login'))
                    })
                })

                describe('GET /play', () => {

                    beforeEach(function() {
                        this.fixture.uri += '/play'
                    })

                    it('should return 200 for logged in', async function () {
                        const {cookie} = this.fixture
                        const res = await this.req({headers: {cookie}})
                        expect(res.status).to.equal(200)
                    })

                    it('should redirect to /login when not logged in', async function () {
                        const res = await this.req()
                        expect(res.status).to.equal(302)
                        expect(res.headers.get('location'))
                            .to.equal(this.url('/login'))
                    })
                })
            })
        })
    })
})
