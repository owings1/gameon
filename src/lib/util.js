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
const Errors = require('./errors')

const chalk       = require('chalk')
const cliWidth    = require('cli-width')
const crypto      = require('crypto')
const emailval    = require('email-validator')
const os          = require('os')
const path        = require('path')
const stringWidth = require('string-width')
const stripAnsi   = require('strip-ansi')
const uuid        = require('uuid')

class Util {

    static append(arr, values) {
        values.forEach(value => arr.push(value))
        return arr
    }

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

    /**
     * @param {array} The lines to chunk
     * @param {integer} The max width
     * @return {array} One array of chunked lines for each input line
     */
    static breakLines(lines, width) {
        if (!Number.isInteger(width) || width < 2) {
            // Allow for width Infinity, protect againt NaN or < 1, still make a copy.
            return lines.slice(0)
        }
        // Matches all consecutive ANSI sequences from the beginning of the string.
        const ansiRegex = /^(\x1B([[0-9;]*m)?)+/
        return lines.map(line => {
            const chunk = []
            let thisLine = ''
            for (let i = 0; i < line.length; ++i) {
                const ansiMatch = line.substr(i).match(ansiRegex)
                if (ansiMatch) {
                    // Add all consecutive ANSI controls, since they do not increase the
                    // width. This also prevents an extra line at the end if it is just a
                    // closing color code.
                    const ansiLength = ansiMatch[0].length
                    thisLine += line.substr(i, ansiLength)
                    i += ansiLength
                }
                // We could try to optimize here by grabbing more than just the next
                // character, but we would have to be prepared to backtrack if we end
                // up exceeding the width.
                const nextChar = line[i] || ''
                if (Util.stringWidth(thisLine + nextChar) > width) {
                    // If adding the next character to the line would exceed the width,
                    // then start a new line.
                    chunk.push(thisLine)
                    thisLine = ''
                }
                thisLine += nextChar
            }
            if (thisLine) {
                chunk.push(thisLine)
            }
            return chunk
        })
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
        let c = 0
        while (arr.length > 0) {
            chunks[c].push(arr.shift())
            c += 1
            if (c == chunks.length) {
                c = 0
            }
        }
        return chunks
    }

    static get cliWidth() {
        return cliWidth
    }

    // adapted from: https://stackoverflow.com/a/17369245
    static countDecimalPlaces(num) {
        if (Math.floor(num.valueOf()) === num.valueOf()) {
            return 0
        }
        // the || 0 was never called in tests, and it so far seems unnecessary
        return num.toString().split('.')[1].length //|| 0
    }

    static createHash(type, input, digest) {
        const hash = crypto.createHash(type)
        if (input == null) {
            return hash
        }
        hash.update(input)
        if (digest == null) {
            return hash
        }
        return hash.digest(digest)
    }

    // from:  https://stackoverflow.com/questions/60369148/how-do-i-replace-deprecated-crypto-createcipher-in-nodejs
    static decrypt1(text, key) {
        if (!text || text.length < 41) {
            throw new ArgumentError('Invalid text argument')
        }
        if (!key || key.length != 32) {
            throw new ArgumentError('Invalid key argument')
        }
        const textParts = text.split(':')
        const iv = Buffer.from(textParts.shift(), 'hex')
        if (iv.length != 16) {
            throw new ArgumentError('Invalid IV length')
        }
        const encryptedText = Buffer.from(textParts.join(':'), 'hex')
        const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(key), iv)
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()])
        return decrypted.toString()
    }

    static defaults(defaults, ...opts) {
        let obj = {...defaults}
        opts.forEach(opts => obj = {...obj, ...opts})
        return Util.propsFrom(obj, defaults)
    }

    static destroyAll(obj) {
        Object.values(obj).forEach(it => it.destroy())
    }

    // from:  https://stackoverflow.com/questions/60369148/how-do-i-replace-deprecated-crypto-createcipher-in-nodejs
    static encrypt1(text, key) {
        if (!text || !text.length) {
            throw new ArgumentError('Invalid text argument')
        }
        if (!key || key.length != 32) {
            throw new ArgumentError('Invalid key argument')
        }
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(key), iv)
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
        return [iv.toString('hex'), encrypted.toString('hex')].join(':')
    }

    static ensure(target, defaults) {
        Object.entries(defaults).forEach(([name, method]) => {
            if (!(name in target)) {
                target[name] = method
            }
        })
        return target
    }

    static errMessage(cb) {
        try {
            cb()
        } catch (err) {
            return err.message || false
        }
        return true
    }

    static escapeRegex(str) {
        // from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    static extendClass(TargetClass, SourceClass, opts) {

        opts = opts || {}

        Object.values(['overrides', 'optionals']).forEach(key => {
            if (opts[key] === true) {
                opts[key] = {'*': true}
            } else if (opts[key] === false) {
                opts[key] = {}
            } else {
                opts[key] = Util.keyValuesTrue(Util.castToArray(opts[key]))
            }
        })

        const {overrides, optionals} = opts
        const isOverride = overrides['*'] || opts.isOverride
        const isOptional = optionals['*'] || opts.isOptional

        Object.getOwnPropertyNames(SourceClass.prototype).forEach(name => {
            if (name == 'constructor' || name == '_constructor') {
                return
            }
            if (name in TargetClass.prototype) {
                if (!isOverride && !overrides[name]) {
                    if (isOptional || optionals[name]) {
                        return
                    }
                    throw new ProgrammerError(`Class ${TargetClass.name} already has method ${name}`)
                }
            }
            TargetClass.prototype[name] = SourceClass.prototype[name]
        })

        return TargetClass
    }

    static fileDateString(date) {
        date = date || new Date
        const b = new StringBuilder
        b.add(
            [
                date.getFullYear()
              , (date.getMonth() + 1)
              , date.getDate()
            ].map(n => n.toString().padStart(2, '0')).join('-')
        )
        b.add(
            [
                date.getHours()
              , date.getMinutes()
              , date.getSeconds()
            ].map(n => n.toString().padStart(2, '0')).join('-')
        )
        b.add(
            date.getMilliseconds().toString().padStart(3, '0')
        )
        return b.join('_')
    }

    static filenameWithoutExtension(str) {
        return Util.filepathWithoutExtension(path.basename(str))
    }

    static filepathWithoutExtension(str) {
        return str.replace(/\.[^/.]+$/, '')
    }

    /**
     * From inquirer/lib/utils/screen-manager.
     */
    static forceLineReturn(content, width) {
        return Util.breakLines(content.split('\n'), width).flat().join('\n')
    }

    static get hash() {
        return Util.createHash
    }

    static homeTilde(str) {
        if (str == null) {
            return str
        }
        const homeDir = os.homedir()
        if (str.indexOf(homeDir) != 0) {
            return str
        }
        return '~' + str.substring(homeDir.length)
    }

    static httpToWs(str) {
        if (!str) {
            return str
        }
        return str.replace(/^(http)/, 'ws')
    }

    static intRange(a, b) {
        const range = []
        for (let i = a; i <= b; ++i) {
            range.push(i)
        }
        return range
    }

    static isCredentialsFilled(credentials, isServer) {
        return Boolean(
            credentials.username && credentials.password && (!isServer || credentials.serverUrl)
        )
    }

    static isEmptyObject(obj) {
        if (obj == null) {
            return true
        }
        for (var k in obj) {
            return false
        }
        return true
    }

    static isValidEmail(str) {
        return emailval.validate(str)
    }

    static keypressName(e) {
        if (e.key.name == 'escape') {
            return e.key.name
        }
        const parts = ['ctrl', 'meta', 'shift'].filter(it => e.key[it])
        if (parts.length) {
            parts.push(e.key.name)
            return parts.join('-')
        }
        if (e.value == null && e.key.name) {
            return e.key.name
        }
        if (e.key.name && e.key.name.length > 1) {
            return e.key.name
        }
        return e.value || ''
    }

    static keyValuesTrue(input) {
        return Object.fromEntries(Object.values(input).map(value => [value, true]))
    }

    static makeErrorObject(err, depth = 1) {
        const obj = {
            isError : true
          , error   : err.message || err.name
          , name    : err.name || err.constructor.name
        }
        for (let prop in err) {
            if (!err.hasOwnProperty(prop)) {
                continue
            }
            if (obj[prop] != null) {
                continue
            }
            let value = err[prop]
            if (value instanceof Error) {
                if (depth < 2) {
                    obj[prop] = Util.makeErrorObject(value, depth + 1)
                } else {
                    obj[prop] = {
                        name: value.name || value.constructor.name
                    }
                }
            } else {
                obj[prop] = value
            }
        }
        return obj
    }

    static nchars(n, chr) {
        if (!chr.length) {
            throw new InvalidCharError(`Unrepeatable character: '${chr}'`)
        }
        if (n == Infinity) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        return ''.padEnd(n, chr)
    }

    // returns a new object with the same keys, transforming
    // values with cb.
    static mapValues(obj, cb) {
        return Object.fromEntries(
            Object.entries(obj).map(
                ([k, v]) => [k, cb(v)]
            )
        )
    }

    static nmap(n, cb) {
        if (n == Infinity) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        const arr = []
        for (let i = 0; i < n; ++i) {
            arr.push(cb(i))
        }
        return arr
    }

    static ntimes(n, cb) {
        if (n == Infinity) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        let ret
        for (let i = 0; i < n; ++i) {
            ret = cb(i)
        }
        return ret
    }

    // ansi safe
    static pad(str, align, width, chr = ' ') {
        if (align == 'right') {
            return Util.padStart(str, width, chr)
        }
        return Util.padEnd(str, width, chr)
    }

    // ansi safe
    static padEnd(str, n, chr) {
        if (!chr.length) {
            throw new InvalidCharError(`Unrepeatable character: '${chr}'`)
        }
        if (n == Infinity) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        while (Util.stripAnsi(str).length < n) {
            str += chr
        }
        return str
    }

    // ansi safe
    static padStart(str, n, chr) {
        if (!chr.length) {
            throw new InvalidCharError(`Unrepeatable character: '${chr}'`)
        }
        if (n == Infinity) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        while (Util.stripAnsi(str).length < n) {
            str = chr + str
        }
        return str
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

    static rejectDuplicatePrompter(prompter, reject = null) {
        if (!prompter) {
            return false
        }
        let activeName = null
        if (prompter.ui && prompter.ui.activePrompt) {
            const {activePrompt} = prompter.ui
            activeName = activePrompt.opt.name
        }
        const err = new PromptActiveError(`A prompt is already active: ${activeName}`)
        if (reject) {
            reject(err)
            return true
        }
        throw err
    }

    // from: https://stackoverflow.com/a/15762794
    static roundTo(n, digits) {
        let isNegative = false
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

    static secret1() {
        return crypto.createHash('sha256').update(Util.uuid()).digest('hex')
    }

    static sortNumericAsc(a, b) {
        return a - b
    }

    static sortNumericDesc(a, b) {
        return b - a
    }

    // Join space
    static sp(...args) {
        return args.join(' ')
    }

    static spreadScore(obj, isInverse) {
        const iobj = {}
        let size = 0
        let minRaw = Infinity
        for (var k in obj) {
            iobj[k] = isInverse ? -obj[k] : obj[k]
            if (iobj[k] < minRaw) {
                minRaw = iobj[k]
            }
            size += 1
        }
        const normObj = {}
        let scale = 0
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

    static get stripAnsi() {
        return stripAnsi
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

    static get stringWidth() {
        return stringWidth
    }

    // ansi safe
    static get strlen() {
        return stringWidth
    }

    static sumArray(arr) {
        return arr.reduce((acc, cur) => acc + cur, 0)
    }

    static tildeHome(str) {
        if (str == null) {
            return str
        }
        if (str.indexOf('~') != 0) {
            return str
        }
        return os.homedir() + str.substring(1)
    }

    static timestamp(date) {
        date = date || new Date
        return Math.floor(+date / 1000)
    }

    static trimMessageData(data) {
        if (!data) {
            return data
        }
        const trimmed = {...data}
        if (data.secret) {
            trimmed.secret = '***'
        }
        if (data.password) {
            trimmed.password = '***'
        }
        if (data.passwordEncrypted) {
            trimmed.passwordEncrypted = '***'
        }
        if (data.token) {
            trimmed.token = '***'
        }
        if (data.turn) {
            trimmed.turn = {...data.turn}
            if (data.turn.allowedMoveIndex) {
                Util.update(trimmed.turn, {
                    allowedEndStates: '[trimmed]'
                  , allowedMoveIndex: '[trimmed]'
                  , endStatesToSeries: '[trimmed]'
                })
            }
        }
        return trimmed
    }

    static get tstamp() {
        return Util.timestamp
    }

    static ucfirst(str) {
        if (str == null || !str.length) {
            return str
        }
        return str.substring(0, 1).toUpperCase() + str.substring(1)
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

    static update(target, source) {
        target = target || {}
        source = source || {}
        Object.entries(source).forEach(([key, value]) => {
            target[key] = value
        })
        return target
    }

    static uuid() {
        return uuid.v4()
    }

    static wsToHttp(str) {
        if (!str) {
            return str
        }
        return str.replace(/^(ws)/, 'http')
    }
}

class Counter {

    constructor(name) {
        this.isCounter = true
        this.name = name || 'Counter' + CounterCounter.inc().value
        this.value = 0
    }

    inc(amount = 1) {
        this.value += amount
        return this
    }

    zero() {
        this.value = 0
        return this
    }

    // for parallel api with timer
    getCount() {
        return this.value
    }
}

const CounterCounter = new Counter('CounterCounter')
const TimerCounter   = new Counter('TimerCounter')

class Timer {

    // For more resolution, see https://stackoverflow.com/a/18197438/794513

    constructor(name) {
        this.isTimer = true
        this.name = name || 'Timer' + TimerCounter.inc().value
        this.startTime = null
        this.isRunning = false
        this.elapsed = 0
        this.startCount = 0
        this.average = null
    }

    start() {
        if (this.isRunning) {
            throw new IllegalStateError('Timer already started')
        }
        this.startTime = +new Date
        this.isRunning = true
        this.startCount += 1
        return this
    }

    stop() {
        if (!this.isRunning) {
            throw new IllegalStateError('Timer not started')
        }
        this.elapsed += +new Date - this.startTime
        this.average = this.elapsed / this.startCount
        this.isRunning = false
        return this
    }

    reset() {
        this.elapsed = 0
        this.startCount = 0
        this.average = null
        return this
    }

    // for parallel api with counter
    getCount() {
        return this.startCount
    }
}

class Profiler {

    static getDefaultInstance() {
        return DefaultProfiler
    }

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
        return this
    }

    stop(name) {
        if (!this.enabled) {
            return
        }
        this.timers[name].stop()
        return this
    }

    reset(name) {
        if (!this.enabled) {
            return
        }
        this.timers[name].reset()
        return this
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
        return this
    }

    inc(name, amount) {
        if (!this.enabled) {
            return
        }
        if (!this.counters[name]) {
            this.counters[name] = new Counter(name)
        }
        this.counters[name].inc(amount)
        return this
    }

    zero(name) {
        if (!this.enabled) {
            return
        }
        this.counters[name].zero()
        return this
    }
}

const DefaultProfiler = Profiler.createDisabled()

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
            throw new DependencyError(`Duplicate name: ${name}`)
        }
        this.added[name] = true

        this.unresolved[name] = {}

        if (dependencies) {
            dependencies.forEach(dependency => {
                if (!this.resolved[dependency]) {
                    if (this.unresolved[dependency] && this.unresolved[dependency][name]) {
                        throw new CircularDependencyError(`Circular dependecy: ${name} <-> ${dependency}`)
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
            throw new MissingDependencyError(`Missing dependencies: ${Object.keys(missing).join(', ')}`)
        }

        do {
            var count = this._resolveLoop()
        } while (count > 0)

        const unresolvedNames = Object.keys(this.unresolved)
        if (unresolvedNames.length) {
            throw new UnresolvedDependencyError(`Unmet dependecies for: ${unresolvedNames.join(', ')}`)
        }

        return this.order
    }

    _resolveLoop() {

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
    ArgumentError
  , CircularDependencyError
  , DependencyError
  , IllegalStateError
  , IncompatibleKeysError
  , InvalidCharError
  , MissingDependencyError
  , ProgrammerError
  , PromptActiveError
  , UnresolvedDependencyError
} = Errors

Util.update(Util, {
    Counter
  , DependencyHelper
  , Profiler
  , Timer
  , StringBuilder
})

module.exports = Util