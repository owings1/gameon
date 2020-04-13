const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    MockPrompter,
    States
} = TestUtil

const Menu        = requireSrc('term/menu')
const Draw        = requireSrc('term/draw')
const TermPlayer  = requireSrc('term/player')

const Core        = requireSrc('lib/core')
const Coordinator = requireSrc('lib/coordinator')
const Robot       = requireSrc('robot/player')

const {White, Red, Match, Game, Board, Turn} = Core

const {RandomRobot} = Robot

describe('Draw', () => {

    describe('#drawBoard', () => {

        // these are just for coverage
        var game

        beforeEach(() => game = new Game)

        it('should not barf for initial board', () => {
            Draw.drawBoard(game)
        })

        it('should not barf for RedHitComeIn3', () => {
            game.board.setStateString(States.RedHitComeIn3)
            Draw.drawBoard(game)
        })

        it('should not barf for WhiteCornerCase24', () => {
            game.board.setStateString(States.WhiteCornerCase24)
            Draw.drawBoard(game)
        })

        it('should not barf for WhiteGammon1', () => {
            game.board.setStateString(States.WhiteGammon1)
            Draw.drawBoard(game)
        })

        it('should not barf for RedGammon1', () => {
            game.board.setStateString(States.RedGammon1)
            Draw.drawBoard(game)
        })

        it('should not barf when game isCrawford', () => {
            game.opts.isCrawford = true
            Draw.drawBoard(game)
        })

        it('should not barf when cubeOwner is red', () => {
            game.cubeOwner = Red
            Draw.drawBoard(game)
        })

        it('should not barf when cubeOwner is white', () => {
            game.cubeOwner = White
            Draw.drawBoard(game)
        })

        it('should not barf when match is passed', () => {
            Draw.drawBoard(game, new Match(1))
        })
    })
})

describe('Menu', () => {

    var player
    var menu

    beforeEach(() => {
        menu = new Menu
    })

    describe('#doMainIfEquals', () => {

        // coverage tricks

        var oldMain

        before(() => {
            oldMain = Menu.main
        })

        afterEach(() => {
            Menu.main = oldMain
        })

        it('should call mock main', () => {
            var isCalled
            Menu.main = () => isCalled = true
            Menu.doMainIfEquals(null, null)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#main', () => {

        // coverage tricks

        it('should call mainMenu', () => {
            var isCalled = false
            menu.mainMenu = () => isCalled = true
            Menu.main(menu)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#mainMenu', () => {

        it('should quit', async () => {
            menu.prompt = MockPrompter({mainChoice: 'quit'})
            await menu.mainMenu()
        })

        it('should go to new local match menu, then come back, then quit', async () => {
            menu.prompt = MockPrompter([
                {mainChoice: 'newLocal'},
                {matchChoice: 'quit'},
                {mainChoice: 'quit'}
            ])
            await menu.mainMenu()
        })

        it('should invalidate match id abcd with joinOnline', async () => {
            menu.prompt = MockPrompter([
                {mainChoice: 'joinOnline'},
                {matchId: 'abcd'}
            ])
            const err = await getErrorAsync(() => menu.mainMenu())
            expect(err.message).to.contain('Validation failed for matchId')
        })

    })

    describe('#matchMenu', () => {

        
        it('should set match total to 5', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'total'},
                {total: '5'},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.total).to.equal(5)
        })

        it('should invalidate total=-1', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'total'},
                {total: '-1'}
            ])
            const err = await getErrorAsync(() => menu.matchMenu())
            expect(err.message).to.contain('Validation failed for total')
        })

        it('should set isJacoby to true', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'isJacoby'},
                {isJacoby: true},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.isJacoby).to.equal(true)
        })

        it('should set isCrawford to false', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'isCrawford'},
                {isCrawford: false},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.isCrawford).to.equal(false)

        })

        it('should quit', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
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

        it('should call inquirer.prompt with array and set menu._prompt', () => {
            var q
            inquirer.prompt = questions => q = questions
            menu.prompt()
            expect(Array.isArray(q)).to.equal(true)
        })
    })
})

describe('Coordinator', () => {

    var coord
    var r1
    var r2

    beforeEach(() => {
        coord = new Coordinator
        r1 = new RandomRobot(White)
        r2 = new RandomRobot(Red)
        t1 = new TermPlayer(White)
        t2 = new TermPlayer(Red)
        t1.logger.loglevel = 1
        t2.logger.loglevel = 1
        t1.stdout = {write: () => {}}
        t2.stdout = t1.stdout
    })

    describe('#runMatch', () => {
        it('should play 3 point match with mock runGame', async () => {
            const match = new Match(3)
            coord.runGame = (players, game) => {
                game.board.setStateString(States.EitherOneMoveWin)
                makeRandomMoves(game.firstTurn(), true)
            }
            await coord.runMatch(match, r1, r2)
            expect(match.hasWinner()).to.equal(true)
        })
    })

    describe('#runGame', () => {

        var game

        beforeEach(() => {
            game = new Game
        })

        it('should play RedWinWith66 for white first move 6,1 then red 6,6', async () => {
            game.board.setStateString(States.RedWinWith66)
            game._rollFirst = () => [6, 1]
            t1.rollTurn = turn => turn.setRoll([6, 6])
            t2.rollTurn = turn => turn.setRoll([6, 6])
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {face: '6'},
                {origin: '17'},
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
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
        })

        it('should end with white refusing double on second turn', async () => {
            game._rollFirst = () => [6, 1]
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {origin: '17'},
                {finish: 'f'},
                {accept: false}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
        })

        it('should play RedWinWith66 for white first move 6,1 then red double, white accept, red rolls 6,6 backgammon', async () => {
            game.board.setStateString(States.RedWinWith66)
            game._rollFirst = () => [6, 1]
            t1.rollTurn = turn => turn.setRoll([6, 6])
            t2.rollTurn = turn => turn.setRoll([6, 6])
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {face: '6'},
                {origin: '17'},
                {finish: 'f'},
                {accept: true}
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

        it('should play RedWinWith66, white 6,1, red double, white accept, red 6,5, white 1,2, red cant double 6,6, backgammon', async () => {
            game.board.setStateString(States.RedWinWith66)
            game._rollFirst = () => [6, 1]
            const rolls = [
                [6, 5],
                [1, 2],
                [6, 6]
            ]
            t1.rollTurn = turn => turn.setRoll(rolls.shift())
            t2.rollTurn = turn => turn.setRoll(rolls.shift())
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '12'},
                {face: '6'},
                {origin: '17'},
                {finish: 'f'},
                // accept
                {accept: true},
                // white's turn
                {action: 'r'},
                {origin: '1'},
                {face: '2'},
                {origin: '1'},
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
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
            expect(game.cubeValue).to.equal(2)
            expect(game.finalValue).to.equal(8)
        })
    })
})

describe('TermPlayer', () => {

    var player

    beforeEach(() => {
        player = new TermPlayer(White)
        player.logger.loglevel = 1
        player.stdout = {write: () => {}}
    })

    describe('#describeMove', () => {

        it('should include \'bar\' if origin is -1', () => {
            const board = Board.fromStateString(States.WhiteCornerCase24)
            const move = board.buildMove(White, -1, 4)
            const result = player.describeMove(move)
            expect(result).to.contain('bar')
        })

        it('should inclue 1 and 3 if origin is 0 and face is 2', () => {
            const board = Board.setup()
            const move = board.buildMove(White, 0, 2)
            const result = player.describeMove(move)
            expect(result).to.contain('1')
            expect(result).to.contain('3')
        })

        it('should include \'home\' for red if origin is 0 and face is 2', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const move = board.buildMove(Red, 0, 2)
            const result = player.describeMove(move)
            expect(result).to.contain('home')
        })
    })

    describe('#playRoll', () => {

        var game

        beforeEach(() => {
            game = new Game
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
            game._rollFirst = () => [6, 1]
            player.prompt = MockPrompter([
                {origin: '12'},
                {origin: '17'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })

        it('should play first roll White 6,1 undo first then second with board as expected for 6 point', async () => {
            game._rollFirst = () => [6, 1]
            player.prompt = MockPrompter([
                {origin: '12'},
                {origin: 'u'},
                {origin: '12'},
                {origin: '17'},
                {finish: 'u'},
                {origin: '17'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
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
            inquirer.prompt = questions => q = questions
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

        it('should return true for true', async () => {
            player.prompt = MockPrompter({accept: true})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(true)
        })

        it('should return false for false', async () => {
            player.prompt = MockPrompter({accept: false})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptTurnOption', () => {

        it('should return false for r', async () => {
            player.prompt = MockPrompter({action: 'r'})
            const result = await player.promptTurnOption()
            expect(result).to.equal(false)
        })

        it('should return true for d', async () => {
            player.prompt = MockPrompter({action: 'd'})
            const result = await player.promptTurnOption()
            expect(result).to.equal(true)
        })
    })

    describe('#promptFace', () => {

        it('should return 3 for [3, 3, 3, 3] and not prompt', async () => {
            const result = await player.promptFace([3, 3, 3, 3])
            expect(result).to.equal(3)
        })

        it('should return 5 for 5 with [5, 6]', async () => {
            player.prompt = MockPrompter({face: '5'})
            const result = await player.promptFace([5, 6])
            expect(result).to.equal(5)
        })

        it('should fail validation for 3 with [1, 2]', async () => {
            player.prompt = MockPrompter({face: '3'})
            const err = await getErrorAsync(() => player.promptFace([1, 2]))
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
    })

    describe('#promptOrigin', () => {

        it('should return -1 for b with [-1]', async () => {
            player.prompt = MockPrompter({origin: 'b'})
            const result = await player.promptOrigin([-1])
            expect(result).to.equal(-1)
        })

        it('should return 0 for 1 with [0, 4]', async () => {
            player.prompt = MockPrompter({origin: '1'})
            const result = await player.promptOrigin([0, 4])
            expect(result).to.equal(0)
        })

        it('should return undo for u with [11, 12] canUndo=true', async () => {
            player.prompt = MockPrompter({origin: 'u'})
            const result = await player.promptOrigin([11, 12], true)
            expect(result).to.equal('undo')
        })

        it('should fail validation for 3 with [3, 4]', async () => {
            player.prompt = MockPrompter({origin: '3'})
            const err = await getErrorAsync(() => player.promptOrigin([3, 4]))
            expect(err.message).to.contain('Validation failed for origin')
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
})