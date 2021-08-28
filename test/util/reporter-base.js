/**
 * gameon - Custom mochajs reporter
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
/**
 * Contains code copied and modified from mochajs
 *
 * - https://mochajs.org/
 * - https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js
 * - https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/spec.js
 *
 * The mochajs license is as follows:
 * ----------------------------------
 *
 * (The MIT License)
 * 
 * Copyright (c) 2011-2021 OpenJS Foundation and contributors, https://openjsf.org
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const {
    arrays  : {append},
    objects : {lget, lset},
    strings : {lcfirst, ucfirst},
    types   : {castToArray},
} = require('@quale/core')
const {colors: {Chalk}} = require('@quale/term')

const ms = require('ms')
const Base        = require('mocha/lib/reporters/base')
const Runner      = require('mocha/lib/runner')
const mstringify  = require('mocha/lib/utils').stringify

const {
    induceBool,
    induceInt,
    mapValues,
    nchars,
    sp,
    stringWidth,
} = require('../../src/lib/util.js')

const Chalks = require('./reporter-chalks.js')
const Diffs  = require('./diffs.js')

const chalk = new Chalk()
const RawMatchRegex = /^([^:]+): expected/

const DefaultDiffLinesMin = 5
const DefaultDiffSize     = 2048
const DefaultGroupErrors  = true
const DefaultTabSize      = 2

/**
 * Mocha Runner events.
 *
 * For reference, See: https://github.com/mochajs/mocha/blob/master/lib/runner.js
 */
const Increments = {
    EVENT_SUITE_BEGIN: {
        tab:  1,
    },
    EVENT_SUITE_END: {
        tab: -1,
    },
    EVENT_TEST_BEGIN: {
        tab:  1,
    },
    EVENT_TEST_END: {
        tab: -1,
    },
    EVENT_TEST_FAIL: {
        failures: 1,
    },
    EVENT_TEST_PENDING: {
        tab:  1,
    },
}

/**
 * Build a map from Runner event keys to info objects.
 */
const EventMap = Object.fromEntries(
    Object.entries(Runner.constants).filter(([key]) =>
        key.split('_')[0] == 'EVENT'
    ).map(([key, event]) => {
        const mparts = key.split('_').slice(1).map(str => str.toLowerCase())
        const alias = lcfirst(mparts.map(ucfirst).join(''))
        const render = 'render' + ucfirst(alias)
        const incs = Increments[key]
        return [key, {key, event, alias, render, incs}]
    })
)
const EventList = Object.values(EventMap)


const matchIndex = (str, regex, index) => (str.match(regex) || [])[index]
const stringify = arg => typeof arg == 'string' ? arg : mstringify(arg)

/**
 * Base reporter class.
 *
 *   - Tracks indententation level and failures count.
 *   - Loads generic listeners to all events and delagates to render*() methods.
 */
class BaseReporter extends Base {

    /**
     * Constructor
     *
     * @param {Runner} The mochajs runner
     * @param {object} (optional) The runner options
     */
    constructor(runner, options) {

        super(runner, options)

        this.counters = {tab: 0, failures: 0}
        this.chalk = new chalk.Instance()
        // Propagate color option to chalk instance.
        if (this.opts.color === false) {
            this.chalk.level = 0
        }

        // Load default colors and symbols.
        this.chalks = Chalks(this.chalk)
        this.symbols = {ok: '\u2713'}

        // Load listeners.
        EventList.forEach(({event, render, incs}) => {
            if (incs) {
                // Load increment handler.
                incs = Object.entries(incs).filter(it => Boolean(it[1]))
                runner.on(event, () => {
                    incs.forEach(([ctr, inc]) => this.counters[ctr] += inc)
                })
            }
            if (render) {
                // Load render handler.
                runner.on(event, this._render.bind(this, render))
            }
        })
    }

    /**
     * Set a chalk style.
     *
     * @param {string} The style key path to set, e.g. `test.pass.title`.
     * @param {string} The chalk path, e.g. `magenta.bold`.
     * @return self
     */
    setStyle(key, ref) {
        lset(this.chalks, key, lget(this.chalk, ref))
        return this
    }

    /**
     * Set chalk styles
     *
     * @param {object} Map of style key paths to chalk paths.
     * @return self
     */
    setStyles(styles) {
        Object.entries(styles).forEach(entry => this.setStyle(...entry))
        return this
    }

    /**
     * Get a spaces string for indenting. The number of spaces is determined by
     * the `tabSize` reporter option, default 2. The formula is:
     *
     * (tab - 1) * tabSize
     *
     * @param {integer} (optional) The tab level. If not specified, the value
     *        of `this.counters.tab` is used.
     * @return {string} The string of spaces
     */
    indent(tab = null) {
        if (tab == null) {
            tab = this.counters.tab
        }
        return Array(tab).join(nchars(this.tabSize, ' '))
    }

    /**
     * Prefix a string with indent spaces.
     *
     * @param {string} The string to indent
     * @param {integer} (optional) The tab level. If not specified, the value
     *        of `this.counters.tab` is used.
     * @return {string} The indented string
     */
    indentLine(line, tab = null) {
        return line ? this.indent(tab) + line : line
    }

    /**
     * Indent each string in an array with indent spaces.
     *
     * @param {array} The lines to indent
     * @param {integer} (optional) The tab level. If not specified, the value
     *        of `this.counters.tab` is used.
     * @param {integer} (optional) How much to increment the tab level after
     *        each line, default is 0.
     * @return {array} The indented lines
     */
    indentLines(lines, tab = null, inc = 0) {
        inc = inc || 0
        if (tab == null) {
            tab = this.counters.tab
        }
        return lines.map((line, i) =>
            line ? this.indent(tab + inc * i) + line : line
        )
    }

    /**
     * Log to the console.
     *
     * @param {...*} The arguments to log
     * @return self
     */
    log(...args) {
        Base.consoleLog(...args)
        return this
    }

    /**
     * Get the stats summary lines.
     *
     * @param {object} (optional) The stats, default is `this.stats`
     * @return {object} The formatted lines {passes, pending, failures}
     */
    getStatsLines(stats) {

        stats = stats || this.stats
        const chlk = this.chalks.stats

        return {
            passes: sp(
                chlk.passes(`${stats.passes || 0} passing`),
                chlk.duration(`(${ms(stats.duration)})`),
            ),
            pending  : chlk.pending(`${stats.pending} pending`),
            failures : chlk.failures(`${stats.failures} failing`),
        }
    }

    /**
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L223
     *
     * Collect the message, stack, and diff for an error. Returns an object
     * whose values are strings. No indenting is applied.
     *
     * @param {Error} The error to examine
     * @return {object} The result object {message, stack, diff}
     */
    getErrorResult(err) {

        const {stack, rawMessage, rawMatch, ...parsed} = this._parseStack(err)

        let {message} = parsed
        let diff

        if (this.shouldDiff(err)) {

            // Generate diff.
            diff = this.generateDiff(err.actual, err.expected)

            if (rawMatch) {
                // Override error message.
                message = rawMatch
            }
        }

        return {message, diff, stack}
    }

    /**
     * Returns an object whose values are either a single or array of colored
     * lines for a failure info object. No indenting is applied.
     *
     * @param {object|Error} Either a failure result object With keys `message`,
     *        `stack`, and `diff`, each of whose values are strings, or an Error
     *        with which to generate such a result object.
     * @return {object} Map of chalked lines. Each key is an arrays of strings.
     */
    getErrorLines(result) {
        if (result instanceof Error) {
            result = this.getErrorResult(result)
        }
        const chlk = this.chalks.error
        const {message, stack, diff} = result
        return {
            message : chlk.message(message).split('\n'),
            stack   : chlk.stack(stack).split('\n'),
            diff    : diff ? diff.split('\n') : [],
        }
    }

    /**
     * Lines after the first line will be padded with the width of the prefix
     * string. No other indentation is applied.
     *
     * @param {Test} The mochajs test instance
     * @param {integer} The sequence number of the test
     * @return {object} With keys `first` (string) and `others` (array).
     */
    getFailedTestLines(test, num) {

        const chlk = this.chalks.error

        // Prefix and extra padding for title path lines.
        const prefix = `${num})`
        const prepad = nchars(prefix.length + 1, ' ')

        // Root suite title, and the other ancestors.
        const [root, ...rest] = test.titlePath().slice(0, -1)
        const first = chlk.title(`${prefix} ${root}`)

        // Test title goes last, followed by a colon.
        const final = `${test.title}:`
        const others = [...rest, final].map(line => prepad + chlk.title(line))

        return {first, others}
    }

    /**
     * Warning message lines for multiple errors.
     *
     * @return {string} The warning lines
     */
    getWarnMulipleLines() {
        const chlk = this.chalks.warn
        return ['', chlk.message('------ MULTIPLE ERRORS --------'), '']
    }

    /**
     * Returns an array of all errors from the test.
     *
     * @param {Test} The mochajs test instance
     * @return {array} The errors
     */
    collectErrors(test) {
        const errs = []
        if (test && test.err) {
            append(errs, castToArray(test.err))
            append(errs, castToArray(test.err.multiple))
        }
        return errs
    }

    /**
     * Check whether the error is diffable and diffs are enabled.
     *
     * Checks for diffable error with actual/expected properties, e.g.
     * AssertionError.
     *
     * @param {Error} The error to check
     * @return {boolean} Whether the error should be diffed.
     */
    shouldDiff(err) {
        return this.opts.diff && Base.showDiff(err)
    }

    /**
     * Adapted from:
     *
     * https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L180
     *
     * Returns a diff between 2 strings with coloured ANSI output. The diff
     * will be either inline or unified dependent on the value of `inlineDiffs`
     * option. No indenting is applied.
     *
     * @param {*} The actual result
     * @param {*} The expected result
     * @return {string} The diff
     */
    generateDiff(actual, expected) {

        const style = this.diffStyle
        const norm = arg => this.trunc(stringify(arg), this.diffSize)

        let result

        try {
            result = this._diffResult(style, norm(actual), norm(expected))
        } catch (err) {
            this.log(err)
            result = this._errorDiffResult(err)
        }

        return [result.head, '', result.body].join('\n')
    }

    /**
     * Truncate a string at certain length and append a message.
     *
     * @param {string} The string to truncate
     * @param {integer} The max width
     * @return {string} The result string
     */
    trunc(str, width) {
        if (str.length <= width) {
            return str
        }
        return str.substring(0, width) + ' ... [truncated]'
    }

    /**
     * The current depth (integer).
     */
    get depth() {
        return Math.max(this.counters.tab - 1, 0)
    }

    /**
     * Alias for `options` (object).
     */
    get opts() {
        return this.options
    }

    /**
     * Alias for `opts.reporterOption` (object).
     */
    get ropts() {
        if (!this.opts.reporterOption) {
            this.opts.reporterOption = {}
        }
        return this.opts.reporterOption
    }

    /**
     * The `diffSize` reporter option (integer). String safe. If `opts.diff`
     * is false, the value of `diffSize` is 0.
     */
    get diffSize() {
        if (!this.opts.diff) {
            return 0
        }
        return induceInt(this.ropts.diffSize, DefaultDiffSize)
    }

    /**
     * Sets `reporterOption.diffSize`.
     */
    set diffSize(value) {
        this.ropts.diffSize = value
    }

    /**
     * The diff style (string): 'inline' if `opts.inlineDiffs` is true,
     * otherwise 'unified'.
     */
    get diffStyle() {
        return this.opts.inlineDiffs ? 'inline' : 'unified'
    }

    /**
     * Sets `opts.inlineDiffs` to true iff the value is 'inline'.
     */
    set diffStyle(style) {
        this.opts.inlineDiffs = style == 'inline'
    }

    /**
     * The `diffNumLinesMin` reporter option (integer). If `opts.inlineDiffs`
     * is false, then the value Infinity. String safe.
     */
    get diffNumLinesMin() {
        if (!this.opts.inlineDiffs) {
            return Infinity
        }
        return induceInt(this.ropts.diffNumLinesMin, DefaultDiffLinesMin)
    }

    /**
     * Sets `reporterOption.diffNumLinesMin`.
     */
    set diffNumLinesMin(value) {
        this.ropts.diffNumLinesMin = value
    }

    /**
     * The `tabSize` reporter option (integer). String safe.
     */
    get tabSize() {
        return induceInt(this.ropts.tabSize, DefaultTabSize)
    }

    /**
     * Sets `reporterOption.tabSize`.
     */
    set tabSize(value) {
        this.ropts.tabSize = value
    }

    /**
     * The `groupErrors` reporter option (boolean). String safe.
     */
    get groupErrors() {
        return induceBool(this.ropts.groupErrors, DefaultGroupErrors)
    }

    /**
     * Sets `reporterOption.groupErrors`.
     */
    set groupErrors(value) {
        this.ropts.groupErrors = value
    }

    /**
     * Get a string from calling a method, if it exists. If the returned string
     * is not null, then log the string. Otherwise, do nothing.
     *
     * @param {string} The method name
     * @param {...*} The arguments to pass
     * @return {undefined}
     */
    _render(method, ...args) {
        if (typeof this[method] != 'function') {
            return
        }
        try {
            let res = this[method](...args)
            if (res == null) {
                return
            }
            if (Array.isArray(res)) {
                res = res.join('\n')
            }
            this.log(res)
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    /**
     * Get the diff result.
     *
     * @param {string} The style, 'inline' or 'unified'
     * @param {string} The actual text
     * @param {string} The expected text
     * @return {object} The diff result {head, body}
     */
    _diffResult(style, actual, expected) {

        const chlk = this.chalks.diff[style]
        const numbers = lines => lines.length >= this.diffNumLinesMin
        const dopts = {chlk, numbers}

        const head = style == 'inline'
            ? sp(chlk.removed('actual'), chlk.added('expected'))
            : sp(chlk.added('+ expected'), chlk.removed('- actual'))

        const body = Diffs[style](actual, expected, dopts)

        return {head, body}
    }

    /**
     * Produce a diff result for the UI when an internal error occurs.
     *
     * @param {Error} The error that occurred.
     * @return {object} The diff result {head, body}
     */
    _errorDiffResult(err) {

        const chlk = this.chalks.diff.unified

        const head = sp(
            chlk.added('+ expected'),
            chlk.removed ('- actual: failed to generate error diff'),
        )
        return {head, body: ''}
    }

    /**
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L223
     *
     * Get normalized message and stack info for an error.
     *
     * @param {Error} The error to parse
     * @return {object} Strings {stack, message, rawMessage, rawMatch}
     */
    _parseStack(err) {

        // Normalize raw error message.
        const rawMessage = this._rawErrorMessage(err)

        let message = ''
        let stack = err.stack || rawMessage

        if (err.uncaught) {
            message += 'Uncaught '
        }

        if (rawMessage) {
            // Check if the stack contains the rawMessage.
            const rawStart = stack.indexOf(rawMessage)
            if (rawStart > -1) {
                // Add everything from the start of the stack until the end
                // of the the raw message to errMessage, which will
                // typically include the error name at the beginning.
                const rawEnd = rawStart + rawMessage.length
                message += stack.slice(0, rawEnd)
                // Remove everything up to the raw message, and the following
                // newline character from the stack.
                stack = stack.slice(rawEnd + 1)
            }
        }

        const rawMatch = matchIndex(rawMessage, RawMatchRegex, 1)

        return {stack, message, rawMessage, rawMatch}
    }

    /**
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L245
     *
     * Normalize raw error message.
     *
     * @param {Error} The error to examine
     * @return {string} The normalized message
     */
    _rawErrorMessage(err) {
        let raw = ''
        if (typeof err.inspect == 'function') {
            raw += err.inspect()
        } else if (err.message && typeof err.message.toString == 'function') {
            raw += err.message
        }
        return raw
    }
}

/**
 * Default reporter implementation.
 */
class DefaultReporter extends BaseReporter {

    /**
     * Add a new line at the start of the test run.
     *
     * @return {string} The rendered content
     */
    renderRunBegin() {
        return ''
    }

    /**
     * Write the suite title during testing.
     *
     * @param {Suite} The mochajs suite instance
     * @return {string} The rendered content
     */
    renderSuiteBegin(suite) {
        let chlk = this.chalks.suite
        if (this.depth == 1) {
            chlk = chlk.root
        }
        const msg = chlk.title(suite.title)
        return this.indentLine(msg)
    }

    /**
     * Render the title of a pending/skipped test during testing.
     *
     * @param {Test} The mochajs test instance
     * @return {string} The rendered content
     */
    renderTestPending(test) {
        const chlk = this.chalks.test
        const msg = chlk.pending.title(`- ${test.title}`)
        return this.indentLine(msg)
    }

    /**
     * Render the title of a passed test during testing.
     *
     * @param {Test} The mochajs test instance
     * @return {string} The rendered content
     */
    renderTestPass(test) {
        const chlk = this.chalks.test
        const parts = [
            chlk.pass.symbol(this.symbols.ok),
            chlk.pass.title(test.title),
        ]
        if (test.speed != 'fast') {
            parts.push(
                chlk.speed[test.speed](`(${test.duration}ms)`)
            )
        }
        const msg = parts.join(' ')
        return this.indentLine(msg)
    }

    /**
     * Render the title of a failed test during testing.
     *
     * @param {Test} The mochajs test instance
     * @return {string} The rendered content
     */
    renderTestFail(test) {
        const chlk = this.chalks.test
        const {failures} = this.counters
        const msg = chlk.fail.title(`${failures}) ${test.title}`)
        return this.indentLine(msg)
    }

    /**
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L351
     *
     * Render the summary and errors after the test run is complete.
     *
     * @return {string} The rendered content
     */
    renderRunEnd() {

        const chlk = this.chalks.stats
        const {stats} = this
        const tab = 2

        const stLines = this.getStatsLines(stats)

        const lines = []

        lines.push('')

        // Passing
        lines.push(this.indentLine(stLines.passes, tab))

        // Pending
        if (stats.pending) {
            lines.push(this.indentLine(stLines.pending, tab))
        }

        // Failures
        if (stats.failures) {
            lines.push(this.indentLine(stLines.failures, tab))
            append(lines, this.renderFailures(this.failures, tab).split('\n'))
            lines.push('')
        }

        lines.push('')

        return lines.join('\n')
    }

    /**
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L223
     *
     * Render test failures.
     *
     * @param {array} Test instances with corresponding `err` property
     * @param {integer} (optional) The start tab level, default is 0
     * @return {string} The rendered lines
     */
    renderFailures(failures, tab = 0) {

        tab = tab || 0

        const chlk = this.chalks.error
        const {groupErrors} = this

        const lines = []

        lines.push('')

        failures.forEach((test, i) => {

            const errs = this.collectErrors(test)

            // Test info repeats for multiple errors.
            const {first, others} = this.getFailedTestLines(test, i + 1)
            const common = [
                // Root suite title with number prefix.
                this.indentLine(  first  , tab),
                // Successively indent the other lines of the test path.
                this.indentLines( others , tab + 1, 1),
            ].flat()

            common.push('')

            errs.forEach((err, eidx) => {

                // Error lines.
                const {message, diff, stack} = this.getErrorLines(err)

                if (groupErrors && eidx > 0) {
                    // Show warning line instead of test info after first error.
                    const warning = this.getWarnMulipleLines()
                    append(lines, this.indentLines(warning, tab + 2))
                } else {
                    // Repeat test info for each error.
                    append(lines, common)
                }

                append(lines, [
                    // The error message.
                    this.indentLines( message , tab + 2),
                    // The diff, if any.
                    this.indentLines( diff    , tab + 2),
                    // The error stack.
                    this.indentLines( stack   , tab),
                ].flat())

                lines.push('')
            })
        })

        return lines.join('\n')
    }
}

module.exports = {
    BaseReporter,
    DefaultReporter,
}