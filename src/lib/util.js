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
const {
    Logger,
    merging : {mergePlain},
    objects : {lget, lset, update, valueHash},
    strings : {breakLines, stringWidth},
    types   : {isString, isObject, castToArray},
} = require('utils-h')
const cliWidth = require('cli-width')
const emailval = require('email-validator')
const roundTo  = require('round-to')
const uuid     = require('uuid')

const crypto = require('crypto')
const os     = require('os')
const path   = require('path')

const {
    ArgumentError,
    ProgrammerError,
    PromptActiveError,
} = require('./errors')

const StringBuilder = require('./util/string-builder')

const LoggerTypes = {
    named: {
        prefix: function namedPrefix(level) {
            return [
                `[${this.name}]`,
                `[${this.chalks[level].prefix(level.toUpperCase())}]`,
            ]
        },
    },
    raw: {
        colors: false,
        prefix: null,
    },
    server: {
        prefix: function serverPrefix(level) {
            return [
                new Date().toISOString(),
                `[${this.name}]`,
                `[${this.chalks[level].prefix(level.toUpperCase())}]`,
            ]
        },
    },
}


class Util {

    /**
     * @throws {TypeError}
     * 
     * @param {array}
     * @param {integer}
     * @param {integer}
     * @param {integer}
     * @param {integer} (optional)
     * @return {boolean}
     */
    static arrayIncrement(arr, inc, min, max, place) {
        const precision = inc == Math.floor(inc)
            ? 0
            : inc.toString().split('.')[1].length
        if (typeof place == 'undefined') {
            place = arr.length - 1
        }
        if (arr[place] + inc <= max) {
            arr[place] = roundTo(arr[place] + inc, precision)
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
     * Break up an array into chunks.
     *
     * @throws {TypeError}
     * @param {array} The array to chunk
     * @param {integer} The number of chunks
     * @return {array} The array of chunks
     */
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

    /**
     * Get the terminal width.
     *
     * @param {object} (optional) The options
     * @return {integer} The width
     */
    static cliWidth(opts) {
        return cliWidth(opts)
    }

    /**
     * Create a crypto Hash object, optionally update it, and optionally return
     * a digest string.
     *
     * @param {string} The hash type to pass to `crypto.createHash()`
     * @param {string|Buffer|TypedArray|DataView} (optional) Data to update
     * @param {string} (optional) The digest type to return. If not specified,
     *        the Hash object is returned
     *
     * @return {Hash|string} The Hash object, or digest
     *
     * See: https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding
     */
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

    static createLogger(inst, opts = {}) {
        opts = isObject(opts) ? opts : {}
        let {type} = opts
        const optset = []
        const isobj = isObject(inst)
        let name = 'Logger'
        if (isString(inst)) {
            name = inst
        } else if (isobj) {
            name = lget(inst, 'name') ?? lget(inst, 'constructor.name') ?? name
        }
        optset.push({name})
        if (isobj) {
            const lopts = lget(inst, 'opts.logging', {})
            type = type ?? lopts.type
            optset.push(lopts)
        }
        optset.push(LoggerTypes[type])
        return new Logger(mergePlain(...optset, opts))
    }

    /**
     * Adapted from: http://vancelucas.com/blog/stronger-encryption-and-decryption-in-node-js/
     *
     * @license CC-BY 3.0 https://creativecommons.org/licenses/by/3.0/us/
     *
     * @throws {ArgumentError}
     *
     * @param {string}
     * @param {string}
     * @return {string}
     */
    static decrypt2(text, key) {
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
        let decrypted = decipher.update(encryptedText)

        decrypted = Buffer.concat([decrypted, decipher.final()])

        return decrypted.toString()
    }
    /**
     *
     * @param {object}
     * @param ...{object} (optional)
     * @return {object}
     */
    static defaults(defaults, ...opts) {
        let obj = {...defaults}
        opts.forEach(opts => obj = {...obj, ...opts})
        return Util.propsFrom(obj, defaults)
    }

    /**
     * Call the `destroy()` method on all values of the given parameter.
     *
     * @throws {TypeError}
     * @param {array|object} The collection whose values to destroy
     * @return {self}
     */
    static destroyAll(obj) {
        Object.values(obj).forEach(it => it.destroy())
        return Util
    }

    /**
     * Adapted from: http://vancelucas.com/blog/stronger-encryption-and-decryption-in-node-js/
     *
     * @license CC-BY 3.0 https://creativecommons.org/licenses/by/3.0/us/
     *
     * @throws {ArgumentError}
     * @param {string}
     * @param {string}
     * @return {string}
     */
    static encrypt2(text, key) {
        if (!text || !text.length) {
            throw new ArgumentError('Invalid text argument')
        }
        if (!key || key.length != 32) {
            throw new ArgumentError('Invalid key argument')
        }
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(key), iv)
        let encrypted = cipher.update(text)

        encrypted = Buffer.concat([encrypted, cipher.final()])

        return iv.toString('hex') + ':' + encrypted.toString('hex')
    }

    /**
     * Update the target object with the defaults if the key does not yet exist.
     *
     * @throws {TypeError}
     *
     * @param {object} The target object to update
     * @param {object} The defaults to use
     * @return {object} The target object
     */
    static ensure(target, defaults) {
        target = target || {}
        Object.entries(defaults).forEach(([name, method]) => {
            if (!(name in target)) {
                target[name] = method
            }
        })
        return target
    }

    /**
     * Catch an error from executing the given callback, and return the error
     * message, or `false` if the error message is empty, or `true` if no error
     * occurs.
     *
     * @param {function} The callback to execute
     *
     * @return {boolean|string} The string error message or `false` for empty
     *          message, or `true` if no error was thrown.
     */
    static errMessage(cb) {
        try {
            cb()
        } catch (err) {
            return err.message || false
        }
        return true
    }

    /**
     * Copy methods from the prototype of one class to another.
     *
     * @throws {TypeError}
     * @throws {ProgrammerError}
     *
     * @param {class} The target class
     * @param {class} The source class
     * @param {object} (optional) Options, `overrides`, `optionals`, each
     *        either a boolean (for all) or array of method names. The string
     *        '*' as a name signifies all.
     * @return {class} The target class
     */
    static extendClass(TargetClass, SourceClass, opts) {

        opts = opts || {}

        Object.values(['overrides', 'optionals']).forEach(key => {
            if (opts[key] === true) {
                opts[key] = {'*': true}
            } else if (opts[key] === false) {
                opts[key] = {}
            } else {
                opts[key] = valueHash(castToArray(opts[key]))
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

    /**
     * Generate a readable date string safe for using as a filename.
     *
     * Format:  YYYY-MM-DD_HH-MM-SS_MS
     *          -----------------------
     * Example: 2021-07-29_02-01-09_584
     *
     * @throws {TypeError}
     * @param {Date} (optional) The date reference, default is current date.
     * @return {string} The result string
     */
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

    /**
     * Get the basename of the file path, without the extension.
     *
     * @throws {TypeError}
     * @param {string} The input path string
     * @return {string} The basename without the extension
     */
    static filenameWithoutExtension(str) {
        return Util.filepathWithoutExtension(path.basename(str))
    }

    /**
     * Get the file path without the extension.
     *
     * @throws {TypeError}
     * @param {string} The input path string
     * @return {string} The path without the extension
     */
    static filepathWithoutExtension(str) {
        return str.replace(/\.[^/.]+$/, '')
    }

    /**
     * From inquirer/lib/utils/screen-manager.
     *
     * @throws {TypeError}
     * @param {string}
     * @param {integer}
     * @return {string}
     */
    static forceLineReturn(content, width) {
        return breakLines(content.split('\n'), width).flat().join('\n')
    }

    static getOrCall(thing, ...args) {
        return typeof thing == 'function' ? thing(...args) : thing
    }

    /**
     * Alias for `createHash()`
     *
     * @see `createHash()`
     */
    static hash(...args) {
        return Util.createHash(...args)
    }

    /**
     * Replace os home dir at the start of a string with ~.
     *
     * @throws {TypeError}
     *
     * @param {string} The input path string
     * @return {string} The result string
     *
     * @see `tildeHome()`
     */
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

    /**
     * Normalize an http(s) URL to a websocket URL.
     *
     * @throws {TypeError}
     *
     * @param {string} The URL string to normalized
     * @return {string} The normalized string
     *
     * @see `wsToHttp()`
     */
    static httpToWs(str) {
        if (!str) {
            return str
        }
        return str.replace(/^(http)/, 'ws')
    }

    /**
     * Induce a boolean value.
     *
     * @param {*} The value to examine
     * @param {boolean} (optional) The default value
     * @return {boolean} The induced value
     */
    static induceBool(value, def = false) {
        if (typeof value == 'boolean') {
            return value
        }
        if (value != null) {
            value = String(value).toLowerCase()
            if (def) {
                // Default is true, so check for explicit false.
                return ['0', 'false', 'no', 'n', 'off'].indexOf(value) < 0
            }
            // Default is false, so check for explicit true.
            return ['1', 'true', 'yes', 'y', 'on'].indexOf(value) > -1
        }
        return Boolean(def)
    }

    /**
     * Induce an integer value.
     *
     * @param {*} The value to examine
     * @param {integer} (optional) The default value
     * @return {integer} The induced value
     */
    static induceInt(value, def = 0) {
        if (Number.isInteger(value)) {
            return value
        }
        if (!Number.isInteger(def)) {
            def = 0
        }
        if (value != null) {
            return parseInt(value) || def
        }
        return def
    }

    /**
     * Create an array of integers for the given range (inclusive).
     *
     * @throws {TypeError}
     * @throws {ArgumentError}
     *
     * @param {integer} The range start
     * @param {integer} The range end
     * @return {array} The range array
     */
    static intRange(a, b) {
        if (!Number.isFinite(b) && Number.isFinite(a)) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        const range = []
        for (let i = a; i <= b; ++i) {
            range.push(i)
        }
        return range
    }

    /**
     * Check whether both the `username` and `password` keys are non-empty, and
     * optionally the `serverUrl` key.
     *
     * @throws {TypeError}
     *
     * @param {object} The credentials object to check
     * @param {boolean} (optional) Whether to also check for `serverUrl`
     * @return {boolean} Whether the keys are non-empty
     */
    static isCredentialsFilled(credentials, isServer) {
        return Boolean(
            credentials.username && credentials.password && (!isServer || credentials.serverUrl)
        )
    }

    /**
     * Check whether the input is a valid email address.
     *
     * @param {*} The input to check
     * @return {boolean} Whether the input is a valid email
     */
    static isValidEmail(str) {
        return emailval.validate(str)
    }

    /**
     * Get the normalized keypress name from an event object.
     *
     * @throws {TypeError}
     *
     * @param {object} The keypress event object
     * @return {string} The normalized keypress name
     */
    static keypressName(e) {
        if (e.key && e.key.name == 'escape') {
            return e.key.name
        }
        const parts = ['ctrl', 'meta', 'shift'].filter(it => e.key && e.key[it])
        if (parts.length) {
            parts.push(e.key.name)
            return parts.join('-')
        }
        if (e.value == null && e.key.name) {
            return e.key.name
        }
        if (e.key && e.key.name && e.key.name.length > 1) {
            return e.key.name
        }
        return e.value || ''
    }

    /**
     * Create a plain object from an Error, suitable for serialization.
     *
     * @throws {TypeError}
     *
     * @param {Error} The input error
     * @return {object} The result object
     */
    static makeErrorObject(err, depth = 1) {
        const obj = {
            isError : true,
            error   : err.message || err.name,
            name    : err.name || err.constructor.name,
        }
        for (const prop in err) {
            if (!err.hasOwnProperty(prop)) {
                continue
            }
            if (obj[prop] != null) {
                continue
            }
            const value = err[prop]
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

    /**
     * Return a new object with the same keys, transforming values with the
     * given callback.
     *
     * @throws {TypeError}
     *
     * @param {object} The input object
     * @param {function} The callback, to transform the value
     * @return {object} The result object
     */
    static mapValues(obj, cb) {
        return Object.fromEntries(
            Object.entries(obj).map(
                ([k, v]) => [k, cb(v)]
            )
        )
    }

    /**
     * Create a string of length n from the input character.
     *
     * @throws {ArgumentError}
     * @throws {TypeError}
     *
     * @param {integer} The desired length
     * @param {string} The character to repeat
     * @return {string} The result string
     */
    static nchars(n, chr) {
        if (!chr.length) {
            throw new ArgumentError(`Unrepeatable character: '${chr}'`)
        }
        if (!Number.isFinite(+n)) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        return ''.padEnd(n, chr)
    }

    /**
     * Map the range from 0 for n (exclusive) by the given callback.
     *
     * @throws {ArgumentError}
     * @throws {TypeError}
     *
     * @param {integer} The range limit
     * @param {function} The callback to execute
     * @return {array} The collection of the return values
     */
    static nmap(n, cb) {
        if (!Number.isFinite(+n)) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        const arr = []
        for (let i = 0; i < n; ++i) {
            arr.push(cb(i))
        }
        return arr
    }

    /**
     * Run the callback n times.
     *
     * @throws {ArgumentError}
     * @throws {TypeError}
     *
     * @param {integer} The number of times to run the callback
     * @param {function} The callback to execute
     * @return {*} Return value of last callback
     */
    static ntimes(n, cb) {
        if (!Number.isFinite(+n)) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        let ret
        for (let i = 0; i < n; ++i) {
            ret = cb(i)
        }
        return ret
    }

    /**
     * Pad a string, left or right, ANSI-safe.
     *
     * @throws {ArgumentError}
     * @throws {TypeError}
     *
     * @param {string} The string to pad
     * @param {string} Alignment, 'left' or 'right', default 'right'
     * @param {integer} Required string width.
     * @param {string} (optional) Pad string, default space.
     * @return {string} The padded string
     */
    static pad(str, align, width, chr = ' ') {
        if (align == 'right') {
            return Util.padStart(str, width, chr)
        }
        return Util.padEnd(str, width, chr)
    }

    /**
     * Pad the end of a string, ANSI-safe.
     *
     * @throws {ArgumentError}
     * @throws {TypeError}
     *
     * @param {string} The string to pad
     * @param {integer} The min width required
     * @param {string} The character to pad with
     * @return {string} The padded string
     */
    static padEnd(str, n, chr) {
        if (!chr.length) {
            throw new ArgumentError(`Unrepeatable character: '${chr}'`)
        }
        if (!Number.isFinite(+n)) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        while (Util.stringWidth(str) < n) {
            str += chr
        }
        return str
    }

    /**
     * Pad the start of a string, ANSI-safe.
     *
     * @throws {ArgumentError}
     * @throws {TypeError}
     *
     * @param {string} The string to pad
     * @param {integer} The min width required
     * @param {string} The character to pad with
     * @return {string} The padded string
     */
    static padStart(str, n, chr) {
        if (!chr.length) {
            throw new ArgumentError(`Unrepeatable character: '${chr}'`)
        }
        if (!Number.isFinite(+n)) {
            throw new ArgumentError('Refusing to go to infinity')
        }
        while (Util.stringWidth(str) < n) {
            str = chr + str
        }
        return str
    }

    /**
     * @throws {TypeError}
     *
     * @param {object}
     * @param {array|object}
     * @return {object}
     */
    static propsFrom(obj, keys) {
        keys = Array.isArray(keys) ? keys : Object.keys(keys)
        obj = obj || {}
        const ret = {}
        for (var k of keys) {
            ret[k] = obj[k]
        }
        return ret
    }

    /**
     * Get a random element from an array.
     *
     * @throws {TypeError}
     *
     * @param {array} The input array
     * @return {*} The value of a random index of the array
     */
    static randomElement(arr) {
        const i = Math.floor(Math.random() * arr.length)
        return arr[i]
    }

    /**
     * Check if the first argument is not empty, and if so, reject with a new
     * `PromptActiveError` by calling the reject argument if passed, else by
     * throwing.
     *
     * @throws {PromptActiveError}
     *
     * @param {*} The object to test
     * @param {function} (optional) The reject function.
     * @return {boolean} Whether the reject function was called
     */
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

    /**
     * Generate a new secret string.
     *
     * @return {string} The new secret string
     */
    static secret1() {
        return Util.createHash('sha256', Util.uuid(), 'hex')
    }

    /**
     * Check whether default values are used in production environments.
     *
     * @param {array} The checks {value, default, name}
     * @param {object} (optional) The environment variables
     * @return {object} Result {isPass, error, warning, missing}
     */
    static securityCheck(checks, env) {

        env = env || process.env

        const getter = it => typeof it == 'function' ? it() : it
        const missing = checks.filter(it =>
            getter(it.value) == getter(it.default)
        )

        const count = missing.length
        const isPass = !count
        const isProd = env.NODE_ENV == 'production'

        let error
        let warning

        if (count) {

            const strs = []
            const names = missing.map(it => it.name)

            if (count > 1) {
                // Join all but the last with commas. If count is only 2,
                // this will just add the first name.
                strs.push(names.slice(0, -1).join(', '))
            }
            // Add the last name.
            strs.push(names[count - 1])

            // Use Oxford comma.
            // For two names: 'A and B'.
            // For three or more name: 'A, B, and C'.
            const joiner = count > 2 ? ', and ' : ' and '
            const joined = strs.join(joiner)

            // Cheap pluralization.
            const [noun, adj] = count > 1
                ? ['defaults' , 'These']
                : ['default'  , 'This']

            if (isProd) {
                error = `Must set custom ${joined} in production environments`
            } else {
                warning = [
                    `${joined} not set, using ${noun}.`
                  , `${adj} must be set in production environments.`
                ].join(' ')
            }
        }

        return {isPass, error, warning, missing}
    }

    /**
     * Compare two numbers for sorting ascending.
     *
     * @param {number} The left-hand number.
     * @param {number} The right-hand number.
     * @return {number} The comparison result
     */
    static sortNumericAsc(a, b) {
        return a - b
    }

    /**
     * Compare two numbers for sorting descending.
     *
     * @param {number} The left-hand number.
     * @param {number} The right-hand number.
     * @return {number} The comparison result
     */
    static sortNumericDesc(a, b) {
        return b - a
    }

    /**
     * Join arguments on space character.
     *
     * @param ...{*} The arguments to join
     * @return {string} The joined string
     */
    static sp(...args) {
        return args.join(' ')
    }

    static spaces(n) {
        return Util.nchars(n, ' ')
    }

    /**
     * @param {object}
     * @param {boolean} (optional)
     * @return {object}
     */
    static spreadScore(obj, isInverse) {
        const iobj = {}
        let size = 0
        let minRaw = Infinity
        for (const k in obj) {
            iobj[k] = isInverse ? -obj[k] : obj[k]
            if (iobj[k] < minRaw) {
                minRaw = iobj[k]
            }
            size += 1
        }
        const normObj = {}
        let scale = 0
        for (const k in obj) {
            normObj[k] = iobj[k] - minRaw
            scale += normObj[k]
        }
        const spreadObj = {}
        for (const k in obj) {
            if (scale == 0) {
                // all values are equal
                spreadObj[k] = 1 / size
            } else {
                spreadObj[k] = normObj[k] / scale
            }
        }
        return spreadObj
    }

    /**
     * Strips one forward slash from the start of a string, if any.
     *
     * @throws {TypeError}
     *
     * @param {string} The input string
     * @return {string} The result string
     */
    static stripLeadingSlash(str) {
        if (str && str[0] == '/') {
            return str.substring(1)
        }
        return str
    }

    /**
     * Strips one forward slash from the end of a string, if any.
     *
     * @throws {TypeError}
     *
     * @param {string} The input string
     * @return {string} The result string
     */
    static stripTrailingSlash(str) {
        if (str && str[str.length - 1] == '/') {
            return str.substring(0, str.length - 1)
        }
        return str
    }

    /**
     * Get the width of the string, ignoring ANSI codes, and accounting for
     * multi-byte characters.
     *
     * @param {string} The input string
     * @return {integer} The string width
     */
    static stringWidth(str) {
        return stringWidth(str)
    }

    /**
     * Sum all numbers in the array.
     *
     * @throws {TypeError}
     *
     * @param {array} The input array
     * @return {integer} The result sum
     */
    static sumArray(arr) {
        return arr.reduce((acc, cur) => acc + cur, 0)
    }

    /**
     * Replace ~ at the start of a string with the os home dir.
     *
     * @throws {TypeError}
     *
     * @param {string} The input path string
     * @return {string} The result string
     *
     * @see `homeTilde()`
     */
    static tildeHome(str) {
        if (str == null) {
            return str
        }
        if (str.indexOf('~') != 0) {
            return str
        }
        return os.homedir() + str.substring(1)
    }

    /**
     * Get UNIX timestamp (seconds).
     *
     * @param {Date} (optional) The date reference. Default is the current date.
     * @return {integer} The UNIX timestamp
     */
    static timestamp(date) {
        date = date || new Date
        return Math.floor(+date / 1000)
    }

    /**
     * Prune data object for logging.
     *
     * @param {object} The input data
     * @return {object} The cleaned data
     */
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
                update(trimmed.turn, {
                    allowedEndStates: '[trimmed]'
                  , allowedMoveIndex: '[trimmed]'
                  , endStatesToSeries: '[trimmed]'
                })
            }
        }
        return trimmed
    }

    /**
     * Alias for `timestamp()`
     *
     * @param {Date} (optional) The date reference. Default is the current date.
     * @return {integer} The UNIX timestamp
     *
     * @see `timestamp()`
     */
    static tstamp(date) {
        return Util.timestamp(date)
    }




    /**
     * Returns an array with all the unique integers of the input array.
     *
     * @throws {TypeError}
     *
     * @param {array} The input array
     * @return {array} The unique numbers
     */
    static uniqueInts(arr) {
        const map = {}
        arr.forEach(it => map[+it] = true)
        return Object.keys(map).map(Number)
    }

    /**
     * Returns an array with all the unique strings of the input array.
     *
     * @throws {TypeError}
     *
     * @param {array} The input array
     * @return {array} The unique strings
     */
    static uniqueStrings(arr) {
        return Util.uniquePrimitives(arr).map(String)
    }

    /**
     * Returns an array with all the unique primitives of the input array.
     *
     * @throws {TypeError}
     *
     * @param {array} The input array
     * @return {array} The unique primitives
     */
    static uniquePrimitives(arr) {
        const map = {}
        arr.forEach(it => map[it] = it)
        return Object.values(map)
    }

    /**
     * Generate a UUID.
     *
     * @return {string} The new UUID
     */
    static uuid() {
        return uuid.v4()
    }

    /**
     * Normalize websocket URL to an http(s) URL.
     *
     * @throws {TypeError}
     *
     * @param {string} The URL string to normalized
     * @return {string} The normalized string
     *
     * @see `httpToWs()`
     */
    static wsToHttp(str) {
        if (!str) {
            return str
        }
        return str.replace(/^(ws)/, 'http')
    }
}

update(Util, {
    get Counter()          { return require('./util/counter') },
    get DependencyHelper() { return require('./util/dependency-helper') },
    get Intl()             { return require('./util/intl') },
    get Profiler()         { return require('./util/profiler') },
    get Timer()            { return require('./util/timer') },
    StringBuilder,
})

module.exports = Util