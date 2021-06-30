/**
 * gameon - test suite - logger
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
    requireSrc
} = TestUtil

const Logger = requireSrc('lib/logger')

describe('-', () => {

    describe('#getFormatServer', () => {

        it('should include name in message', () => {
            const res = Logger.getFormatServer('TestLogger')({type: '[info]', msg: 'hello'})
            expect(res).to.contain('TestLogger')
        })

        it('should accept blank name', () => {
            const res = Logger.getFormatServer()({type: '[info]', msg: 'hello'})
            expect(res).to.contain('hello')
        })
    })

    describe('#error', () => {

        // coverage only

        it('should call with Error param', () => {
            const logger = new Logger
            logger.loglevel =  -1
            logger.error(new Error('test'))
        })

        it('should call with Error param without name prop', () => {
            const logger = new Logger
            const err = new Error
            err.name = null
            logger.loglevel =  -1
            logger.error(err)
        })

        it('should call with string param', () => {
            const logger = new Logger
            logger.loglevel =  -1
            logger.error('test')
        })

        it('should call console.error with opts.server', () => {
            const logger = new Logger('Test', {server:true})
            logger._parentError = () => {}
            var isCalled = false
            logger.console = {error : () => isCalled = true }
            logger.error(new Error('Test Logger.error'))
            expect(isCalled).to.equal(true)
        })
    })

    describe('#format', () => {

        it('should return string with type and msg', () => {
            const str = Logger.format({type: 'info', msg: 'test'})
            expect(str.toLowerCase()).to.contain('info')
            expect(str).to.contain('test')
        })
    })

    describe('#getStdout', () => {

        it('should return process.stdout if not set', () => {
            const logger = new Logger
            const result = logger.getStdout()
            expect(result).to.equal(process.stdout)
        })

        it('should return what is set', () => {
            const logger = new Logger
            logger.stdout = 1
            const result = logger.getStdout()
            expect(result).to.equal(1)
        })
    })

    describe('#writeStdout', () => {
        it('should call write method on logger.stdout with str as argument', () => {
            const logger = new Logger
            var s
            logger.stdout = {write: str => s = str}
            logger.writeStdout('foo')
            expect(s).to.equal('foo')
        })
    })
})
