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
    stripAnsi,
    requireSrc,
    update,
} = require('../util')

describe('inquirer', () => {

    const {inquirer} = requireSrc('term/inquirer')
    const {TermHelper} = requireSrc('term/draw')

    beforeEach(function () {
        this.rl = new ReadlineStub
        this.output = this.rl.output
        this.input = this.rl.input
        this.inquirer = inquirer.createPromptModule({rl: this.rl})
        this.term = new TermHelper(true)
        this.term.output = this.rl.output
        this.create = function () {
            const {questions, answers, opts} = this.fixture
            const promise = this.inquirer.prompt(questions, answers, opts)
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

            it('should set module.opt.rl for rl in opt', function () {
                const rl = new ReadlineStub
                const prompter = this.inquirer.createPromptModule({rl})
                expect(prompter.opt.rl).to.equal(rl)
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
                    expect(this.output.raw).to.contain('test-error')
                    expect(answers.test).to.equal('foo')
                })
            })

            it('should reject when UI constructor throws', function (done) {
                const exp = new Error('test')
                this.inquirer.ui.Prompt = function () { throw exp }
                this.run().catch(err => {
                    expect(err).to.equal(exp)
                    done()
                })
            })
        })

        describe('#registerPrompt', () => {

            it('should register mock input class', function () {
                class MyPrompt extends this.inquirer.prompts.input {}
                this.inquirer.registerPrompt('input', MyPrompt)
                return this.run(rl => {
                    expect(this.ui.activePrompt.constructor).to.equal(MyPrompt)
                    rl.emit('line', 'foo')
                })
            })
        })
    })

    describe('ScreenManager', () => {

        const {ScreenManager} = inquirer

        beforeEach(function () {
            this.create = function (opts) {
                this.screen = new ScreenManager(this.rl, {...this.fixture.opts, ...opts})
                return this.screen
            }
        })

        describe('#onResize', () => {
            it('should reset isFirstRender on second arg true', function () {
                const screen = this.create()
                    .render('test-content')
                // hack _lasttRender property so it wont re-render
                screen._lastRender = null
                screen.onResize(null, true)
                expect(screen.isFirstRender).to.equal(true)
            })
        })

        describe('#render', () => {

            it('should render with term disabled', function () {
                this.term.enabled = false
                this.create()
                    .render('test-content')
                expect(this.output.raw).to.contain('test-content')
            })

            it('should render with indent=2', function () {
                this.create({indent: 2})
                    .render('test-content')
                expect(this.output.raw).to.contain('test-content')
            })

            it('shoud render with rl.line', function () {
                // coverage
                this.rl.line = 'test-line'
                this.rl.cursor = this.rl.line.length
                this.rl._getCursorPos = function () {
                    return {cols: this.line.length, rows: 0}
                }
                this.create()
                    .render('test-content' + '\n' + this.rl.line)
                expect(this.output.raw)
                    .to.contain('test-content').and
                    .to.contain('test-line')
            })

            it('should split line with maxWidth 10', function () {
                const content = '0123456789abc'
                this.create({maxWidth: 10})
                    .render(content)
                expect(this.output.raw)
                    .to.contain('0123456789\n').and
                    .to.contain('abc')
            })

            it('should render with clearMaxWidth', function () {
                // coverage
                const content = '0123456789abc'
                this.create({maxWidth: 10, clearMaxWidth: true})
                    .render(content)
                    .clean()
                expect(this.output.raw)
                    .to.contain('0123456789\n').and
                    .to.contain('abc')
            })

            it('should render with line at maxWidth with indent 2', function () {
                // coverage
                const content = '0123456789'
                this.create({maxWidth: 10, indent: 2})
                    .render(content)
                expect(this.output.raw).to.contain('0123456789')
            })
        })
    })

    describe('Separator', () => {

        const {Separator} = inquirer

        beforeEach(function () {
            this.create = function(...args) {
                this.sep = new Separator(...args)
                return this.sep
            }
        })

        describe('line', () => {

            it('should use char in constructor, default length 15', function () {
                expect(stripAnsi(this.create('x').line)).to.equal('xxxxxxxxxxxxxxx')
            })

            it('should set to blank when empty char in constructor', function () {
                expect(this.create('').line).to.equal('')
            })
        })

        describe('#text', () => {

            it('should set line', function () {
                expect(this.create().text('test').line).to.equal('test')
            })
        })

        describe('#when', () => {

            it('should set when with argument false', function () {
                expect(this.create().when(false).when()).to.equal(false)
            })

            it('should return true by default', function () {
                expect(this.create().when()).to.equal(true)
            })

            it('should set when by function returning false', function () {
                expect(this.create().when(() => false).when()).to.equal(false)
            })
        })
    })

    describe('UI', () => {

        const {Prompt} = inquirer.ui

        describe('#constructor', () => {

            it('should construct with only prompts argument', function () {
                // coverage
                let ui
                try {
                    ui = new Prompt(this.inquirer.prompts)
                } finally {
                    if (ui) {
                        ui.close()
                    }
                }
            })

            it('should construct with empty object as prompter argument', function () {
                // coverage
                let ui
                try {
                    ui = new Prompt(this.inquirer.prompts, null, {})
                } finally {
                    if (ui) {
                        ui.close()
                    }
                }
            })
        })

        describe('#close', () => {

            it('should pass if activePrompt.screen.done is missing', function () {
                // coverage
                let ui
                try {
                    ui = new Prompt(this.inquirer.prompts)
                    ui.activePrompt = {screen: {}}
                } finally {
                    if (ui) {
                        ui.close()
                    }
                }
                ui.close()
            })
        })

        describe('#onResize', () => {

            it('screen should render _lastRender', function () {
                // coverage
                return this.run(rl => {
                    this.ui.activePrompt.screen._lastRender = ['test-resize', '']
                    this.ui.onResize()
                    rl.emit('line', 'foo')
                }).then(answers => {
                    expect(this.output.raw).to.contain('test-resize')
                    expect(answers.test).to.equal('foo')
                })
            })

            it('should pass when no active prompt', function () {
                return this.run(rl => {
                    rl.emit('line', 'foo')
                }).then(answers => {
                    expect(Boolean(this.ui.activePrompt)).to.equal(false)
                    this.ui.onResize()
                    expect(answers.test).to.equal('foo')
                })
            })

            it('should pass active prompt screen has no resize', function () {
                return this.run(rl => {
                    this.ui.activePrompt.screen.onResize = null
                    this.ui.onResize()
                    rl.emit('line', 'foo')
                })
            })
        })
    })
})