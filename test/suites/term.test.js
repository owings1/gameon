/**
 * gameon - test suite - term classes
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
const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    NullOutput,
    parseKey,
    requireSrc,
    MockPrompter,
    noop,
    tmpDir,
    States
} = TestUtil

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')

const {resolve} = path

const {DrawHelper} = requireSrc('term/draw')
const TermPlayer   = requireSrc('term/player')

const Constants   = requireSrc('lib/constants')
const Core        = requireSrc('lib/core')
const Coordinator = requireSrc('lib/coordinator')
const Dice        = requireSrc('lib/dice')
const Errors      = requireSrc('lib/errors')
const Player      = requireSrc('lib/player')
const Robot       = requireSrc('robot/player')
const Client      = requireSrc('net/client')
const Server      = requireSrc('net/server')
const NetPlayer   = requireSrc('net/player')
const Util        = requireSrc('lib/util')

const {destroyAll, update} = Util

const {White, Red} = Constants
const {Match, Game, Board, Turn} = Core

const {RandomRobot} = Robot

const {RequestError} = Errors

function newRando(...args) {
    return Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
}

describe('Draw', () => {

    describe('#drawBoard', () => {

        // these are just for coverage
        var game
        var draw

        beforeEach(() => {
            game = new Game
            draw = DrawHelper.forGame(game)
        })

        it('should not barf for initial board', () => {
            draw.getString()
        })

        it('should not barf for RedHitComeIn3', () => {
            game.board.setStateString(States.RedHitComeIn3)
            draw.getString()
        })

        it('should not barf for WhiteCornerCase24', () => {
            game.board.setStateString(States.WhiteCornerCase24)
            draw.getString()
        })

        it('should not barf for WhiteGammon1', () => {
            game.board.setStateString(States.WhiteGammon1)
            draw.getString()
        })

        it('should not barf for RedGammon1', () => {
            game.board.setStateString(States.RedGammon1)
            draw.getString()
        })

        it('should not barf when game isCrawford', () => {
            game.opts.isCrawford = true
            draw.getString()
        })

        it('should not barf when cubeOwner is red', () => {
            game.cubeOwner = Red
            draw.getString()
        })

        it('should not barf when cubeOwner is white', () => {
            game.cubeOwner = White
            draw.getString()
        })
    })
})

describe('Reporter', () => {

    var player

    beforeEach(() => {
        player = new TermPlayer(White)
        player.logger.loglevel = 1
        player.logger.stdout = {write: () => {}}
    })

    describe('#move', () => {
        it('should include \'bar\' if origin is -1', () => {
            const board = Board.fromStateString(States.WhiteCornerCase24)
            const move = board.buildMove(White, -1, 4)
            const draw = DrawHelper.forBoard(board)
            const {reporter} = draw
            const result = reporter.move(move).toString()
            expect(result).to.contain('bar')
        })

        it('should include \'home\' for red if origin is 0 and face is 2', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const move = board.buildMove(Red, 0, 2)
            const draw = DrawHelper.forBoard(board)
            const {reporter} = draw
            const result = reporter.move(move).toString()
            expect(result).to.contain('home')
        })

        it('should include HIT for hit move', () => {
            const board = Board.fromStateString(States.EitherHitWith11)
            const move = board.buildMove(White, 22, 1)
            const draw = DrawHelper.forBoard(board)
            const {reporter} = draw
            const result = reporter.move(move).toString()
            expect(result).to.contain('HIT')
        })
    })
})

describe('TermPlayer', () => {


    beforeEach(function () {

        const rolls = []
        const game = new Game({
            roller: () => rolls.shift() || Dice.rollTwo()
        })
        const players = {
            White : new TermPlayer(White)
          , Red   : Robot.RobotDelegator.forDefaults(Red)
        }
        const player = players.White
        player.loglevel = 1
        player.output = new NullOutput

        player.emit('gameStart', game, null, players)
        this.fixture = {players, player, game, rolls}
    })

    afterEach(async function () {
        await destroyAll(Object.values(this.fixture.players))
    })

    describe('#cchalk', () => {

        describe('coverage', () => {

            it('drawer=null', function () {
                const {player} = this.fixture
                player.drawer = null
                player.cchalk()
            })
        })
    })

    describe('#doHiddenAction', () => {

        it('should log board states with _', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            const turn = game.firstTurn()
            await player.doHiddenAction('_', turn)
            expect(player.output.lines[0]).to.contain(game.board.state28())
        })

        it('should flip persp with _f', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            const turn = game.firstTurn()
            await player.doHiddenAction('_f', turn)
            expect(player.persp).to.equal(Red)
        })

        it('should flip persp with _f when drawer null', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            const turn = game.firstTurn()
            player.drawer = null
            await player.doHiddenAction('_f', turn)
            expect(player.persp).to.equal(Red)
        })

        it('should suggest with _r', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            const turn = game.firstTurn()
            await player.doHiddenAction('_r', turn)
        })

        it('should pass with _r when not rolled', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            makeRandomMoves(game.firstTurn(), true)
            makeRandomMoves(game.nextTurn().roll(), true)
            player.logger.loglevel = -1
            const turn = game.nextTurn()
            await player.doHiddenAction('_r', turn)
        })

        it('should pass with _r when no moves', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            makeRandomMoves(game.firstTurn(), true)
            makeRandomMoves(game.nextTurn().roll(), true)
            game.board.setStateString(States.WhiteCantMove)
            player.logger.loglevel = -1
            const turn = game.nextTurn().roll()
            await player.doHiddenAction('_r', turn)
        })

        it('should pass with _r when robot throws', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            player.newRobot = {getMoves: () => {throw new Error}}
            const turn = game.firstTurn()
            player.logger.loglevel = -1
            await player.doHiddenAction('_r', turn)
        })

        it('should pass with _unknown', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            const turn = game.firstTurn()
            player.logger.loglevel = -1
            await player.doHiddenAction('_unknown', turn)
        })
    })

    describe('#newRobot', () => {

        const Menu = requireSrc('term/menu')

        it('should return instance when isCustomRobot and robots are configs', function () {
            const {player} = this.fixture
            player.opts.isCustomRobot = true
            player.opts.robots = Menu.robotsDefaults()
            const res = player.newRobot(Red)
            expect(res.isRobot).to.equal(true)
        })
    })

    describe('#playRoll', () => {

        it('should return without prompting if turn.isCantMove', async function () {
            const {player, game} = this.fixture
            const turn = game.firstTurn()
            // force properties
            turn.isCantMove = true
            turn.allowedMoveCount = 0
            await player.playRoll(turn, game)
        })

        it('should play first roll White 6,1 then break with board as expected for 6 point', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            player.prompt = MockPrompter([
                {origin: '13'},
                {origin: '8'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })

        it('should play first roll White 6,1 undo first then second with board as expected for 6 point', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([6, 1])
            player.prompt = MockPrompter([
                {origin: '13'},
                {origin: 'u'},
                {origin: '13'},
                {origin: '8'},
                {finish: 'u'},
                {origin: '8'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })

        it('should not prompt with fastForced on force move', async function () {
            const {rolls, player, game} = this.fixture
            rolls.push([1, 2])
            makeRandomMoves(game.firstTurn(), true)
            game.board.setStateString(States.EitherOneMoveWin)
            player.prompt = () => {throw new Error}
            player.opts.fastForced = true
            const turn = game.nextTurn()
            turn.roll()
            await player.playRoll(turn, game)
            turn.finish()
            expect(game.checkFinished()).to.equal(true)
            expect(game.getWinner()).to.equal(White)
        })
    })

    describe('#prompt', () => {

        // coverage tricks

        it('should call inquirer.prompt with array and set player.prompt', function () {
            const {player} = this.fixture
            const exp = []
            var q
            player.inquirer = {
                prompt : questions => {
                    q = questions
                    return new Promise(() => {})
                }
            }
            player.prompt(exp)
            expect(q).to.equal(exp)
        })
    })

    describe('#promptDecideDouble', () => {

        beforeEach(function () {
            const {game} = this.fixture
            update(this.fixture, {
                turn: makeRandomMoves(game.firstTurn(), true)
            })
        })

        it('should return true for y', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({accept: 'y'})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(true)
        })

        it('should return false for n', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({accept: 'n'})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptTurnOption', () => {

        beforeEach(function () {
            const {game} = this.fixture
            update(this.fixture, {
                turn: makeRandomMoves(game.firstTurn(), true)
            })
        })

        it('should return false for r', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({action: 'r'})
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })

        it('should return true for d', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({action: 'd'})
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(true)
        })

        it('should invalidate foo', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({action: 'foo'})
            const err = await getErrorAsync(() => player.promptTurnOption(turn))
            expect(err.message).to.contain('Validation failed for action')
        })

        it('should throw MatchCanceledError for action=q, confirm=true', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter([
                {action: 'q'},
                {confirm : true}
            ])
            const err = await getErrorAsync(() => player.promptTurnOption(turn))
            expect(err.name).to.equal('MatchCanceledError')
        })

        it('should return false for q, confirm=false, r', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter([
                {action: 'q'},
                {confirm: false},
                {action: 'r'}
            ])
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })

        it('should do hidden action _f then roll', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter([
                {action: '_f'},
                {action: 'r'}
            ])
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptFace', () => {


        beforeEach(function () {
            const {game} = this.fixture
            update(this.fixture, {
                turn: makeRandomMoves(game.firstTurn(), true)
            })
        })

        it('should return 3 for [3, 3, 3, 3] and not prompt', async function () {
            const {player, turn} = this.fixture
            const result = await player.promptFace(turn, [3, 3, 3, 3])
            expect(result).to.equal(3)
        })

        it('should return 5 for 5 with [5, 6]', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({face: '5'})
            const result = await player.promptFace(turn, [5, 6])
            expect(result).to.equal(5)
        })

        it('should fail validation for 3 with [1, 2]', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({face: '3'})
            const err = await getErrorAsync(() => player.promptFace(turn, [1, 2]))
            expect(err.message).to.contain('Validation failed for face')
        })
    })

    describe('#promptFinish', () => {

        it('should return true for f', async function () {
            const {player} = this.fixture
            player.prompt = MockPrompter({finish: 'f'})
            const result = await player.promptFinish()
            expect(result).to.equal(true)
        })

        it('should return false for u', async function () {
            const {player} = this.fixture
            player.prompt = MockPrompter({finish: 'u'})
            const result = await player.promptFinish()
            expect(result).to.equal(false)
        })

        it('should invalidate for foo', async function () {
            const {player} = this.fixture
            player.prompt = MockPrompter({finish: 'foo'})
            const err = await getErrorAsync(() => player.promptFinish())
            expect(err.message).to.contain('Validation failed for finish')
        })
    })

    describe('#promptOrigin', () => {

        beforeEach(function () {
            update(this.fixture, {
                turn: new Turn(new Board, White)
            })
        })

        it('should return -1 for b with [-1]', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({origin: 'b'})
            const result = await player.promptOrigin(turn, [-1])
            expect(result).to.equal(-1)
        })

        it('should return 0 for 24 with [0, 4]', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({origin: '24'})
            const result = await player.promptOrigin(turn, [0, 4])
            expect(result).to.equal(0)
        })

        it('should return undo for u with [11, 12] canUndo=true', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({origin: 'u'})
            const result = await player.promptOrigin(turn, [11, 12], true)
            expect(result).to.equal('undo')
        })

        it('should fail validation for 3 with [3, 4]',async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter({origin: '3'})
            const err = await getErrorAsync(() => player.promptOrigin(turn, [3, 4]))
            expect(err.message).to.contain('Validation failed for origin')
        })

        it('should throw MatchCanceledError for origin=q, confirm=true', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter([
                {origin: 'q'},
                {confirm : true}
            ])
            const err = await getErrorAsync(() => player.promptOrigin(turn, [1, 2]))
            expect(err.name).to.equal('MatchCanceledError')
        })

        it('should return -1 for q, confirm=false, b with [-1]', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter([
                {origin: 'q'},
                {confirm: false},
                {origin: 'b'}
            ])
            const result = await player.promptOrigin(turn, [-1])
            expect(result).to.equal(-1)
        })

        it('should do hidden action _f then quit with MatchCanceledError', async function () {
            const {player, turn} = this.fixture
            player.prompt = MockPrompter([
                {origin: '_f'},
                {origin: 'q'},
                {confirm: true}
            ])
            const err = await getErrorAsync(() => player.promptOrigin(turn, [1]))
            expect(err.name).to.equal('MatchCanceledError')
        })
    })

    describe('#report', () => {

        describe('coverage', () => {

            it('drawer=null', function () {
                const {player} = this.fixture
                player.drawer = null
                player.report()
            })
        })
    })

    describe('#rollTurn', () => {

        // coverage

        it('should roll', async function () {
            const {player} = this.fixture
            const turn = new Turn(Board.setup(), White)
            await player.rollTurn(turn)
            expect(turn.isRolled).to.equal(true)
        })
    })

    describe('events', () => {

        // coverage

        beforeEach(function () {
            this.fixture.rolls.push([6, 1])
            makeRandomMoves(this.fixture.game.firstTurn(), true)
        })

        describe('afterRoll', () => {

            it('should pass for red turn with isDualTerm=false', function () {
                const {player, game} = this.fixture
                const turn = game.nextTurn()
                turn.roll()
                player.emit('afterRoll', turn)
            })

            it('should start waiting for opponent prompt if opponent isNet', function () {
                const {player, game} = this.fixture
                const turn = game.nextTurn()
                turn.roll()
                // hack opponent property
                player.opponent.isNet = true
                var isCalled = false
                player.promptWaitingForOpponent = () => new Promise(r => isCalled = true)
                player.emit('afterRoll', turn)
                expect(isCalled).to.equal(true)
            })
        })

        describe('beforeOption', () => {

            it('should start waiting for opponent turn if opponent isNet', function () {
                const {player, game} = this.fixture
                const turn = game.nextTurn()
                player.opponent.isNet = true
                var isCalled = false
                player.promptWaitingForOpponent = () => new Promise(r => isCalled = true)
                player.emit('beforeOption', turn)
                expect(isCalled).to.equal(true)
            })
        })

        describe('doubleOffered', () => {

            it('should start waiting for self turn if opponent isNet', function () {
                const {player, game} = this.fixture
                makeRandomMoves(game.nextTurn().roll(), true)
                const turn = game.nextTurn()
                turn.setDoubleOffered()
                player.opponent.isNet = true
                var isCalled = false
                player.promptWaitingForOpponent = () => new Promise(r => isCalled = true)
                player.emit('doubleOffered', turn, game)
                expect(isCalled).to.equal(true)
            })
        })

        describe('turnEnd', () => {

            it('should pass for red cant move', function () {
                const {player, game} = this.fixture
                game.board.bars.Red.push(game.board.slots[5].pop())
                const turn = game.nextTurn()
                turn.setRoll([6, 6])
                turn.finish()
                player.emit('turnEnd', turn)
            })
        })
    })

    describe('listeners on opponent net player', () => {

        const loglevel = 1

        function eastAndWest(client1, client2) {

            const coordWest = new Coordinator
            const coordEast = new Coordinator

            client1.logger.name = 'ClientWest'
            client2.logger.name = 'ClientEast'
            coordWest.logger.name = 'CoordWest'
            coordEast.logger.name = 'CoordEast'

            const west = {
                players: {
                    White : new TermPlayer(White)
                  , Red   : new NetPlayer(client1, Red)
                }
              , client: client1
              , coord: coordWest
            }
            const east = {
                players: {
                    White : new NetPlayer(client2, White)
                  , Red   : new Player(Red)
                }
              , client: client2
              , coord: coordEast
            }

            coordWest.loglevel = loglevel
            coordEast.loglevel = loglevel
            Object.values(east.players).forEach(player => {
                player.logger.name += 'East'
                player.loglevel = loglevel
            })
            west.players.White.term.stdout = new NullOutput
            Object.values(west.players).forEach(player => {
                player.logger.name += 'West'
                player.loglevel = loglevel
            })

            return {east, west}
        }

        beforeEach(async function() {
            const server = new Server
            server.loglevel = loglevel
            await server.listen()
            const serverUrl = `http://localhost:${server.port}`
            const client1 = new Client({serverUrl})
            const client2 = new Client({serverUrl})
            client1.loglevel = loglevel
            client2.loglevel = loglevel
            const {east, west} = eastAndWest(client1, client2)
            update(this.fixture, {client1, client2, server, east, west})
        })

        afterEach(async function () {
            const {client1, client2, server, east, west} = this.fixture
            await destroyAll(east.players)
            await destroyAll(west.players)
            await client1.close()
            await client2.close()
            server.close()
        })

        it('should not leak listeners', async function() {

            const {east, west} = this.fixture

            const mockMethods = {
                playRoll    : turn => makeRandomMoves(turn).finish()
              , drawBoard   : noop
              , turnOption  : turn => turn.setDoubleOffered()
              , decideDouble: (turn, game) => {
                    if (game.cubeValue > 1) {
                        turn.setDoubleDeclined()
                    }
                }
            }

            update(west.players.White, mockMethods)
            update(east.players.Red, mockMethods)

            const runMatch = async () => {
                let promise
                west.client.once('matchCreated', id => {
                    promise = east.client.joinMatch(id)
                })
                const matchWest = await west.client.createMatch({total: 2})
                const matchEast = await promise
                await Promise.all([
                    west.coord.runMatch(matchWest, west.players)
                  , east.coord.runMatch(matchEast, east.players)
                ])
            }

            const countListeners = () => ({
                matchCanceled: west.players.Red.listenerCount('matchCanceled')
              , matchResponse: west.players.Red.listenerCount('matchResponse')
            })

            const counts0 = countListeners()

            // We expect TermPlayer to add 1 listener
            const exp = {
                matchCanceled : counts0.matchCanceled + 1
              , matchResponse : counts0.matchResponse + 1
            }

            await west.client.connect()
            await east.client.connect()

            for (let i = 0; i < 1; ++i) {
                await runMatch()
            }

            const res = countListeners()
            
            expect(res.matchCanceled).to.equal(exp.matchCanceled)
            expect(res.matchResponse).to.equal(exp.matchResponse)

        })
    })
})

describe('Robot', () => {

    it('should play robot v robot double after 3 turns', async function () {
        this.timeout(1000)
        const white = new TermPlayer.Robot(newRando(White), {delay: 0})
        const red = new TermPlayer.Robot(newRando(Red), {delay: 0})
        white.logger.loglevel = 1
        red.logger.loglevel = 1
        white.logger.stdout = {write: () => {}}
        red.logger.stdout = {write: () => {}}
        white.robot.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        red.robot.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        white.robot.decideDouble = turn => turn.setDoubleDeclined()
        red.robot.decideDouble = turn => turn.setDoubleDeclined()
        const match = new Match(1, {isCrawford: false})
        const coordinator = new Coordinator
        await coordinator.runMatch(match, white, red)
        expect(match.checkFinished()).to.equal(true)
        await destroyAll([white, red])
    })

    describe('#delay', () => {

        it('should delay for delay=0.01', async () => {
            const player = new TermPlayer.Robot(newRando(White), {delay: 0.01})
            await player.delay()
            await player.destroy()
        })
    })

    describe('#meta', () => {

        it('should have isRobot=true', async () => {
            const player = new TermPlayer.Robot(newRando(White), {delay: 0.01})
            const result = player.meta()
            expect(result.isRobot).to.equal(true)
            await player.destroy()
        })
    })
})
