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

const Core = requireSrc('lib/core')
const Server = requireSrc('net/server')
const Client = requireSrc('net/client')

const {White, Red} = Core

describe('Client', () => {

    var server
    var client

    beforeEach(() => {
        server = new Server
        client = new Client
    })
})

describe('Server', () => {

    var server
    var port
    var client
    var client2

    beforeEach(async () => {
        server = new Server
        server.loglevel = 1
        await server.listen()
        const url = 'ws://localhost:' + server.port
        client = new Client(url)
        client.logger.loglevel = 1
        client2 = new Client(url)
        client2.logger.loglevel = 1
    })

    afterEach(async () => {
        await client.close()
        server.close()
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

    describe('#doMainIfEquals', () => {
    
    })

    describe('#listen', () => {

        it('should have non-null socketServer', () => {
            expect(!!server.socketServer).to.equal(true)
        })

        it('should accept connection', async () => {
            await client.connect()
            expect(!!client.conn).to.equal(true)
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
            client.socketClient.connect(client.serverUrl)
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

        describe('startMatch', () => {

            it('should return matchCreated with id of new match with total 1', async () => {
                await client.connect()
                const msg = {action: 'startMatch', total: 1}
                const res = await client.sendAndWait(msg)
                expect(res.action).to.equal('matchCreated')
                expect(typeof(res.id)).to.equal('string')
            })

            it('should return ArgumentError for match with total -1', async () => {
                server.loglevel = -1
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
                server.loglevel = -1
                await client.connect()
                const msg = {action: 'joinMatch', id: '12345678'}
                const res = await client.sendAndWait(msg)
                expect(res.name).to.equal('MatchNotFoundError')
            })

            it('should return MatchAlreadyJoinedError when already joined', async () => {
                server.loglevel = -1
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

    describe('#matchResponse', () => {

        var id

        beforeEach(async () => {
            await Promise.all([client.connect(), client2.connect()])
            const res = await client.sendAndWait({action: 'startMatch', total: 3})
            id = res.id
            const p = client.waitForMessage()
            await client2.sendAndWait({action: 'joinMatch', id})
            await p
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
                server.loglevel = -1
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
            it('should return same dice')
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