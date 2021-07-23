/**
 * gameon - test suite - util classes
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
    noop,
    requireSrc,
    update
} = TestUtil

const Util = requireSrc('lib/util')
const {Profiler, Counter, Timer, StringBuilder} = Util

const chalk = require('chalk')
const os    = require('os')

describe('Util', () => {

    beforeEach(function () {
        this.fixture = {}
    })

    describe('#append', () => {

        it('should append [3,4] to [1]', () => {
            const arr = [1]
            Util.append(arr, [3,4])
            expect(arr).to.jsonEqual([1,3,4])
        })
    })

    describe('#arrayIncrement', () => {

        var inc
        var min
        var max

        beforeEach(() => {
            // defaults
            inc = 0.1
            min = 0.1
            max = 1.0
        })
        it('should increment [0.1, 0.1, 0.1] to [0.1, 0.1, 0.2] and return true', () => {
            const arr = [0.1, 0.1, 0.1]
            const exp = [0.1, 0.1, 0.2]
            const result = Util.arrayIncrement(arr, inc, min, max)
            expect(arr).to.jsonEqual(exp)
            expect(result).to.equal(true)
        })

        it('should increment [0.1, 0.1, 1.0] to [0.1, 0.2, 0.1] and return true', () => {
            const arr = [0.1, 0.1, 1.0]
            const exp = [0.1, 0.2, 0.1]
            const result = Util.arrayIncrement(arr, inc, min, max)
            expect(arr).to.jsonEqual(exp)
            expect(result).to.equal(true)
        })

        it('should not increment [1.0, 1.0, 1.0] and return false', () => {
            const arr = [1.0, 1.0, 1.0]
            const exp = arr.slice(0)
            const result = Util.arrayIncrement(arr, inc, min, max)
            expect(arr).to.jsonEqual(exp)
            expect(result).to.equal(false)
        })

        it('should increment [0.1, 0.1, 0.1] to [1.0, 1.0, 1.0] in loop', () => {
            const arr = [0.1, 0.1, 0.1]
            const exp = [1.0, 1.0, 1.0]
            do {
                var result = Util.arrayIncrement(arr, inc, min, max)
            } while (result)
            expect(arr).to.jsonEqual(exp)
            expect(result).to.equal(false)
        })
    })

    describe('#breakLines', () => {

        it('should return 1 chunk with size 0 for empty string', function () {
            const res = Util.breakLines([''], 80)
            expect(res.length).to.equal(1)
            expect(res[0].length).to.equal(0)
        })
    })

    describe('#castToArray', () => {

        it('should return singleton [1] for input 1', () => {
            const result = Util.castToArray(1)
            expect(result).to.jsonEqual([1])
        })

        it('should return empty list for undefined', () => {
            const result = Util.castToArray(undefined)
            expect(result).to.jsonEqual([])
        })

        it('should return empty list for null', () => {
            const result = Util.castToArray(null)
            expect(result).to.jsonEqual([])
        })

        it('should return singleton false for input false', () => {
            const result = Util.castToArray(false)
            expect(result).to.jsonEqual([false])
        })

        it('should return singleton 0 for input 0', () => {
            const result = Util.castToArray(0)
            expect(result).to.jsonEqual([0])
        })

        it('should return same reference for array input', () => {
            const arr = []
            const result = Util.castToArray(arr)
            expect(result).to.equal(arr)
        })
    })

    describe('#chunkArray', () => {

        it('should chunk [1, 2] to [1], [2]', () => {
            const res = Util.chunkArray([1, 2], 2)
            expect(res).to.jsonEqual([[1], [2]])
        })
    })

    describe('#createHash', () => {

        it('should return hash object updated with text when no digest passed', function () {
            const res = Util.createHash('md5', '123')
            const exp = '202cb962ac59075b964b07152d234b70'
            expect(res.digest('hex')).to.equal(exp)
        })
    })

    describe('#decrypt1', () => {

        beforeEach(function () {
            update(this.fixture, {
                key: '202cb962ac59075b964b07152d234b70'
            })
        })

        it('should throw ArgumentError for text with length 5', function () {
            const {key} = this.fixture
            const err = getError(() => Util.decrypt1('asdf', key))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for key with length 5', function () {
            const {key} = this.fixture
            const badKey = '12345'
            const enc = Util.encrypt1('sample', key)
            const err = getError(() => Util.decrypt1(enc, badKey))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for text with iv length 17', function () {
            const {key} = this.fixture
            const enc = Util.encrypt1('sample', key)
            const input = 'a0' + enc
            const err = getError(() => Util.decrypt1(input, key))
            expect(err.isArgumentError).to.equal(true)
        })
    })

    describe('#encrypt2', () => {

        beforeEach(function () {
            update(this.fixture, {
                key: '202cb962ac59075b964b07152d234b70'
            })
        })

        it('should be compatible with decrypt1', function () {
            const {key} = this.fixture
            const text = 'test-input'
            const enc = Util.encrypt2(text, key)
            const res = Util.decrypt1(enc, key)
            expect(res).to.equal(text)
        })
    })

    describe('#defaults', () => {

        it('should return only keys from first param', () => {
            const defaults = {a: 1, b: 2}
            const opts = {a: 1, c: 3}
            const result = Util.defaults(defaults, opts)
            expect(result).to.jsonEqual(defaults)
        })

        it('should override default with opts', () => {
            const defaults = {a: 1, b: 2}
            const opts = {a: 1, b: 3}
            const result = Util.defaults(defaults, opts)
            expect(result).to.jsonEqual(opts)
        })

        it('should handle 4 args', () => {
            const defaults = {a: 1, b: 2}
            const opts1 = {a: 1, b: 3}
            const opts2 = {a: 4, b: 4}
            const opts3 = {a: 2, d: 3}
            const exp = {a:2, b:4}
            const result = Util.defaults(defaults, opts1, opts2, opts3)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#encrypt1', () => {

        beforeEach(function () {
            update(this.fixture, {
                key: '202cb962ac59075b964b07152d234b70'
            })
        })

        it('should throw ArgumentError for key with length 5', function () {
            const {key} = this.fixture
            const badKey = '12345'
            const text = 'some-text'
            const err = getError(() => Util.encrypt1(text, badKey))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for text with length 0', function () {
            const {key} = this.fixture
            const input = ''
            const err = getError(() => Util.encrypt1(input, key))
            expect(err.isArgumentError).to.equal(true)
        })
    })

    describe('#ensure', () => {

        it('should add property bar if not present', function () {
            const obj = {}
            Util.ensure(obj, {bar: 1})
            expect(obj.bar).to.equal(1)
        })

        it('should not overwrite property with null value', function () {
            const obj = {foo: null}
            Util.ensure(obj, {foo: 1})
            expect(obj.foo).to.equal(null)
        })
    })

    describe('#errMessage', () => {

        it('should return Error message', () => {
            const msg = 'test message'
            const res = Util.errMessage(() => {throw new Error(msg)})
            expect(res).to.equal(msg)
        })

        it('should return false for no message', () => {
            const res = Util.errMessage(() => {throw new Error})
            expect(res).to.equal(false)
        })
    })

    describe('#escapeRegex', () => {

        const theCases = {
            '^' : '\\^',
            'x' : 'x'
        }

        Object.entries(theCases).forEach(([input, exp]) => {
            it('should escape ' + input + ' to ' + exp, () => {
                const result = Util.escapeRegex(input)
                expect(result).to.equal(exp)
            })
        })
    
    })

    describe('#extendClass', () => {
    
        it('should allow explicit override', () => {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            Util.extendClass(Target, Source, {overrides: ['foo']})
            const inst = new Target
            const res = inst.foo()
            expect(res).to.equal(1)
        })

        it('should allow wildcard override', () => {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            Util.extendClass(Target, Source, {overrides: '*'})
            const inst = new Target
            const res = inst.foo()
            expect(res).to.equal(1)
        })

        it('should allow override with true', () => {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            Util.extendClass(Target, Source, {overrides: true})
            const inst = new Target
            const res = inst.foo()
            expect(res).to.equal(1)
        })

        it('should throw ProgrammerError without override', () => {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            const err = getError(() => Util.extendClass(Target, Source))
            expect(err.isProgrammerError).to.equal(true)
        })

        it('should throw ProgrammerError with overrides=false', () => {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            const err = getError(() => Util.extendClass(Target, Source, {overrides: false}))
            expect(err.isProgrammerError).to.equal(true)
        })

        it('should support explicit optionals', () => {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            Util.extendClass(Target, Source, {optionals: ['foo']})
            const inst = new Target
            const res = inst.foo()
            expect(res).to.equal(0)
        })
    })

    describe('#fileDateString', () => {

        it('should use new dat if no date passed', () => {
            const d = new Date
            const res = Util.fileDateString()
            expect(res.substring(0, 4)).to.equal(d.getFullYear().toString())
        })

        it('should use date argument', () => {
            const d = new Date('2011-02-01')
            const res = Util.fileDateString(d)
            expect(res.substring(0, 4)).to.equal('2011')
        })
    })

    describe('#forceLineReturn', () => {

        it('should return empty string for empty string', () => {
            const exp = ''
            const res = Util.forceLineReturn(exp)
            expect(res).to.equal(exp)
        })
    })

    describe('#homeTilde', () => {

        it('should return null for null', () => {
            const res = Util.homeTilde(null)
            expect(res).to.equal(null)
        })

        it('should return undefined for undefined', () => {
            const res = Util.homeTilde(undefined)
            expect(res).to.equal(undefined)
        })
    })

    describe('#isEmptyObject', () => {

        it('should return true for {}', () => {
            const res = Util.isEmptyObject({})
            expect(res).to.equal(true)
        })

        it('should return true for null', function () {
            const res = Util.isEmptyObject(null)
            expect(res).to.equal(true)
        })
    })

    describe('#keypressName', () => {

        const expCases = [
            ['escape'      , {key: {name: 'escape'}}]
          , ['foo'         , {key: {name: 'foo'}}]
          , ['bob'         , {value: '1', key: {name: 'bob'}}]
          , ['ctrl-delete' , {key: {ctrl: true, name: 'delete'}}]
          , ['a'           , {value: 'a', key: {}}]
          , [''            , {key: {}}]
        ]

        expCases.forEach(([exp, input]) => {

            const desc = JSON.stringify(input)

            it(`should return ${exp} for ${desc}`, function () {
                const res = Util.keypressName(input)
                expect(res).to.equal(exp)
            })
        })
    })

    describe('#keyValuesTrue', () => {

        it('should make arr values keys with true', () => {
            const res = Util.keyValuesTrue(['a', 'b', 'b', 'c'])
            const exp = {a: true, b: true, c: true}
            expect(res).to.jsonEqual(exp)
        })
    })

    describe('#makeErrorObject', () => {

        it('should return constructor name if error has no name', () => {
            const err = new Error
            err.name = null
            const result = Util.makeErrorObject(err)
            expect(result.name).to.equal('Error')
        })

        it('should include own property foo, and exclude prototype property bar', function () {
            class TestError extends Error {
                constructor(...args) {
                    super(...args)
                    this.foo = 1
                }
            }
            TestError.prototype.bar = 2
            const err = new TestError
            const result = Util.makeErrorObject(err)
            expect(err.bar).to.equal(2)
            expect(result.foo).to.equal(1)
            expect(Object.keys(result)).to.not.contain('bar')
        })

        it('should recurse with props from error as property', function () {
            const err = new Error('testMessage')
            err.a = new Error('subError')
            err.a.foo = 1
            const result = Util.makeErrorObject(err)
            expect(result.a.error).to.equal('subError')
            expect(result.a.foo).to.equal(1)
        })

        it('should recurse depth 2 without props from error as property', function () {
            const err = new Error('testMessage')
            err.a = new Error('subError')
            err.a.b = new Error('subSubError')
            err.a.b.foo = 1
            err.a.b.name = null
            const result = Util.makeErrorObject(err)
            expect(result.a.error).to.equal('subError')
            expect(result.a.b.name).to.equal('Error')
            expect(Boolean(result.a.b.foo)).to.equal(false)
        })
    })

    describe('#mapValues', () => {

        it('should map values with +1', () => {
            const res = Util.mapValues({a: 1, b: 2}, value => value + 1)
            const exp = {a: 2, b: 3}
            expect(res).to.jsonEqual(exp)
        })
    })

    describe('#nchars', () => {

        it('should throw ArgumentError for empty', function () {
            const err = getError(() => Util.nchars(5, ''))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for Infinity', function () {
            const err = getError(() => Util.nchars(Infinity, ' '))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should repeat char 8 times', function () {
            const exp = 'cccccccc'
            const res = Util.nchars(8, 'c')
            expect(res).to.equal(exp)
        })
    })

    describe('#nmap', () => {

        it('should throw ArgumentError for Infinity', function () {
            const err = getError(() => Util.nmap(Infinity, noop))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should repeat accumulate callback values', function () {
            const exp = [3, 4, 5, 6]
            const res = Util.nmap(4, value => value + 3)
            expect(res).to.jsonEqual(exp)
        })
    })

    describe('#ntimes', () => {

        it('should throw ArgumentError for Infinity', function () {
            const err = getError(() => Util.ntimes(Infinity, noop))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should repeat callback 4 times', function () {
            let counter = 0
            const res = Util.ntimes(4, () => counter += 1)
            expect(counter).to.equal(4)
        })

        it('should increment variable by 2 5 times', function () {
            let v = 0
            Util.ntimes(5, () => v += 2)
            expect(v).to.equal(10)
        })

        it('should not do anything 0 times', function () {
            let v = 0
            Util.ntimes(0, () => v += 2)
            expect(v).to.equal(0)
        })

        it('should not do anything -1 times', function () {
            let v = 0
            Util.ntimes(-1, () => v += 2)
            expect(v).to.equal(0)
        })
    })

    describe('#pad', () => {

        it('should pad left with 2 spaces with chalked input', () => {
            const res = Util.pad(chalk.green('a'), 'left', 3)
            const exp = chalk.green('a') + '  '
            expect(res).to.equal(exp)
        })

        it('should pad right with 2 spaces with chalked input', () => {
            const res = Util.pad(chalk.green('a'), 'right', 3)
            const exp = '  ' + chalk.green('a')
            expect(res).to.equal(exp)
        })

        it('should pad right with xx with chalked input', () => {
            const res = Util.pad(chalk.green('a'), 'right', 3, 'x')
            const exp = 'xx' + chalk.green('a')
            expect(res).to.equal(exp)
        })
    })

    describe('#padEnd', () => {

        it('should throw ArgumentError for Infinity', function () {
            const err = getError(() => Util.padEnd('x', Infinity, 'x'))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for empty', function () {
            const err = getError(() => Util.padEnd('x', 5, ''))
            expect(err.isArgumentError).to.equal(true)
        })
    })

    describe('#padStart', () => {

        it('should throw ArgumentError for Infinity', function () {
            const err = getError(() => Util.padStart('x', Infinity, 'x'))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for empty', function () {
            const err = getError(() => Util.padStart('x', 5, ''))
            expect(err.isArgumentError).to.equal(true)
        })
    })

    describe('#propsFrom', () => {

        it('should filter keys from array as second param', () => {
            const input = {a: 1, b: 2, c: 3}
            const keys = ['a', 'c']
            const exp = {a: 1, c: 3}
            const result = Util.propsFrom(input, keys)
            expect(result).to.jsonEqual(exp)
        })

        it('should accept empty first para', () => {
            const input = undefined
            const keys = ['a']
            const exp = {a: undefined}
            const result = Util.propsFrom(input, keys)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#randomElement', () => {

        it('should return singleton element', () => {
            const result = Util.randomElement([5])
            expect(result).to.equal(5)
        })

        it('should return undefined from empty array', () => {
            const result = Util.randomElement([])
            expect(result).to.equal(undefined)
        })
    })

    describe('#rejectDuplicatePrompter', () => {

        beforeEach(function () {
            this.prompter = {
                ui: {
                    activePrompt: {
                        opt: {
                            name: 'test'
                        }
                    }
                }
            }
        })

        it('should throw PromptActiveError if prompter not empty and no reject passed', function () {
            const err = getError(() => Util.rejectDuplicatePrompter(this.prompter))
            expect(err.isPromptActiveError).to.equal(true)
        })

        it('should reject with PromptActiveError if prompter not empty and reject passed', function (done) {
            Util.rejectDuplicatePrompter(this.prompter, err => {
                expect(err.isPromptActiveError).to.equal(true)
                done()
            })
        })

        it('should throw PromptActiveError for non-empty prompter even if no activePrompt property', function () {
            const err = getError(() => Util.rejectDuplicatePrompter({}))
            expect(err.isPromptActiveError).to.equal(true)
        })
    })

    // removing...
    describe.skip('#roundTo', () => {

        it('should return 1 for 1,undefined', () => {
            const res = Util.roundTo(1)
            expect(res).to.equal(1)
        })

        it('should return 1.11 for 1.111,2', () => {
            const res = Util.roundTo(1.111, 2)
            expect(res).to.equal(1.11)
        })

        it('should return -1.1 for -1.11,1', () => {
            const res = Util.roundTo(-1.11, 1)
            expect(res).to.equal(-1.1)
        })
    })

    describe('#sortNumericAsc', () => {

        it('should sort [32, 4, 1, 7] to [1, 4, 7, 32]', () => {
            const input = [32, 4, 1, 7]
            const exp = [1, 4, 7, 32]
            const result = input.sort(Util.sortNumericAsc)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#sortNumericDesc', () => {

        it('should sort [32, 4, 1, 7] to [32, 7, 4, 1]', () => {
            const input = [32, 4, 1, 7]
            const exp = [32, 7, 4, 1]
            const result = input.sort(Util.sortNumericDesc)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#sp', () => {

        it('should join all three params with space', () => {
            const input = ['a', 'b', 'c']
            const exp = 'a b c'
            const result = Util.sp(...input)
            expect(result).to.equal(exp)
        })
    })

    describe('#spreadScore', () => {

        const expCases = [
            {
                input : {a: 0, b: 1, c: 2},
                exp   : {a: 0, b: 1/3, c: 2/3},
                edesc : '{a:0, b:1/3, c:2/3}'
            },
            {
                input : {a: 0, b: 0, c: 0},
                exp   : {a: 1/3, b: 1/3, c: 1/3},
                edesc : '{a:1/3, b:1/3, c:1/3}'
            },
            {
                input : {a: -1, b: -1, c: -1},
                exp   : {a: 1/3, b: 1/3, c: 1/3},
                edesc : '{a:1/3, b:1/3, c:1/3}'
            },
            {
                input : {a: 0, b: 1, c: 2},
                exp   : {a: 2/3, b: 1/3, c:0},
                edesc : '{a: 2/3, b: 1/3, c:0}',
                isInverse: true
            }
        ]

        expCases.forEach(({input, exp, edesc, isInverse}) => {

            var desc = 'should return ' + (edesc || JSON.stringify(exp)) + ' for ' + JSON.stringify(input)
            if (isInverse) {
                desc += ' with isInverse=true'
            }

            it(desc, () => {
                const result = Util.spreadScore(input, isInverse)
                expect(result).to.jsonEqual(exp)
            })

            it('should return same value after 2 calls for ' + JSON.stringify(input), () => {
                const result1 = Util.spreadScore(input)
                const result2 = Util.spreadScore(result1)
                expect(result1).to.jsonEqual(result2)
            })

            it('should invert and back again for 2 invert calls for ' + JSON.stringify(input), () => {
                const result1 = Util.spreadScore(input)
                const result2 = Util.spreadScore(Util.spreadScore(result1, true), true)
                expect(result1).to.jsonEqual(result2)
            })
        })
    })

    describe('#stringWidth', () => {

        it('should return 0 for null', () => {
            const res = Util.stringWidth(null)
            expect(res).to.equal(0)
        })

        it('should return 4 for chalked input', () => {
            const res = Util.stringWidth(chalk.green('asdf'))
            expect(res).to.equal(4)
        })
    })

    describe('#stripLeadingSlash', () => {

        it('should return asdf for asdf', () => {
            const res = Util.stripLeadingSlash('asdf')
            expect(res).to.equal('asdf')
        })

        it('should return asdf for /asdf', () => {
            const res = Util.stripLeadingSlash('/asdf')
            expect(res).to.equal('asdf')
        })
    })

    describe('#stripTrailingSlash', () => {

        it('should return asdf for asdf', () => {
            const res = Util.stripTrailingSlash('asdf')
            expect(res).to.equal('asdf')
        })

        it('should return asdf for asdf/', () => {
            const res = Util.stripTrailingSlash('asdf/')
            expect(res).to.equal('asdf')
        })
    })

    describe('#sumArray', () => {

        const expCases = [
            {input: [1, 2], exp: 3},
            {input: [], exp: 0},
            {input: [5, 5], exp: 10}
        ]

        expCases.forEach(({input, exp}) => {
            it('should return ' + exp + ' for ' + JSON.stringify(input), () => {
                const result = Util.sumArray(input)
                expect(result).to.equal(exp)
            })
        })
    })

    describe('#tildeHome', () => {

        it('should return null for null', () => {
            const res = Util.tildeHome(null)
            expect(res).to.equal(null)
        })

        it('should replace ~ with home dir', () => {
            const res = Util.tildeHome('~/foo')
            expect(res).to.equal(os.homedir() + '/foo')
        })
    })

    describe('#trimMessageData', () => {

        it('should return self for empty data', function () {
            const res = Util.trimMessageData(null)
            expect(res).to.equal(null)
        })
    })

    describe('#ucfirst', () => {

        it('should return null for null', () => {
            const res = Util.ucfirst(null)
            expect(res).to.equal(null)
        })

        it('should return empty for empty', () => {
            const res = Util.ucfirst('')
            expect(res).to.equal('')
        })

        it('should return Foo for foo', () => {
            const res = Util.ucfirst('foo')
            expect(res).to.equal('Foo')
        })
    })

    describe('#uniqueInts', () => {

        it('should return [1,2,3] for [1,1,2,2,3,3]', () => {
            const input = [1, 1, 2, 2, 3, 3]
            const exp = [1, 2, 3]
            const result = Util.uniqueInts(input)
            expect(result).to.jsonEqual(exp)
        })

        it('should return [1,2,3,NaN] for [1,1,2,3,a,a]', function () {
            const input = [1, 1, 2, 3, 'a', 'a']
            const exp = [1, 2, 3, NaN]
            const result = Util.uniqueInts(input)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#uniqueStrings', () => {

        it('should return [a, b] for [a, a, b]', () => {
            const input = ['a', 'a', 'b']
            const result = Util.uniqueStrings(input)
            expect(result).to.jsonEqual(['a', 'b'])
        })
    })

    describe('#update', () => {

        it('should return object for null as target', function () {
            const res = Util.update(null, {a: 1})
            expect(res).to.jsonEqual({a: 1})
        })
    })

    describe('#uuid', () => {

        it('should return string of length 36', () => {
            const result = Util.uuid()
            expect(result).to.have.length(36)
        })
    })
})

describe('Profiler', () => {

    var profiler

    beforeEach(() => {
        profiler = Profiler.createEnabled()
    })

    it('should start/stop and have startCount of 1', () => {
        profiler.start('test')
        profiler.stop('test')
        expect(profiler.timers.test.startCount).to.equal(1)
    })

    it('should start/stop twice and have startCount of 2', () => {
        profiler.start('test')
        profiler.stop('test')
        profiler.start('test')
        profiler.stop('test')
        expect(profiler.timers.test.startCount).to.equal(2)
    })

    it('should reset startCount to 0', () => {
        profiler.start('test')
        profiler.stop('test')
        profiler.reset('test')
        expect(profiler.timers.test.startCount).to.equal(0)
    })

    it('should inc by 1', () => {
        profiler.inc('test')
        expect(profiler.counters.test.value).to.equal(1)
    })

    it('should inc by 1 twice', () => {
        profiler.inc('test')
        profiler.inc('test')
        expect(profiler.counters.test.value).to.equal(2)
    })

    it('should zero counter', () => {
        profiler.inc('test')
        profiler.zero('test')
        expect(profiler.counters.test.value).to.equal(0)
    })

    it('should not zero when disabled', () => {
        profiler.inc('test')
        profiler.enabled = false
        profiler.zero('test')
        expect(profiler.counters.test.value).to.equal(1)
    })

    it('should resetAll', () => {
        profiler.start('test1')
        profiler.stop('test1')
        profiler.start('test2')
        profiler.stop('test2')
        profiler.inc('test3')
        profiler.resetAll()
        expect(profiler.timers.test1.startCount).to.equal(0)
        expect(profiler.timers.test2.startCount).to.equal(0)
        expect(profiler.counters.test3.value).to.equal(0)
    })

    it('should not resetAll when disabled', () => {
        profiler.start('test1')
        profiler.stop('test1')
        profiler.enabled = false
        profiler.resetAll()
        expect(profiler.timers.test1.startCount).to.equal(1)
    })

    it('should not reset when disabled', () => {
        profiler.start('test1')
        profiler.stop('test1')
        profiler.enabled = false
        profiler.reset('test1')
        expect(profiler.timers.test1.startCount).to.equal(1)
    })

    it('should not zero when disabled', () => {
        profiler.inc('test')
        profiler.enabled = false
        profiler.zero('test')
        expect(profiler.counters.test.value).to.equal(1)
    })

    it('should throw IllegalStateError on double start', () => {
        profiler.start('test1')
        const err = getError(() => profiler.start('test1'))
        expect(err.name).to.equal('IllegalStateError')
    })
})

describe('Counter', () => {

    it('should give a default name', () => {
        const counter = new Counter
        expect(counter.name).to.have.length.greaterThan(0)
    })
})

describe('Timer', () => {

    var timer

    beforeEach(() => timer = new Timer)

    it('should throw IllegalStateError on stop unstarted', () => {
        const err = getError(() => timer.stop())
        expect(err.name).to.equal('IllegalStateError')
    })
})

describe('DependencyHelper', () => {

    const DependencyHelper = requireSrc('lib/util/dependency-helper')

    it('should throw MissingDependencyError', () => {

        const roots = ['Default']
        // missing c, d
        const configs = {
            a: ['c']
          , b: ['c', 'd', 'e']
          , e: ['Default']
          , f: ['Default', 'b', 'c']
        }
        const helper = new DependencyHelper(roots)
        for (var name in configs) {
            helper.add(name, configs[name])
        }
        const err = getError(() => helper.resolve())
        expect(err.name).to.equal('MissingDependencyError')

    })

    it('should resolve basic case', () => {

        const roots = ['Default']
        const configs = {
            a: ['c']
          , b: ['c', 'd', 'e']
          , e: ['Default']
          , f: ['Default', 'b', 'c']
          , d: ['c']
          , c: []
        }
        const helper = new DependencyHelper(roots)
        for (var name in configs) {
            helper.add(name, configs[name])
        }
        // load order should be 
        const exp = ['e', 'c', 'a', 'd', 'b', 'f']
        const result = helper.resolve()

        expect(result).to.jsonEqual(exp)
    })

    it('should throw CircularDependencyError for tight circle', () => {

        const helper = new DependencyHelper
        helper.add('a', ['b'])
        const err = getError(() => helper.add('b', ['a']))

        expect(err.name).to.equal('CircularDependencyError')
    })

    it('should throw UnresolvedDependencyError for bigger circle', () => {
        const helper = new DependencyHelper
        const configs = {
            a: ['b']
          , b: ['c']
          , c: ['d']
          , d: ['a']
        }
        for (var name in configs) {
            helper.add(name, configs[name])
        }
        const err = getError(() => helper.resolve())

        expect(err.name).to.equal('UnresolvedDependencyError')
    })

    it('should throw DependencyError for duplicate name', () => {
        const helper = new DependencyHelper
        helper.add('a', ['b'])
        const err = getError(() => helper.add('a', ['c']))
        expect(err.isDependencyError).to.equal(true)
    })
})

describe('StringBuilder', () => {

    describe('#length', () => {
        it('should return 5 with add one char five times', () => {
            const b = new StringBuilder
            b.add('a', 'b', 'c', 'd', 'e')
            const res = b.length()
            expect(res).to.equal(5)
        })
    })

    describe('#replace', () => {
        it('should replace arr', () => {
            const b = new StringBuilder
            b.add('a', 'b', 'c')
            b.replace('c')
            expect(b.toString()).to.equal('c')
        })
    })
})