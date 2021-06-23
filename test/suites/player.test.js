const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
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
        const err = await getErrorAsync(() => players.White.playRoll())
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
