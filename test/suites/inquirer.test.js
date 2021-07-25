/**
 * gameon - test suite - custom inquirer
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
    ReadlineStub,
    requireSrc,
    update,
} = require('../util')

describe('inquirer', () => {

    const {inquirer} = requireSrc('term/inquirer')
    const {TermHelper} = requireSrc('term/draw')

    beforeEach(function () {
        this.rl = new ReadlineStub
        this.prompter = inquirer.createPromptModule({...this.rl})
        this.prompter.rl = this.rl
        this.term = new TermHelper(true)
        this.term.stdout = this.rl.output
        this.create = function () {
            const {questions, answers, opts} = this.fixture
            const promise = this.prompter.prompt(questions, answers, opts)
            this.ui = promise.ui
            return promise
        }
        this.run = function (before) {
            const promise = this.create()
            if (before) {
                before(this.rl)
            }
            return promise
        }
        this.fixture = {
            questions : {name: 'test'},
            opts      : {term: this.term},
        }
    })

    describe('module', () => {

        describe('#createPromptModule', () => {

            it('should set module.rl for rl in opt', function () {
                const rl = new ReadlineStub
                const prompter = this.prompter.createPromptModule({rl})
                expect(prompter.rl).to.equal(rl)
            })
        })

        describe('#prompt', () => {

            it('should return answers.test=foo', function () {
                return this.run(rl => {
                    rl.emit('line', 'foo')
                }).then(answers => {
                    expect(answers.test).to.equal('foo')
                })
            })

            it('should return error then set answers.test=foo', function () {
                this.fixture.questions.validate = value => value == 'foo' || 'test-error'
                return this.run(rl => {
                    rl.emit('line', 'bar')
                    rl.emit('line', 'foo')
                }).then(answers => {
                    expect(this.rl.output.raw).to.contain('test-error')
                    expect(answers.test).to.equal('foo')
                })
            })
        })

        describe('#registerPrompt', () => {

            it('should register mock input class', function () {
                class MyPrompt extends this.prompter.prompts.input {}
                this.prompter.registerPrompt('input', MyPrompt)
                return this.run(rl => {
                    expect(this.ui.activePrompt.constructor).to.equal(MyPrompt)
                    rl.emit('line', 'foo')
                })
            })
        })
    })

    describe('Separator', () => {

        const {Separator} = inquirer

        beforeEach(function () {
            this.sep = new Separator
        })

        describe('#text', () => {

            it('should set line', function () {
                this.sep.text('test')
                expect(this.sep.line).to.equal('test')
            })
        })
    })

    describe('UI', () => {

        describe('#onResize', () => {

            it('screen should render _lastRender', function () {
                // coverage
                return this.run(rl => {
                    this.ui.activePrompt.screen._lastRender = ['test-resize', '']
                    this.ui.onResize()
                    rl.emit('line', 'foo')
                }).then(answers => {
                    expect(this.rl.output.raw).to.contain('test-resize')
                    expect(answers.test).to.equal('foo')
                })
            })
        })
    })
})