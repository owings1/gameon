/**
 * gameon - Table helper classes
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
const {
    arrays  : {append, arraySum},
    objects : {valueHash},
    strings : {stringWidth},
    types   : {castToArray, isNumber, isObject, isRegex, isString},
    Screen,
} = require('utils-h')

const Themes = require('./themes.js')
// TODO: refactor to class and translate messages
const Questions  = require('./helpers/tables.questions.js')

const {inquirer} = require('./inquirer.js')
const IntlHelper = require('../lib/util/intl.js')
const {
    Chars,
    DefaultAnsiEnabled,
    DefaultThemeName,
} = require('../lib/constants.js')
const {
    createLogger,
    defaults,
    mapValues,
    nchars,
    pad,
} = require('../lib/util.js')
const {
    DuplicateColumnError,
    InvalidColumnError,
    InvalidRegexError,
} = require('../lib/errors.js')

const DefaultScreen = new Screen({isAnsi: DefaultAnsiEnabled})

class TableHelper {

    static defaults() {
        return {
            indent : 0,
            screen : DefaultScreen,
            theme  : DefaultThemeName,
            intl   : IntlHelper.getGlobalInstance(),
        }
    }

    constructor(opts) {
        this.opts = defaults(TableHelper.defaults(), opts)
        this.screen = this.opts.screen
        this.logger = createLogger(this, {oneout: true, stdout: this.screen.output})
        this.theme = Themes.getInstance(this.opts.theme)
        this.inquirer = inquirer.createPromptModule()
    }

    get intl() {
        return this.opts.intl
    }

    set intl(intl) {
        this.opts.intl = intl
    }

    get __() {
        return this.intl.__
    }

    // TODO: refactor Questions to class andtranslate messages
    async interactive(table) {

        if (!table.isBuilt) {
            table.build()
        }

        const originalOpts = {...table.opts}

        while (true) {

            this.printTable(table)

            const {input} = await this.prompt(Questions.interactive)

            if (input == 'quit') {
                break
            }

            switch (input) {

                case 'filterRegex':
                    const {regex} = await this.prompt(Questions.filterRegex)
                    if (!regex.length) {
                        break
                    }
                    table.opts.filterRegex = table.opts.filterRegex.slice(0)
                    table.opts.filterRegex.push(regex)
                    break

                case 'filterFixed':
                    const {fixed} = await this.prompt(Questions.filterFixed)
                    if (!fixed.length) {
                        break
                    }
                    table.opts.filterFixed = table.opts.filterFixed.slice(0)
                    table.opts.filterFixed.push(fixed)
                    break

                case 'sort':
                    if (!table.columns.find(it => it.sortable)) {
                        this.logger.warn('No sortable columns')
                        break
                    }
                    const {column, dir} = await this.prompt(Questions.sort(table))
                    table.opts.sortBy = [column.name, dir].join(table.opts.dirSeparator)
                    break

                case 'maxRows':
                    const {maxRows} = await this.prompt(Questions.maxRows(table))
                    if (!maxRows.length) {
                        break
                    }
                    table.opts.maxRows = +maxRows
                    break

                case 'columns':
                    const {columns} = await this.prompt(Questions.columns(table))
                    table.opts.columns = columns
                    break

                case 'restore':
                    table.opts = {...originalOpts}
                    break
            }

            table.build()
        }
    }

    printTable(table) {
        table.lines.forEach(line => this.println(line))
    }

    println(line) {
        const {output} = this
        output.write(''.padEnd(this.opts.indent, ' '))
        output.write(line)
        output.write('\n')
    }

    prompt(questions) {
        const opts = {
            theme: this.theme
        }
        this.prompter = this.inquirer.prompt(castToArray(questions), null, opts)
        return this.prompter
    }

    get output() {
        return this.screen.output
    }

    set output(strm) {
        this.screen.output = strm
        this.logger.stdout = strm
    }
}

class Table {

    static defaults() {
        return {
            theme        : DefaultThemeName,
            name         : 'Table',
            columns      : null,
            title        : null,
            titleAlign   : 'left',
            footerLines  : null,
            footerAlign  : 'left',
            innerBorders : false,
            sortBy       : null,
            maxRows      : -1,
            filterRegex  : null,
            filterFixed  : null,
            arrSeparator : ',',
            dirSeparator : ':',
            oddEven      : true,
        }
    }

    constructor(columns, data, opts) {

        this.columns = columns
        this.data = data
        this.opts = defaults(Table.defaults(), opts)

        this.isBuilt = false

        this.preBuild()
    }

    build() {

        this.preBuild()

        this.buildColumns()
        this.buildOpts()

        this.sortData()
        this.buildRows()

        this.calculatePre()

        this.buildParts()
        this.buildStrings()
        this.buildLines()

        this.calculatePost()

        this.isBuilt = true

        return this
    }

    preBuild() {

        this.name = this.opts.name
        this.title = this.opts.title || ''

        this.rows    = null
        this.parts   = null
        this.strings = null

        this.theme   = Themes.getInstance(this.opts.theme)
        this.chars   = Chars.table
        this.chlk    = this.theme.table

        this.opts.footerLines = castToArray(this.opts.footerLines)
        this.opts.filterRegex = castToArray(this.opts.filterRegex)
        this.opts.filterFixed = castToArray(this.opts.filterFixed)

        this.lines = []

        this.footerLines = this.opts.footerLines.slice(0)

        return this
    }

    buildOpts() {
        this.sortBys = this.makeSortBys()
        this.filter = this.makeFilter()
        this.showColumns = this.makeShowColumns()
        return this
    }

    buildColumns() {
        const nameMap = {}
        const columns = []
        this.columns.map(Table.makeColumn).forEach(column => {
            if (nameMap[column.name]) {
                throw new DuplicateColumnError(`Duplicate column name: ${column.name}`)
            }
            for (const opt of ['dirSeparator', 'arrSeparator']) {
                const chr = this.opts[opt]
                if (column.name.indexOf(chr) > -1) {
                    const msg = [
                        'Column name cannot contain',
                        opt,
                        '(' + chr + '):',
                        column.name,
                    ].join(' ')
                    throw new InvalidColumnError(msg)
                }
            }
            columns.push(column)
            nameMap[column.name] = true
        })
        this.columns = columns
        return this
    }

    sortData() {
        const {sortBys} = this
        if (!sortBys.length) {
            return this
        }
        const sortHash = JSON.stringify(
            sortBys.map(({column, mult}) => [column.name, mult])
        )
        if (this.lastSortHash == sortHash) {
            return this
        }
        this.data.sort((a, b) => {
            for (const {column, mult} of sortBys) {
                const aval = column.get(a, this)
                const bval = column.get(b, this)
                let cmp = column.sorter(aval, bval)
                if (cmp) {
                    return cmp * mult
                }
            }
            return 0
        })
        this.lastSortHash = sortHash
        return this
    }

    buildRows() {
        const {filter} = this
        this.rows = this.data.filter(filter).map(info =>
            this.showColumns.map(column =>
                column.format(column.get(info, this), info, this)
            )
        )
        return this
    }

    calculatePre() {
        this.calculateColumnWidths()
        this.calculateInnerWidth()
        return this
    }

    buildParts() {
        this.parts = {
            title  : this.makePartsTitle(),
            head   : this.makePartsHead(),
            rows   : this.makePartsRows(),
            foot   : this.makePartsFoot(),
            border : this.makePartsBorder(),
        }
        return this
    }

    buildStrings() {
        this.strings = this.makeStrings()
        return this
    }

    buildLines() {
        if (this.showColumns.length) {
            this.lines = this.makeLinesNormal()
        } else if (this.strings.foot.length || this.strings.title.length) {
            // corner case of no columns
            this.lines = this.makeLinesExtraOnly()
        } else {
            // corner case of no columns, no footer, no title
            this.lines = []
        }
        return this
    }

    calculatePost() {
        this.outerWidth = stringWidth(this.lines[0])
        return this
    }

    makeSortBys() {
        let sortByOpts = []
        if (isString(this.opts.sortBy)) {
            sortByOpts = this.opts.sortBy.split(this.opts.arrSeparator)
        } else if (Array.isArray(this.opts.sortBy)) {
            sortByOpts = this.opts.sortBy.slice(0)
        }
        const sortBys = []
        sortByOpts.forEach(opt => {
            let [name, dir] = opt.split(this.opts.dirSeparator)
            let column = this.columns.find(it => it.name === name && it.sortable)
            if (!column) {
                column = this.columns.find(it => it.name.trim() === name.trim() && it.sortable)
            }
            if (!column) {
                throw new InvalidColumnError('Invalid sort column: ' + name)
            }
            if (!dir) {
                dir = column.defaultDir
            }
            const mult = dir === 'desc' ? -1 : 1
            sortBys.push({column, mult})
        })
        return sortBys
    }

    makeFilter() {
        const filterRegexes = this.makeFilterRegexes()
        const filterColumns = this.columns.filter(it => it.isFilter)
        return (info, i) => {
            if (this.opts.maxRows > -1 && i >= this.opts.maxRows) {
                return false
            }
            if (!filterRegexes.length) {
                return true
            }
            if (!filterColumns.length) {
                return true
            }
            const values = filterColumns.map(it => it.get(info, this)).filter(it => it != null)
            // for each regex, some column should match it
            for (const regex of filterRegexes) {
                let isFound = false
                for (const value of values) {
                    if (regex.test(value)) {
                        isFound = true
                        break
                    }
                }
                if (!isFound) {
                    return false
                }
            }
            return true
        }
    }

    makeFilterRegexes() {
        const {opts} = this
        const filterRegexes = []
        if (opts.filterRegex) {
            castToArray(opts.filterRegex).forEach(value => {
                if (isString(value)) {
                    if (value[0] == '/') {
                        var [str, flags] = value.substring(1).split('/')
                        if (!flags.length) {
                            flags = undefined
                        }
                    } else {
                        var str = value
                        var flags = undefined
                    }
                    try {
                        value = new RegExp(str, flags)
                    } catch (err) {
                        throw new InvalidRegexError(err.message, err)
                    }
                }
                if (!isRegex(value)) {
                    throw new InvalidRegexError('Filter regex must be a RegExp or valid regex string')
                }
                filterRegexes.push(value)
            })
        }
        if (opts.filterFixed) {
            castToArray(opts.filterFixed).forEach(value => {
                filterRegexes.push(new RegExp(value.toString(), 'i'))
            })
        }
        return filterRegexes
    }

    makeShowColumns() {
        if (this.opts.columns == null) {
            return this.columns
        }
        const nameMap = valueHash(this.columns.map(it => it.name), null)
        const showNames = []
        let columnOpts = []
        if (Array.isArray(this.opts.columns)) {
            columnOpts = this.opts.columns.slice(0)
        } else if (typeof this.opts.columns == 'string') {
            columnOpts = this.opts.columns.split(this.opts.arrSeparator)
        }
        columnOpts.forEach(name => {
            if (!nameMap[name]) {
                throw new InvalidColumnError('Unknown column: ' + name)
            }
            showNames[name] = true
        })
        return this.columns.filter(it => showNames[it.name])
    }

    makePartsTitle() {
        const {chlk, title, innerWidth} = this
        const {titleAlign} = this.opts
        if (!title) {
            return ''
        }
        return pad(chlk.title(title), titleAlign, innerWidth, chlk.title(' '))
    }

    makePartsHead() {
        const {chlk} = this
        return this.showColumns.map((column, i) =>
            pad(chlk.head(column.title), column.align, column.width, chlk.head(' '))
        )
    }

    makePartsRows() {
        const {chlk} = this
        const chlkn = i => [chlk.row.odd, chlk.row.even][(i % 2) * +!!this.opts.oddEven]
        return this.rows.map((row, i) =>
            this.showColumns.map((column, j) =>
                pad(chlkn(i)(row[j]), column.align, column.width, chlkn(i)(' '))
            )
        )
    }

    makePartsFoot() {
        const {chlk, innerWidth} = this
        return this.footerLines.map(line =>
            pad(chlk.foot(line), this.opts.footerAlign, innerWidth, chlk.foot(' '))
        )
    }

    makePartsBorder() {

        const {top, mid, bot, foot, dash} = this.chars

        const ndashes = n => nchars(n, dash)

        const dashParts = this.showColumns.map(column => ndashes(column.width))
        const dashLine = ndashes(this.innerWidth)

        const jp = chr => dashParts.join(dash + chr + dash)

        return {
            top          : [top.left  , jp(top.mid)  , top.right  ],
            mid          : [mid.left  , jp(mid.mid)  , mid.right  ],
            bot          : [foot.left , jp(bot.mid)  , foot.right ],
            pretitle     : [top.left  , dashLine     , top.right  ],
            posttitle    : [mid.left  , jp(top.mid)  , mid.right  ],
            prefoot      : [bot.left  , jp(bot.mid)  , bot.right  ],
            postfoot     : [foot.left , jp(foot.mid) , foot.right ],
            footOnlyTop  : [top.left  , dashLine     , top.right  ],
            footOnlyBot  : [foot.left , dashLine     , foot.right ],
            extraOnlyMid : [mid.left  , dashLine     , mid.right  ],
        }
    }

    calculateColumnWidths() {
        this.showColumns.forEach((column, i) => {
            column.width = Math.max(
                stringWidth(column.title),
                ...this.rows.map(row => stringWidth(row[i])),
            )
        })
    }

    calculateInnerWidth() {
        const {showColumns, footerLines, title} = this
        // start with column inner widths
        this.innerWidth = arraySum(showColumns.map(column => column.width))
        // add inner borders/padding
        this.innerWidth += Math.max(showColumns.length - 1, 0) * 3
        if (!footerLines.length && !title.length) {
            return
        }
        // check if footers/title will fit
        const extrasWidth = Math.max(...footerLines.map(stringWidth), stringWidth(title))
        const deficit = extrasWidth - this.innerWidth
        if (deficit <= 0) {
            return
        }
        // adjust innerWidth
        this.innerWidth += deficit
        if (showColumns.length) {
            // adjust width of last column
            showColumns[showColumns.length - 1].width += deficit
        }
    }

    makeStrings() {

        const {chlk, chars, parts} = this
        const pipe = chlk.border(chars.pipe)
        const space = {
            f : chlk.foot(' '),
            h : chlk.head(' '),
            t : chlk.title(' '),
            n : i => [chlk.row.odd, chlk.row.even][(i % 2) * +!!this.opts.oddEven](' '),
        }
        // join parts (p) with pipe wrapped with space (s)
        const jps = (p, s) => p.join(s + pipe + s)

        return {
            title : parts.title ? [pipe, parts.title, pipe].join(space.t) : '',
            head  : [pipe, jps(parts.head, space.h), pipe].join(space.h),
            rows  : parts.rows.map((p, i) =>
                [pipe, jps(p, space.n(i)), pipe].join(space.n(i))
            ),
            foot : parts.foot.map(innerStr =>
                [pipe, innerStr, pipe].join(space.f)
            ),
            border : mapValues(parts.border, p =>
                chlk.border(p.join(chars.dash))
            ),
        }
    }

    makeLinesNormal() {
        const {strings, opts} = this
        const lines = []

        if (strings.title.length) {
            append(lines, [
                strings.border.pretitle,
                strings.title,
                strings.border.posttitle,
            ])
        } else {
            lines.push(strings.border.top)
        }
        append(lines, [
            strings.head,
            strings.border.mid,
        ])
        strings.rows.forEach((str, i) => {
            if (opts.innerBorders && i > 0) {
                lines.push(strings.border.mid)
            }
            lines.push(str)
        })
        if (strings.foot.length) {
            lines.push(strings.border.prefoot)
            append(lines, strings.foot)
            lines.push(strings.border.postfoot)
        } else {
            lines.push(strings.border.bot)
        }
        return lines
    }

    makeLinesExtraOnly() {
        const {strings, title} = this
        const lines = []
        if (strings.title.length) {
            append(lines, [
                strings.border.pretitle,
                strings.title,
            ])
            if (strings.foot.length) {
                lines.push(strings.border.extraOnlyMid)
            }
        } else {
            lines.push(strings.border.footOnlyTop)
        }
        if (strings.foot.length) {
            append(lines, strings.foot)
        }
        lines.push(strings.border.footOnlyBot)
        return lines
    }

    toString() {
        return this.lines.join('\n')
    }

    static makeColumn(col) {
        let column
        if (isObject(col)) {
            column = {...col}
        } else if (isString(col)) {
            column = {name: col}
        } else {
            throw new InvalidColumnError('Column def must be object or string')
        }
        column = {
            align       : 'left',
            title       : column.name,
            key         : column.name,
            type        : 'auto',
            isFilter    : true,
            sortable    : true,
            defaultDir : 'asc',
            ...column,
        }
        if (!column.name) {
            throw new InvalidColumnError('Column must have a name')
        }
        if (!column.get) {
            column.get = info => info[column.key]
        }
        if (!column.format) {
            column.format = (value, info) => {
                if (value == null) {
                    return ''
                }
                return value.toString()
            }
        }
        if (column.title == null || column.title === false) {
            column.title = ''
        }
        if (!column.sorter) {
            column.sorter = (aval, bval) => {
                if (aval == null) {
                    if (bval == null) {
                        return 0
                    }
                    return -1
                }
                if (bval == null) {
                    return 1
                }
                const isNum = (
                    column.type === 'number' ||
                    (column.type === 'auto' && isNumber(aval))
                )
                if (isNum) {
                    return aval - bval
                }
                return aval.toString().localeCompare(bval.toString())
            }
        }
        return column
    }
}

module.exports = {
    Table,
    TableHelper,
}