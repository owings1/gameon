/**
 * gameon - test entrypoint
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
const {stripLeadingSlash, ucfirst} = require('../src/lib/util')

const globby = require('globby')
const path   = require('path')

const isPrintOnly = false

const onlys = [
    null
    //, 'Auth'
    //, 'BoardAnalyzer'
    //, 'Client'
    //, 'Coordinator'
    //, 'Core'
    //, 'Errors'
    //, 'Lab'
    //, 'Logger'
    //, 'Menu'
    //, 'Moves'
    //, 'NetPlayer'
    //, 'Player'
    //, 'Prompts'
    //, 'Robot'
    //, 'Tables'
    //, 'Term'
    //, 'Themes'
    //, 'Trees'
    //, 'Util'
]
const skips = [
    null
    //, 'Auth'
    //, 'BoardAnalyzer'
    //, 'Client'
    //, 'Coordinator'
    //, 'Core'
    //, 'Errors'
    //, 'Lab'
    //, 'Logger'
    //, 'Menu'
    //, 'Moves'
    //, 'NetPlayer'
    //, 'Player'
    //, 'Prompts'
    //, 'Robot'
    //, 'Tables'
    //, 'Term'
    //, 'Themes'
    //, 'Trees'
    //, 'Util'
]

const oldEnv = process.env.GAMEON_TEST
before(() => {
    process.env.GAMEON_TEST = '1'
})
after(() => {
    process.env.GAMEON_TEST = oldEnv
})
Object.entries(getSuites()).forEach(([file, title]) => {
    if (isPrintOnly) {
        console.log(title)
        return
    }
    const suite = () => require(file)
    if (onlys.indexOf(title) > -1) {
        describe.only(title, suite)
    } else if (skips.indexOf(title) > -1) {
        describe.skip(title, suite)
    } else {
        describe(title, suite)
    }
})

function getSuites(dir, glob) {
    dir = dir || path.resolve(__dirname, 'suites')
    glob = dir + '/' + stripLeadingSlash(glob || '*.test.js')
    return Object.fromEntries(
        globby.sync(glob)
            .sort((a, b) =>
                path.basename(a).toLowerCase().localeCompare(
                    path.basename(b).toLowerCase()
                )
            )
            .map(file => [
                file
              , path.basename(file)
                    .split('.').slice(0, -2)
                    .join('')
                    .split('-')
                    .map(ucfirst)
                    .join('')
            ])
    )
}