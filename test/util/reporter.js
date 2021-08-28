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
const {arrays: {append}} = require('@quale/core')

const Base = require('./reporter-base.js').DefaultReporter
const {pad, nchars, stringWidth} = require('../../src/lib/util.js')

function wrap (inner, outer) {
    return outer + inner + outer
}

class Reporter extends Base {

    constructor(runner, opts) {
        super(runner, opts)
        this.setStyles({
            'suite.root.title' : 'bgWhiteBright.magenta.bold',
        })
    }

    renderSuiteBegin(suite) {

        if (this.depth != 1) {
            return super.renderSuiteBegin(suite)
        }

        const chlk = this.chalks.suite.root
        const {title} = suite
        const spaces = nchars(stringWidth(title) + 2, ' ')
        const lines = [
            spaces,
            wrap(title.toUpperCase(), ' '),
            spaces,
        ].map(line => chlk.title(line))

        lines.push('')

        return this.indentLines(lines, this.counters.tab + 1)
    }
}

module.exports = Reporter