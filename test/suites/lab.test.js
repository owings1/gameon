/**
 * gameon - test suite - lab helper
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
    requireSrc,
    MockPrompter,
    noop,
    tmpDir,
    States
} = TestUtil

const chalk = require('chalk')
const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {resolve} = path

describe('-', () => {

    const Constants = requireSrc('lib/constants')
    const Core      = requireSrc('lib/core')
    const Lab       = requireSrc('term/lab')
    const Menu      = requireSrc('term/menu')

    const {Red, White} = Constants

    const {Board} = Core

    var board
    var lab
    var recordDir

    beforeEach(() => {
        board = Board.setup()
        recordDir = tmpDir()
        const opts = {
            board
          , recordDir
        }
        lab = new Lab(opts)
        lab.logger.loglevel = 0
        lab.logger.writeStdout = () => {}
        lab.logger.console = {log: () => {}}
    })

    afterEach(async () => {
        await fse.remove(recordDir)
    })

    describe('#constructor', () => {

        it('should construct with no opts', () => {
            new Lab
        })
    })

    describe('#interactive', () => {

        it('should quit with q', async () => {
            lab.prompt = MockPrompter({input: 'q'})
            await lab.interactive()
        })

        it('should continue with empty, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: ''},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should continue with ?, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: '?'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should continue with i, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 'i'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should continue with crap, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 'crap'},
                {input: 'q'}
            ])
            lab.logger.loglevel = -1
            await lab.interactive()
        })

        it('should switch to breadthTrees with x', async () => {
            lab.prompt = MockPrompter([
                {input: 'x'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(lab.opts.breadthTrees).to.equal(true)
        })

        it('should switch to breadthTrees=false with x,x', async () => {
            lab.prompt = MockPrompter([
                {input: 'x'},
                {input: 'x'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(lab.opts.breadthTrees).to.equal(false)
        })

        it('should continue with p, q, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: 'q'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should continue with p, from=6 dest=q, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'q'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should continue with p, from=h color=w dest=q, q with right setup', async () => {
            board.setStateString(States.RedHasWinner12)
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: 'h', color: 'w', dest: 'q'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should continue with u, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 'u'},
                {input: 'q'}
            ])
            lab.logger.loglevel = -1
            await lab.interactive()
        })

        it('should continue with f, then quit with q and have persp Red', async () => {
            lab.prompt = MockPrompter([
                {input: 'f'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(lab.persp).to.equal(Red)
        })
        
        it('should set string with s <string>, then quit with q and have board with correct string', async () => {
            lab.prompt = MockPrompter([
                {input: 's'},
                {state: States.RedHasWinner12},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.RedHasWinner12)
        })

        it('should prompt state with s, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 's'},
                {state: 'q'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should prompt state with s, set initial with i', async () => {
            lab.prompt = MockPrompter([
                {input: 's'},
                {state: 'i'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should prompt state with s, set initial with initial', async () => {
            lab.prompt = MockPrompter([
                {input: 's'},
                {state: 'initial'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should generate state with s, g', async function () {
            this.timeout(20000)
            lab.prompt = MockPrompter([
                {input: 's'},
                {state: 'g'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should roll dice with d then 1,2, then quit with q', async () => {
            lab.prompt = MockPrompter([
                {input: 'd'},
                {dice: '1,2'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should roll dice with d then 1,2, then record last result', async () => {
            lab.prompt = MockPrompter([
                {input: 'd'},
                {dice: '1,2'},
                {input: 'w'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(lab.lastOutDir).to.contain('lab-')
        })

        it('should place 6 to bar', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should place 6 to bar then undo and be back to intial', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'u'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to bar then bar to 6 and be back to initial', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: 'b', dest: '6'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to bar, 12 to bar then bar w to 6, bar to 12 and be back to initial', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: '12', dest: 'b'},
                {input: 'p'},
                {from: 'b', color: 'w', dest: '6'},
                {input: 'p'},
                {from: 'b', dest: '12'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to home, 12 to home then home w to 6, home to 12 and be back to initial', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'h'},
                {input: 'p'},
                {from: '12', dest: 'h'},
                {input: 'p'},
                {from: 'h', color: 'w', dest: '6'},
                {input: 'p'},
                {from: 'h', dest: '12'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to home, 12 to home then home r to 12, home to 6 and be back to initial', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'h'},
                {input: 'p'},
                {from: '12', dest: 'h'},
                {input: 'p'},
                {from: 'h', color: 'r', dest: '12'},
                {input: 'p'},
                {from: 'h', dest: '6'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to bar, 12 to bar, start bar w but quit', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: '12', dest: 'b'},
                {input: 'p'},
                {from: 'b', color: 'q'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should place 6 to bar, 12 to bar, start bar but throw with bad color', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: '12', dest: 'b'},
                {input: 'p'},
                {from: 'b', color: 'x'}
            ])
            const err = await getErrorAsync(() => lab.interactive())
            expect(err.message.toLowerCase()).to.contain('color')
        })

        it('should place 6 to home, 19 to home, then home white 2', async () => {
            lab.prompt = MockPrompter([
                {input: 'p'},
                {from: '6', dest: 'h'},
                {input: 'p'},
                {from: '19', dest: 'h'},
                {input: 'p'},
                {from: 'h', color: 'w', dest: '2'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should roll robot dice 1,2', async () => {
            lab.prompt = MockPrompter([
                {input: 'D'},
                {dice: '1,2'},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should roll robot dice 4,4 and record result', async () => {
            lab.prompt = MockPrompter([
                {input: 'D'},
                {dice: '1,2'},
                {input: 'w'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(lab.lastOutDir).to.contain('lab-')
        })

        it('should do rollout with 1 game', async () => {
            lab.prompt = MockPrompter([
                {input: 'r 1'},
                {rollsFile: ''},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should do rollout with 1 game with rolls file', async () => {
            lab.prompt = MockPrompter([
                {input: 'r 1'},
                {rollsFile: resolve(__dirname, '../rolls.json')},
                {input: 'q'}
            ])
            await lab.interactive()
        })

        it('should invert board and be at initial', async () => {
            lab.prompt = MockPrompter([
                {input: 'F'},
                {input: 'q'}
            ])
            await lab.interactive()
            expect(board.stateString()).to.equal(States.Initial)
        })
    })

    describe('#chalkDiff', () => {

        // coverage, probably will refactor away
        it('should be green +2 for 2', () => {
            const res = lab.chalkDiff(2)
            const exp = chalk.green('+2')
            expect(res).to.equal(exp)
        })

        it('should be red -2 for -2', () => {
            const res = lab.chalkDiff(-2)
            const exp = chalk.red('-2')
            expect(res).to.equal(exp)
        })

        it('should be yellow 0 for 0', () => {
            const res = lab.chalkDiff(0)
            const exp = chalk.yellow('0')
            expect(res).to.equal(exp)
        })
    })

    describe('#diceCommand', () => {

        it('should with many moves for WhiteManyMoves12', async () => {
            lab.board.setStateString(States.WhiteManyMoves12)
            await lab.diceCommand(true, '1,2')
            const records = await lab.fetchLastRecords()
            const res = JSON.parse(records['turn.json'])
            expect(res.turn.allowedEndStates).to.have.length(33)
        })

        it('should not have lastResult for cant move', async () => {
            lab.board.setStateString(States.WhiteCantMove)
            await lab.diceCommand(false, '1,2')
            expect(!!lab.fetchLastRecords).to.equal(false)
        })
    })

    describe('#draw', () => {

        describe('coverage', () => {
            it('isPrint=true, canErase=true', async () => {
                lab.canErase = true
                await lab.draw(true)
            })
            it('isPrint=false', async () => {
                await lab.draw(false)
            })
        })
    })

    describe('#formatRankDiff', () => {

        describe('coverage', () => {
            it('value=null', () => {
                const res = lab.formatRankDiff(null)
                expect(res).to.equal('')
            })
        })
    })

    describe('#getBuiltInStateString', () => {

        it('should return intial for Initial', () => {
            const res = lab.getBuiltInStateString('Initial')
            expect(!!res).to.equal(true)
            expect(res).to.equal(Constants.BoardStrings.Initial)
        })
    })

    describe('#getRankDiff', () => {

        describe('coverage', () => {

            it('myRank=null', () => {
                const res = lab.getRankDiff({myRank: null})
                expect(res).to.equal(null)
            })
        })
    })

    describe('#moveDesc', () => {

        it('should contain bar if origin is -1', () => {
            const res = lab.moveDesc({origin: -1, face: 2})
            expect(res).to.contain('bar')
        })

        it('should contain home if origin is 23 and face is 2', () => {
            const res = lab.moveDesc({origin: 23, face: 2})
            expect(res).to.contain('home')
        })
    })

    describe('#newRobot', () => {

        it('should return custom robot with opts.isCustomRobot and opts.robots', () => {
            const configs = Menu.robotsDefaults()
            configs.FirstTurnRobot.moveWeight = 0
            lab.opts.isCustomRobot = true
            lab.opts.robots = configs
            const robot = lab.newRobot(White)
            const delegate = robot.delegates.find(it => it.robot.name == 'FirstTurnRobot')
            expect(delegate.moveWeight).to.equal(0)
        })
    })

    describe('#parseNumRollouts', () => {

        describe('coverage', () => {

            it('empty param', () => {
                lab.parseNumRollouts()
            })

            it('param=1', () => {
                lab.parseNumRollouts('1')
            })
        })
    })

    describe('#runCommand', () => {

        describe('coverage', () => {

            it('input=q,isPrintFirst=true', async () => {
                await lab.runCommand('q', true)
            })
        })
    })

    describe('#setStateCommand', () => {

        it('should not prompt but catch err for bad param', async () => {
            var msg = ''
            lab.logger.error = (...args) => msg += args.join(' ')
            await lab.setStateCommand('asdf')
            expect(msg.toLowerCase()).to.contain('bad input')
        })
    })

    describe('#validateDice', () => {

        it('should validate [1,2]', () => {
            const res = lab.validateDice([1,2])
            expect(res).to.equal(true)
        })

        it('should invalidate [1,7]', () => {
            const res = lab.validateDice([1,7])
            expect(typeof res).to.equal('string')
        })
    })

    describe('#validatePlaceFrom', () => {

        it('should return err string for 7 from initial', () => {
            const result = lab.validatePlaceFrom('7')
            expect(typeof result).to.equal('string')
        })

        it('should return err string for b from initial', () => {
            const result = lab.validatePlaceFrom('b')
            expect(typeof result).to.equal('string')
        })

        it('should return true for b when one color has bar', () => {
            board.setStateString('A@R@@@@E@C@@@UE@@@S@T@@@@B@@')
            const result = lab.validatePlaceFrom('b')
            expect(result).to.equal(true)
        })

        it('should return err string for h from initial', () => {
            const result = lab.validatePlaceFrom('h')
            expect(typeof result).to.equal('string')
        })

        it('should return err string for invalid number', () => {
            const result = lab.validatePlaceFrom('horse')
            expect(typeof result).to.equal('string')
        })
    })

    describe('#validatePlaceTo', () => {

        it('with only white on bar should return true for from=b, value=6', () => {
            lab.board.setState28('A@R@@@@E@C@@@UE@@@S@T@@@@B@@')
            const result = lab.validatePlaceTo('6', {from: 'b'})
            expect(result).to.equal(true)
        })

        it('with only white on home should return true for from=h, value=6', () => {
            lab.board.setState28('@@R@@@@E@C@@@UE@@@S@T@@@@BA@')
            const result = lab.validatePlaceTo('6', {from: 'h'})
            expect(result).to.equal(true)
        })

        it('from initial should return true for from=6, value=5', () => {
            const result = lab.validatePlaceTo('5', {from: '6'})
            expect(result).to.equal(true)
        })

        it('should return err string for point out of range', () => {
            const result = lab.validatePlaceTo('50', {from: '6'})
            expect(typeof result).to.equal('string')
        })

        it('should return err string for from=6, value=12', () => {
            const result = lab.validatePlaceTo('12', {from: '6'})
            expect(typeof result).to.equal('string')
        })
    })

    describe('#validateStateString', () => {

        it('should return true for empty', () => {
            const result = lab.validateStateString()
            expect(result).to.equal(true)
        })

        it('should return string for asdf', () => {
            const result = lab.validateStateString('asdf')
            expect(typeof result).to.equal('string')
        })
    })

    describe('#writeLastResult', () => {

        it('should return false when no record dir', async () => {
            lab.opts.recordDir = null
            const res = await lab.writeLastResult()
            expect(res).to.equal(false)
        })

        it('should return false when no last result', async () => {
            const res = await lab.writeLastResult()
            expect(res).to.equal(false)
        })
    })
})