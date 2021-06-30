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

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')

const {resolve} = path

describe('Lab', () => {

    const Constants = requireSrc('lib/constants')
    const Core      = requireSrc('lib/core')
    const Lab       = requireSrc('term/lab')

    const {Red, White} = Constants

    const {Board} = Core

    var board
    var lab

    beforeEach(() => {
        board = Board.setup()
        lab = new Lab({board})
        lab.logger.loglevel = 0
        lab.logger.writeStdout = () => {}
        lab.logger.console = {log: () => {}}
    })

    it('should construct', () => {
        expect(!!lab).to.equal(true)
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

        it('should generate state with s, g', async () => {
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
    })
})