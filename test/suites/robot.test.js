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

const Core  = requireSrc('lib/core')
const Robot = requireSrc('robot/player')

const {White, Red, Game} = Core

describe('Robot', () => {

    describe('#getMoves', () => {
        it('should throw NotImplemented', async () => {
            const robot = new Robot.Robot(White)
            const err = await getErrorAsync(() => robot.getMoves())
            expect(err.message).to.equal('NotImplemented')
        })
    })

    describe('#meta', () => {
        it('should say isRobot', () => {
            const robot = new Robot.Robot(White)
            const result = robot.meta()
            expect(result.isRobot).to.equal(true)
        })
    })
})

describe('#RandomRobot', () => {

    var game
    var robot

    beforeEach(() => {
        game = new Game
        robot = new Robot.RandomRobot(White)
    })

    describe('#playRoll', () => {

        it('should play legal move for first roll 6,1', async () => {
            game._rollFirst = () => [6, 1]
            const turn = game.firstTurn()
            await robot.playRoll(turn, game)
            turn.finish()
        })
    })
    
})