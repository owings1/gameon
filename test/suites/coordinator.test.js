const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    requireSrc,
    tmpDir,
    tmpFile,
    States
} = TestUtil

const fse = require('fs-extra')
const fs = require('fs')
const {resolve} = require('path')

const Constants   = requireSrc('lib/constants')
const Core        = requireSrc('lib/core')
const Coordinator = requireSrc('lib/coordinator')
const Player      = requireSrc('lib/player')
const Util        = requireSrc('lib/util')

const {White, Red, PointOrigins} = Constants
const {Match, Game, Dice} = Core

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

const players = {}

var coordinator

beforeEach(() => {
    players.White = new MockPlayer(White)
    players.Red = new MockPlayer(Red)
    coordinator = new Coordinator
    coordinator.logger.loglevel = 1
})

afterEach(async () => {
    await Promise.all(Object.values(players).map(player => player.destroy()))
})


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
})