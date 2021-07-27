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
const IsPrintOnly = false

const {
    keyValuesTrue,
    mapValues,
    stripLeadingSlash,
    ucfirst,
} = require('./util')

const {Chars} = require('../src/lib/constants')

const chalk  = require('chalk')
const globby = require('globby')
const path   = require('path')

const onlys = [
    //'auth',
    //'board-analyzer',
    //'client',
    //'coordinator',
    //'core',
    //'errors',
    //'inquirer',
    //'lab',
    //'logger',
    //'menu',
    //'move',
    //'net-player',
    //'player',
    //'prompts',
    //'robot',
    //'server',
    //'tables',
    //'term',
    //'themes',
    //'trees',
    //'util',
    null
]
const skips = [
    //'auth',
    //'board-analyzer',
    //'client',
    //'coordinator',
    //'core',
    //'errors',
    //'inquirer',
    //'lab',
    //'logger',
    //'menu',
    //'move',
    //'net-player',
    //'player',
    //'prompts',
    //'robot',
    //'server',
    //'tables',
    //'term',
    //'themes',
    //'trees',
    //'util',
    null
]

const isMocha = typeof describe != 'undefined'
const isPrintOnly = IsPrintOnly || !isMocha
const isRun = !isPrintOnly

if (isRun) {

    let oldEnv

    before(() => {
        oldEnv = process.env.GAMEON_TEST
        process.env.GAMEON_TEST = '1'
    })

    after(() => {
        process.env.GAMEON_TEST = oldEnv
    })
}

const maps = mapValues({onlys, skips}, keyValuesTrue)

getSuites().forEach(({file, name, title}) => {
    if (isPrintOnly) {
        console.log(name)
        return
    }
    const {onlys, skips} = maps
    const suite = () => require(file)
    //const hr = ''.padEnd(name.length + 2, Chars.table.dash)
    //const label = [
    //    [Chars.pointer, name].join(' ')
    //  , hr
    //].join('\n  ')
    const label = name
    if (onlys[title] || onlys[name]) {
        describe.only(label, suite)
    } else if (skips[title] || skips[name]) {
        describe.skip(label, suite)
    } else {
        describe(label, suite)
    }
})

function getSuites(dir, glob) {
    dir = dir || path.resolve(__dirname, 'suites')
    glob = dir + '/' + stripLeadingSlash(glob || '*.test.js')
    return globby.sync(glob)
        .map(file => {
            const name = path.basename(file)
                .split('.')
                .slice(0, -2)
                .join('')
            const title = name.split('-')
                .map(ucfirst)
                .join('')
            return {file, name, title}
        })
        .sort((a, b) => {
            const strs = [a, b].map(({name}) => name.toLowerCase())
            return strs[0].localeCompare(strs[1])
        })
}
