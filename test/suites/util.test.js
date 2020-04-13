const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    requireSrc
} = TestUtil

const Util = requireSrc('lib/util')

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

describe('#joinSpace', () => {

    it('should join all three params with space', () => {
        const input = ['a', 'b', 'c']
        const exp = 'a b c'
        const result = Util.joinSpace(...input)
        expect(result).to.equal(exp)
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

describe('uuid', () => {

    it('should return string of length 36', () => {
        const result = Util.uuid()
        expect(result).to.have.length(36)
    })
})