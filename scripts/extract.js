/**
 * gameon - i18n extraction script
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
const {objects: {valueHash}} = require('utils-h')
const {Extractor, Merger} = require('po-extractor')
const fse = require('fs-extra')

const fs = require('fs')
const path = {resolve} = require('path')

const Diffs = require('../test/util/diffs.js')
const {BaseDir, LocalesDir} = require('../src/lib/constants.js')

const poGlob = LocalesDir + '/*/messages.po'
const srcGlobs = ['src/**/*.js']

const IgnoreKeys = valueHash([
    '*',
    'play.color.*',
    'play.colorLetter.*',
], null)
const opts = {
    dryRun: false,
    verbose: 1,
    //logging: {logLevel: 4, inspect: {depth: 4}},
    marker: ['__'],
    replace: true,
    members: true,
    baseDir: BaseDir,
    sort: 'msgid',
    references: {
        perLine: 1,
    },
    filter: key => {
        if (IgnoreKeys[key]) {
            return false
        }
        return true
    },
}

function main () {
    const merger = new Merger(opts)
    const extractor = new Extractor(opts)
    const messages = extractor.extract(srcGlobs)
    merger.mergePos(poGlob, messages)
}

function mergeDiff (locale, messages) {
    const file = resolve(LocalesDir, locale, 'messages.po')
    const result = merger.getMergePoResult(file, messages)
    const contentOld = result.sourceContent.toString('utf-8')
    const contentNew = result.content.toString('utf-8')
    return Diffs.unified(contentOld, contentNew)
}

if (require.main === module) {
    main()
}