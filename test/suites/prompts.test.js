/**
 * gameon - test suite - custom inquirer prompts
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
const {objects: {update}} = require('@quale/core')
const {
    expect,
    getError,
    ReadlineStub,
    requireSrc,
} = require('../util.js')

describe('Prompts', () => {

    const Prompts = requireSrc('term/prompts')

    beforeEach(function () {
        this.rl = new ReadlineStub
        this.create = function () {
            this.prompt = new Prompts[this.fixture.type](this.fixture, this.rl)
            return this.prompt
        }
        this.run = function (before) {
            const promise = this.create().run()
            if (before) {
                before(this.rl)
            }
            return promise
        }
        this.fixture = {
            name: 'test',
            theme: 'Default',
        }
    })

    describe('InputPrompt', () => {

        beforeEach(function () {
            this.fixture.type = 'input'
        })

        it('should accept foo as input', function () {
            return this.run(rl =>
                rl.emit('line', 'foo')
            ).then(answer => {
                expect(answer).to.equal('foo')
            })
        })

        it('should use writeInvalid', function () {
            update(this.fixture, {
                validate     : value => value != 'bar',
                writeInvalid : () => 'test-invalid',
            })
            return this.run(rl => {
                rl.emit('line', 'bar')
                rl.emit('line', 'foo')
            }).then(answer => {
                expect(this.rl.output.raw)
                    .to.contain('test-invalid').and
                    .to.not.contain('bar')
                expect(answer).to.equal('foo')
            })
        })

        it('should use passthru as default writeInvalid', function () {
            this.fixture.validate = value => value != 'bar'
            return this.run(rl => {
                rl.emit('line', 'bar')
                rl.emit('line', 'foo')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('bar')
                expect(answer).to.equal('foo')
            })
        })

        it('should render cancel.message on cancel', function () {
            this.fixture.cancel = {char: '`', message: 'test-cancel-message'}
            return this.run(({input}) => {
                input.emit('keypress', '`')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-cancel-message')
            })
        })

        it('should render transformer value', function () {
            this.fixture.transformer = () => 'transformed-value'
            return this.run(rl =>
                rl.emit('line', 'foo')
            ).then(answer => {
                expect(this.rl.output.raw).to.contain('transformed-value')
                expect(answer).to.equal('foo')
            })
        })

        it('should not render input when mute=true', function () {
            this.fixture.mute = true
            return this.run(rl =>
                rl.emit('line', 'foo')
            ).then(answer => {
                expect(this.rl.output.raw).to.not.contain('foo')
                expect(answer).to.equal('foo')
            })
        })

        it('should render error message', function () {
            this.fixture.validate = value => value == 'foo' || 'test-error-message'
            return this.run(rl => {
                rl.emit('line', 'bar')
                rl.emit('line', 'foo')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-error-message')
                expect(answer).to.equal('foo')
            })
        })

        it('should close ok when spin=true', function () {
            update(this.fixture, {
                spin: true,
            })
            const promise = this.run().then(answer => {
                expect(answer).to.equal('foo')
            })
            this.rl.emit('line', 'foo')
            return promise
        })

        describe('#onError', () => {

            it('should pass when isValid=true', function () {
                // coverage
                const prompt = this.create()
                prompt.onError({isValid: true})
            })
        })
    })

    describe('PasswordPrompt', () => {

        beforeEach(function () {
            this.fixture.type = 'password'
        })

        it('should accept foo as input', function () {
            return this.run(rl =>
                rl.emit('line', 'foo')
            ).then(answer => {
                expect(answer).to.equal('foo')
            })
        })

        it('should render cancel.message on cancel', function () {
            this.fixture.cancel = {char: '`', message: 'test-cancel-message'}
            return this.run(({input}) => {
                input.emit('keypress', '`')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-cancel-message')
            })
        })

        it('should mask with $', function () {
            this.fixture.mask = '$'
            return this.run(rl =>
                rl.emit('line', 'foo')
            ).then(answer => {
                expect(this.rl.output.raw).to.contain('$$$')
            })
        })

        it('should mask with * when mask=true', function () {
            this.fixture.mask = true
            return this.run(rl =>
                rl.emit('line', 'foo')
            ).then(answer => {
                expect(this.rl.output.raw).to.contain('***')
            })
        })

        it('should render error message', function () {
            this.fixture.validate = value => value == 'foo' || 'test-error-message'
            return this.run(rl => {
                rl.emit('line', 'bar')
                rl.emit('line', 'foo')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-error-message')
                expect(answer).to.equal('foo')
            })
        })
    })

    describe('ListPrompt', () => {

        beforeEach(function () {
            update(this.fixture, {
                type: 'list',
                choices: ['a', 'b', 'c'],
            })
        })

        it('should choose first index on line', function () {
            return this.run(rl => {
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal('a')
            })
        })

        it('should render cancel.message on cancel', function () {
            this.fixture.cancel = {char: '`', message: 'test-cancel-message'}
            return this.run(({input}) => {
                input.emit('keypress', '`')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-cancel-message')
            })
        })

        it('should choose first index after keypress X', function () {
            return this.run(rl => {
                rl.input.emit('keypress', 'X')
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal('a')
            })
        })
    })

    describe('RawlistPrompt', () => {

        beforeEach(function () {
            update(this.fixture, {
                type: 'rawlist',
                choices: ['a', 'b', 'c'],
            })
        })

        it('should choose first index on line', function () {
            return this.run(rl => {
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal('a')
            })
        })

        it('should render cancel.message on cancel', function () {
            this.fixture.cancel = {char: '`', message: 'test-cancel-message'}
            return this.run(({input}) => {
                input.emit('keypress', '`')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-cancel-message')
            })
        })

        it('should select second value on line after keypress 2', function () {
            return this.run(rl => {
                rl.input.emit('keypress', '2')
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal('b')
            })
        })

        it('should select third value on select char keypress then line', function () {
            this.fixture.choices[2] = {value: 'c', select: 'X'}
            return this.run(rl => {
                rl.input.emit('keypress', 'X')
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal('c')
            })
        })

        it('should select third value on enter char keypress', function () {
            this.fixture.choices[2] = {value: 'c', enter: 'X'}
            return this.run(rl => {
                rl.input.emit('keypress', 'X')
            }).then(answer => {
                expect(answer).to.equal('c')
            })
        })

        it('should render error message on invalid line', function () {
            this.fixture.errorMessage = 'test-error-message'
            return this.run(rl => {
                rl.emit('line', 'bar')
                rl.line = ''
                rl.emit('line', '')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-error-message')
                expect(answer).to.equal('a')
            })
        })

        describe('#getCurrentValue', () => {

            it('should return null for null if selected is null', function () {
                // coverage
                const prompt = this.create()
                prompt.selected = null
                expect(prompt.getCurrentValue(null)).to.equal(null)
            })
        })
    })

    describe('ConfirmPrompt', () => {

        beforeEach(function () {
            this.fixture.type = 'confirm'
        })

        it('should answer false on line n', function () {
            this.fixture.toggle = '`'
            return this.run(rl => {
                rl.emit('line', 'n')
            }).then(answer => {
                expect(answer).to.equal(false)
            })
        })

        it('should render cancel.message on cancel', function () {
            this.fixture.cancel = {char: '`', message: 'test-cancel-message'}
            return this.run(({input}) => {
                input.emit('keypress', '`')
            }).then(answer => {
                expect(this.rl.output.raw).to.contain('test-cancel-message')
            })
        })

        it('should answer false on toggle keypress then line', function () {
            this.fixture.toggle = '`'
            return this.run(rl => {
                rl.input.emit('keypress', '`')
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal(false)
            })
        })

        it('should answer false on toggle enter keypress', function () {
            this.fixture.toggleEnter = '`'
            return this.run(rl => {
                rl.input.emit('keypress', '`')
            }).then(answer => {
                expect(answer).to.equal(false)
            })
        })

        it('should answer false on toggle keypress, keypress n then line', function () {
            this.fixture.toggle = '`'
            return this.run(rl => {
                rl.input.emit('keypress', '`')
                rl.input.emit('keypress', 'n')
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal(false)
            })
        })

        it('should answer true on toggle keypress twice then line', function () {
            this.fixture.toggle = '`'
            return this.run(rl => {
                rl.input.emit('keypress', '`')
                rl.input.emit('keypress', '`')
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal(true)
            })
        })

        it('should answer turn on toggle keypress, backspace, then line', function () {
            this.fixture.toggle = '`'
            return this.run(rl => {
                rl.input.emit('keypress', '`')
                rl.input.emit('keypress', '', {name: 'backspace'})
                rl.emit('line', '')
            }).then(answer => {
                expect(answer).to.equal(true)
            })
        })

        describe('#render', function () {

            it('should render error message', function () {
                // coverage
                const prompt = this.create()
                prompt.render('test-error-message')
                expect(prompt.rl.output.raw).to.contain('test-error-message')
            })
        })        
    })
})