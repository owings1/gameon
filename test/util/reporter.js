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

const {append, lcfirst, mapValues, ucfirst} = require('../../src/lib/util')

const DefaultDiffSize = 2048

/**
 * Mocha Runner events.
 *
 * For reference, See: https://github.com/mochajs/mocha/blob/master/lib/runner.js
 */
const Increments = {
    EVENT_SUITE_BEGIN: {
        indents:  1,
    },
    EVENT_SUITE_END: {
        indents: -1,
    },
    EVENT_TEST_BEGIN: {
        indents:  1,
    },
    EVENT_TEST_END: {
        indents: -1,
    },
    EVENT_TEST_FAIL: {
        failures: 1,
    },
    EVENT_TEST_PENDING: {
        indents:  1,
    },
}

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

const Chalks = (chalk) => ({
    diff: {
        unified: {
            added   : chalk.green,
            removed : chalk.red,
        },
        inline: {
            added   : chalk.bgGreen.black,
            removed : chalk.bgRed.black,
        },
    },
    error: {
        title   : chalk.reset,
        message : chalk.red,
        stack   : chalk.grey,
    },
    stats: {
        passes   : chalk.green,
        pending  : chalk.cyan,
        failures : chalk.red,
        duration : chalk.grey,
    },
    suite: {
        title : chalk.reset,
    },
    test: {
        pass: {
            title  : chalk.grey,
            symbol : chalk.green,
        },
        fail: {
            title: chalk.red,
        },
        pending: {
            title: chalk.cyan,
        },
        speed: {
            fast   : chalk.grey,
            medium : chalk.yellow,
            slow   : chalk.red,
        },
    },
})

class Reporter extends Base {

    constructor(runner, options) {

        super(runner, options)

        this.symbols = {
            ok: '\u2713',// \u2714 \u221a
        }

        this.chalk = new chalk.Instance()
        if (this.opts.color === false) {
            this.chalk.level = 0
        }
        this.chalks = Chalks(this.chalk)

        if ('diffSize' in this.ropts) {
            this.diffSize = parseInt(this.ropts.diffSize) || 0
        } else {
            this.diffSize = DefaultDiffSize
        }

        this.counters = {
            indents  : 0,
            failures : 0,
        }

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
                runner.on(event, this.render.bind(this, render))
            }
        })
    }

    get opts() {
        return this.options
    }

    get ropts() {
        return this.options.reporterOption || {}
    }

    render(method, ...args) {
        if (typeof this[method] != 'function') {
            return
        }
        const str = this[method](...args)
        if (str != null) {
            this.log(str)
        }
    }

    indent(indents = null) {
        if (indents == null) {
            indents = this.counters.indents
        }
        return Array(indents).join('  ')
    }

    indentLine(str, indents = null) {
        return str ? this.indent(indents) + str : str
    }

    indentLines(lines, indents = null) {
        const indent = this.indent(indents)
        return lines.map(line => line ? indent + line : line)
    }

    log(...args) {
        Base.consoleLog(...args)
    }

    /**
     * Add a new line at the start of the test run.
     */
    renderRunBegin() {
        return ''
    }

   /**
    * Adapted from https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L351
    *
    * Outputs common epilogue used by many of the bundled reporters.
    *
    * @public
    * @memberof Mocha.reporters
    * @return {String} The rendered lines
    */
    renderRunEnd() {

        const chlk = this.chalks.stats

        const {stats} = this

        const passLine = [
            chlk.passes  (`${stats.passes || 0} passing`)
          , chlk.duration(`(${ms(stats.duration)})`)
        ].join(' ')
        const pendLine = chlk.pending (`${stats.pending} pending`)
        const failLine = chlk.failures(`${stats.failures} failing`)

        const lines = []

        lines.push('')
        lines.push('')

        lines.push(this.indentLine(passLine, 2))

        // pending
        if (stats.pending) {
            lines.push(this.indentLine(pendLine, 2))
        }

        // failures
        if (stats.failures) {
            lines.push(this.indentLine(failLine, 2))
            append(lines, this.renderFailures(this.failures).split('\n'))
            lines.push('')
        }

        lines.push('')

        return lines.join('\n')
    }

    renderSuiteBegin(suite) {
        const chlk = this.chalks.suite
        const msg = chlk.title(suite.title)
        return this.indentLine(msg)
    }

    renderSuiteEnd(suite) {
        if (this.counters.indents == 1) {
            return ''
        }
    }

    renderTestPending(test) {
        const chlk = this.chalks.test
        const msg = chlk.pending.title(`- ${test.title}`)
        return this.indentLine(msg)
    }

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

    renderTestFail(test) {
        const chlk = this.chalks.test
        const msg = chlk.fail.title(`${this.counters.failures}) ${test.title}`)
        return this.indentLine(msg)
    }

    /**
     * Adapted from https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L223
     *
     * Render test failures.
     *
     * @param {array} Test instances with corresponding `err` property
     *
     * @return {string} The rendered lines
     */
    renderFailures(failures) {

        const chlk = this.chalks.error

        const lines = []

        let multipleErr
        let multipleTest

        lines.push('')

        failures.forEach((test, i) => {

            const testNum = i + 1

            // indented test title
            let testTitle = ''
            test.titlePath().forEach((str, idx) => {
                if (idx !== 0) {
                    testTitle += '\n     '
                }
                for (let i = 0; i < idx; i++) {
                    testTitle += '  '
                }
                testTitle += str
            })

            // Select error in case of multiple errors.
            let err
            if (test.err && test.err.multiple) {
                if (multipleTest !== test) {
                    multipleTest = test
                    multipleErr = [test.err].concat(test.err.multiple)
                }
                err = multipleErr.shift()
            } else {
                err = test.err
            }

            // Normalize raw error message.
            let rawMessage = ''
            if (typeof err.inspect === 'function') {
                rawMessage += err.inspect()
            } else if (err.message && typeof err.message.toString === 'function') {
                rawMessage += err.message
            }

            // Error stack.
            let stack = err.stack || rawMessage

            // Check for error with actual/expected, e.g. AssertionError.
            const isShowDiff = this.opts.diff && Base.showDiff(err)
            const diffLines = []

            // Construct full error message.
            let message = ''

            if (isShowDiff) {

                const expMatch = rawMessage.match(/^([^:]+): expected/)
                if (expMatch) {
                    message += expMatch[1]
                }

                const diffArgs = ['actual', 'expected'].map(key => {
                    const value = err[key]
                    return typeof value == 'string' ? value : stringify(value)
                })

                append(diffLines,
                    this.generateDiff(...diffArgs).split('\n')
                )
            }

            if (!message) {

                if (err.uncaught) {
                    message += 'Uncaught '
                }

                const rawMsgStart = rawMessage ? stack.indexOf(rawMessage) : -1

                if (rawMsgStart > -1) {
                    // Add everything from the start of the stack until the end
                    // of the the raw message to errMessage, which will
                    // typically include the error name at the beginning.
                    const rawMsgEnd = rawMsgStart + rawMessage.length
                    message += stack.slice(0, rawMsgEnd)
                    // Remove everything up to the raw message, and the following
                    // newline character from the stack.
                    stack = stack.slice(rawMsgEnd + 1)
                } else {
                    // Raw message not found in stack, so add it to errMessage.
                    message += rawMessage
                }
            }

            // Format lines.
            const titleLine = chlk.title(`${testNum}) ${testTitle}:`)
            const messageLine = chlk.message(message)
            const stackLines = stack.split('\n').map(line => chlk.stack(line))

            // Add lines.
            lines.push(this.indentLine(titleLine, 2))
            lines.push('')

            lines.push(this.indentLine(messageLine, 4))

            append(lines, this.indentLines(diffLines, 4))

            append(lines, this.indentLines(stackLines, 2))

            lines.push('')
        })

        return lines.join('\n')
    }

    /**
     * Copied and adapted from https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L180
     *
     * Returns a diff between 2 strings with coloured ANSI output.
     *
     * @description
     * The diff will be either inline or unified dependent on the value
     * of `this.opts.inlineDiffs`.
     *
     * @param {string} actual
     * @param {string} expected
     * @return {string} Diff
     */
    generateDiff(actual, expected) {

        try {

            const {diffSize} = this

            if (actual.length > diffSize) {
                actual = actual.substring(0, diffSize) + ' ... Lines skipped'
            }
            if (expected.length > diffSize) {
                expected = expected.substring(0, diffSize) + ' ... Lines skipped'
            }

            const method = ['_unifiedDiff', '_inlineDiff'][+Boolean(this.opts.inlineDiffs)]
            return this[method](actual, expected)

        } catch (err) {

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
     * Adapted from https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L435
     *
     * Returns unified diff between two strings with coloured ANSI output.
     *
     * @private
     * @param {String} actual
     * @param {String} expected
     * @return {string} The diff.
     */
    _unifiedDiff(actual, expected) {

        const chlk = this.chalks.diff.unified

        const headerLine = [
            chlk.added   ( '+ expected' )
          , chlk.removed ( '- actual'   )
        ].join(' ')

        const formatLine = line => {
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

        const notBlank = line => typeof line !== 'undefined' && line !== null

        const patch = diff.createPatch('string', actual, expected)
        const diffLines = patch.split('\n').splice(5)

        const lines = []

        lines.push(headerLine)

        lines.push('')
        lines.push('')

        append(lines, diffLines.map(formatLine).filter(notBlank))

        return lines.join('\n')
    }

    /**
     * Adapted from:
     *  - https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L398
     *  - https://github.com/mochajs/mocha/blob/e044ef02/lib/reporters/base.js#L478
     *
     * Returns inline diff between 2 strings with coloured ANSI output.
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
        lines.push('')

        append(lines, diffLines.map((str, i) => {
            if (!isLineNums) {
                return str
            }
            const numStr = String(i + 1).padStart(numsWidth, ' ')
            return [numStr, str].join(' | ')
        }))

        lines.push('')

        return lines.join('\n')
    }
}

module.exports = Reporter