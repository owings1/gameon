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
const Base        = require('mocha/lib/reporters/base')
const Runner      = require('mocha/lib/runner')
const {stringify} = require('mocha/lib/utils')

const {
    append,
    castToArray,
    lcfirst,
    mapValues,
    nchars,
    ucfirst,
} = require('../../src/lib/util')

const Chalks = require('./reporter-chalks')

const DefaultDiffSize    = 2048
const DefaultGroupErrors = true

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

const chalk = require('chalk')
const diff  = require('diff')
const ms    = require('ms')
const ld = {
    get : require('lodash/get'),
    set : require('lodash/set'),
}
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

        // Load default colors and symbols.
        this.chalks = Chalks(this.chalk)
        this.symbols = {ok: '\u2713'}

        // Process options.
        if (this.opts.color === false) {
            this.chalk.level = 0
        }

        // Report options.
        const {ropts} = this

        this.diffSize = DefaultDiffSize
        if (ropts.diffSize != null) {
            this.diffSize = parseInt(ropts.diffSize) || 0
        }
        this.tabSize = 2
        if (ropts.tabSize != null) {
            this.tabSize = parseInt(ropts.tabSize) || 0
        }
        if (ropts.groupErrors != null) {
            ropts.groupErrors = String(ropts.groupErrors).toLowerCase() != 'false'
        } else {
            ropts.groupErrors = DefaultGroupErrors
        }

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
        ld.set(this.chalks, key, ld.get(this.chalk, ref))
        return this
    }

    /**
     * Set chalk styles.
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

        try {

            const {diffSize} = this

            if (typeof actual != 'string') {
                actual = stringify(actual)
            }
            if (typeof expected != 'string') {
                expected = stringify(expected)
            }

            if (actual.length > diffSize) {
                actual = actual.substring(0, diffSize) + ' ... Lines skipped'
            }
            if (expected.length > diffSize) {
                expected = expected.substring(0, diffSize) + ' ... Lines skipped'
            }

            const method = this.opts.inlineDiffs ? '_inlineDiff' : '_unifiedDiff'

            return this[method](actual, expected)

        } catch (err) {

            console.error(err)

            // Produce an error diff for the UI.

            const chlk = this.chalks.diff.unified

            const headerLine = [
                chlk.added   ( '+ expected' )
              , chlk.removed ( '- actual: failed to generate Mocha diff' )
            ].join(' ')

            const lines = []

            lines.push(headerLine)
            lines.push('')

            return lines.join('\n')
        }
    }

    /**
     * Getter for the current depth (integer).
     */
    get depth() {
        return Math.max(this.counters.tab - 1, 0)
    }

    /**
     * Alias getter for this.options (object).
     */
    get opts() {
        return this.options
    }

    /**
     * Alias getter for this.options.reporterOption (object).
     */
    get ropts() {
        if (!this.options.reporterOption) {
            this.options.reporterOption = {}
        }
        return this.options.reporterOption
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
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L435
     *
     * Returns unified diff between two strings with coloured ANSI output.
     * No indenting is applied.
     *
     * @param {string} The actual result
     * @param {string} The expected result
     * @return {string} The diff
     */
    _unifiedDiff(actual, expected) {

        const chlk = this.chalks.diff.unified

        const headerLine = [
            chlk.added   ( '+ expected' )
          , chlk.removed ( '- actual'   )
        ].join(' ')

        const format = line => {
            if (line[0] === '+') {
                return chlk.added(line)
            }
            if (line[0] === '-') {
                return chlk.removed(line)
            }
            if (line.match(/@@/)) {
                return '--'
            }
            if (line.match(/\\ No newline/)) {
                return null
            }
            return line
        }

        const blanks = line => typeof line !== 'undefined' && line !== null

        const patch = diff.createPatch('string', actual, expected)
        const diffLines = patch.split('\n').splice(5).map(format).filter(blanks)

        const lines = []

        lines.push(headerLine)

        lines.push('')
        //lines.push('')

        append(lines, diffLines)

        return lines.join('\n')
    }

    /**
     * Adapted from:
     *
     *  - https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L398
     *  - https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L478
     *
     * Returns inline diff between 2 strings with coloured ANSI output.
     * No indenting is applied.
     *
     * @private
     * @param {String} actual
     * @param {String} expected
     * @return {string} Diff
     */
    _inlineDiff(actual, expected) {

        const chlk = this.chalks.diff.inline

        const headerLine = [
            chlk.removed ( 'actual'   )
          , chlk.added   ( 'expected' )
        ].join(' ')

        const changes = diff.diffWordsWithSpace(actual, expected)
        const parts = changes.map(change => {
            if (change.added) {
                return chlk.added(change.value)
            }
            if (change.removed) {
                return chlk.removed(change.value)
            }
            return change.value
        })
        const diffLines = parts.join('').split('\n')
        const isLineNums = diffLines.length > 4
        const numsWidth = String(diffLines.length).length

        const lines = []

        lines.push(headerLine)
        //lines.push('')

        append(lines, diffLines.map((str, i) => {
            if (!isLineNums) {
                return str
            }
            // Add line numbers.
            const prefix = String(i + 1).padStart(numsWidth, ' ')
            return [prefix, str].join(' | ')
        }))

        lines.push('')

        return lines.join('\n')
    }

    /**
     * Adapted from:
     *
     *   https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L223
     *
     * Get normalized message and stack info for an error.
     *
     * @param {Error} The error to parse
     * @return {object} Strings {stack, message, rawMessagem, rawMatch}
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

        const rawMatch = (rawMessage.match(/^([^:]+): expected/) || [])[1] || ''

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
        // Normalize raw error message.
        let rawMessage = ''
        if (typeof err.inspect == 'function') {
            rawMessage += err.inspect()
        } else if (err.message && typeof err.message.toString == 'function') {
            rawMessage += err.message
        }
        return rawMessage
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
            chlk.pass.symbol(this.symbols.ok)
          , chlk.pass.title(test.title)
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
     * Adapted from https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L351
     *
     * Render the summary and errors after the test run is complete.
     *
     * @return {string} The rendered content
     */
    renderRunEnd() {

        const chlk = this.chalks.stats

        const tab = 2

        const {stats} = this

        const passLine = [
            chlk.passes  ( `${stats.passes || 0} passing` )
          , chlk.duration( `(${ms(stats.duration)})`      )
        ].join(' ')
        const pendLine = chlk.pending (`${stats.pending} pending`)
        const failLine = chlk.failures(`${stats.failures} failing`)

        const lines = []

        lines.push('')

        // Passing
        lines.push(this.indentLine(passLine, tab))

        // Pending
        if (stats.pending) {
            lines.push(this.indentLine(pendLine, tab))
        }

        // Failures
        if (stats.failures) {
            lines.push(this.indentLine(failLine, tab))
            append(lines, this.renderFailures(this.failures, tab).split('\n'))
            lines.push('')
        }

        lines.push('')

        return lines.join('\n')
    }

    /**
     * Adapted from https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L223
     *
     * Render test failures.
     *
     * @param {array} Test instances with corresponding `err` property
     * @param {integer} (optional) The start tab level, default is 0.
     * @return {string} The rendered lines
     */
    renderFailures(failures, tab = 0) {

        tab = tab || 0

        const chlk = this.chalks.error
        const lines = []

        const {groupErrors} = this.ropts

        
        lines.push('')

        failures.forEach((test, i) => {

            const errs = this.collectErrors(test)

            // Test info repeats for multiple errors.
            const {first, others} = this.getFailedTestLines(test, i + 1)
            const common = [
                // Root suite title with number prefix.
                this.indentLine(  first  , tab)
                // Successively indent the other lines of the test path.
              , this.indentLines( others , tab + 1, 1)
            ].flat()

            common.push('')

            if (groupErrors) {
                // Log test info once.
                append(lines, common)
            }

            errs.forEach((err, eidx) => {

                // Error lines.
                const {message, diff, stack} = this.getErrorLines(err)

                if (groupErrors) {
                    if (eidx > 0) {
                        append(lines,
                            this.indentLines(this.getWarnMulipleLines(), tab + 2)
                        )
                    }
                } else {
                    // Repeat test info.
                    append(lines, common)
                }

                append(
                    lines, [
                    // The error message.
                    this.indentLines( message , tab + 2)
                    // The diff, if any.
                  , this.indentLines( diff    , tab + 2)
                    // The error stack.
                  , this.indentLines( stack   , tab)
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