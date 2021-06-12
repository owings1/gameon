/**
 * gameon - Util class
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
const crypto    = require('crypto')
const emailval  = require('email-validator')
const Errors    = require('./errors')
const merge     = require('merge')
const path      = require('path')
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
        // the || 0 was never called in tests, and it so far seems unnecessary
        return num.toString().split('.')[1].length //|| 0
    }

    static defaults(defaults, ...opts) {
        return Util.propsFrom(Util.merge({}, defaults, ...opts), defaults)
    }

    static escapeRegex(str) {
        // from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    static filenameWithoutExtension(str) {
        return Util.filepathWithoutExtension(path.basename(str))
    }

    static filepathWithoutExtension(str) {
        return str.replace(/\.[^/.]+$/, '')
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

    static makeErrorObject(err) {
        return {
            isError         : true
          , error           : err.message || err.name
          , name            : err.name || err.constructor.name
          , isRequestError  : err.isRequestError
          , isAuthError     : err.isAuthError
          , isInternalError : err.isInternalError
        }
    }

    static merge(...args) {
        return merge(...args)
    }

    static nmap(n, cb) {
        const arr = []
        for (var i = 0; i < n; ++i) {
            arr.push(cb(i))
        }
        return arr
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
        const iobj = {}
        var size = 0
        var minRaw = Infinity
        for (var k in obj) {
            iobj[k] = isInverse ? -obj[k] : obj[k]
            if (iobj[k] < minRaw) {
                minRaw = iobj[k]
            }
            size += 1
        }
        const normObj = {}
        var scale = 0
        for (var k in obj) {
            normObj[k] = iobj[k] - minRaw
            scale += normObj[k]
        }
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

    static isValidEmail(str) {
        return emailval.validate(str)
    }

    static timestamp() {
        return Math.floor(+new Date / 1000)
    }

    // from:  https://stackoverflow.com/questions/60369148/how-do-i-replace-deprecated-crypto-createcipher-in-nodejs
    static encrypt1(text, key) {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(key), iv)
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
        return [iv.toString('hex'), encrypted.toString('hex')].join(':')
    }

    static decrypt1(text, key) {
        const textParts = text.split(':')
        const iv = Buffer.from(textParts.shift(), 'hex')
        const encryptedText = Buffer.from(textParts.join(':'), 'hex')
        const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(key), iv)
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()])
        return decrypted.toString()
    }

    static wsToHttp(str) {
        return str.replace(/^(ws)/, 'http')
    }

    static httpToWs(str) {
        return str.replace(/^(http)/, 'ws')
    }

    static stripLeadingSlash(str) {
        if (str && str[0] == '/') {
            return str.substring(1)
        }
        return str
    }

    static stripTrailingSlash(str) {
        if (str && str[str.length - 1] == '/') {
            return str.substring(0, str.length - 1)
        }
        return str
    }

    static ucfirst(str) {
        return str.substring(0, 1).toUpperCase() + str.substring(1)
    }
}

var timerSuffix = 0
var counterSuffix = 0

class Timer {

    // For more resolution, see https://stackoverflow.com/a/18197438/794513

    constructor(name) {
        this.name = name || 'Timer' + ++timerSuffix
        this.startTime = null
        this.isRunning = false
        this.elapsed = 0
        this.startCount = 0
    }

    start() {
        if (this.isRunning) {
            throw new IllegalStateError('Timer already started')
        }
        this.startTime = +new Date
        this.isRunning = true
        this.startCount += 1
    }

    stop() {
        if (!this.isRunning) {
            throw new IllegalStateError('Timer not started')
        }
        this.elapsed += +new Date - this.startTime
        this.isRunning = false
    }

    reset() {
        this.elapsed = 0
        this.startCount = 0
    }
}

class Counter {

    constructor(name) {
        this.name = name || 'Counter' + ++counterSuffix
        this.value = 0
    }

    inc(amount = 1) {
        this.value += amount
    }

    zero() {
        this.value = 0
    }
}

class Profiler {

    static createEnabled() {
        return new Profiler
    }

    static createDisabled() {
        const profiler = new Profiler
        profiler.enabled = false
        return profiler
    }

    constructor() {
        this.timers = {}
        this.counters = {}
        this.enabled = true
    }

    start(name) {
        if (!this.enabled) {
            return
        }
        if (!this.timers[name]) {
            this.timers[name] = new Timer(name)
        }
        this.timers[name].start()
    }

    stop(name) {
        if (!this.enabled) {
            return
        }
        this.timers[name].stop()
    }

    reset(name) {
        if (!this.enabled) {
            return
        }
        this.timers[name].reset()
    }

    resetAll() {
        if (!this.enabled) {
            return
        }
        for (var name in this.timers) {
            this.reset(name)
        }
        for (var name in this.counters) {
            this.zero(name)
        }
    }

    inc(name, amount) {
        if (!this.enabled) {
            return
        }
        if (!this.counters[name]) {
            this.counters[name] = new Counter(name)
        }
        this.counters[name].inc(amount)
    }

    zero(name) {
        if (!this.enabled) {
            return
        }
        this.counters[name].zero()
    }
}

class StringBuilder {

    constructor(...args) {
        this.arr = []
        this.add(...args)
    }

    add(...args) {
        for (var i = 0, ilen = args.length; i < ilen; ++i) {
            var arg = args[i]
            if (arg instanceof StringBuilder) {
                this.arr.push(arg.toString())
            } else {
                this.arr.push(arg)
            }
        }
        return this
    }

    sp(...args) {
        return this.add(args.join(' '))
    }

    replace(...args) {
        const b = new StringBuilder(...args)
        this.arr = b.arr
        return this
    }

    length() {
        return this.toString().length
    }

    join(sep) {
        return this.arr.join(sep)
    }

    toString() {
        return this.arr.join('')
    }
}

class DependencyHelper {

    constructor(roots) {
        this.resolved = {}
        this.unresolved = {}
        this.added = {}
        this.order = []
        if (roots) {
            roots.forEach(name => this.resolved[name] = true)
        }
    }

    add(name, dependencies) {

        if (this.added[name]) {
            throw new DependencyError('Duplicate name: ' + name)
        }
        this.added[name] = true

        this.unresolved[name] = {}

        if (dependencies) {
            dependencies.forEach(dependency => {
                if (!this.resolved[dependency]) {
                    if (this.unresolved[dependency] && this.unresolved[dependency][name]) {
                        throw new CircularDependencyError('Circular dependecy: ' + name + ' <-> ' + dependency)
                    }
                    this.unresolved[name][dependency] = true
                }
            })
        }

        if (!Object.keys(this.unresolved[name]).length) {
            if (!this.resolved[name]) {
                this.resolved[name] = true
                this.order.push(name)
            }
            delete this.unresolved[name]
        }
    }

    resolve() {

        const missing = {}

        for (var name in this.unresolved) {
            for (var dependency in this.unresolved[name]) {
                if (!this.added[dependency]) {
                    missing[dependency] = true
                }
            }
        }
        if (Object.keys(missing).length) {
            throw new MissingDependencyError('Missing dependencies ' + Object.keys(missing).join(', '))
        }

        do {
            var count = this.resolveLoop()
        } while (count > 0)

        const unresolvedNames = Object.keys(this.unresolved)
        if (unresolvedNames.length) {
            throw new UnresolvedDependencyError('Unmet dependecies for: ' + unresolvedNames.join(', '))
        }

        return this.order
    }

    resolveLoop() {

        var count = 0

        Object.keys(this.unresolved).forEach(name => {

            Object.keys(this.unresolved[name]).forEach(dependency => {
                if (this.resolved[dependency]) {
                    count += 1
                    delete this.unresolved[name][dependency]
                }
            })

            if (!Object.keys(this.unresolved[name]).length) {
                this.resolved[name] = true
                this.order.push(name)
                delete this.unresolved[name]
            }
        })

        return count
    }
}

const {
    CircularDependencyError
  , DependencyError
  , IllegalStateError
  , MissingDependencyError
  , UnresolvedDependencyError
} = Errors

Util.Counter = Counter
Util.Timer = Timer
Util.Profiler = Profiler
Util.StringBuilder = StringBuilder
Util.DependencyHelper = DependencyHelper

module.exports = Util