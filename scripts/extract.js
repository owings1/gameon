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
const Extract = require('i18n-extract')
const Logger = require('../src/lib/logger')

const {fileDateString} = require('../src/lib/util')

const fs     = require('fs')
const fse    = require('fs-extra')
const parser = require('gettext-parser').po
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
        const rel = [locale, PoName].join('/')
        const file = resolve(LocalesDir, rel)
        return [locale, {locale, file, rel}]
    })
)
const Locales = Object.values(LocalesMap)

const logger = new Logger('extract', {named: true})

/**
 * Extract messages, backup and update po files.
 */
function main () {

    const globs = ['src/**/*.js']
    const eopts = {marker: '__'}

    logger.info('Backup directory is', BackupDir)

    const messages = extract(globs, eopts)

    logger.log(_stringify(messages))

    logger.info('Updating', Locales.length, 'locales')
    const opts = {dateRef: new Date}
    Locales.forEach(({locale, rel}) => {
        update(locale, messages, opts)
    })

    logger.info('Done')
}

/**
 * Extract messages from source files.
 *
 * See: https://github.com/oliviertassinari/i18n-extract
 *
 * @param {array} File globs
 * @param {object} Options for i18n-extract
 * @return {array} Extracted message objects
 */
function extract (globs, opts) {
    logger.info('Extracting messages')
    return _withDir(BaseDir, () =>
        Extract.extractFromFiles(globs, opts)
    )
}

/**
 * Update a locale po file with new messages.
 *
 * @param {string} The locale name
 * @param {array} The extracted messages
 * @param {object} (optional) The options
 */
function update (locale, messages, opts) {

    opts = opts || {}

    const {dateRef = new Date} = opts
    const method = opts.replace ? 'replace' : 'patch'

    const {file, rel} = LocalesMap[locale]
    const po = parser.parse(_readFile(file))
    const collated = _collateExtracted(messages)

    const {track, counts, pos} = _poUpdateResult(po, collated, opts)

    Object.keys(track.removed).forEach(key => {
        if (key) {
            logger.info('  removed', key)
        }
    })

    if (counts.removed) {
        logger.info(counts.removed, 'translations removed, making backup.')
        backup(locale, dateRef)
    }

    logger.info('Writing', rel)
    const content = parser.compile(pos[method]).toString('utf-8')
    fs.writeFileSync(file, content)

    logger.info('Totals -----')
    logger.info(Object.entries(counts).map(it => it.join(': ')).join(', '))
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

function _poUpdateResult (po, collated, opts) {

    opts = opts || {}

    const {
        context = '',
        keepComments = true,
        mergeComments = true,
    } = opts

    const track = {
        added   : {},
        found   : {},
        removed : {},
        changed : {},
    }

    const data = {
        patch   : {},
        replace : {},
    }

    const copy = () => ({...po, translations: {...po.translations}})
    const source = po.translations[context]

    collated.forEach(message => {

        const msgid = message.key
        const found = source[msgid]
        const tran = {msgid, msgstr: [''], ...found}
        const info = {message, tran}

        data.patch[msgid] = tran
        data.replace[msgid] = tran

        const newComments = _buildComments(message, opts)
        const comments = found && mergeComments
            ? _mergeComments(found.comments, newComments)
            : newComments

        if (found) {
            track.found[msgid] = info
        } else {
            track.added[msgid] = info
        }

        if (keepComments) {
            tran.comments = comments
            if (!_jsonEqual(newComments, comments)) {
                track.changed[msgid] = info
            }
        }
    })

    Object.values(source).forEach(tran => {
        const {msgid} = tran
        if (msgid && !track.added[msgid] && !track.found[msgid]) {
            track.removed[msgid] = {tran}
            data.patch[msgid] = tran
        }
    })

    const pos = Object.fromEntries(
        Object.entries(data).map(([type, trans]) => {
            const po = copy()
            po.translations[context] = trans
            return [type, po]
        })
    )

    const counts = Object.fromEntries(
        Object.entries(track).map(([name, value]) =>
            [name, Object.values(value).length]
        )
    )

    return {track, counts, pos}
}

function _mergeComments (present, updates) {
    present = present || {}
    updates = updates || {}
    const merged = {}

    const keys = [present, updates].map(Object.keys).flat()
    const keysHash = _arrayHash(keys)
    Object.keys(keysHash).forEach(key => {
        const combined = [present, updates].map(arr =>
            arr[key] ? arr[key].split('\n') : []
        ).flat()
        const linesHash = _arrayHash(combined)
        const lines = Object.keys(linesHash)
        if (key == 'reference') {
            lines.sort(_referenceSort)
        }
        merged[key] = lines.join('\n')
    })
    return merged
}

function _buildComments (message, opts) {
    opts = opts || {}
    let references
    if (opts.shortReferences) {
        references = message.shortReferences
    } else {
        references = message.references
    }
    if (!references) {
        references = []
    }
    return {
        reference: references.join('\n')
    }
}

function _collateExtracted (extracted) {
    const index = _indexExtracted(extracted)
    return Object.values(index).map(({key, locs}) => {
        const files = Object.keys(locs).sort(_fileSort)
        const filesLineNums = Object.fromEntries(
            files.map(file =>
                [file, Object.values(locs[file]).sort()]
            )
        )
        const references = files.map(file =>
            filesLineNums[file].map(line =>
                [file, line].join(':')
            )
        ).flat()
        const referencesShort = files.map(file =>
            _referenceShort(file, filesLineNums[file])
        )
        return {key, files, references, referencesShort}
    }).sort(_keySort)
}

function _indexExtracted (extracted) {
    const index = {}
    extracted.forEach(({key, file, loc}) => {
        const {line} = loc.start
        if (!index[key]) {
            index[key] = {key, locs: {}}
        }
        const {locs} = index[key]
        if (!locs[file]) {
            locs[file] = {}
        }
        locs[file][line] = line
    })
    return index
}

function _referenceShort (file, nums) {
    const numStrs = nums.slice(0).map(String)
    const lowFileLen = Math.ceil(0.25 * CommentMaxLen)
    let fileLen = CommentMaxLen - 5//Math.ceil(0.75 * CommentMaxLen)
    let fileStr
    while (true) {
        fileStr = _trunc(file, fileLen, true)
        if (numStrs.join(',').length + fileStr.length < CommentMaxLen) {
            break
        }
        if (fileLen < lowFileLen || numStrs.length > 1) {
            numStrs.pop()
            continue
        }
        fileLen -= 1
    }
    if (numStrs.length < nums.length) {
        numStrs.push('...')
    }
    return [fileStr, numStrs.join(',')].join(':')
}

function _trunc (str, len, start = false, dots = '...') {
    if (!str || str.length <= len) {
        return str
    }
    dots = String(dots || '')
    if (start) {
        return dots + str.substring(str.length - len)
    }
    return str.substring(0, len) + dots
}

function _fileSort (a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase())
}

function _keySort (a, b) {
    return a.key.toLowerCase().localeCompare(b.key.toLowerCase())
}

function _referenceSort (a, b) {
    const [afile, aline] = a.split(':')
    const [bfile, bline] = b.split(':')
    let cmp = _fileSort(afile, bfile)
    if (cmp) {
        return cmp
    }
    return parseInt(aline) - parseInt(bline) || 0
}

function _diffFiles (current, previous) {
    return Diffs.unified(...[previous, current].map(_readFile))
}

function _backupPath (locale, dateRef) {
    const fdstr = fileDateString(dateRef)
    const bname = [Filename, fdstr, Format].join('.')
    const rel = [locale, bname].join('/')
    const dest = resolve(BackupDir, rel)
    return {dest, rel}
}

function _readFile (file) {
    return fs.readFileSync(file, 'utf-8')
}

function _stringify (obj, indent = 2) {
    return JSON.stringify(obj, null, indent)
}

function _jsonEqual (a, b) {
    return JSON.stringify(a) == JSON.stringify(b)
}

function _arrayHash (...args) {
    return Object.fromEntries(
        args.map(Object.values).flat().map(value =>
            [value, true]
        )
    )
}

function _withDir (dir, cb) {
    const oldDir = process.cwd()
    let res
    try {
        res = cb()
    } finally {
        try {
            process.chdir(oldDir)
        } catch (err) {
            console.error(err)
        }
    }
    return res
}

if (require.main === module) {
    main()
}