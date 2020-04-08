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
        const map = {}
        arr.forEach(it => map[it] = true)
        return Object.keys(map).map(it => +it)
    }
}

module.exports = Util