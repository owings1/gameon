/**
 * gameon - test suite - Errors
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
    requireSrc
} = TestUtil

describe('-', () => {

    const Errors = requireSrc('lib/errors')

    beforeEach(function() {
        this.load = function () {
            this.name = this.name || 'BaseError'
            this.cls = Errors[this.name]
            this.msg = this.msg || 'Test message'
            this.args = this.args || []
            const args = this.args.slice(0)
            if (!this.argsOnly) {
                args.unshift(this.msg)
            }
            this.err = new this.cls(...args)
        }
    })

    describe('properties', () => {

        describe('RequestError from AlreadyRolledError', () => {

            beforeEach(function() {
                this.name = 'RequestError'
                this.args = [new Errors.AlreadyRolledError(this.msg)]
                this.argsOnly = true
                this.load()
            })

            it('should have name RequestError', function() {
                expect(this.err.name).to.equal('RequestError')
            })

            it('should have cause AlreadyRolledError', function() {
                expect(this.args[0].name).to.equal('AlreadyRolledError')
                expect(this.err.cause).to.equal(this.args[0])
            })

            const expTrueProps = [
                'isAlreadyRolledError'
              , 'isIllegalStateError'
              , 'isGameError'
              , 'isRequestError'
              , 'isBaseError'
            ]

            expTrueProps.forEach(prop => {
                it(`should have property ${prop} = true`, function() {
                    expect(this.err[prop]).to.equal(true)
                })
            })
        })
    })
})
