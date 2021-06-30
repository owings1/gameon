/**
 * gameon - test suite - coordinator
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
    MockPrompter,
    noop,
    requireSrc,
    tmpDir,
    tmpFile,
    States
} = TestUtil

const fse = require('fs-extra')
const fs = require('fs')
const {resolve} = require('path')

describe('Coordinator', () => {

    const Constants   = requireSrc('lib/constants')
    const Core        = requireSrc('lib/core')
    const Coordinator = requireSrc('lib/coordinator')
    const Player      = requireSrc('lib/player')
    const Robot       = requireSrc('robot/player')
    const Util        = requireSrc('lib/util')

    const {White, Red, PointOrigins} = Constants
    const {Match, Game, Dice} = Core

    const players = {}

    var coordinator

    beforeEach(() => {
        players.White = new MockPlayer(White)
        players.Red = new MockPlayer(Red)
        coordinator = new Coordinator
        coordinator.logger.loglevel = 1
    })

    afterEach(async () => {
        await Util.destroyAll(players)
    })

    function newRando(...args) {
        return Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
    }

    class MockPlayer extends Player {

        constructor(color) {
            super(color)
            this.moves = []
        }

        async playRoll(turn, game, match) {
            for (var i = 0; i < turn.allowedMoveCount; i++) {
                turn.move(...this.moves.shift())
            }
        }
    }

    describe('#constructor', () => {

        var recordDir

        before(() => {
            recordDir = tmpDir()
        })

        afterEach(async () => {
            await fse.remove(recordDir)
        })

        it('should throw InvalidDirError when isRecord=true and no recordDir passed', () => {
            const err = getError(() => new Coordinator({isRecord: true}))
            expect(err.name).to.equal('InvalidDirError')
        })

        it('should accept recordDir when isRecord=true', () => {
            new Coordinator({isRecord: true, recordDir})
        })
    })

    describe('#buildPlayers', () => {

        it('should accept keyed object', () => {
            const res = Coordinator.buildPlayers(players)
            expect(res.White).to.equal(players.White)
            expect(res.Red).to.equal(players.Red)
        })

        it('should accept white,red args', () => {
            const res = Coordinator.buildPlayers(players.White, players.Red)
            expect(res.White).to.equal(players.White)
            expect(res.Red).to.equal(players.Red)
        })

        it('should accept array', () => {
            const res = Coordinator.buildPlayers([players.White, players.Red])
            expect(res.White).to.equal(players.White)
            expect(res.Red).to.equal(players.Red)
        })
    })

    describe('#cancelGame', () => {

        it('should emit gameCanceled on both players', async () => {
            var isCalled1 = false
            var isCalled2 = false
            players.White.on('gameCanceled', () => isCalled1 = true)
            players.Red.on('gameCanceled', () => isCalled2 = true)
            const game = new Game
            await coordinator.cancelGame(game, players, new Error)
            expect(isCalled1).to.equal(true)
            expect(isCalled2).to.equal(true)
        })
    })

    describe('#cancelMatch', () => {

        it('should emit matchCanceled on both players', async () => {
            var isCalled1 = false
            var isCalled2 = false
            players.White.on('matchCanceled', () => isCalled1 = true)
            players.Red.on('matchCanceled', () => isCalled2 = true)
            const match = new Match(1)
            await coordinator.cancelMatch(match, players, new Error)
            expect(isCalled1).to.equal(true)
            expect(isCalled2).to.equal(true)
        })
    })

    describe('#emitAll', () => {

        it('should await promises in holds', async () => {
            var isCalled = false
            players.White.holds.push(new Promise(resolve => {
                setTimeout(() => {
                    isCalled = true
                    resolve()
                }, 10)
            }))
            await coordinator.emitAll([players.White], 'foo')
            expect(isCalled).to.equal(true)
        })

        it('should remove all holds', async () => {
            var isCalled = false
            players.White.holds.push(new Promise(resolve => {
                setTimeout(() => {
                    isCalled = true
                    resolve()
                }, 10)
            }))
            await coordinator.emitAll([players.White], 'foo')
            expect(isCalled).to.equal(true)
            expect(players.White.holds).to.have.length(0)
        })

        it('should call listener on white', async () => {
            var isCalled = false
            players.White.on('testEvent', () => isCalled = true)
            await coordinator.emitAll(players, 'testEvent')
            expect(isCalled).to.equal(true)
        })
    })

    describe('#recordGame', () => {

        var file
        var game

        function readGame(f) {
            f = f || file
            return JSON.parse(fs.readFileSync(f))
        }

        before(() => {
            file = tmpFile()
        })

        beforeEach(() => {
            game = new Game
        })

        afterEach(async () => {
            await fse.remove(file)
        })

        it('should write valid game meta for new game', async () => {
            await coordinator.recordGame(game, file, players)
            const result = readGame()
            expect(result.uuid).to.equal(game.uuid)
        })
    })

    describe('#recordMatch', () => {

        var file
        var match

        function readMatch(f) {
            f = f || file
            return JSON.parse(fs.readFileSync(f))
        }

        beforeEach(() => {
            file = tmpFile()
            match = new Match(1)
        })

        afterEach(async () => {
            await fse.remove(file)
        })

        it('should write valid match meta for new match', async () => {
            await coordinator.recordMatch(match, file, players)
            const result = readMatch()
            expect(result.uuid).to.equal(match.uuid)
        })
    })

    describe('#runGame', () => {

        var rolls

        var roller

        beforeEach(() => {
            rolls = [[2, 1], [6, 5]]
            roller = () => rolls.shift() || Dice.rollTwo()
        })

        it('should run EitherOneMoveWin with 2,1 first roll white to win', async () => {
            rolls = [[2, 1]]
            const game = new Game({roller})
            game.board.setStateString(States.EitherOneMoveWin)
            players.White.moves.push([23, 2])
            await coordinator.runGame(players, game)
            expect(game.getWinner()).to.equal(White)
        })

        it('should run Either65Win with 2,1 first roll, next roll 6,5 red to win', async () => {
            //coordinator.logger.loglevel = 4
            const game = new Game({roller})
            const board = game.board
            board.setStateString(States.Either65Win)
            players.White.moves = [
                [PointOrigins[White][6], 2],
                [PointOrigins[White][5], 1]
            ]
            players.Red.moves = [
                [PointOrigins[Red][6], 6],
                [PointOrigins[Red][5], 5]
            ]
            await coordinator.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
        })

        it('should run Either65Win with 2,1 first roll, red double, white decline, red win with 1 point', async () => {
            const game = new Game({roller})
            const board = game.board
            board.setStateString(States.Either65Win)
            players.White.moves = [
                [PointOrigins[White][6], 2],
                [PointOrigins[White][5], 1]
            ]
            players.Red.turnOption = turn => turn.setDoubleOffered()
            players.White.decideDouble = turn => turn.setDoubleDeclined()
            await coordinator.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
            expect(game.finalValue).to.equal(1)
        })

        it('should run Either65Win with 2,1 first roll, next roll 6,5 red to win and not call red turnOption with isCrawford=true', async () => {
            const game = new Game({isCrawford: true, roller})
            const board = game.board
            board.setStateString(States.Either65Win)
            players.White.moves = [
                [PointOrigins[White][6], 2],
                [PointOrigins[White][5], 1]
            ]
            players.Red.moves = [
                [PointOrigins[Red][6], 6],
                [PointOrigins[Red][5], 5]
            ]
            players.Red.turnOption = () => {throw new Error}
            await coordinator.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
        })

        it('should run Either65Win with 2,1 first roll, red double, white accept, red rolls 6,5 to win finalValue 2', async () => {
            const game = new Game({roller})
            const board = game.board
            board.setStateString(States.Either65Win)
            players.White.moves = [
                [PointOrigins[White][6], 2],
                [PointOrigins[White][5], 1]
            ]
            players.Red.moves = [
                [PointOrigins[Red][6], 6],
                [PointOrigins[Red][5], 5]
            ]
            players.Red.turnOption = turn => turn.setDoubleOffered()
            await coordinator.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
            expect(game.finalValue).to.equal(2)
        })

        describe('TermPlayer', () => {

            const TermPlayer = requireSrc('term/player')

            var coord
            var r1
            var r2

            var game

            var rolls
            var roller

            beforeEach(() => {
                r1 = newRando(White)
                r2 = newRando(Red)
                t1 = new TermPlayer(White)
                t2 = new TermPlayer(Red)
                t1.logger.loglevel = 1
                t2.logger.loglevel = 1
                t1.logger.stdout = {write: noop}
                t2.logger.stdout = t1.logger.stdout
                rolls = []
                roller = () => rolls.shift() || Dice.rollTwo()
                game = new Game({roller})
            })

            afterEach(async () => {
                await Util.destroyAll([r1, r2, t1, t2])
            })

            it('should play RedWinWith66 for white first move 6,1 then red 6,6', async () => {
                game.board.setStateString(States.RedWinWith66)
                rolls = [[6, 1]]
                t1.rollTurn = turn => turn.setRoll([6, 6])
                t2.rollTurn = turn => turn.setRoll([6, 6])
                t1.prompt = MockPrompter([
                    // white's first turn
                    {origin: '13'},
                    {face: '6'},
                    {origin: '8'},
                    {finish: 'f'}
                ])
                t2.prompt = MockPrompter([
                    // red's turn
                    {action: 'r'},
                    {origin: '6'},
                    {origin: '6'},
                    {origin: '6'},
                    {origin: '6'},
                    {finish: 'f'}
                ])
                await coordinator.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
            })

            it('should end with white refusing double on second turn', async () => {
                rolls = [[6, 1]]
                t1.prompt = MockPrompter([
                    // white's first turn
                    {origin: '13'},
                    {origin: '8'},
                    {finish: 'f'},
                    {accept: 'n'}
                ])
                t2.prompt = MockPrompter([
                    // red's turn
                    {action: 'd'}
                ])
                await coordinator.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
            })

            it('should play RedWinWith66 for white first move 6,1 then red double, white accept, red rolls 6,6 backgammon', async () => {
                game.board.setStateString(States.RedWinWith66)
                rolls = [[6, 1]]
                t1.rollTurn = turn => turn.setRoll([6, 6])
                t2.rollTurn = turn => turn.setRoll([6, 6])
                t1.prompt = MockPrompter([
                    // white's first turn
                    {origin: '13'},
                    {face: '6'},
                    {origin: '8'},
                    {finish: 'f'},
                    {accept: 'y'}
                ])
                t2.prompt = MockPrompter([
                    // red's turn
                    {action: 'd'},
                    {origin: '6'},
                    {origin: '6'},
                    {origin: '6'},
                    {origin: '6'},
                    {finish: 'f'}
                ])
                await coordinator.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
                expect(game.cubeValue).to.equal(2)
                expect(game.finalValue).to.equal(8)
            })

            it('should play RedWinWith66, white 6,1, red double, white accept, red 6,5, white 1,2, red cant double 6,6, backgammon', async () => {
                game.board.setStateString(States.RedWinWith66)
                rolls = [
                    [6, 1],
                    [6, 5],
                    [1, 2],
                    [6, 6]
                ]
                t1.prompt = MockPrompter([
                    // white's first turn
                    {origin: '13'},
                    {face: '6'},
                    {origin: '8'},
                    {finish: 'f'},
                    // accept
                    {accept: 'y'},
                    // white's turn
                    {action: 'r'},
                    {origin: '24'},
                    {face: '2'},
                    {origin: '24'},
                    {finish: 'f'}
                ])
                t2.prompt = MockPrompter([
                    // red's turn
                    {action: 'd'},
                    {origin: '6'},
                    {finish: 'f'},
                    // red's turn
                    {origin: '6'},
                    {origin: '6'},
                    {origin: '6'},
                    {finish: 'f'}
                ])
                await coordinator.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
                expect(game.cubeValue).to.equal(2)
                expect(game.finalValue).to.equal(8)
            })
        })
    })

    describe('#runMatch', () => {

        var match
        var recordDir
        var rolls

        var roller

        before(() => {
            recordDir = tmpDir()
        })

        beforeEach(() => {
            rolls = [[2, 1]]
            roller = () => rolls.shift() || Dice.rollTwo()
            match = new Match(1, {roller})
        })

        afterEach(async () => {
            await fse.remove(recordDir)
        })

        it('should run EitherOneMoveWin with 2,1 first roll white to win', async () => {
            players.White.on('gameStart', game => {
                game.board.setStateString(States.EitherOneMoveWin)
            })
            players.White.moves.push([23, 2])
            await coordinator.runMatch(match, players.White, players.Red)
            expect(match.getWinner()).to.equal(White)
        })

        it('should run EitherOneMoveWin with isRecord=true and record match to expected file', async () => {
            players.White.on('gameStart', game => {
                game.board.setStateString(States.EitherOneMoveWin)
            })
            players.White.moves.push([23, 2])
            coordinator.opts.isRecord = true
            coordinator.opts.recordDir = recordDir
            await coordinator.runMatch(match, players.White, players.Red)

            const matchDir = coordinator.getMatchDir(match)
            const matchFile = resolve(matchDir, 'match.json')
            const gameFile = resolve(matchDir, 'game_1.json')
            expect(fs.existsSync(matchFile)).to.equal(true)
            expect(fs.existsSync(gameFile)).to.equal(true)
        })

        it('should play 3 point match with mock runGame', async () => {
            const match = new Match(3)
            coordinator.runGame = (players, game) => {
                game.board.setStateString(States.EitherOneMoveWin)
                makeRandomMoves(game.firstTurn(), true)
            }
            const r1 = newRando(White)
            const r2 = newRando(Red)
            await coordinator.runMatch(match, r1, r2)
            expect(match.hasWinner()).to.equal(true)
        })
    })
})
