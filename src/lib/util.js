const merge     = require('merge')
const stripAnsi = require('strip-ansi')
const uuid      = require('uuid')

class Util {

    static arrayIncrement(arr, inc, min, max, place) {
        const precision = Util.countDecimalPlaces(inc)
        if (typeof place == 'undefined') {
            place = arr.length - 1
        }
        if (arr[place] + inc <= max) {
            arr[place] = Util.roundTo(arr[place] + inc, precision)
            return true
        }
        if (place == 0) {
            return false
        }
        if (Util.arrayIncrement(arr, inc, min, max, place - 1)) {
            arr[place] = min
            return true
        }
        return false
    }

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

    static chunkArray(arr, numChunks) {
        const chunks = Util.intRange(1, numChunks).map(() => [])
        var c = 0
        while (arr.length > 0) {
            chunks[c].push(arr.shift())
            c += 1
            if (c == chunks.length) {
                c = 0
            }
        }
        return chunks
    }

    // adapted from: https://stackoverflow.com/a/17369245
    static countDecimalPlaces(num) {
        if (Math.floor(num.valueOf()) === num.valueOf()) {
            return 0
        }
        return num.toString().split('.')[1].length || 0
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

    // from: https://stackoverflow.com/a/15762794
    static roundTo(n, digits) {
        var isNegative = false
        if (typeof digits == 'undefined') {
            digits = 0
        }
        if (n < 0) {
            isNegative = true
            n = n * -1
        }
        const multiplicator = Math.pow(10, digits)
        n = parseFloat((n * multiplicator).toFixed(11))
        n = (Math.round(n) / multiplicator).toFixed(2)
        if (isNegative) {
            n = (n * -1).toFixed(2)
        }
        return +n
    }

    static sortNumericAsc(a, b) {
        return a - b
    }

    static sortNumericDesc(a, b) {
        return b - a
    }

    static spreadRanking(obj, isInverse) {
        const size = Object.keys(obj).length
        const iobj = {}
        for (var k in obj) {
            iobj[k] = isInverse ? -obj[k] : obj[k]
        }
        const minRaw = Math.min(...Object.values(iobj))
        const normObj = {}
        for (var k in obj) {
            normObj[k] = iobj[k] - minRaw
        }
        const scale = Util.sumArray(Object.values(normObj))
        const spreadObj = {}
        for (var k in obj) {
            if (scale == 0) {
                // all values are equal
                spreadObj[k] = 1 / size
            } else {
                spreadObj[k] = normObj[k] / scale
            }
        }
        return spreadObj
    }

    static stripAnsi(str) {
        return stripAnsi(str)
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

    static errMessage(cb) {
        try {
            cb()
        } catch (err) {
            return err.message || false
        }
        return true
    }
}

module.exports = Util