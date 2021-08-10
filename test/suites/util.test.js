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
const {
    expect,
    getError,
    noop,
    requireSrc,
    update,
} = require('../util')

describe('Util', () => {

    const Util = requireSrc('lib/util')

    function makeCases(method, ...args) {

        const cases = args.pop()
        const opts = args[0] || {}
        const {isJson, isError} = opts
        const decorator = isJson ? 'jsonEqual' : 'equal'

        cases.forEach(([exp, ...input]) => {

            const argsDesc = '(' + input.map(arg => {
                const argType = typeof arg
                if (argType == 'function') {
                    if (arg.name) {
                        return arg.name + '()'
                    }
                    return '[Function]'
                }
                if (arg == Infinity || arg == -Infinity) {
                    return arg.toString()
                }
                if (arg instanceof Date) {
                    return 'Date(' + arg.toISOString() + ')'
                }
                return JSON.stringify(arg)
            }).join(',') + ')'

            if (isError) {
                it(`should throw ${exp} for ${argsDesc}`, function () {
                    const err = getError(() => Util[method](...input))
                    expect(err['is' + exp]).to.equal(true)
                })
            } else {
                it(`should return ${JSON.stringify(exp)} for ${argsDesc}`, function () {
                    const result = Util[method](...input)
                    expect(result).to[decorator](exp)
                })
            }
            
        })
    }

    const chalk = require('chalk')
    const os    = require('os')

    describe('#arrayIncrement', () => {

        describe('inc=1, min=0, max=9', () => {

            beforeEach(function () {
                this.args = [1, 0, 9]
            })

            it('should increment [1, 1, 9] to [1, 2, 0]', function () {
                const arr = [1, 1, 9]
                const exp = [1, 2, 0]
                Util.arrayIncrement(arr, ...this.args)
                expect(arr).to.jsonEqual(exp)
            })
        })

        describe('inc=0.1, min=0.1, max=1.0', () => {

            beforeEach(function () {
                this.args = [0.1, 0.1, 1.0]
            })

            it('should increment [0.1, 0.1, 0.1] to [0.1, 0.1, 0.2] and return true', function () {
                const arr = [0.1, 0.1, 0.1]
                const exp = [0.1, 0.1, 0.2]
                const result = Util.arrayIncrement(arr, ...this.args)
                expect(arr).to.jsonEqual(exp)
                expect(result).to.equal(true)
            })

            it('should increment [0.1, 0.1, 1.0] to [0.1, 0.2, 0.1] and return true', function () {
                const arr = [0.1, 0.1, 1.0]
                const exp = [0.1, 0.2, 0.1]
                const result = Util.arrayIncrement(arr, ...this.args)
                expect(arr).to.jsonEqual(exp)
                expect(result).to.equal(true)
            })

            it('should not increment [1.0, 1.0, 1.0] and return false', function () {
                const arr = [1.0, 1.0, 1.0]
                const exp = arr.slice(0)
                const result = Util.arrayIncrement(arr, ...this.args)
                expect(arr).to.jsonEqual(exp)
                expect(result).to.equal(false)
            })

            it('should increment [0.1, 0.1, 0.1] to [1.0, 1.0, 1.0] in loop', function () {
                const arr = [0.1, 0.1, 0.1]
                const exp = [1.0, 1.0, 1.0]
                let result
                do {
                    result = Util.arrayIncrement(arr, ...this.args)
                } while (result)
                expect(arr).to.jsonEqual(exp)
                expect(result).to.equal(false)
            })
        })        
    })

    describe('#chunkArray', () => {

        makeCases('chunkArray', {isJson: true}, [
            [[[1], [2]], [1, 2], 2]
        ])
    })

    describe('#cliWidth', () => {

        it('should return integer', function () {
            const res = Util.cliWidth()
            expect(Number.isInteger(res)).to.equal(true)
        })
    })

    describe('#createHash', () => {

        it('should return hash object updated with text when no digest passed', function () {
            const res = Util.createHash('md5', '123')
            const exp = '202cb962ac59075b964b07152d234b70'
            expect(res.digest('hex')).to.equal(exp)
        })

        it('should return hash object when input is null', function () {
            const res = Util.createHash('md5')
            expect(res.constructor.name).to.equal('Hash')
        })

        it('should return digest when specified', function () {
            const res = Util.createHash('md5', '123', 'hex')
            const exp = '202cb962ac59075b964b07152d234b70'
            expect(res).to.equal(exp)
        })
    })

    describe('#decrypt2', () => {

        const key = '202cb962ac59075b964b07152d234b70'

        makeCases('decrypt2', [
            ['sample', Util.encrypt2('sample', key), key]
        ])

        makeCases('decrypt2', {isError: true}, [
            ['ArgumentError', 'asdf', key]
          , ['ArgumentError', Util.encrypt2('sample', key), '12345']
          , ['ArgumentError', 'a0' + Util.encrypt2('sample', key), key]
          , ['ArgumentError', 'asdf:EH5WYw5GN5aagfGPd2mvAQaQdPRqkruwPbJd', key]
        ])
    })

    describe('#defaults', () => {

        it('should return only keys from first param', function () {
            const defaults = {a: 1, b: 2}
            const opts = {a: 1, c: 3}
            const result = Util.defaults(defaults, opts)
            expect(result).to.jsonEqual(defaults)
        })

        it('should override default with opts', function () {
            const defaults = {a: 1, b: 2}
            const opts = {a: 1, b: 3}
            const result = Util.defaults(defaults, opts)
            expect(result).to.jsonEqual(opts)
        })

        it('should handle 4 args', function () {
            const defaults = {a: 1, b: 2}
            const opts1 = {a: 1, b: 3}
            const opts2 = {a: 4, b: 4}
            const opts3 = {a: 2, d: 3}
            const exp = {a:2, b:4}
            const result = Util.defaults(defaults, opts1, opts2, opts3)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#destroyAll', () => {

        it('should call destroy on each element in an array', function () {
            let counter = 0
            const input = [
                {destroy: () => counter += 1},
                {destroy: () => counter += 1}
            ]
            Util.destroyAll(input)
            expect(counter).to.equal(2)
        })

        it('should call destroy on each value in an object', function () {
            let counter = 0
            const input = {
                a: {destroy: () => counter += 1},
                b: {destroy: () => counter += 1},
            }
            Util.destroyAll(input)
            expect(counter).to.equal(2)
        })
    })

    describe('#encrypt2', () => {

        beforeEach(function () {
            this.key = '202cb962ac59075b964b07152d234b70'
        })

        it('should throw ArgumentError for key with length 5', function () {
            const badKey = '12345'
            const text = 'some-text'
            const err = getError(() => Util.encrypt2(text, badKey))
            expect(err.isArgumentError).to.equal(true)
        })

        it('should throw ArgumentError for text with length 0', function () {
            const input = ''
            const err = getError(() => Util.encrypt2(input, this.key))
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

        it('should return object for null target', function () {
            const res = Util.ensure(null, {})
            expect(res).to.jsonEqual({})
        })
    })

    describe('#errMessage', () => {

        makeCases('errMessage', [
            ['test message', function throwsTestMessage() {throw new Error('test message')}]
          , [false         , function throwsNoMessage() {throw new Error}]
          , [true          , function doesNotThrow() {}] 
        ])
    })

    describe('#extendClass', () => {
    
        it('should allow explicit override', function () {
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

        it('should allow wildcard override', function () {
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

        it('should allow override with true', function () {
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

        it('should throw ProgrammerError without override', function () {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            const err = getError(() => Util.extendClass(Target, Source))
            expect(err.isProgrammerError).to.equal(true)
        })

        it('should throw ProgrammerError with overrides=false', function () {
            class Source {
                foo() {return 1}
            }
            class Target {
                foo() {return 0}
            }
            const err = getError(() => Util.extendClass(Target, Source, {overrides: false}))
            expect(err.isProgrammerError).to.equal(true)
        })

        it('should support explicit optionals', function () {
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

        it('should use new date if no date passed', function () {
            const d = new Date
            const res = Util.fileDateString()
            expect(res.substring(0, 4)).to.equal(d.getFullYear().toString())
        })

        it('should use date argument', function () {
            const d = new Date('2011-02-01')
            const res = Util.fileDateString(d)
            expect(res.substring(0, 4)).to.equal('2011')
        })
    })

    describe('#filenameWithoutExtension', () => {

        makeCases('filenameWithoutExtension', [
            ['foo', '/a/b/c/foo.txt']
        ])
    })

    describe('#filepathWithoutExtension', () => {

        makeCases('filepathWithoutExtension', [
            ['/a/b/c/foo', '/a/b/c/foo.txt']
        ])
    })

    describe('#forceLineReturn', () => {

        makeCases('forceLineReturn', [
            ['', '']
        ])
    })

    describe('#hash', () => {

        it('should return hash object updated with text when no digest passed', function () {
            const res = Util.hash('md5', '123')
            const exp = '202cb962ac59075b964b07152d234b70'
            expect(res.digest('hex')).to.equal(exp)
        })

        it('should return hash object when input is null', function () {
            const res = Util.hash('md5')
            expect(res.constructor.name).to.equal('Hash')
        })

        it('should return digest when specified', function () {
            const res = Util.hash('md5', '123', 'hex')
            const exp = '202cb962ac59075b964b07152d234b70'
            expect(res).to.equal(exp)
        })
    })

    describe('#homeTilde', () => {

        makeCases('homeTilde', [
            [null                          , null]
          , [undefined                     , undefined]
          , ['~/foo.txt'                   , os.homedir() + '/foo.txt']
          , [`/tmp/${os.homedir()}/foo.txt`, `/tmp/${os.homedir()}/foo.txt`]
        ])
    })

    describe('#httpToWs', () => {

        makeCases('httpToWs', [
            ['ws://localhost:8080' , 'http://localhost:8080']
          , ['wss://localhost:8181', 'https://localhost:8181']
          , [null                  , null]
          , [''                    , '']
        ])
    })

    describe('#intRange', () => {

        makeCases('intRange', {isError: true}, [
            ['ArgumentError', 1, Infinity]
        ])
    })

    describe('#isCredentialsFilled', () => {

        makeCases('isCredentialsFilled', [
            [true , {username: 'a', password: 'b'}]
          , [true , {username: 'a', password: 'b', serverUrl: 'c'}, true]
          , [false, {username: 'a', password: 'b'}, true]
        ])
    })

    describe('#isValidEmail', () => {

        makeCases('isValidEmail', [
            [true, 'nobody@nowhere.example']
          , [false, 'abc']
        ])
    })

    describe('#keypressName', () => {

        makeCases('keypressName', [
            ['escape'      , {key: {name: 'escape'}}]
          , ['foo'         , {key: {name: 'foo'}}]
          , ['bob'         , {key: {name: 'bob'}, value: '1'}]
          , ['ctrl-delete' , {key: {ctrl: true, name: 'delete'}}]
          , ['a'           , {key: {}, value: 'a'}]
          , [''            , {key: {}}]
          , ['`'           , {value: '`'}]
        ])
    })

    describe('#makeErrorObject', () => {

        it('should return constructor name if error has no name', function () {
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

        makeCases('mapValues', {isJson: true}, [
            [{a: 2, b: 3}, {a: 1, b: 2}, function addOne(value) { return value + 1}]
        ])
    })

    describe('#nchars', () => {

        makeCases('nchars', {isError: true}, [
            ['ArgumentError',        5,  '']
          , ['ArgumentError', Infinity, ' ']
        ])

        makeCases('nchars', [
            ['cccccccc',     8, 'c']
          , ['c'       ,  true, 'c']
          , [''        , false, 'c']
        ])
    })

    describe('#nmap', () => {

        makeCases('nmap', {isError: true}, [
            ['ArgumentError', Infinity, noop]
        ])

        makeCases('nmap', {isJson: true}, [
            [[3,4,5,6] ,    4, function addThree(value) { return value + 3}]
          , [[2]       , true, function addTwo(value)   { return value + 2}]
        ])
    })

    describe('#ntimes', () => {

        makeCases('ntimes', {isError: true}, [
            ['ArgumentError', Infinity, noop]
        ])

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

        it('should interpret true as 1', function () {
            let v = 0
            Util.ntimes(true, () => v += 2)
            expect(v).to.equal(2)
        })
    })

    describe('#pad', () => {

        makeCases('pad', [
            [chalk.green('a') + '  ', chalk.green('a'),  'left', 3]
          , ['  ' + chalk.green('a'), chalk.green('a'), 'right', 3]
          , ['xx' + chalk.green('a'), chalk.green('a'), 'right', 3, 'x']
        ])
    })

    describe('#padEnd', () => {

        makeCases('padEnd', {isError: true}, [
            ['ArgumentError', 'x', Infinity, 'x']
          , ['ArgumentError', 'x',        5,  '']
        ])
    })

    describe('#padStart', () => {

        makeCases('padStart', {isError: true}, [
            ['ArgumentError', 'x', Infinity, 'x']
          , ['ArgumentError', 'x',        5,  '']
        ])
    })

    describe('#propsFrom', () => {

        it('should filter keys from array as second param', function () {
            const input = {a: 1, b: 2, c: 3}
            const keys = ['a', 'c']
            const exp = {a: 1, c: 3}
            const result = Util.propsFrom(input, keys)
            expect(result).to.jsonEqual(exp)
        })

        it('should accept empty first para', function () {
            const input = undefined
            const keys = ['a']
            const exp = {a: undefined}
            const result = Util.propsFrom(input, keys)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#randomElement', () => {

        it('should return singleton element', function () {
            const result = Util.randomElement([5])
            expect(result).to.equal(5)
        })

        it('should return undefined from empty array', function () {
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

        it('should not throw and return false for empty first arg', function () {
            const res = Util.rejectDuplicatePrompter()
            expect(res).to.equal(false)
        })
    })

    describe('#secret1', () => {

        it('should return string with length 64', function () {
            const res = Util.secret1()
            expect(res).to.have.length(64)
        })
    })

    describe('#sortNumericAsc', () => {

        it('should sort [32, 4, 1, 7] to [1, 4, 7, 32]', function () {
            const input = [32, 4, 1, 7]
            const exp = [1, 4, 7, 32]
            const result = input.sort(Util.sortNumericAsc)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#sortNumericDesc', () => {

        it('should sort [32, 4, 1, 7] to [32, 7, 4, 1]', function () {
            const input = [32, 4, 1, 7]
            const exp = [32, 7, 4, 1]
            const result = input.sort(Util.sortNumericDesc)
            expect(result).to.jsonEqual(exp)
        })
    })

    describe('#sp', () => {

        makeCases('sp', [
            ['a b c', 'a','b','c']
        ])
    })

    describe('#spreadScore', () => {

        const expCases = [
            {
                input : {a: 0, b: 1, c: 2},
                exp   : {a: 0, b: 1/3, c: 2/3},
                edesc : '{a:0, b:1/3, c:2/3}',
            },
            {
                input : {a: 0, b: 0, c: 0},
                exp   : {a: 1/3, b: 1/3, c: 1/3},
                edesc : '{a:1/3, b:1/3, c:1/3}',
            },
            {
                input : {a: -1, b: -1, c: -1},
                exp   : {a: 1/3, b: 1/3, c: 1/3},
                edesc : '{a:1/3, b:1/3, c:1/3}',
            },
            {
                input : {a: 0, b: 1, c: 2},
                exp   : {a: 2/3, b: 1/3, c:0},
                edesc : '{a: 2/3, b: 1/3, c:0}',
                isInverse: true,
            }
        ]

        expCases.forEach(({input, exp, edesc, isInverse}) => {

            const ijson = JSON.stringify(input)

            it(`should return ${edesc} for ${ijson} with isInverse=${isInverse}`, function () {
                const result = Util.spreadScore(input, isInverse)
                expect(result).to.jsonEqual(exp)
            })

            it(`should return same value after 2 calls for ${ijson}`, function () {
                const result1 = Util.spreadScore(input)
                const result2 = Util.spreadScore(result1)
                expect(result1).to.jsonEqual(result2)
            })

            it(`should invert and back again for 2 invert calls for ${ijson}`, function () {
                const result1 = Util.spreadScore(input)
                const result2 = Util.spreadScore(Util.spreadScore(result1, true), true)
                expect(result1).to.jsonEqual(result2)
            })
        })
    })

    describe('#stringWidth', () => {

        makeCases('stringWidth', [
            [0, null]
          , [4, chalk.green('asdf')]
        ])
    })

    describe('#stripLeadingSlash', () => {

        makeCases('stripLeadingSlash', [
            ['asdf', 'asdf']
          , ['asdf', '/asdf']
        ])
    })

    describe('#stripTrailingSlash', () => {

        makeCases('stripTrailingSlash', [
            ['asdf', 'asdf']
          , ['asdf', 'asdf/']
        ])
    })

    describe('#tildeHome', () => {

        makeCases('tildeHome', [
            [null                  , null]
          , [os.homedir() + '/foo' , '~/foo']
          , [`/tmp${os.homedir()}/foo` , `/tmp${os.homedir()}/foo`]
        ])
    })

    describe('#timestamp', () => {

        makeCases('timestamp', [
            [1627166054, new Date('2021-07-24T22:34:14.676Z')]
        ])

        it('should return integer when no date passed', function () {
            // coverage
            const res = Util.timestamp()
            expect(Number.isInteger(res)).to.equal(true)
        })
    })

    describe('#trimMessageData', () => {

        makeCases('trimMessageData', {isJson: true}, [
            [null                      , null]
          , [{turn: {}}                , {turn: {}}]
          , [{token: '***'}            , {token: 'foo/bar'}]
          , [{secret: '***'}           , {secret: 123}]
          , [{password: '***'}         , {password: 'abc'}]
          , [{passwordEncrypted: '***'}, {passwordEncrypted: 'enc_abc'}]
          , [
              {
                  turn: {
                      allowedMoveIndex: '[trimmed]',
                      allowedEndStates: '[trimmed]',
                      endStatesToSeries: '[trimmed]'
                  }
              }
            , {turn: {allowedMoveIndex: {}}}]
        ])
    })

    describe('#tstamp', () => {

        makeCases('tstamp', [
            [1627166054, new Date('2021-07-24T22:34:14.676Z')]
        ])
    })

    describe('#uniqueInts', () => {

        makeCases('uniqueInts', {isJson: true}, [
            [[1,2,3]     , [1,1,2,2,3,3]]
          , [[1,2,3,NaN] , [1,1,2,3,'a','a']]
        ])
    })

    describe('#uniqueStrings', () => {

        makeCases('uniqueStrings', {isJson: true}, [
            [['a','b'], ['a','a', 'b']]
        ])
    })

    describe('#uuid', () => {

        it('should return string of length 36', function () {
            const result = Util.uuid()
            expect(result).to.have.length(36)
        })
    })

    describe('#wsToHttp', () => {

        makeCases('wsToHttp', [
            ['http://localhost:8080' , 'ws://localhost:8080']
          , ['https://localhost:8181', 'wss://localhost:8181']
          , [null                  , null]
          , [''                    , '']
        ])
    })
})

describe('Profiler', () => {

    const Profiler = requireSrc('lib/util/profiler')

    it('should start/stop and have startCount of 1', function () {
        const profiler = Profiler.createEnabled()
        profiler.start('test')
        profiler.stop('test')
        expect(profiler.timers.test.startCount).to.equal(1)
    })

    it('should start/stop twice and have startCount of 2', function () {
        const profiler = Profiler.createEnabled()
        profiler.start('test')
        profiler.stop('test')
        profiler.start('test')
        profiler.stop('test')
        expect(profiler.timers.test.startCount).to.equal(2)
    })

    it('should reset startCount to 0', function () {
        const profiler = Profiler.createEnabled()
        profiler.start('test')
        profiler.stop('test')
        profiler.reset('test')
        expect(profiler.timers.test.startCount).to.equal(0)
    })

    it('should inc by 1', function () {
        const profiler = Profiler.createEnabled()
        profiler.inc('test')
        expect(profiler.counters.test.value).to.equal(1)
    })

    it('should inc by 1 twice', function () {
        const profiler = Profiler.createEnabled()
        profiler.inc('test')
        profiler.inc('test')
        expect(profiler.counters.test.value).to.equal(2)
    })

    it('should zero counter', function () {
        const profiler = Profiler.createEnabled()
        profiler.inc('test')
        profiler.zero('test')
        expect(profiler.counters.test.value).to.equal(0)
    })

    it('should not zero when disabled', function () {
        const profiler = Profiler.createEnabled()
        profiler.inc('test')
        profiler.enabled = false
        profiler.zero('test')
        expect(profiler.counters.test.value).to.equal(1)
    })

    it('should resetAll', function () {
        const profiler = Profiler.createEnabled()
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

    it('should not resetAll when disabled', function () {
        const profiler = Profiler.createEnabled()
        profiler.start('test1')
        profiler.stop('test1')
        profiler.enabled = false
        profiler.resetAll()
        expect(profiler.timers.test1.startCount).to.equal(1)
    })

    it('should not reset when disabled', function () {
        const profiler = Profiler.createEnabled()
        profiler.start('test1')
        profiler.stop('test1')
        profiler.enabled = false
        profiler.reset('test1')
        expect(profiler.timers.test1.startCount).to.equal(1)
    })

    it('should not zero when disabled', function () {
        const profiler = Profiler.createEnabled()
        profiler.inc('test')
        profiler.enabled = false
        profiler.zero('test')
        expect(profiler.counters.test.value).to.equal(1)
    })

    it('should throw IllegalStateError on double start', function () {
        const profiler = Profiler.createEnabled()
        profiler.start('test1')
        const err = getError(() => profiler.start('test1'))
        expect(err.name).to.equal('IllegalStateError')
    })
})

describe('Counter', () => {

    const Counter = requireSrc('lib/util/counter')

    it('should give a default name', () => {
        const counter = new Counter
        expect(counter.name).to.have.length.greaterThan(0)
    })
})

describe('Timer', () => {

    const Timer = requireSrc('lib/util/timer')

    it('should throw IllegalStateError on stop unstarted', function () {
        const timer = new Timer
        const err = getError(() => timer.stop())
        expect(err.name).to.equal('IllegalStateError')
    })
})

describe('DependencyHelper', () => {

    const DependencyHelper = requireSrc('lib/util/dependency-helper')

    it('should throw MissingDependencyError', function () {

        const roots = ['Default']
        // missing c, d
        const configs = {
            a: ['c']
          , b: ['c', 'd', 'e']
          , e: ['Default']
          , f: ['Default', 'b', 'c']
        }
        const helper = new DependencyHelper(roots)
        for (const name in configs) {
            helper.add(name, configs[name])
        }
        const err = getError(() => helper.resolve())
        expect(err.name).to.equal('MissingDependencyError')

    })

    it('should resolve basic case', function () {

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
        for (const name in configs) {
            helper.add(name, configs[name])
        }
        // load order should be 
        const exp = ['e', 'c', 'a', 'd', 'b', 'f']
        const result = helper.resolve()

        expect(result).to.jsonEqual(exp)
    })

    it('should throw CircularDependencyError for tight circle', function () {

        const helper = new DependencyHelper
        helper.add('a', ['b'])
        const err = getError(() => helper.add('b', ['a']))

        expect(err.name).to.equal('CircularDependencyError')
    })

    it('should throw UnresolvedDependencyError for bigger circle', function () {
        const helper = new DependencyHelper
        const configs = {
            a: ['b']
          , b: ['c']
          , c: ['d']
          , d: ['a']
        }
        for (const name in configs) {
            helper.add(name, configs[name])
        }
        const err = getError(() => helper.resolve())

        expect(err.name).to.equal('UnresolvedDependencyError')
    })

    it('should throw DependencyError for duplicate name', function () {
        const helper = new DependencyHelper
        helper.add('a', ['b'])
        const err = getError(() => helper.add('a', ['c']))
        expect(err.isDependencyError).to.equal(true)
    })
})

describe('StringBuilder', () => {

    const StringBuilder = requireSrc('lib/util/string-builder')

    describe('#length', () => {

        it('should return 5 with add one char five times', function () {
            const b = new StringBuilder
            b.add('a', 'b', 'c', 'd', 'e')
            const res = b.length()
            expect(res).to.equal(5)
        })
    })

    describe('#replace', () => {

        it('should replace arr', function () {
            const b = new StringBuilder
            b.add('a', 'b', 'c')
            b.replace('c')
            expect(b.toString()).to.equal('c')
        })
    })
})