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
const Test = require('../util')

const {
    expect
  , getError
  , makeRandomMoves
  , MockPrompter
  , newRando
  , noop
  , NullOutput
  , requireSrc
  , tmpDir
  , tmpFile
  , States
} = Test

const fs  = require('fs')
const fse = require('fs-extra')

const {resolve} = require('path')

describe('-', () => {

    const Constants   = requireSrc('lib/constants')
    const Core        = requireSrc('lib/core')
    const Coordinator = requireSrc('lib/coordinator')
    const Dice        = requireSrc('lib/dice')
    const Player      = requireSrc('lib/player')
    const Robot       = requireSrc('robot/player')
    const Util        = requireSrc('lib/util')

    const {append, update} = Util
    const {White, Red, PointOrigins} = Constants
    const {Match, Game} = Core

    const loglevel = 1

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

    beforeEach(function () {
        const rolls = []
        const recordDir = tmpDir()
        const coord = new Coordinator({recordDir})
        this.fixture = {
            rolls
          , roller :  () => this.fixture.rolls.shift() || Dice.rollTwo()
          , coord
          , recordDir
          , players: {
                White : new MockPlayer(White)
              , Red   : new MockPlayer(Red)
            }
        }
        Object.values(this.fixture.players).forEach(player => {
            player.loglevel = loglevel
        })
        coord.loglevel = loglevel
    })

    afterEach(async function () {
        Util.destroyAll(this.fixture.players)
        await fse.remove(this.fixture.recordDir)
    })

    describe('Static', () => {

        describe('#buildPlayers', () => {

            it('should accept keyed object', function () {
                const {players} = this.fixture
                const res = Coordinator.buildPlayers(players)
                expect(res.White).to.equal(players.White)
                expect(res.Red).to.equal(players.Red)
            })

            it('should accept white,red args', function () {
                const {players} = this.fixture
                const res = Coordinator.buildPlayers(players.White, players.Red)
                expect(res.White).to.equal(players.White)
                expect(res.Red).to.equal(players.Red)
            })

            it('should accept array', function () {
                const {players} = this.fixture
                const res = Coordinator.buildPlayers([players.White, players.Red])
                expect(res.White).to.equal(players.White)
                expect(res.Red).to.equal(players.Red)
            })
        })
    })

    describe('#constructor', () => {

        it('should throw InvalidDirError when isRecord=true and no recordDir passed', function () {
            const {recordDir} = this.fixture
            const err = getError(() => new Coordinator({isRecord: true}))
            expect(err.name).to.equal('InvalidDirError')
        })

        it('should accept recordDir when isRecord=true', function () {
            const {recordDir} = this.fixture
            new Coordinator({isRecord: true, recordDir})
        })
    })

    describe('#cancelMatch', () => {

        it('should emit matchCanceled on both players', async function () {
            const {players, coord} = this.fixture
            let isCalled1 = false
            let isCalled2 = false
            players.White.on('matchCanceled', () => isCalled1 = true)
            players.Red.on('matchCanceled', () => isCalled2 = true)
            const match = new Match(1)
            await coord.cancelMatch(match, players, new Error)
            expect(isCalled1).to.equal(true)
            expect(isCalled2).to.equal(true)
        })
    })

    describe('#emitAll', () => {

        it('should await promises in holds', async function () {
            const {players, coord} = this.fixture
            let isCalled = false
            players.White.holds.push(new Promise(resolve => {
                setTimeout(() => {
                    isCalled = true
                    resolve()
                }, 10)
            }))
            await coord.emitAll([players.White], 'foo')
            expect(isCalled).to.equal(true)
        })

        it('should remove all holds', async function () {
            const {players, coord} = this.fixture
            let isCalled = false
            players.White.holds.push(new Promise(resolve => {
                setTimeout(() => {
                    isCalled = true
                    resolve()
                }, 10)
            }))
            await coord.emitAll([players.White], 'foo')
            expect(isCalled).to.equal(true)
            expect(players.White.holds).to.have.length(0)
        })

        it('should call listener on white', async function () {
            const {players, coord} = this.fixture
            let isCalled = false
            players.White.on('testEvent', () => isCalled = true)
            await coord.emitAll(players, 'testEvent')
            expect(isCalled).to.equal(true)
        })
    })

    describe('#recordGame', () => {

        beforeEach(function () {
            update(this.fixture, {
                file: tmpFile()
              , game: new Game
            })
            this.readGame = async function (f) {
                return await fse.readJson(f || this.fixture.file)
            }
        })

        afterEach(async function () {
            await fse.remove(this.fixture.file)
        })

        it('should write valid game meta for new game', async function () {
            const {coord, file, players, game} = this.fixture
            await coord.recordGame(game, file, players)
            const result = await this.readGame()
            expect(result.uuid).to.equal(game.uuid)
        })
    })

    describe('#recordMatch', () => {

        beforeEach(function () {
            update(this.fixture, {
                file  : tmpFile()
              , match : new Match(1)
            })
            
            this.readMatch = async function (f) {
                return await fse.readJson(f || this.fixture.file)
            }
        })

        afterEach(async function () {
            await fse.remove(this.fixture.file)
        })

        it('should write valid match meta for new match', async function () {
            const {coord, file, players, match} = this.fixture
            await coord.recordMatch(match, file, players)
            const result = await this.readMatch()
            expect(result.uuid).to.equal(match.uuid)
        })
    })

    describe('#runGame', () => {

        beforeEach(function () {
            this.fixture.rolls = [[2, 1], [6, 5]]
            const game = new Game({roller: this.fixture.roller})
            update(this.fixture, {
                game
              , board: game.board
            })
        })

        it('should run EitherOneMoveWin with 2,1 first roll white to win', async function () {
            const {board, players, coord, game} = this.fixture
            this.fixture.rolls = [[2, 1]]
            board.setStateString(States.EitherOneMoveWin)
            players.White.moves.push([23, 2])
            await coord.runGame(players, game)
            expect(game.getWinner()).to.equal(White)
        })

        it('should run Either65Win with 2,1 first roll, next roll 6,5 red to win', async function () {
            const {board, players, coord, game} = this.fixture
            board.setStateString(States.Either65Win)
            players.White.moves = [
                [PointOrigins[White][6], 2],
                [PointOrigins[White][5], 1]
            ]
            players.Red.moves = [
                [PointOrigins[Red][6], 6],
                [PointOrigins[Red][5], 5]
            ]
            await coord.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
        })

        it('should run Either65Win with 2,1 first roll, red double, white decline, red win with 1 point', async function () {
            const {board, players, coord, game} = this.fixture
            board.setStateString(States.Either65Win)
            players.White.moves = [
                [PointOrigins[White][6], 2],
                [PointOrigins[White][5], 1]
            ]
            players.Red.turnOption = turn => turn.setDoubleOffered()
            players.White.decideDouble = turn => turn.setDoubleDeclined()
            await coord.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
            expect(game.finalValue).to.equal(1)
        })

        it('should run Either65Win with 2,1 first roll, next roll 6,5 red to win and not call red turnOption with isCrawford=true', async function () {
            const {board, players, coord, game} = this.fixture
            game.opts.isCrawford = true
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
            await coord.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
        })

        it('should run Either65Win with 2,1 first roll, red double, white accept, red rolls 6,5 to win finalValue 2', async function () {
            const {board, players, coord, game} = this.fixture
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
            await coord.runGame(players, game)
            expect(game.getWinner()).to.equal(Red)
            expect(game.finalValue).to.equal(2)
        })

        describe('TermPlayer', () => {

            const TermPlayer = requireSrc('term/player')

            beforeEach(function () {
                const t1 = new TermPlayer(White)
                const t2 = new TermPlayer(Red)
                t1.loglevel = loglevel
                t2.loglevel = loglevel
                t1.output = new NullOutput
                t2.output = new NullOutput
                update(this.fixture, {t1, t2})
            })

            afterEach(function () {
                const {t1, t2} = this.fixture
                Util.destroyAll([t1, t2])
            })

            it('should play RedWinWith66 for white first move 6,1 then red 6,6', async function () {
                const {t1, t2, board, coord, game} = this.fixture
                this.fixture.rolls = [[6, 1]]
                board.setStateString(States.RedWinWith66)
                t1.rollTurn = turn => turn.setRoll([6, 6])
                t2.rollTurn = turn => turn.setRoll([6, 6])
                t1.prompt = MockPrompter([
                    // white's first turn
                    {origin: '13'},
                    {face:    '6'},
                    {origin:  '8'},
                    {finish:  'f'}
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
                await coord.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
            })

            it('should end with white refusing double on second turn', async function () {
                const {t1, t2, board, coord, game} = this.fixture
                this.fixture.rolls = [[6, 1]]
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
                await coord.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
            })

            it('should play RedWinWith66 for white first move 6,1 then red double, white accept, red rolls 6,6 backgammon', async function () {
                const {t1, t2, board, coord, game} = this.fixture
                this.fixture.rolls = [[6, 1]]
                board.setStateString(States.RedWinWith66)
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
                await coord.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
                expect(game.cubeValue).to.equal(2)
                expect(game.finalValue).to.equal(8)
            })

            it('should play RedWinWith66, white 6,1, red double, white accept, red 6,5, white 1,2, red cant double 6,6, backgammon', async function () {
                const {t1, t2, board, coord, game} = this.fixture
                this.fixture.rolls = [
                    [6, 1],
                    [6, 5],
                    [1, 2],
                    [6, 6]
                ]
                board.setStateString(States.RedWinWith66)
                t1.prompt = MockPrompter([
                    // white's first turn
                    {origin: '13'},
                    {face:    '6'},
                    {origin:  '8'},
                    {finish:  'f'},
                    // accept
                    {accept:  'y'},
                    // white's turn
                    {action:  'r'},
                    {origin: '24'},
                    {face:    '2'},
                    {origin: '24'},
                    {finish:  'f'}
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
                await coord.runGame({White: t1, Red: t2}, game)
                expect(game.winner).to.equal(Red)
                expect(game.cubeValue).to.equal(2)
                expect(game.finalValue).to.equal(8)
            })
        })
    })

    describe('#runMatch', () => {

        beforeEach(function () {

            const r1 = newRando(White)
            const r2 = newRando(Red)
            this.fixture.rolls = [[2, 1]]
            update(this.fixture, {
                match: new Match(1, {roller: this.fixture.roller})
              , r1
              , r2
            })
        })

        afterEach(async function () {
            const {r1, r2} = this.fixture
            Util.destroyAll([r1, r2])
            await fse.remove(this.fixture.recordDir)
        })

        it('should run EitherOneMoveWin with 2,1 first roll white to win', async function () {
            const {players, coord, match} = this.fixture
            players.White.on('gameStart', game => {
                game.board.setStateString(States.EitherOneMoveWin)
            })
            players.White.moves.push([23, 2])
            await coord.runMatch(match, players.White, players.Red)
            expect(match.getWinner()).to.equal(White)
        })

        it('should run EitherOneMoveWin with isRecord=true and record match to expected file', async function () {
            const {players, coord, match} = this.fixture
            players.White.on('gameStart', game => {
                game.board.setStateString(States.EitherOneMoveWin)
            })
            players.White.moves.push([23, 2])
            coord.opts.isRecord = true
            await coord.runMatch(match, players.White, players.Red)

            const matchDir = coord.getMatchDir(match)
            const matchFile = resolve(matchDir, 'match.json')
            const gameFile = resolve(matchDir, 'game_1.json')
            expect(fs.existsSync(matchFile)).to.equal(true)
            expect(fs.existsSync(gameFile)).to.equal(true)
        })

        it('should play 3 point match with mock runGame', async function () {
            const {coord, match, r1, r2} = this.fixture
            match.total = 3
            coord.runGame = (players, game) => {
                game.board.setStateString(States.EitherOneMoveWin)
                makeRandomMoves(game.firstTurn(), true)
            }
            await coord.runMatch(match, r1, r2)
            expect(match.hasWinner()).to.equal(true)
        })
    })
})
