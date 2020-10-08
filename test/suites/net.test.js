const Test = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    States
} = Test

const Core   = requireSrc('lib/core')
const Server = requireSrc('net/server')
const Client = requireSrc('net/client')
const NetPlayer = requireSrc('net/player')
const Robot = requireSrc('robot/player')
const Auth  = requireSrc('net/auth')

const Coordinator = requireSrc('lib/coordinator')

const {White, Red, Match} = Core

const AWS = require('aws-sdk')
const fs = require('fs')
const fse = require('fs-extra')
const merge = require('merge')
const tmp = require('tmp')

function newRando(...args) {
    return Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
}

describe('Client', () => {

    var serverUrl
    var client
    var client2

    var server

    async function startMatch() {
        const p = client.startMatch({total: 1})
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

    describe('#buildError', () => {

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
            const match = await startMatch()
            client2.matchRequest('nextGame')
            await client.matchRequest('nextGame')
        })
    })

    describe('#startMatch', () => {

        it('should return match', async () => {
            const match = await startMatch()
            expect(client.matchId).to.equal(match.id)
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
    var port
    var client
    var client2

    async function startMatch() {
        await Promise.all([client.connect(), client2.connect()])
        const res = await client.sendAndWait({action: 'startMatch', total: 1})
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
        server = new Server
        server.logger.loglevel = 1
        await server.listen()
        const url = 'ws://localhost:' + server.port
        client = new Client(url)
        client.logger.loglevel = 1
        client2 = new Client(url)
        client2.logger.loglevel = 1
        client.sendAndWait = sendAndWait
        client2.sendAndWait = sendAndWait
    })

    afterEach(async () => {
        await client.close()
        await client2.close()
        server.close()
    })

    describe('#checkMatchFinished', () => {

        it('should delete match from matches when finished', async () => {
            const match = await startMatch()
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

        it('should pass when socketServer and httpServer are null', () => {
            // coverage
            server.close()
            server.socketServer = null
            server.httpServer = null
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
            const {id} = await startMatch()
            
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
                resolve()
            }))
            client.socketClient.connect(client.serverSocketUrl)
            await p
        }

        it('should return HandshakeError for missing secret in message', async () => {
            server.logger.loglevel = -1
            await client.connect()
            const res = await client.sendAndWait({secret: null})
            expect(res.isError).to.equal(true)
            expect(res.name).to.equal('HandshakeError')
        })

        it('should return HandshakeError for missing secret on server', async () => {
            server.logger.loglevel = -1
            await bareConn(client)
            const res = await client.sendAndWait({secret: 'abc'})
            expect(res.isError).to.equal(true)
            expect(res.name).to.equal('HandshakeError')
        })

        describe('establishSecret', () => {

            it('should return HandshakeError for secret of length 23', async () => {
                server.logger.loglevel = -1
                const msg = {secret: 'abcdefghijklmnopqrstuvw', action: 'establishSecret'}
                await bareConn(client)
                const res = await client.sendAndWait(msg)
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })

            it('should return HandshakeError for mismatch secret', async () => {
                server.logger.loglevel = -1
                await client.connect()
                const msg = {secret: Client.generateSecret(), action: 'establishSecret'}
                const res = await client.sendAndWait(msg)
                expect(res.isError).to.equal(true)
                expect(res.name).to.equal('HandshakeError')
            })
        })

        describe('startMatch', () => {

            it('should return matchCreated with id of new match with total 1', async () => {
                await client.connect()
                const msg = {action: 'startMatch', total: 1}
                const res = await client.sendAndWait(msg)
                expect(res.action).to.equal('matchCreated')
                expect(typeof(res.id)).to.equal('string')
            })

            it('should return ArgumentError for match with total -1', async () => {
                server.logger.loglevel = -1
                await client.connect()
                const msg = {action: 'startMatch', total: -1}
                const res = await client.sendAndWait(msg)
                expect(res.name).to.equal('ArgumentError')
            })
        })

        describe('joinMatch', () => {

            it('should return matchJoined and opponentJoind with id of new match with total 1', async () => {
                await client.connect()
                const {id} = await client.sendAndWait({action: 'startMatch', total: 1})
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
                server.logger.loglevel = -1
                await client.connect()
                const msg = {action: 'joinMatch', id: '12345678'}
                const res = await client.sendAndWait(msg)
                expect(res.name).to.equal('MatchNotFoundError')
            })

            it('should return MatchAlreadyJoinedError when already joined', async () => {
                server.logger.loglevel = -1
                await client.connect()
                const {id} = await client.sendAndWait({action: 'startMatch', total: 1})
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

    describe('#makeErrorObject', () => {

        it('should return constructor name if error has no name', () => {
            const err = new Error
            err.name = null
            const result = Server.makeErrorObject(err)
            expect(result.name).to.equal('Error')
        })
    })

    describe('#matchResponse', () => {

        var id

        beforeEach(async () => {
            const match = await startMatch()
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
                client.sendAndWait({action: 'nextGame', color: White, id})
                await client2.sendAndWait({action: 'nextGame', color: Red, id})
                client.sendAndWait({action: 'nextGame', color: White, id})
                server.logger.loglevel = -1
                const res = await client2.sendAndWait({action: 'nextGame', color: Red, id})
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
                expect(JSON.stringify(res.dice)).to.equal(JSON.stringify(res2.dice))
            })
        })

        describe('playRoll', () => {

            it('should reply with same moves', async () => {
                const game = server.matches[id].nextGame()
                game._rollFirst = () => [2, 1]
                game.firstTurn()
                client2.sendAndWait({action: 'playRoll', color: Red, id})
                const moves = [
                    {origin: 0, face: 1},
                    {origin: 0, face: 2}
                ]
                const res = await client.sendAndWait({action: 'playRoll', color: White, id, moves})
                expect(JSON.stringify(res.moves)).to.equal(JSON.stringify(moves))
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
                game._rollFirst = () => [2, 1]
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
                game._rollFirst = () => [2, 1]
                makeRandomMoves(game.firstTurn(), true)
                game.nextTurn().setDoubleOffered()
                client2.sendAndWait({action: 'doubleResponse', color: Red, id})
                const res = await client.sendAndWait({action: 'doubleResponse', color: White, id, isAccept: false})
                expect(game.thisTurn.isDoubleDeclined).to.equal(true)
                expect(res.isAccept).to.equal(false)
            })

            it('should double game for isAccept=true', async () => {
                const game = server.matches[id].nextGame()
                game._rollFirst = () => [2, 1]
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
                expect(JSON.stringify(res.dice)).to.equal(JSON.stringify(res2.dice))
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

describe('NetPlayer', () => {

    var serverUrl
    var client
    var client2

    var server

    beforeEach(async () => {
        server = new Server
        server.logger.loglevel = 1
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

    async function eastAndWest(opts) {
        opts = merge({total: 1}, opts)
        await client.connect()
        await client2.connect()
        const playersWest = {
            White : newRando(White)
          , Red   : new NetPlayer(client, Red)
        }
        const playersEast = {
            White : new NetPlayer(client2, White)
          , Red   : newRando(Red)
        }
        const coordWest = new Coordinator
        const coordEast = new Coordinator
        const p = client.startMatch(opts)
        await new Promise(resolve => setTimeout(resolve, 10))
        const matchEast = await client2.joinMatch(client.matchId)
        const matchWest = await p
        return {
            east : {players: playersEast, coord: coordEast, match: matchEast},
            west : {players: playersWest, coord: coordWest, match: matchWest}
        }
    }

    it('should play robot v robot over net', async function () {

        this.timeout(20000)

        const {east, west} = await eastAndWest({total: 1})

        await Promise.all([
            east.coord.runMatch(east.match, east.players.White, east.players.Red),
            west.coord.runMatch(west.match, west.players.White, west.players.Red)
        ])
    })

    it('should play robot v robot over net with double accept, decline', async function() {
        this.timeout(2000)
        //server.logger.loglevel = 4

        const {east, west} = await eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        await Promise.all([
            east.coord.runMatch(east.match, east.players.White, east.players.Red),
            west.coord.runMatch(west.match, west.players.White, west.players.Red)
        ])
    })


    it('should play robot v robot over net with double after 3 moves accept, decline', async function() {
        this.timeout(2000)
        //server.logger.loglevel = 4

        const {east, west} = await eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = (turn, game) => {
            if (game.turns.length > 3) {
                turn.setDoubleOffered()
            }
        }
        east.players.Red.turnOption = (turn, game) => {
            if (game.turns.length > 3) {
                turn.setDoubleOffered()
            }
        }
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        await Promise.all([
            east.coord.runMatch(east.match, east.players.White, east.players.Red),
            west.coord.runMatch(west.match, west.players.White, west.players.Red)
        ])
    })
})

describe('Auth', () => {


    /*
    // method removed
    describe('#isValidUsername', () => {
        it('should return true for nobody@nowhere.example', () => {
            const auth = new Auth('anonymous')
            const input = 'nobody@nowhere.example'
            const result = auth.isValidUsername(input)
            expect(result).to.equal(true)
        })
        it('should return false for x', () => {
            const auth = new Auth('anonymous')
            const input = ''
            const result = auth.isValidUsername(input)
            expect(result).to.equal(false)
        })
    })
    */

    describe('#defaults', () => {

        it('should set passwordHelp to non default when regex defined', () => {
            const auth = new Auth('anonymous')
            const d1 = auth.defaults({})
            const d2 = auth.defaults({AUTH_PASSWORD_REGEX: '.*'})
            expect(d2.passwordHelp).to.not.equal(d1.passwordHelp)
        })
    })

    describe('#validateUsername', () => {

        it('should throw ValidationError for empty', () => {
            const auth = new Auth('anonymous')
            const input = ''
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidationError')
        })

        it('should throw ValidationError for bar char ?', () => {
            const auth = new Auth('anonymous')
            const input = 'foo?@example.example'
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidationError')
        })

        it('should throw ValidationError for bad email chunky', () => {
            const auth = new Auth('anonymous')
            const input = 'chunky'
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidationError')
        })

        it('should pass for nobody@nowhere.example', () => {
            const auth = new Auth('anonymous')
            const input = 'nobody@nowhere.example'
            auth.validateUsername(input)
        })
    })

    describe('#validatePassword', () => {

        it('should throw ValidationError for empty', () => {
            const auth = new Auth('anonymous')
            const input = ''
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidationError')
        })

        it('should throw ValidationError for length 7', () => {
            const auth = new Auth('anonymous')
            const input = '5ZycJj3'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidationError')
        })

        it('should throw ValidationError for missing number', () => {
            const auth = new Auth('anonymous')
            const input = 'aDlvkdoslK'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidationError')
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
            const opts = {dir: '/non-existent'}
            const err = getError(() => { new Auth('directory', opts)})
            expect(err instanceof Error).to.equal(true)
        })

        it('should pass with diretory specified', () => {
            const opts = {dir: authDir}
            const auth = new Auth('directory', opts)
        })

        function newAuth() {
            const opts = {dir: authDir}
            return new Auth('directory', opts)
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
                await fse.remove(auth.opts.dir)
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
        })
    })

    function s3Suite(s3_bucket) {

        return function() {

            this.timeout(10000)

            const s3_prefix = 'test/' + +new Date + '/'

            function newAuth() {
                const opts = {s3_bucket, s3_prefix}
                return new Auth('s3', opts)
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

                it('should throw InternalError with cause InvalidBucketName when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getErrorAsync(() => auth.impl.deleteUser(username))
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('InvalidBucketName')
                })
            })

            describe('#updateUser', () => {
                it('should throw InternalError with cause InvalidBucketName when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucke-update-user@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getErrorAsync(() => auth.impl.updateUser(username, {}))
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('InvalidBucketName')
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