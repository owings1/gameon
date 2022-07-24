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
import {expect} from 'chai'

import fs from 'fs'
import fse from 'fs-extra'
import {resolve} from 'path'
import {extend} from '@quale/core/arrays.js'
import {update} from '@quale/core/objects.js'
import {destroyAll} from '../../src/lib/util.js'
import MockPrompter from '../util/mock-prompter.js'
import {NullOutput} from '../util/io.js'
import States from '../states.js'
import {
    fetchBoard,
    getError,
    newRando,
    tmpDir,
    tmpFile,
} from '../util.js'

import Coordinator from '../../src/lib/coordinator.js'
import Dice from '../../src/lib/dice.js'
import Player from '../../src/lib/player.js'
import TermPlayer from '../../src/term/player.js'

import {Match, Game} from '../../src/lib/core.js'
import {White, Red, PointOrigins} from '../../src/lib/constants.js'
import {MatchCanceledError} from '../../src/lib/errors.js'

describe('Coordinator', () => {

    const logLevel = 1//4

    class MockPlayer extends Player {

        constructor(color) {
            super(color)
            this.moves = []
            this.doubleOptions = []
            this.doubleRejects = []
        }

        async playRoll(turn, game, match) {
            for (let i = 0; i < turn.allowedMoveCount; ++i) {
                turn.move(...this.moves.shift())
            }
        }

        async turnOption(turn, game, match) {
            const isDouble = this.doubleOptions.shift()
            if (isDouble) {
                turn.setDoubleOffered()
            }
        }

        async decideDouble(turn, game, match) {
            const isReject = this.doubleRejects.shift()
            if (isReject) {
                turn.setDoubleDeclined()
            }
        }
    }

    function pointMove(color, point, face) {
        return [PointOrigins[color][point], face]
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
        this.setRolls = function(arr) {
            this.fixture.rolls = arr
        }
        this.addRolls = function(arr) {
            extend(this.fixture.rolls, arr)
        }
        this.addRoll = function(roll) {
            this.fixture.rolls.push(roll)
        }
        this.load = function (name) {
            this.fixture.board.setStateString(fetchBoard(name).state28())
        }
        this.objects = []
        Object.values(this.fixture.players).forEach(player => {
            this.objects.push(player)
            player.logLevel = logLevel
        })
        coord.logLevel = logLevel
    })

    afterEach(async function () {
        destroyAll(this.objects)
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

        it('should set logLevel', function () {
            const {coord} = this.fixture
            coord.logLevel = 2
            expect(coord.logLevel).to.equal(2)
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

    describe('#emitAndWait', () => {

        it('should await promises in holds', async function () {
            const {players, coord} = this.fixture
            let isCalled = false
            players.White.holds.push(new Promise(resolve => {
                setTimeout(() => {
                    isCalled = true
                    resolve()
                }, 10)
            }))
            await coord.emitAndWait([players.White], 'foo')
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
            await coord.emitAndWait([players.White], 'foo')
            expect(isCalled).to.equal(true)
            expect(players.White.holds).to.have.length(0)
        })

        it('should call listener on white', async function () {
            const {players, coord} = this.fixture
            let isCalled = false
            players.White.on('testEvent', () => isCalled = true)
            await coord.emitAndWait(players, 'testEvent')
            expect(isCalled).to.equal(true)
        })

        it('should throw error when listener throws', async function () {
            const {players, coord} = this.fixture
            coord.logLevel = -1
            const exp = new Error
            players.White.on('testEvent', () => { throw exp })
            const err = await getError(() => coord.emitAndWait(players, 'testEvent'))
            expect(err).to.equal(exp)
        })

        it('should throw error when hold rejects', async function () {
            const {players, coord} = this.fixture
            coord.logLevel = -1
            const exp = new Error
            players.White.on('testEvent', function () {
                this.holds.push(new Promise((resolve, reject) => reject(exp)))
            })
            const err = await getError(() => coord.emitAndWait(players, 'testEvent'))
            expect(err).to.equal(exp)
        })

        it('should not throw MatchCanceledError when there is a listener on matchCanceled', function (done) {
            const {players, coord} = this.fixture
            coord.logLevel = -1
            const exp = new MatchCanceledError
            players.White.on('testEvent', function () {
                this.holds.push(new Promise((resolve, reject) => reject(exp)))
            })
            players.White.on('matchCanceled', function (err) {
                expect(err).to.equal(exp)
                done()
            })
            coord.emitAndWait(players, 'testEvent')
        })

        it('should emit error and not throw MatchCanceledError when there is no listener on matchCanceled', function (done) {
            const {players, coord} = this.fixture
            coord.logLevel = -1
            players.White.removeAllListeners()
            const exp = new MatchCanceledError
            players.White.on('testEvent', function () {
                this.holds.push(new Promise((resolve, reject) => reject(exp)))
            })
            players.White.on('error', function (err) {
                expect(err).to.equal(exp)
                done()
            })
            coord.emitAndWait(players, 'testEvent')
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
            const game = new Game({roller: this.fixture.roller})
            update(this.fixture, {game, board: game.board})
        })

        describe('EitherOneMoveWin', () => {

            beforeEach(function () {
                this.load('EitherOneMoveWin')
            })

            describe('White rolls 2,1 moves 1:2', () => {

                beforeEach(function () {
                    this.setRolls([[2, 1]])
                    const {players} = this.fixture
                    extend(players.White.moves, [
                        pointMove(White, 1, 2)
                    ])
                })

                it('White should win with 1 point', async function () {
                    const {players, coord, game} = this.fixture
                    await coord.runGame(players, game)
                    expect(game.getWinner()).to.equal(White)
                    expect(game.finalValue).to.equal(1)
                })
            })
        })

        describe('Either65Win', () => {

            beforeEach(function () {
                this.load('Either65Win')
            })

            describe('White rolls 2,1, moves 6:2, 5:1', () => {

                beforeEach(function () {
                    this.setRolls([[2, 1]])
                    const {players} = this.fixture
                    extend(players.White.moves, [
                        pointMove(White, 6, 2),
                        pointMove(White, 5, 1)
                    ])
                })

                describe('Red doubles', () => {

                    beforeEach(function () {
                        const {players} = this.fixture
                        players.Red.doubleOptions.push(true)
                    })

                    describe('White declines', () => {

                        beforeEach(function () {
                            const {players} = this.fixture
                            players.White.doubleRejects.push(true)
                        })

                        it('Red should win with 1 point', async function () {
                            const {players, coord, game} = this.fixture
                            await coord.runGame(players, game)
                            expect(game.getWinner()).to.equal(Red)
                            expect(game.finalValue).to.equal(1)
                        })
                    })

                    describe('White accepts', function () {

                        describe('Red rolls 6,5, moves 6:6, 5:5', () => {

                            beforeEach(function () {
                                this.addRoll([6, 5])
                                const {players} = this.fixture
                                extend(players.Red.moves, [
                                    pointMove(Red, 6, 6),
                                    pointMove(Red, 5, 5)
                                ])
                            })

                            it('Red should win with 2 points', async function () {
                                const {players, coord, game} = this.fixture
                                await coord.runGame(players, game)
                                expect(game.getWinner()).to.equal(Red)
                                expect(game.finalValue).to.equal(2)
                            })
                        })
                    })
                })

                describe('Red rolls 6,5, moves 6:6, 5:5', () => {

                    beforeEach(function () {
                        this.addRoll([6, 5])
                        const {players} = this.fixture
                        extend(players.Red.moves, [
                            pointMove(Red, 6, 6),
                            pointMove(Red, 5, 5)
                        ])
                    })

                    it('Red should win with 1 point', async function () {
                        const {players, coord, game} = this.fixture
                        await coord.runGame(players, game)
                        expect(game.getWinner()).to.equal(Red)
                        expect(game.finalValue).to.equal(1)
                    })

                    it('should not call Red turnOption with isCrawford=true', async function () {
                        const {players, coord, game} = this.fixture
                        game.opts.isCrawford = true
                        players.Red.turnOption = () => {throw new Error}
                        await coord.runGame(players, game)
                    })
                })
            })
        })

        describe('TermPlayer', () => {

            beforeEach(function () {
                const t1 = new TermPlayer(White)
                const t2 = new TermPlayer(Red)
                extend(this.objects, [t1, t2])
                t1.logLevel = logLevel
                t2.logLevel = logLevel
                t1.output = new NullOutput
                t2.output = new NullOutput
                const r1 = []
                const r2 = []
                t1.prompt = MockPrompter(r1)
                t2.prompt = MockPrompter(r2)
                this.fixture.responses = {
                    White : r1
                  , Red   : r2
                }
                this.fixture.players = {
                    White : t1
                  , Red   : t2
                }
            })

            describe('Initial', () => {

                beforeEach(function () {
                    this.setRolls([[6, 1]])
                })

                describe('White rolls 6,1, moves 13:, 8:', () => {

                    beforeEach(function () {
                        this.setRolls([[6, 1]])
                        const {responses} = this.fixture
                        extend(responses.White, [
                            {origin: '13'},
                            {origin: '8'},
                            {finish: 'f'}
                        ])
                    })

                    describe('Red doubles', () => {

                        beforeEach(function () {
                            const {responses} = this.fixture
                            extend(responses.Red, [
                                {action: 'd'}
                            ])
                        })

                        describe('White declines', () => {

                            beforeEach(function () {
                                const {responses} = this.fixture
                                extend(responses.White, [
                                    {accept: 'n'}
                                ])
                            })

                            it('Red should win with 1 point', async function () {
                                const {players, coord, game} = this.fixture
                                await coord.runGame(players, game)
                                expect(game.getWinner()).to.equal(Red)
                                expect(game.finalValue).to.equal(1)
                            })

                        })

                        describe('White cancels', () => {

                            beforeEach(function () {
                                const {responses} = this.fixture
                                extend(responses.White, [
                                    {accept: 'y'}
                                ])
                            })

                            it.skip('should not call gameEnd if game is canceled after turnEnd', function (done) {
                                const {players, coord, game} = this.fixture
                                const cancelErr = new Error('test')
                                
                                //const {decideDouble} = players.White
                                //players.White.decideDouble = function (turn, game, match) {
                                //    this.holds.push(() => {
                                //        turn.cancel(cancelErr)
                                //        game.cancel(cancelErr)
                                //    })
                                //    return decideDouble.call(players.White, turn, game, match)
                                //}
                                players.White.on('doubleAccepted', (turn, game) => {
                                    console.log('doubleAccepted')
                                    turn.cancel(cancelErr)
                                })
                                //players.White.on('doubleDeclined', (turn, game, match) => {
                                //    //if (true || turn.isDoubleDeclined) {
                                //        console.log('fooooo')
                                //        turn.cancel(cancelErr)
                                //        game.cancel(cancelErr)
                                //        console.log(game.meta())
                                //        //}
                                //})
                                players.White.on('gameEnd', () => {
                                    done(new Error('test failed'))
                                })
                                coord.runGame(players, game).then(done).catch(err => {
                                    console.log(err)
                                    expect(err).to.equal(cancelErr)
                                    done()
                                })
                            })
                        })
                    })
                })
            })

            describe('RedWinWith66', () => {

                beforeEach(function () {
                    this.load('RedWinWith66')
                })

                describe('White rolls 6,1, moves 13:6, 8:', () => {

                    beforeEach(function () {
                        this.setRolls([[6, 1]])
                        const {responses} = this.fixture
                        extend(responses.White, [
                            {origin: '13'},
                            {face:    '6'},
                            {origin:  '8'},
                            {finish:  'f'}
                        ])
                    })

                    describe('Red doubles', () => {

                        beforeEach(function () {
                            const {responses} = this.fixture
                            extend(responses.Red, [
                                {action: 'd'}
                            ])
                        })

                        describe('White accepts', () => {

                            beforeEach(function () {
                                const {responses} = this.fixture
                                extend(responses.White, [
                                    {accept: 'y'}
                                ])
                            })

                            describe('Red rolls 6,6, moves 6:, 6:, 6:, 6:', () => {

                                beforeEach(function () {
                                    const {responses} = this.fixture
                                    this.addRoll([6, 6])
                                    extend(responses.Red, [
                                        {origin: '6'},
                                        {origin: '6'},
                                        {origin: '6'},
                                        {origin: '6'},
                                        {finish: 'f'}
                                    ])
                                })

                                it('Red should win backgammon with 8 points', async function () {
                                    const {players, coord, game} = this.fixture
                                    await coord.runGame(players, game)
                                    expect(game.getWinner()).to.equal(Red)
                                    expect(game.finalValue).to.equal(8)
                                })
                            })

                            describe('Red rolls 6,5, moves 6:', () => {

                                beforeEach(function () {
                                    this.addRoll([6, 5])
                                    const {responses} = this.fixture
                                    extend(responses.Red, [
                                        {origin: '6'},
                                        {finish: 'f'}
                                    ])
                                })

                                describe('White rolls 1,2, moves 24:2, 24:', () => {

                                    beforeEach(function () {
                                        this.addRoll([1, 2])
                                        const {responses} = this.fixture
                                        extend(responses.White, [
                                            {action:  'r'},
                                            {origin: '24'},
                                            {face:    '2'},
                                            {origin: '24'},
                                            {finish:  'f'}
                                        ])
                                    })

                                    describe('Red rolls (no-option) 6,6, moves 6:, 6:, 6:', () => {

                                        beforeEach(function () {
                                            this.addRoll([6, 6])
                                            const {responses} = this.fixture
                                            extend(responses.Red, [
                                                {origin: '6'},
                                                {origin: '6'},
                                                {origin: '6'},
                                                {finish: 'f'}
                                            ])
                                        })

                                        it('Red should win doubled backgammon with 8 points', async function () {
                                            const {players, coord, game} = this.fixture
                                            await coord.runGame(players, game)
                                            expect(game.cubeValue).to.equal(2)
                                            expect(game.finalValue).to.equal(8)
                                        })
                                    })
                                })
                            })
                        })
                    })

                    describe('Red rolls 6, 6, moves 6:, 6:, 6:, 6:', () => {

                        beforeEach(function () {
                            this.addRoll([6, 6])
                            const {responses} = this.fixture
                            extend(responses.Red, [
                                {action: 'r'},
                                {origin: '6'},
                                {origin: '6'},
                                {origin: '6'},
                                {origin: '6'},
                                {finish: 'f'}
                            ])  
                        })

                        it('Red should win backgammon with 4 points', async function () {
                            const {players, coord, game} = this.fixture
                            await coord.runGame(players, game)
                            expect(game.getWinner()).to.equal(Red)
                            expect(game.finalValue).to.equal(4)
                        })
                    })
                })
            })

        })
    })

    describe('#runMatch', () => {

        beforeEach(function () {
            update(this.fixture, {
                match: new Match(1, {roller: this.fixture.roller})
            })
        })

        describe('EitherOneMoveWin', () => {

            beforeEach(function () {
                this.fixture.match.opts.startState = States.EitherOneMoveWin
            })

            describe('RandomRobot', () => {

                beforeEach(function () {
                    const r1 = newRando(White)
                    const r2 = newRando(Red)
                    extend(this.objects, [r1, r2])
                    update(this.fixture, {
                        players: {
                           White: r1
                         , Red  : r2
                        }
                    })
                })

                it('should play 3 point match', async function () {
                    const {coord, match, players} = this.fixture
                    match.total = 3
                    await coord.runMatch(match, players)
                    expect(match.hasWinner()).to.equal(true)
                })
            })

            describe('White rolls 2,1, moves 1:2', () => {

                beforeEach(function () {
                    this.setRolls([[2, 1]])
                    const {players} = this.fixture
                    extend(players.White.moves, [
                        pointMove(White, 1, 2)
                    ])
                })

                it('White should win', async function () {
                    const {players, coord, match} = this.fixture
                    await coord.runMatch(match, players.White, players.Red)
                    expect(match.getWinner()).to.equal(White)
                })

                it('record match to expected file with isRecord=true', async function () {
                    const {players, coord, match} = this.fixture
                    coord.opts.isRecord = true
                    await coord.runMatch(match, players.White, players.Red)
                    const matchDir = coord.getMatchDir(match)
                    const matchFile = resolve(matchDir, 'match.json')
                    const gameFile = resolve(matchDir, 'game_1.json')
                    expect(fs.existsSync(matchFile)).to.equal(true)
                    expect(fs.existsSync(gameFile)).to.equal(true)
                })
            })
        })
    })
})
