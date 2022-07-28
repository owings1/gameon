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
import Logger from '@quale/term/logger.js'
import {merge} from '@quale/term/merging.js'
import {lget, update, valueHash} from '@quale/core/objects.js'
import {breakLines, stringWidth} from '@quale/core/strings.js'
import {isString, isObject, castToArray} from '@quale/core/types.js'
import emailval from 'email-validator'
import roundTo from 'round-to'
import * as Uuid from 'uuid'

import crypto from 'crypto'
import os from 'os'
import path from 'path'

import {
    ArgumentError,
    ProgrammerError,
    PromptActiveError,
} from './errors.js'

import StringBuilder from './util/string-builder.js'

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


/**
 * @param {Array} arr
 * @param {Number} inc
 * @param {Number} min
 * @param {Number} max
 * @param {Number} place
 * @return {Boolean}
 */
export function arrayIncrement(arr, inc, min, max, place = undefined) {
    const precision = inc === Math.floor(inc)
        ? 0
        : inc.toString().split('.')[1].length
    if (place === undefined) {
        place = arr.length - 1
    }
    if (arr[place] + inc <= max) {
        arr[place] = roundTo(arr[place] + inc, precision)
        return true
    }
    if (place === 0) {
        return false
    }
    if (arrayIncrement(arr, inc, min, max, place - 1)) {
        arr[place] = min
        return true
    }
    return false
}

/**
 * Break up an array into chunks.
 *
 * @param {Array} arr The array to chunk
 * @param {Number} numChunks The number of chunks
 * @return {Array} The array of chunks
 */
export function chunkArray(arr, numChunks) {
    const chunks = intRange(1, numChunks).map(() => [])
    let c = 0
    while (arr.length > 0) {
        chunks[c].push(arr.shift())
        c += 1
        if (c === chunks.length) {
            c = 0
        }
    }
    return chunks
}

/**
 * Create a crypto Hash object, optionally update it, and optionally return
 * a digest string.
 *
 * @param {String} type The hash type to pass to `crypto.createHash()`
 * @param {string|Buffer|TypedArray|DataView} input Data to update
 * @param {String} digest The digest type to return. If not specified,
 *        the Hash object is returned
 *
 * @return {crypto.Hash|string} The Hash object, or digest
 *
 * See: https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding
 */
export function createHash(type, input = undefined, digest = undefined) {
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
export {createHash as hash}

/**
 * @param {String|object} owner
 * @param {object} opts
 * @return {Logger}
 */
export function createLogger(owner, opts = {}) {
    opts = isObject(opts) ? opts : {}
    let {type} = opts
    const optset = []
    const isobj = isObject(owner)
    let name = 'Logger'
    if (isString(owner)) {
        name = owner
    } else if (isobj) {
        name = lget(owner, 'name') || lget(owner, 'constructor.name') || name
    }
    optset.push({name})
    if (isobj) {
        const lopts = lget(owner, 'opts.logging', {})
        type = type || lopts.type
        optset.push(lopts)
    }
    optset.push(LoggerTypes[type])
    return new Logger(merge(...optset, opts))
}

/**
 * Adapted from: http://vancelucas.com/blog/stronger-encryption-and-decryption-in-node-js/
 *
 * @license CC-BY 3.0 https://creativecommons.org/licenses/by/3.0/us/
 *
 * @throws {ArgumentError}
 *
 * @param {String} text
 * @param {String} key
 * @return {String}
 */
export function decrypt2(text, key) {
    if (!text || text.length < 41) {
        throw new ArgumentError('Invalid text argument')
    }
    if (!key || key.length !== 32) {
        throw new ArgumentError('Invalid key argument')
    }
    const textParts = text.split(':')
    const iv = Buffer.from(textParts.shift(), 'hex')
    if (iv.length !== 16) {
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
 * @param {object} defaults
 * @param {object} opts...
 * @return {object}
 */
export function defaults(defaults, ...opts) {
    let obj = {...defaults}
    opts.forEach(opts => obj = {...obj, ...opts})
    return propsFrom(obj, defaults)
}

/**
 * Call the `destroy()` method on all values of the given parameter.
 *
 * @throws {TypeError}
 * @param {Array|object} The collection whose values to destroy
 */
export function destroyAll(obj) {
    Object.values(obj).forEach(it => it.destroy())
}

/**
 * Adapted from: http://vancelucas.com/blog/stronger-encryption-and-decryption-in-node-js/
 *
 * @license CC-BY 3.0 https://creativecommons.org/licenses/by/3.0/us/
 *
 * @throws {ArgumentError}
 * @param {String} text
 * @param {String} key
 * @return {String}
 */
export function encrypt2(text, key) {
    if (!text || !text.length) {
        throw new ArgumentError('Invalid text argument')
    }
    if (!key || key.length !== 32) {
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
 * @param {object} target The target object to update
 * @param {object} defaults The defaults to use
 * @return {object} The target object
 */
export function ensure(target, defaults) {
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
 * @param {Function} cb The callback to execute
 * @return {Boolean|String} The string error message or `false` for empty
 *          message, or `true` if no error was thrown.
 */
export function errMessage(cb) {
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
 * @param {class} TargetClass The target class
 * @param {class} SourceClass The source class
 * @param {object} opts Options, `overrides`, `optionals`, each
 *        either a boolean (for all) or array of method names. The string
 *        '*' as a name signifies all.
 * @return {class} The target class
 */
export function extendClass(TargetClass, SourceClass, opts = undefined) {
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
        if (name === 'constructor' || name === '_constructor') {
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
 * @param {Date} date The date reference, default is current date.
 * @return {String} The result string
 */
export function fileDateString(date = undefined) {
    date = date || new Date
    const b = new StringBuilder
    b.add(
        [
            date.getFullYear(),
            (date.getMonth() + 1),
            date.getDate(),
        ].map(n => n.toString().padStart(2, '0')).join('-')
    )
    b.add(
        [
            date.getHours(),
            date.getMinutes(),
            date.getSeconds(),
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
 * @param {String} str The input path string
 * @return {String} The basename without the extension
 */
export function filenameWithoutExtension(str) {
    return filepathWithoutExtension(path.basename(str))
}

/**
 * Get the file path without the extension.
 *
 * @param {String} str The input path string
 * @return {String} The path without the extension
 */
export function filepathWithoutExtension(str) {
    return str.replace(/\.[^/.]+$/, '')
}

/**
 * From inquirer/lib/utils/screen-manager.
 *
 * @param {String} content
 * @param {Number} width
 * @return {String}
 */
export function forceLineReturn(content, width) {
    return breakLines(content.split('\n'), width).flat().join('\n')
}

export function getOrCall(thing, ...args) {
    return typeof thing === 'function' ? thing(...args) : thing
}

/**
 * Replace os home dir at the start of a string with ~.
 *
 * @throws {TypeError}
 *
 * @param {String} str The input path string
 * @return {String} The result string
 *
 * @see `tildeHome()`
 */
export function homeTilde(str) {
    if (str == null) {
        return str
    }
    const homeDir = os.homedir()
    if (str.indexOf(homeDir) !== 0) {
        return str
    }
    return '~' + str.substring(homeDir.length)
}

/**
 * Normalize an http(s) URL to a websocket URL.
 *
 * @throws {TypeError}
 *
 * @param {String} str The URL string to normalized
 * @return {String} The normalized string
 *
 * @see `wsToHttp()`
 */
export function httpToWs(str) {
    if (!str) {
        return str
    }
    return str.replace(/^(http)/, 'ws')
}

const BOOLSTR = {
    '1': true,
    '0': false,
    'true': true,
    'false': false,
    'yes': true,
    'no': false,
    'y': true,
    'n': false,
    'on': true,
    'off': false,
}
/**
 * Induce a boolean value.
 *
 * @param {*} value The value to examine
 * @param {Boolean} defaultValue The default value. Default is false.
 * @return {Boolean} The induced value
 */
export function induceBool(value, defaultValue = false) {
    if (typeof value === 'boolean') {
        return value
    }
    if (value != null) {
        value = String(value).toLowerCase()
        if (defaultValue) {
            // Default is true, so check for explicit false.
            return BOOLSTR[value] !== false
        }
        // Default is false, so check for explicit true.
        return BOOLSTR[value] === true
    }
    return Boolean(defaultValue)
}

/**
 * Induce an integer value.
 *
 * @param {*} value The value to examine
 * @param {Number} defaultValue The default value
 * @return {Number} The induced value
 */
export function induceInt(value, defaultValue = 0) {
    if (Number.isInteger(value)) {
        return value
    }
    if (!Number.isInteger(defaultValue)) {
        defaultValue = 0
    }
    if (value != null) {
        return parseInt(value) || defaultValue
    }
    return defaultValue
}

/**
 * Create an array of integers for the given range (inclusive).
 *
 * @throws {TypeError}
 * @throws {ArgumentError}
 *
 * @param {Number} a The range start
 * @param {Number} b The range end
 * @return {Array} The range array
 */
export function intRange(a, b) {
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
 * @param {object} credentials The credentials object to check
 * @param {Boolean} isServer Whether to also check for `serverUrl`
 * @return {Boolean} Whether the keys are non-empty
 */
export function isCredentialsFilled(credentials, isServer = false) {
    return Boolean(
        credentials.username && credentials.password && (!isServer || credentials.serverUrl)
    )
}

/**
 * Check whether the input is a valid email address.
 *
 * @param {*} str The input to check
 * @return {Boolean} Whether the input is a valid email
 */
export function isValidEmail(str) {
    return emailval.validate(str)
}


const METAKEYS = ['ctrl', 'meta', 'shift']
/**
 * Get the normalized keypress name from an event object.
 *
 * @param {object} e The keypress event object
 * @return {String} The normalized keypress name
 */
export function keypressName(e) {
    if (e.key && e.key.name === 'escape') {
        return e.key.name
    }
    const parts = METAKEYS.filter(it => e.key && e.key[it])
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
 * @param {Error} err The input error
 * @return {object} The result object
 */
export function makeErrorObject(err, depth = 1) {
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
                obj[prop] = makeErrorObject(value, depth + 1)
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
 * @param {object} obj The input object
 * @param {Function} cb The callback, to transform the value
 * @return {object} The result object
 */
export function mapValues(obj, cb) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cb(v)]))
}

/**
 * Create a string of length n from the input character.
 *
 * @throws {ArgumentError}
 *
 * @param {Number} n The desired length
 * @param {String} chr The character to repeat
 * @return {String} The result string
 */
export function nchars(n, chr) {
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
 *
 * @param {Number} n The range limit
 * @param {Function} cb The callback to execute
 * @return {Array} The collection of the return values
 */
export function nmap(n, cb) {
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
 *
 * @param {Number} n The number of times to run the callback
 * @param {Function} cb The callback to execute
 * @return {*} Return value of last callback
 */
export function ntimes(n, cb) {
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
 *
 * @param {String} str The string to pad
 * @param {String} align Alignment, 'left' or 'right', default 'left'
 * @param {Number} width Required string width.
 * @param {String} chr Pad string, default space.
 * @return {String} The padded string
 */
export function pad(str, align, width, chr = ' ') {
    if (align === 'right') {
        return padStart(str, width, chr)
    }
    return padEnd(str, width, chr)
}

/**
 * Pad the end of a string, ANSI-safe.
 *
 * @throws {ArgumentError}
 * @throws {TypeError}
 *
 * @param {String} str The string to pad
 * @param {Number} n The min width required
 * @param {String} chr The character to pad with
 * @return {String} The padded string
 */
export function padEnd(str, n, chr) {
    if (!chr.length) {
        throw new ArgumentError(`Unrepeatable character: '${chr}'`)
    }
    if (!Number.isFinite(+n)) {
        throw new ArgumentError('Refusing to go to infinity')
    }
    while (stringWidth(str) < n) {
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
 * @param {String} str The string to pad
 * @param {Number} n The min width required
 * @param {String} chr The character to pad with
 * @return {String} The padded string
 */
export function padStart(str, n, chr) {
    if (!chr.length) {
        throw new ArgumentError(`Unrepeatable character: '${chr}'`)
    }
    if (!Number.isFinite(+n)) {
        throw new ArgumentError('Refusing to go to infinity')
    }
    while (stringWidth(str) < n) {
        str = chr + str
    }
    return str
}

/**
 * @param {object} obj
 * @param {array|object} keys
 * @return {object}
 */
export function propsFrom(obj, keys) {
    keys = Array.isArray(keys) ? keys : Object.keys(keys)
    obj = obj || {}
    const ret = {}
    for (const k of keys) {
        ret[k] = obj[k]
    }
    return ret
}

/**
 * Get a random element from an array.
 *
 * @param {Array} arr The input array
 * @return {*} The value of a random index of the array
 */
export function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Check if the first argument is not empty, and if so, reject with a new
 * `PromptActiveError` by calling the reject argument if passed, else by
 * throwing.
 *
 * @throws {PromptActiveError}
 *
 * @param {*} prompter The object to test
 * @param {Function} reject The reject function.
 * @return {Boolean} Whether the reject function was called
 */
export function rejectDuplicatePrompter(prompter, reject = null) {
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
 * @return {String} The new secret string
 */
export function secret1() {
    return createHash('sha256', uuid(), 'hex')
}

/**
 * Check whether default values are used in production environments.
 *
 * @param {Array} checks The checks {value, default, name}
 * @param {object} env The environment variables
 * @return {object} Result {isPass, error, warning, missing}
 */
export function securityCheck(checks, env) {
    env = env || process.env
    const getter = it => typeof it === 'function' ? it() : it
    const missing = checks.filter(it =>
        getter(it.value) == getter(it.default)
    )
    const count = missing.length
    const isPass = !count
    const isProd = env.NODE_ENV === 'production'
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
                `${joined} not set, using ${noun}.`,
                `${adj} must be set in production environments.`,
            ].join(' ')
        }
    }
    return {isPass, error, warning, missing}
}

/**
 * Compare two numbers for sorting ascending.
 *
 * @param {Number} a The left-hand number.
 * @param {Number} b The right-hand number.
 * @return {Number} The comparison result
 */
export function sortNumericAsc(a, b) {
    return a - b
}

/**
 * Compare two numbers for sorting descending.
 *
 * @param {Number} a The left-hand number.
 * @param {Number} b The right-hand number.
 * @return {Number} The comparison result
 */
export function sortNumericDesc(a, b) {
    return b - a
}

/**
 * Join arguments on space character.
 *
 * @param {*} args... The arguments to join
 * @return {String} The joined string
 */
export function sp(...args) {
    return args.join(' ')
}

/**
 * @param {Number} n
 * @return {String}
 */
export function spaces(n) {
    return nchars(n, ' ')
}

/**
 * @param {object} obj
 * @param {Boolean} isInverse
 * @return {object}
 */
export function spreadScore(obj, isInverse = false) {
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
        if (scale === 0) {
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
 * @param {String} str The input string
 * @return {String} The result string
 */
export function stripLeadingSlash(str) {
    if (str && str[0] === '/') {
        return str.substring(1)
    }
    return str
}

/**
 * Strips one forward slash from the end of a string, if any.
 *
 * @param {String} str The input string
 * @return {String} The result string
 */
export function stripTrailingSlash(str) {
    if (str && str[str.length - 1] === '/') {
        return str.substring(0, str.length - 1)
    }
    return str
}

/**
 * Replace ~ at the start of a string with the os home dir.
 *
 * @param {String} str The input path string
 * @return {String} The result string
 *
 * @see `homeTilde()`
 */
export function tildeHome(str) {
    if (str == null) {
        return str
    }
    if (str.indexOf('~') !== 0) {
        return str
    }
    return os.homedir() + str.substring(1)
}

/**
 * Get UNIX timestamp (seconds).
 *
 * @param {Date} date The date reference. Default is the current date.
 * @return {Number} The UNIX timestamp
 */
export function timestamp(date = undefined) {
    date = date || new Date
    return Math.floor(+date / 1000)
}
export {timestamp as tstamp}

/**
 * Prune data object for logging.
 *
 * @param {object} data The input data
 * @return {object} The cleaned data
 */
export function trimMessageData(data) {
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
                allowedEndStates: '[trimmed]',
                allowedMoveIndex: '[trimmed]',
                endStatesToSeries: '[trimmed]',
            })
        }
    }
    return trimmed
}

/**
 * Returns an array with all the unique integers of the input array.
 *
 * @param {Number[]} The input array
 * @return {Number[]} The unique numbers
 */
export function uniqueInts(arr) {
    const map = {}
    arr.forEach(it => map[+it] = true)
    return Object.keys(map).map(Number)
}

/**
 * Returns an array with all the unique strings of the input array.
 *
 * @param {String[]} arr The input array
 * @return {String[]} The unique strings
 */
export function uniqueStrings(arr) {
    return uniquePrimitives(arr).map(String)
}

/**
 * Returns an array with all the unique primitives of the input array.
 *
 * @param {Array} arr The input array
 * @return {Array} The unique primitives
 */
export function uniquePrimitives(arr) {
    const map = {}
    arr.forEach(it => map[it] = it)
    return Object.values(map)
}

/**
 * Generate a UUID.
 *
 * @return {String} The new UUID
 */
export function uuid() {
    return Uuid.v4()
}

/**
 * Normalize websocket URL to an http(s) URL.
 *
 * @param {String} str The URL string to normalized
 * @return {String} The normalized string
 *
 * @see `httpToWs()`
 */
export function wsToHttp(str) {
    if (!str) {
        return str
    }
    return str.replace(/^(ws)/, 'http')
}
