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
const Diffs   = require('../test/util/diffs')
const Extractor = require('../../po-extractor/src/extractor')

const {fileDateString} = require('../src/lib/util')

const fs     = require('fs')
const fse    = require('fs-extra')
const path   = require('path')
const {resolve} = path

const {
    BaseDir,
    LocaleNames,
    LocalesDir,
} = require('../src/lib/constants')

const BackupDir = resolve(LocalesDir, 'backup')
const CommentMaxLen = 80
const Filename = 'messages'
const Format = 'po'
const PoName = [Filename, Format].join('.')

const LocalesMap = Object.fromEntries(
    LocaleNames.map(locale => {
        const file = resolve(LocalesDir, locale, PoName)
        const rel = path.relative(LocalesDir, file)
        return [locale, {locale, file, rel}]
    })
)
const Locales = Object.values(LocalesMap)


const extractor = new Extractor({
    //dryRun: true,
    baseDir: BaseDir,
    gitCheck: 'trackedOnly',
    //verbosity: 1,
    sort: 'source',
    marker: '__',
    references: {
        perLine: 1,
    },
    logging: {
        //prefix: false,
    },
})
const {logger} = extractor
/**
 * Extract messages, backup and update po files.
 */
function main () {

    const globs = ['src/**/*.js']


    const messages = extractor.extract(globs)


    logger.info('Updating', Locales.length, 'locales')
    Locales.forEach(({locale, rel}) => {
        //const diff = mergeDiff(locale, messages)
        //if (diff) {
        //    console.log(diff)
        //} else {
        //    console.log('no diff')
        //}
        
        const {file} = LocalesMap[locale]

        extractor.mergePoTo(file, file, messages)
        //update(locale, messages, opts)
    })
    logger.info('Done')
}


function mergeDiff (locale, messages) {
    const {file} = LocalesMap[locale]
    const result = extractor.getMergePoResult(file, messages)
    const contentOld = result.sourceContent.toString('utf-8')
    const contentNew = result.content.toString('utf-8')
    return Diffs.unified(contentOld, contentNew)
}



/**
 * Backup a locale po file.
 *
 * @param {string} The locale name
 * @param {Date} (optional) The date reference for the backup file
 * @return {string} The backup file
 */
function backup (locale, dateRef) {
    const source = LocalesMap[locale].file
    const {dest, rel} = _backupPath(locale, dateRef)
    logger.info('Backing up to', rel)
    fse.ensureDirSync(path.dirname(dest))
    fse.copySync(source, dest)
    return dest
}


/***************************************************/
/* Util methods                                    */
/***************************************************/


function _backupPath (locale, dateRef) {
    const fdstr = fileDateString(dateRef)
    const bname = [Filename, fdstr, Format].join('.')
    const rel = [locale, bname].join('/')
    const dest = resolve(BackupDir, rel)
    return {dest, rel}
}


if (require.main === module) {
    main()
}