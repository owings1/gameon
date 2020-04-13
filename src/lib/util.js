const merge = require('merge')
const uuid  = require('uuid')

class Util {

    // used with permission
    static castToArray(val) {
        if (Array.isArray(val)) {
            return val
        }
        const arr = []
        if (val !== null && typeof(val) != 'undefined') {
            arr.push(val)
        }
        return arr
    }

    static defaults(defaults, ...opts) {
        return Util.propsFrom(Util.merge({}, defaults, ...opts), defaults)
    }

    static intRange(a, b) {
        const range = []
        for (var i = a; i <= b; i++) {
            range.push(i)
        }
        return range
    }

    static joinSpace(...args) {
        return args.join(' ')
    }

    static merge(...args) {
        return merge(...args)
    }

    static propsFrom(obj, keys) {
        keys = Array.isArray(keys) ? keys : Object.keys(keys)
        obj = obj || {}
        const ret = {}
        for (var k of keys) {
            ret[k] = obj[k]
        }
        return ret
    }

    static randomElement(arr) {
        const i = Math.floor(Math.random() * arr.length)
        return arr[i]
    }

    static sortNumericAsc(a, b) {
        return a - b
    }

    static sortNumericDesc(a, b) {
        return b - a
    }

    static sumArray(arr) {
        return arr.reduce((acc, cur) => acc + cur, 0)
    }

    static uniqueInts(arr) {
        return Util.uniquePrimitives(arr).map(it => +it)
    }

    static uniqueStrings(arr) {
        return Util.uniquePrimitives(arr).map(it => '' + it)
    }

    static uniquePrimitives(arr) {
        const map = {}
        arr.forEach(it => map[it] = true)
        return Object.keys(map)
    }

    static uuid() {
        return uuid.v4()
    }
}

module.exports = Util