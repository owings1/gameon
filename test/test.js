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
const {suites} = require('./util')

const isPrintOnly = false

const onlys = [
    null
    //, 'BoardAnalyzer'
    //, 'Coordinator'
    //, 'Core'
    //, 'Errors'
    //, 'Lab'
    //, 'Logger'
    //, 'Menu'
    //, 'Move'
    //, 'Net'
    //, 'Player'
    //, 'Robot'
    //, 'Tables'
    //, 'Term'
    //, 'Themes'
    //, 'Trees'
    //, 'Util'
]
const skips = [
    null
    //, 'BoardAnalyzer'
    //, 'Coordinator'
    //, 'Core'
    //, 'Errors'
    //, 'Lab'
    //, 'Logger'
    //, 'Menu'
    //, 'Move'
    //, 'Net'
    //, 'Player'
    //, 'Robot'
    //, 'Tables'
    //, 'Term'
    //, 'Themes'
    //, 'Trees'
    //, 'Util'
]

Object.entries(suites()).forEach(([file, title]) => {
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
/*
describe('BoardAnalyzer', () => {
    require('./suites/board-analyzer.test')
})

describe('Coordinator', () => {
    require('./suites/coordinator.test')
})

describe('Core', () => {
    require('./suites/core.test')
})

describe('Lab', () => {
    require('./suites/lab.test')
})

describe('Logger', () => {
    require('./suites/logger.test')
})

describe('Menu', () => {
    require('./suites/menu.test')
})

describe('Moves', () => {
    require('./suites/move.test')
})

describe('Net', () => {
    require('./suites/net.test')
})

describe('Player', () => {
    require('./suites/player.test')
})

describe('Robot', () => {
    require('./suites/robot.test')
})

describe('Tables', () => {
    require('./suites/tables.test')
})

describe('Term', () => {
    require('./suites/term.test')
})

describe('Themes', () => {
    require('./suites/themes.test')
})

describe('Trees', () => {
    require('./suites/trees.test')
})

describe('Util', () => {
    require('./suites/util.test')
})
*/