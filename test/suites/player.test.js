/**
 * gameon - test suite - player base class
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
    makeRandomMoves,
    requireSrc
} = TestUtil

const Constants = requireSrc('lib/constants')
const Core   = requireSrc('lib/core')
const Player = requireSrc('lib/player')

const {White, Red} = Constants
const {Match, Game} = Core

const players = {}

beforeEach(() => {
    players.White = new Player(White)
    players.Red = new Player(Red)
})

afterEach(async () => {
    await Promise.all(Object.values(players).map(player => player.destroy()))
})

describe('#decideDouble', () => {

    it('should not throw', async () => {
        await players.White.decideDouble()
    })
})

describe('#meta', () => {

    it('should return color White for white player', () => {
        const result = players.White.meta()
        expect(result.color).to.equal(White)
    })

    it('should return Player for name', () => {
        const result = players.White.meta()
        expect(result.name).to.equal('Player')
    })
})

describe('#playRoll', () => {

    it('should throw NotImplemented', async () => {
        const err = await getError(() => players.White.playRoll())
        expect(err.message).to.equal('NotImplemented')
    })
})

describe('#rollTurn', () => {

    it('should roll turn', async () => {
        const game = new Game({roller: () => [1, 6]})
        makeRandomMoves(game.firstTurn(), true)
        const turn = game.nextTurn()
        await players.Red.rollTurn(turn, game)
        expect(turn.isRolled).to.equal(true)
    })
})

describe('#turnOption', () => {

    it('should not throw', async () => {
        await players.White.turnOption()
    })
})

describe('events', () => {

    
    describe('gameStart', () => {

        it('should set thisGame to game', () => {
            const game = new Game
            players.White.emit('gameStart', game, null, players)
            expect(players.White.thisGame).to.equal(game)
        })

        it('should set white opponent to red', () => {
            const game = new Game
            players.White.emit('gameStart', game, null, players)
            expect(players.White.opponent).to.equal(players.Red)
        })
    })

    describe('matchStart', () => {

        it('should set thisMatch to match', () => {
            const match = new Match(1)
            players.White.emit('matchStart', match, players)
            expect(players.White.thisMatch).to.equal(match)
        })
    })
})
