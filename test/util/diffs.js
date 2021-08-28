/**
 * gameon - Diffs helper
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
const {arrays: {append}} = require('@quale/core')
const {colors: {Chalk}} = require('@quale/term')

const diff = require('diff')
const chalk = new Chalk()
const noBlanks = line => typeof line != 'undefined' && line !== null

class Diffs {

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
     * @param {object} (optional) The options {chlk}
     * @return {string} The diff
     */
    static unified(actual, expected, opts) {

        opts = opts || {}

        const chlk = {
            added   : chalk.green,
            removed : chalk.red,
            ...opts.chlk,
        }

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

        const patch = diff.createPatch('string', actual, expected)
        const lines = patch.split('\n').splice(5).map(format).filter(noBlanks)
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
     * @param {string} actual
     * @param {string} expected
     * @param {object} (optional) The options {chlk, isNumbers, separator}
     * @return {string} Diff
     */
    static inline(actual, expected, opts) {

        opts = opts || {}

        const chlk = {
            added   : chalk.bgGreen.black,
            removed : chalk.bgRed.black,
            ...opts.chlk,
        }

        const format = change => {
            if (change.added) {
                return chlk.added(change.value)
            }
            if (change.removed) {
                return chlk.removed(change.value)
            }
            return change.value
        }

        const changes = diff.diffWordsWithSpace(actual, expected)
        const lines = changes.map(format).join('').split('\n')
        return Diffs.numberLinesIfNeeded(lines, opts).join('\n')
    }

    static numberLinesIfNeeded(lines, opts) {
        const opt = (opts || {}).numbers
        const isNums = typeof opt == 'function' ? opt(lines) : Boolean(opt)
        return isNums ? Diffs.numberLines(lines, opts) : lines
    }

    static numberLines(lines, opts) {

        opts = opts || {}

        const {separator = ' | '} = opts
        const chlk = {
            number    : chalk.reset,
            separator : chalk.grey,
            ...opts.chlk,
        }

        const width = String(lines.length).length
        const joiner = chlk.separator(separator)

        return lines.map((line, i) => {
            const nstr = String(i + 1).padStart(width, ' ')
            return [chlk.number(nstr), line].join(joiner)
        })
    }
}

module.exports = Diffs