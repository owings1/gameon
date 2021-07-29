const Diffs   = require('../test/util/diffs')
const Extract = require('i18n-extract')
const Logger = require('../src/lib/logger')
const {fileDateString} = require('../src/lib/util')

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')
const {resolve} = path

const {
    BaseDir,
    LocaleNames,
    LocalesDir,
} = require('../src/lib/constants')

const BackupDir = resolve(LocalesDir, 'backup')
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
    const opts = {marker: '__'}

    logger.info('Backup directory is', BackupDir)

    const messages = extract(globs, opts)

    logger.log(_stringify(messages))

    logger.info('Updating', Locales.length, 'locales')
    const dateRef = new Date
    Locales.forEach(({locale, rel}) => {
        const diff = update(locale, messages, dateRef)
        logger.info('Diff', diff)
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
 * Backup and update a locale po file with new messages.
 *
 * @param {string} The locale name
 * @param {array} The messages to merge
 * @param {Date} (optional) The date reference for the backup file
 * @return {object} Result object {diff}
 */
function update (locale, messages, dateRef) {
    const previous = backup(locale, dateRef)
    const current = replace(locale, messages)
    const diff = _diffFiles(current, previous)
    return {diff}
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

/**
 * Update a locale po file with new messages.
 *
 * @param {string} The locale name
 * @param {array} The messages to merge
 * @return {string} The po file
 */
function replace (locale, messages) {
    const {file, rel} = LocalesMap[locale]
    logger.info('Replacing', rel)
    Extract.mergeMessagesWithPO(messages, file, file)
    return file
}

/***************************************************/
/* Util methods                                    */
/***************************************************/

function _diffFiles (current, previous) {
    return Diffs.unified(...[previous, current].map(_readFile))
}

function _backupPath(locale, dateRef) {
    const fdstr = fileDateString(dateRef)
    const bname = [Filename, fdstr, Format].join('.')
    const rel = [locale, bname].join('/')
    const dest = resolve(BackupDir, rel)
    return {dest, rel}
}

function _readFile(file) {
    return fs.readFileSync(file, 'utf-8')
}

function _stringify(obj) {
    return JSON.stringify(obj, null, 2)
}

function _withDir(dir, cb) {
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