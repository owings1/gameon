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
const {
    expect,
    getError,
    requireSrc,
    MockPrompter,
    noop,
    NullOutput,
    tmpDir,
    States,
} = require('../util.js')

const {colors: {Chalk}} = require('utils-h')
const fs    = require('fs')
const fse   = require('fs-extra')
const path = {resolve} = require('path')

describe('Lab', () => {

    const Lab  = requireSrc('term/lab.js')
    const Menu = requireSrc('term/menu.js')
    const {Board} = requireSrc('lib/core.js')
    const {
        BoardStrings,
        Colors: {Red, White},
    } = requireSrc('lib/constants.js')

    beforeEach(function () {
        this.chalk = new Chalk({level: 2})
        this.board = Board.setup()
        this.recordDir = tmpDir()
        this.output = new NullOutput
        const opts = {
            board     : this.board,
            recordDir : this.recordDir,
            output    : this.output,
        }
        this.lab = new Lab(opts)
    })

    afterEach(async function () {
        await fse.remove(this.recordDir)
    })

    describe('#constructor', () => {

        it('should construct with no opts', function () {
            new Lab
        })
    })

    describe('#interactive', () => {

        beforeEach(function () {
            this.responses = []
            this.respond = function (...args) {
                args.flat().forEach(arg => this.responses.push(arg))
                return this
            }
            this.lab.prompt = MockPrompter(this.responses)
        })

        it('should quit with q', async function () {
            this.respond({input: 'q'})
            await this.lab.interactive()
        })

        it('should continue with empty, then quit with q', async function () {
            this.respond([
                {input: ''},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should continue with ?, then quit with q', async function () {
            this.respond([
                {input: '?'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should continue with i, then quit with q', async function () {
            this.respond([
                {input: 'i'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should continue with crap, then quit with q', async function () {
            this.respond([
                {input: 'crap'},
                {input: 'q'}
            ])
            this.lab.logger.logLevel = -1
            await this.lab.interactive()
        })

        it('should switch to breadthTrees with x', async function () {
            this.respond([
                {input: 'x'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.lab.opts.breadthTrees).to.equal(true)
        })

        it('should switch to breadthTrees=false with x,x', async function () {
            this.respond([
                {input: 'x'},
                {input: 'x'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.lab.opts.breadthTrees).to.equal(false)
        })

        it('should continue with p, q, then quit with q', async function () {
            this.respond([
                {input: 'p'},
                {from: 'q'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should continue with p, from=6 dest=q, then quit with q', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'q'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should continue with p, from=h color=w dest=q, q with right setup', async function () {
            this.board.setStateString(States.RedHasWinner12)
            this.respond([
                {input: 'p'},
                {from: 'h', color: 'w', dest: 'q'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should continue with u, then quit with q', async function () {
            this.respond([
                {input: 'u'},
                {input: 'q'}
            ])
            this.lab.logger.logLevel = -1
            await this.lab.interactive()
        })

        it('should continue with f, then quit with q and have persp Red', async function () {
            this.respond([
                {input: 'f'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.lab.persp).to.equal(Red)
        })
        
        it('should set string with s <string>, then quit with q and have board with correct string', async function () {
            this.respond([
                {input: 's'},
                {state: States.RedHasWinner12},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.RedHasWinner12)
        })

        it('should prompt state with s, then quit with q', async function () {
            this.respond([
                {input: 's'},
                {state: 'q'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should prompt state with s, set initial with i', async function () {
            this.respond([
                {input: 's'},
                {state: 'i'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should prompt state with s, set initial with initial', async function () {
            this.respond([
                {input: 's'},
                {state: 'initial'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should generate state with s, g', async function () {
            this.timeout(20000)
            this.respond([
                {input: 's'},
                {state: 'g'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should roll dice with d then 1,2, then quit with q', async function () {
            this.respond([
                {input: 'd'},
                {dice: '1,2'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should roll dice with d then 1,2, then record last result', async function () {
            this.respond([
                {input: 'd'},
                {dice: '1,2'},
                {input: 'w'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.lab.lastOutDir).to.contain('lab-')
        })

        it('should place 6 to bar', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should place 6 to bar then undo and be back to intial', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'u'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to bar then bar to 6 and be back to initial', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: 'b', dest: '6'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to bar, 12 to bar then bar w to 6, bar to 12 and be back to initial', async function () {
            this.respond([
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
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to home, 12 to home then home w to 6, home to 12 and be back to initial', async function () {
            this.respond([
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
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to home, 12 to home then home r to 12, home to 6 and be back to initial', async function () {
            this.respond([
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
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })

        it('should place 6 to bar, 12 to bar, start bar w but quit', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: '12', dest: 'b'},
                {input: 'p'},
                {from: 'b', color: 'q'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should place 6 to bar, 12 to bar, start bar but throw with bad color', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'b'},
                {input: 'p'},
                {from: '12', dest: 'b'},
                {input: 'p'},
                {from: 'b', color: 'x'}
            ])
            const err = await getError(() => this.lab.interactive())
            expect(err.message.toLowerCase()).to.contain('color')
        })

        it('should place 6 to home, 19 to home, then home white 2', async function () {
            this.respond([
                {input: 'p'},
                {from: '6', dest: 'h'},
                {input: 'p'},
                {from: '19', dest: 'h'},
                {input: 'p'},
                {from: 'h', color: 'w', dest: '2'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should roll robot dice 1,2', async function () {
            this.respond([
                {input: 'D'},
                {dice: '1,2'},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should roll robot dice 4,4 and record result', async function () {
            this.respond([
                {input: 'D'},
                {dice: '1,2'},
                {input: 'w'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.lab.lastOutDir).to.contain('lab-')
        })

        it('should do rollout with 1 game', async function () {
            this.respond([
                {input: 'r 1'},
                {rollsFile: ''},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should do rollout with 1 game with rolls file', async function () {
            this.respond([
                {input: 'r 1'},
                {rollsFile: resolve(__dirname, '../rolls.json')},
                {input: 'q'}
            ])
            await this.lab.interactive()
        })

        it('should invert board and be at initial', async function () {
            this.respond([
                {input: 'F'},
                {input: 'q'}
            ])
            await this.lab.interactive()
            expect(this.board.stateString()).to.equal(States.Initial)
        })
    })

    describe('#chalkDiff', () => {

        // coverage, probably will refactor away
        it('should be green +2 for 2', function () {
            const res = this.lab.chalkDiff(2)
            const exp = this.chalk.green('+2')
            expect(res).to.equal(exp)
        })

        it('should be red -2 for -2', function () {
            const res = this.lab.chalkDiff(-2)
            const exp = this.chalk.red('-2')
            expect(res).to.equal(exp)
        })

        it('should be yellow 0 for 0', function () {
            const res = this.lab.chalkDiff(0)
            const exp = this.chalk.yellow('0')
            expect(res).to.equal(exp)
        })
    })

    describe('#diceCommand', () => {

        it('should with many moves for WhiteManyMoves12', async function () {
            this.board.setStateString(States.WhiteManyMoves12)
            await this.lab.diceCommand(true, '1,2')
            const records = await this.lab.fetchLastRecords()
            const res = JSON.parse(records['turn.json'])
            expect(res.turn.allowedEndStates).to.have.length(33)
        })

        it('should not have lastResult for cant move', async function () {
            this.board.setStateString(States.WhiteCantMove)
            await this.lab.diceCommand(false, '1,2')
            expect(!!this.lab.fetchLastRecords).to.equal(false)
        })
    })

    describe('#draw', () => {

        describe('coverage', () => {

            it('isPrint=true, canErase=true', async function () {
                this.lab.canErase = true
                await this.lab.draw(true)
            })

            it('isPrint=false', async function () {
                await this.lab.draw(false)
            })
        })
    })

    describe('#formatRankDiff', () => {

        describe('coverage', () => {

            it('value=null', function () {
                const res = this.lab.formatRankDiff(null)
                expect(res).to.equal('')
            })
        })
    })

    describe('#getBuiltInStateString', () => {

        it('should return intial for Initial', function () {
            const res = this.lab.getBuiltInStateString('Initial')
            expect(Boolean(res)).to.equal(true)
            expect(res).to.equal(BoardStrings.Initial)
        })
    })

    describe('#getRankDiff', () => {

        describe('coverage', () => {

            it('myRank=null', function () {
                const res = this.lab.getRankDiff({myRank: null})
                expect(res).to.equal(null)
            })
        })
    })

    describe('#moveDesc', () => {

        it('should contain bar if origin is -1', function () {
            const res = this.lab.moveDesc({origin: -1, face: 2})
            expect(res).to.contain('bar')
        })

        it('should contain home if origin is 23 and face is 2', function () {
            const res = this.lab.moveDesc({origin: 23, face: 2})
            expect(res).to.contain('home')
        })
    })

    describe('#newRobot', () => {

        it('should return custom robot with opts.isCustomRobot and opts.robots', function () {
            const configs = Menu.robotsDefaults()
            configs.FirstTurnRobot.moveWeight = 0
            this.lab.opts.isCustomRobot = true
            this.lab.opts.robots = configs
            const robot = this.lab.newRobot(White)
            const delegate = robot.delegates.find(it => it.robot.name == 'FirstTurnRobot')
            expect(delegate.moveWeight).to.equal(0)
        })
    })

    describe('#parseNumRollouts', () => {

        describe('coverage', () => {

            it('empty param', function () {
                this.lab.parseNumRollouts()
            })

            it('param=1', function () {
                this.lab.parseNumRollouts('1')
            })
        })
    })

    describe('#runCommand', () => {

        describe('coverage', () => {

            it('input=q,isPrintFirst=true', async function () {
                await this.lab.runCommand('q', true)
            })
        })
    })

    describe('#setStateCommand', () => {

        it('should not prompt but catch err for bad param', async function () {                
            await this.lab.setStateCommand('asdf')
            expect(this.output.raw.toLowerCase()).to.contain('bad input')
        })
    })

    describe('#validateDice', () => {

        it('should validate [1,2]', function () {
            const res = this.lab.validateDice([1,2])
            expect(res).to.equal(true)
        })

        it('should invalidate [1,7]', function () {
            const res = this.lab.validateDice([1,7])
            expect(typeof res).to.equal('string')
        })
    })

    describe('#validatePlaceFrom', () => {

        it('should return err string for 7 from initial', function () {
            const result = this.lab.validatePlaceFrom('7')
            expect(typeof result).to.equal('string')
        })

        it('should return err string for b from initial', function () {
            const result = this.lab.validatePlaceFrom('b')
            expect(typeof result).to.equal('string')
        })

        it('should return true for b when one color has bar', function () {
            this.board.setStateString('A@R@@@@E@C@@@UE@@@S@T@@@@B@@')
            const result = this.lab.validatePlaceFrom('b')
            expect(result).to.equal(true)
        })

        it('should return err string for h from initial', function () {
            const result = this.lab.validatePlaceFrom('h')
            expect(typeof result).to.equal('string')
        })

        it('should return err string for invalid number', function () {
            const result = this.lab.validatePlaceFrom('horse')
            expect(typeof result).to.equal('string')
        })
    })

    describe('#validatePlaceTo', () => {

        it('with only white on bar should return true for from=b, value=6', function () {
            this.board.setState28('A@R@@@@E@C@@@UE@@@S@T@@@@B@@')
            const result = this.lab.validatePlaceTo('6', {from: 'b'})
            expect(result).to.equal(true)
        })

        it('with only white on home should return true for from=h, value=6', function () {
            this.board.setState28('@@R@@@@E@C@@@UE@@@S@T@@@@BA@')
            const result = this.lab.validatePlaceTo('6', {from: 'h'})
            expect(result).to.equal(true)
        })

        it('from initial should return true for from=6, value=5', function () {
            const result = this.lab.validatePlaceTo('5', {from: '6'})
            expect(result).to.equal(true)
        })

        it('should return err string for point out of range', function () {
            const result = this.lab.validatePlaceTo('50', {from: '6'})
            expect(typeof result).to.equal('string')
        })

        it('should return err string for from=6, value=12', function () {
            const result = this.lab.validatePlaceTo('12', {from: '6'})
            expect(typeof result).to.equal('string')
        })
    })

    describe('#validateStateString', () => {

        it('should return true for empty', function () {
            const result = this.lab.validateStateString()
            expect(result).to.equal(true)
        })

        it('should return string for asdf', function () {
            const result = this.lab.validateStateString('asdf')
            expect(typeof result).to.equal('string')
        })
    })

    describe('#writeLastResult', () => {

        it('should return false when no record dir', async function () {
            this.lab.opts.recordDir = null
            const res = await this.lab.writeLastResult()
            expect(res).to.equal(false)
        })

        it('should return false when no last result', async function () {
            const res = await this.lab.writeLastResult()
            expect(res).to.equal(false)
        })
    })
})