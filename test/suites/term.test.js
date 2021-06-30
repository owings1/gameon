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
const Errors      = requireSrc('lib/errors')
const Robot       = requireSrc('robot/player')
const Client      = requireSrc('net/client')
const Server      = requireSrc('net/server')

const {White, Red} = Constants
const {Match, Game, Board, Turn, Dice} = Core

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

    var player

    beforeEach(() => {
        player = new TermPlayer(White)
        player.logger.loglevel = 1
        player.logger.stdout = {write: () => {}}
    })

    describe('#playRoll', () => {

        var game
        var rolls
        var roller

        beforeEach(() => {
            rolls = []
            roller = () => rolls.shift() || Dice.rollTwo()
            game = new Game({roller})
            player.thisGame = game
        })

        it('should return without prompting if turn.isCantMove', async () => {
            const turn = game.firstTurn()
            // force properties
            turn.isCantMove = true
            turn.allowedMoveCount = 0
            await player.playRoll(turn, game)
        })

        it('should play first roll White 6,1 then break with board as expected for 6 point', async () => {
            rolls = [[6, 1]]
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

        it('should play first roll White 6,1 undo first then second with board as expected for 6 point', async () => {
            rolls = [[6, 1]]
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

        it('should not prompt with fastForced on force move', async () => {
            rolls = [[1, 2]]
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

        const inquirer = require('inquirer')

        var oldPrompt

        before(() => {
            oldPrompt = inquirer.prompt
        })

        afterEach(() => {
            inquirer.prompt = oldPrompt
        })

        it('should call inquirer.prompt with array and set player._prompt', () => {
            var q
            inquirer.prompt = questions => {
                q = questions
                return new Promise(() => {})
            }
            player.prompt()
            expect(Array.isArray(q)).to.equal(true)
        })
    })

    describe('#promptDecideDouble', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return true for y', async () => {
            player.prompt = MockPrompter({accept: 'y'})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(true)
        })

        it('should return false for n', async () => {
            player.prompt = MockPrompter({accept: 'n'})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptTurnOption', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return false for r', async () => {
            player.prompt = MockPrompter({action: 'r'})
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })

        it('should return true for d', async () => {
            player.prompt = MockPrompter({action: 'd'})
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(true)
        })

        it('should invalidate foo', async () => {
            player.prompt = MockPrompter({action: 'foo'})
            const err = await getErrorAsync(() => player.promptTurnOption(turn))
            expect(err.message).to.contain('Validation failed for action')
        })

        it('should throw MatchCanceledError for action=q, confirm=true', async () => {
            player.prompt = MockPrompter([
                {action: 'q'},
                {confirm : true}
            ])
            const err = await getErrorAsync(() => player.promptTurnOption(turn))
            expect(err.name).to.equal('MatchCanceledError')
        })

        it('should return false for q, confirm=false, r', async () => {
            player.prompt = MockPrompter([
                {action: 'q'},
                {confirm: false},
                {action: 'r'}
            ])
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptFace', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return 3 for [3, 3, 3, 3] and not prompt', async () => {
            const result = await player.promptFace(turn, [3, 3, 3, 3])
            expect(result).to.equal(3)
        })

        it('should return 5 for 5 with [5, 6]', async () => {
            player.prompt = MockPrompter({face: '5'})
            const result = await player.promptFace(turn, [5, 6])
            expect(result).to.equal(5)
        })

        it('should fail validation for 3 with [1, 2]', async () => {
            player.prompt = MockPrompter({face: '3'})
            const err = await getErrorAsync(() => player.promptFace(turn, [1, 2]))
            expect(err.message).to.contain('Validation failed for face')
        })
    })

    describe('#promptFinish', () => {

        it('should return true for f', async () => {
            player.prompt = MockPrompter({finish: 'f'})
            const result = await player.promptFinish()
            expect(result).to.equal(true)
        })

        it('should return false for u', async () => {
            player.prompt = MockPrompter({finish: 'u'})
            const result = await player.promptFinish()
            expect(result).to.equal(false)
        })

        it('should invalidate for foo', async () => {
            player.prompt = MockPrompter({finish: 'foo'})
            const err = await getErrorAsync(() => player.promptFinish())
            expect(err.message).to.contain('Validation failed for finish')
        })
    })

    describe('#promptOrigin', () => {

        var turn

        beforeEach(() => {
            turn = new Turn(new Board, White)
        })

        it('should return -1 for b with [-1]', async () => {
            player.prompt = MockPrompter({origin: 'b'})
            const result = await player.promptOrigin(turn, [-1])
            expect(result).to.equal(-1)
        })

        it('should return 0 for 24 with [0, 4]', async () => {
            player.prompt = MockPrompter({origin: '24'})
            const result = await player.promptOrigin(turn, [0, 4])
            expect(result).to.equal(0)
        })

        it('should return undo for u with [11, 12] canUndo=true', async () => {
            player.prompt = MockPrompter({origin: 'u'})
            const result = await player.promptOrigin(turn, [11, 12], true)
            expect(result).to.equal('undo')
        })

        it('should fail validation for 3 with [3, 4]', async () => {
            player.prompt = MockPrompter({origin: '3'})
            const err = await getErrorAsync(() => player.promptOrigin(turn, [3, 4]))
            expect(err.message).to.contain('Validation failed for origin')
        })

        it('should throw MatchCanceledError for origin=q, confirm=true', async () => {
            player.prompt = MockPrompter([
                {origin: 'q'},
                {confirm : true}
            ])
            const err = await getErrorAsync(() => player.promptOrigin(turn, [1, 2]))
            expect(err.name).to.equal('MatchCanceledError')
        })

        it('should return -1 for q, confirm=false, b with [-1]', async () => {
            player.prompt = MockPrompter([
                {origin: 'q'},
                {confirm: false},
                {origin: 'b'}
            ])
            const result = await player.promptOrigin(turn, [-1])
            expect(result).to.equal(-1)
        })
    })

    describe('#rollTurn', () => {

        // coverage

        it('should roll', async () => {
            const turn = new Turn(Board.setup(), White)
            await player.rollTurn(turn)
            expect(turn.isRolled).to.equal(true)
        })
    })

    describe('events', () => {

        // coverage

        var game
        var players
        var rolls
        var roller

        beforeEach(() => {
            rolls = [[6, 1]]
            roller = () => rolls.shift() || Dice.rollTwo()
            game = new Game({roller})
            players = {
                White : player,
                Red   : newRando(Red)
            }
            makeRandomMoves(game.firstTurn(), true)
        })

        describe('afterRoll', () => {

            it('should pass for red turn with isDualTerm=false', () => {
                player.emit('gameStart', game, null, players)
                const turn = game.nextTurn()
                turn.roll()
                player.emit('afterRoll', turn)
            })

            it('should log waiting for opponent turn if opponent isNet', () => {
                var logStr = ''
                player.emit('gameStart', game, null, players)
                const turn = game.nextTurn()
                turn.roll()
                player.logger.info = (...args) => logStr += args.join(' ')
                // hack opponent property
                player.opponent.isNet = true
                player.emit('afterRoll', turn)
                expect(logStr.toLowerCase()).to.contain('waiting')
            })
        })

        describe('beforeOption', () => {

            it('should log waiting for opponent turn if opponent isNet', () => {
                var logStr = ''
                player.emit('gameStart', game, null, players)
                const turn = game.nextTurn()
                player.logger.info = (...args) => logStr += args.join(' ')
                // hack opponent property
                player.opponent.isNet = true
                player.emit('beforeOption', turn)
                expect(logStr.toLowerCase()).to.contain('waiting')
            })
        })

        describe('doubleOffered', () => {

            it('should log waiting for self turn if opponent isNet', () => {
                var logStr = ''
                player.emit('gameStart', game, null, players)
                makeRandomMoves(game.nextTurn().roll(), true)
                const turn = game.nextTurn()
                turn.setDoubleOffered()
                player.logger.info = (...args) => logStr += args.join(' ')
                // hack opponent property
                player.opponent.isNet = true
                player.emit('doubleOffered', turn, game)
                expect(logStr.toLowerCase()).to.contain('waiting')
            })
        })

        describe('turnEnd', () => {

            it('should pass for red cant move', () => {
                player.emit('gameStart', game, null, players)
                // place red on bar
                game.board.bars.Red.push(game.board.slots[5].pop())
                const turn = game.nextTurn()
                turn.setRoll([6, 6])
                turn.finish()
                player.emit('turnEnd', turn)
            })
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
    })

    describe('#delay', () => {

        it('should delay for delay=0.01', async () => {
            const player = new TermPlayer.Robot(newRando(White), {delay: 0.01})
            await player.delay()
        })
    })

    describe('#meta', () => {

        it('should have isRobot=true', async () => {
            const player = new TermPlayer.Robot(newRando(White), {delay: 0.01})
            const result = player.meta()
            expect(result.isRobot).to.equal(true)
        })
    })
})

