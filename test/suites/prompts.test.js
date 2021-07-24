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
const {
    expect,
    getError,
    ReadlineStub,
    requireSrc,
} = require('../util')

describe('Prompts', () => {

    const Prompts = requireSrc('term/prompts')

    beforeEach(function () {
        this.rl = new ReadlineStub
        this.create = function () {
            return new Prompts[this.fixture.type](this.fixture, this.rl)
        }
    })

    describe('InputPrompt', () => {

        beforeEach(function () {
            this.fixture = {
                type  : 'input',
                name  : 'test',
                theme : 'Default',
            }
        })

        it('should accept foo as input', function (done) {
            this.create().run().then(answer => {
                expect(answer).to.equal('foo')
                done()
            }).catch(done)
            this.rl.emit('line', 'foo')
        })
    })
})