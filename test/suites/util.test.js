const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    requireSrc
} = TestUtil

const Util = requireSrc('lib/util')
const {Profiler, Counter, Timer, DependencyHelper} = Util

describe('Util', () => {
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
            expect(JSON.stringify(arr)).to.equal(JSON.stringify(exp))
            expect(result).to.equal(true)
        })

        it('should increment [0.1, 0.1, 1.0] to [0.1, 0.2, 0.1] and return true', () => {
            const arr = [0.1, 0.1, 1.0]
            const exp = [0.1, 0.2, 0.1]
            const result = Util.arrayIncrement(arr, inc, min, max)
            expect(JSON.stringify(arr)).to.equal(JSON.stringify(exp))
            expect(result).to.equal(true)
        })

        it('should not increment [1.0, 1.0, 1.0] and return false', () => {
            const arr = [1.0, 1.0, 1.0]
            const exp = arr.slice(0)
            const result = Util.arrayIncrement(arr, inc, min, max)
            expect(JSON.stringify(arr)).to.equal(JSON.stringify(exp))
            expect(result).to.equal(false)
        })

        it('should increment [0.1, 0.1, 0.1] to [1.0, 1.0, 1.0] in loop', () => {
            const arr = [0.1, 0.1, 0.1]
            const exp = [1.0, 1.0, 1.0]
            do {
                var result = Util.arrayIncrement(arr, inc, min, max)
            } while (result)
            expect(JSON.stringify(arr)).to.equal(JSON.stringify(exp))
            expect(result).to.equal(false)
        })
    })

    describe('#castToArray', () => {

        it('should return singleton [1] for input 1', () => {
            const result = Util.castToArray(1)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([1]))
        })

        it('should return empty list for undefined', () => {
            const result = Util.castToArray(undefined)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([]))
        })

        it('should return empty list for null', () => {
            const result = Util.castToArray(null)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([]))
        })

        it('should return singleton false for input false', () => {
            const result = Util.castToArray(false)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([false]))
        })

        it('should return singleton 0 for input 0', () => {
            const result = Util.castToArray(0)
            expect(JSON.stringify(result)).to.equal(JSON.stringify([0]))
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
            expect(JSON.stringify(res)).to.equal(JSON.stringify([[1], [2]]))
        })
    })

    describe('#countDecimalPlaces', () => {

        it('should return 0 for 1', () => {
            const res = Util.countDecimalPlaces(1)
            expect(res).to.equal(0)
        })

        it('should return 1 for 1.1', () => {
            const res = Util.countDecimalPlaces(1.1)
            expect(res).to.equal(1)
        })

        it('should return 2 for 1.11', () => {
            const res = Util.countDecimalPlaces(1.11)
            expect(res).to.equal(2)
        })
    })

    describe('#defaults', () => {

        it('should return only keys from first param', () => {
            const defaults = {a: 1, b: 2}
            const opts = {a: 1, c: 3}
            const result = Util.defaults(defaults, opts)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(defaults))
        })

        it('should override default with opts', () => {
            const defaults = {a: 1, b: 2}
            const opts = {a: 1, b: 3}
            const result = Util.defaults(defaults, opts)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(opts))
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

    describe('#makeErrorObject', () => {

        it('should return constructor name if error has no name', () => {
            const err = new Error
            err.name = null
            const result = Util.makeErrorObject(err)
            expect(result.name).to.equal('Error')
        })
    })

    describe('#propsFrom', () => {

        it('should filter keys from array as second param', () => {
            const input = {a: 1, b: 2, c: 3}
            const keys = ['a', 'c']
            const exp = {a: 1, c: 3}
            const result = Util.propsFrom(input, keys)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })

        it('should accept empty first para', () => {
            const input = undefined
            const keys = ['a']
            const exp = {a: undefined}
            const result = Util.propsFrom(input, keys)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
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

    describe('#roundTo', () => {

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
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })
    })

    describe('#sortNumericDesc', () => {

        it('should sort [32, 4, 1, 7] to [32, 7, 4, 1]', () => {
            const input = [32, 4, 1, 7]
            const exp = [32, 7, 4, 1]
            const result = input.sort(Util.sortNumericDesc)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
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
                expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
            })

            it('should return same value after 2 calls for ' + JSON.stringify(input), () => {
                const result1 = Util.spreadScore(input)
                const result2 = Util.spreadScore(result1)
                expect(JSON.stringify(result1)).to.equal(JSON.stringify(result2))
            })

            it('should invert and back again for 2 invert calls for ' + JSON.stringify(input), () => {
                const result1 = Util.spreadScore(input)
                const result2 = Util.spreadScore(Util.spreadScore(result1, true), true)
                expect(JSON.stringify(result1)).to.equal(JSON.stringify(result2))
            })
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

    describe('#uniqueInts', () => {

        it('should return [1,2,3] for [1,1,2,2,3,3]', () => {
            const input = [1, 1, 2, 2, 3, 3]
            const exp = [1, 2, 3]
            const result = Util.uniqueInts(input)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
        })
    })

    describe('#uniqueStrings', () => {

        it('should return [a, b] for [a, a, b]', () => {
            const input = ['a', 'a', 'b']
            const result = Util.uniqueStrings(input)
            expect(JSON.stringify(result)).to.equal(JSON.stringify(['a', 'b']))
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

        expect(JSON.stringify(result)).to.equal(JSON.stringify(exp))
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