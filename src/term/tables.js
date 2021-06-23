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
const Constants = require('../lib/constants')
const Logger    = require('../lib/logger')
const Themes    = require('./themes')
const Util      = require('../lib/util')

const inquirer = require('inquirer')

const {
    Chars
  , DefaultTermEnabled
  , DefaultThemeName
} = Constants

const {
    append
  , castToArray
  , mapValues
  , nchars
  , pad
  , strlen
  , sumArray
} = Util

const Questions = {
    interactive: {
        name    : 'input'
      , type    : 'expand'
      , message : 'Option'
      , choices : [
            {
                key   : 'f'
              , name  : 'Filter string'
              , value : 'filterFixed'
            }
          , {
                key   : 'x'
              , name  : 'Filter regex'
              , value : 'filterRegex'
            }
          , {
                key   : 's'
              , name  : 'Sort'
              , value : 'sort'
            }
          , {
                key   : 'n'
              , name  : 'Show only n rows'
              , value : 'top'
            }
          , {
                key   : 'r'
              , name  : 'Restore table'
              , value : 'restore'
            }
          , {
                key   : 'q'
              , name  : 'Quit'
              , value : 'quit'
            }
        ]
    }
}

class TableHelper {

    static defaults() {
        return {
            indent : 0
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(TableHelper.defaults(), opts)
        this.logger = new Logger
    }

    async interactive(table) {

        const allData = table.data.slice(0)

        while (true) {

            this.printTable(table)

            var {input} = await this.prompt(Questions.interactive)

            if (input == 'quit') {
                break
            }

            switch (input) {

                case 'filterRegex':
                    var regex = await this.promptFilterRegex()
                    if (regex === false) {
                        break
                    }
                    table.data = table.data.filter(info =>
                        table.columns.filter(it => it.isFilter).find(column => {
                            const value = column.get(info)
                            if (value == null) {
                                return false
                            }
                            return regex.test(value.toString())
                        })
                    )
                    table.rebuildData()
                    break

                case 'filterFixed':
                    var fixed = await this.promptFilterFixed()
                    if (fixed === false) {
                        break
                    }
                    table.data = table.data.filter(info =>
                        table.columns.filter(it => it.isFilter).find(column => {
                            const value = column.get(info)
                            if (value == null) {
                                return false
                            }
                            return value.toString().toLowerCase().indexOf(fixed) > -1
                        })
                    )
                    table.rebuildData()
                    break

                case 'sort':
                    var {column, mult} = await this.promptSort(table)
                    table.data.sort((a, b) => {
                        const aval = column.get(a)
                        const bval = column.get(b)
                        if (aval == null) {
                            if (bval == null) {
                                return 0
                            }
                            return mult
                        }
                        if (bval == null) {
                            return -1 * mult
                        }
                        if (typeof aval == 'number') {
                            return (aval - bval) * mult
                        }
                        return aval.toString().localeCompare(bval.toString()) * mult
                    })
                    table.rebuildData()
                    break

                case 'top':
                    var top = await this.promptTopRows()
                    if (top === false) {
                        break
                    }
                    table.data = table.data.filter((info, i) => i < top)
                    table.rebuildData()
                    break

                case 'restore':
                    table.data = allData.slice(0)
                    table.rebuildData()
                    break
            }
        }
    }

    async promptFilterRegex() {
        const {regex} = await this.prompt({
            name     : 'regex'
          , type     : 'input'
          , message  : 'Regex'
          , validate : value => !value.length || Util.errMessage(() => new RegExp(value)) 
        })
        if (!regex.length) {
            return false
        }
        return new RegExp(regex, 'i')
    }

    async promptFilterFixed() {
        const {fixed} = await this.prompt({
            name     : 'fixed'
          , type     : 'input'
          , message  : 'String'
        })
        if (!fixed.length) {
            return false
        }
        return fixed
    }

    async promptSort(table) {
        return await this.prompt([
            {
                name    : 'column'
              , message : 'Column'
              , type    : 'list'
              , choices : table.columns.map(it => {
                    return {name: it.name, value: it}
                })
            }
          , {
                name    : 'mult'
              , message : 'Direction'
              , type    : 'list'
              , choices : [
                  {name: 'asc', value: 1},
                  {name: 'desc', value: -1}
              ]
            }
        ])
    }

    async promptTopRows() {
        const {top} = await this.prompt({
            name     : 'top'
          , type     : 'input'
          , message  : 'Number of rows'
          , validate : value => !value.length || !isNaN(+value) || 'Invalid number'
        })
        if (!top.length) {
            return false
        }
        if (top < 0) {
            return Infinity
        }
        return +top
    }

    printTable(table) {
        table.lines.forEach(line => this.println(line))
    }

    println(line) {
        const {logger} = this
        logger.writeStdout(''.padEnd(this.opts.indent, ' '))
        logger.writeStdout(line)
        logger.writeStdout('\n')
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(castToArray(questions))
        return this._prompt
    }

}

class Table {

    static defaults() {
        return {
            theme        : DefaultThemeName
          , name         : 'Table'
          , title        : null
          , titleAlign   : 'left'
          , footerLines  : null
          , footerAlign  : 'left'
          , innerBorders : false
        }
    }

    constructor(columns, data, opts) {

        this.opts = Util.defaults(Table.defaults(), opts)
        this.columns = columns
        this.data = data

        this.name = this.opts.name
        this.footerLines = castToArray(this.opts.footerLines)
        this.title = this.opts.title || ''

        this.theme = Themes.getInstance(this.opts.theme)
        this.chlk  = this.theme.table
        this.chars = Chars.table

        this.rows    = null
        this.parts   = null
        this.strings = null
        this.lines   = []
    }

    build() {

        this.buildColumns()
        this.buildRows()

        this.calculatePre()

        this.buildParts()
        this.buildStrings()
        this.buildLines()

        this.calculatePost()

        return this
    }

    rebuildData() {
        this.buildRows()
        this.parts.rows = this.makePartsRows()
        this.buildStrings()
        this.buildLines()
        return this
    }

    buildColumns() {
        this.columns = this.columns.map(Table.makeColumn)
    }

    buildRows() {
        this.rows = this.data.map(info =>
            this.columns.map(column =>
                column.format(column.get(info), info)
            )
        )
    }

    calculatePre() {
        this.calculateColumnWidths()
        this.calculateInnerWidth()
    }

    buildParts() {
        this.parts = {
            title  : this.makePartsTitle()
          , head   : this.makePartsHead()
          , rows   : this.makePartsRows()
          , foot   : this.makePartsFoot()
          , border : this.makePartsBorder()
        }
    }

    buildStrings() {
        this.strings = this.makeStrings()
    }

    buildLines() {
        if (this.columns.length) {
            this.lines = this.makeLinesNormal()
        } else if (this.strings.foot.length || this.strings.title.length) {
            // corner case of no columns
            this.lines = this.makeLinesExtraOnly()
        } else {
            // corner case of no columns, no footer, no title
            this.lines = []
        }
    }

    calculatePost() {
        this.outerWidth = strlen(this.lines[0])
    }

    makePartsTitle() {
        const {chlk} = this
        if (!this.title) {
            return ''
        }
        return pad(chlk.title(this.title), this.opts.titleAlign, this.innerWidth, chlk.title(' '))
    }

    makePartsHead() {
        const {chlk} = this
        return this.columns.map((column, i) =>
            pad(chlk.head(column.title), column.align, column.width, chlk.head(' '))
        )
    }

    makePartsRows() {
        const {chlk} = this
        const chlkn = i => [chlk.odd, chlk.even][i % 2]
        return this.rows.map((row, i) =>
            this.columns.map((column, j) =>
                pad(chlkn(i)(row[j]), column.align, column.width, chlkn(i)(' '))
            )
        )
    }

    makePartsFoot() {
        const {chlk} = this
        return this.footerLines.map(line =>
            pad(chlk.foot(line), this.opts.footerAlign, this.innerWidth, chlk.foot(' '))
        )
    }

    makePartsBorder() {

        const {top, mid, bot, foot, dash} = this.chars

        const ndashes = n => nchars(n, dash)

        const dashParts = this.columns.map(column => ndashes(column.width))
        const dashLine = ndashes(this.innerWidth)

        const jp = chr => dashParts.join(dash + chr + dash)

        return {
            top          : [top.left  , jp(top.mid)  , top.right  ]
          , mid          : [mid.left  , jp(mid.mid)  , mid.right  ]
          , bot          : [foot.left , jp(bot.mid)  , foot.right ]
          , pretitle     : [top.left  , dashLine     , top.right  ]
          , posttitle    : [mid.left  , jp(top.mid)  , mid.right  ]
          , prefoot      : [bot.left  , jp(bot.mid)  , bot.right  ]
          , postfoot     : [foot.left , jp(foot.mid) , foot.right ]
          , footOnlyTop  : [top.left  , dashLine     , top.right  ]
          , footOnlyBot  : [foot.left , dashLine     , foot.right ]
          , extraOnlyMid : [mid.left  , dashLine     , mid.right  ]
        }
    }

    calculateColumnWidths() {
        this.columns.forEach((column, i) => {
            column.width = Math.max(
                strlen(column.title)
              , ...this.rows.map(row => strlen(row[i]))
            )
        })
    }

    calculateInnerWidth() {
        const {columns, footerLines, title} = this
        // start with column inner widths
        this.innerWidth = sumArray(columns.map(column => column.width))
        // add inner borders/padding
        this.innerWidth += Math.max(columns.length - 1, 0) * 3
        if (!footerLines.length && !title.length) {
            return
        }
        // check if footers/title will fit
        const otherWidth = Math.max(...footerLines.map(strlen), strlen(title))
        const deficit = otherWidth - this.innerWidth
        if (deficit <= 0) {
            return
        }
        // adjust innerWidth
        this.innerWidth += deficit
        if (columns.length) {
            // adjust width of last column
            columns[columns.length - 1].width += deficit
        }
    }

    makeStrings() {

        const {chlk, chars, parts} = this
        const pipe = chlk.border(chars.pipe)
        const space = {
            f : chlk.foot(' ')
          , h : chlk.head(' ')
          , t : chlk.title(' ')
          , n : i => [chlk.odd, chlk.even][i % 2](' ')
        }
        // join parts (p) with pipe wrapped with space (s)
        const jps = (p, s) => p.join(s + pipe + s)

        return {
            title : parts.title ? [pipe, parts.title, pipe].join(space.t) : ''
          , head  : [pipe, jps(parts.head, space.h), pipe].join(space.h)
          , rows  : parts.rows.map((p, i) =>
                [pipe, jps(p, space.n(i)), pipe].join(space.n(i))
            )
          , foot : parts.foot.map(innerStr =>
                [pipe, innerStr, pipe].join(space.f)
            )
          , border : mapValues(parts.border, p =>
                chlk.border(p.join(chars.dash))
            )
        }
    }

    makeLinesNormal() {
        const {strings, opts} = this
        const lines = []

        if (strings.title.length) {
            append(lines, [
                strings.border.pretitle
              , strings.title
              , strings.border.posttitle
            ])
        } else {
            lines.push(strings.border.top)
        }
        append(lines, [
            strings.head
          , strings.border.mid
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
                strings.border.pretitle
              , strings.title
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
        var column = {}
        if (typeof(col) == 'object') {
            column = {...col}
        } else if (typeof(col) == 'string') {
            column.name = col
        }
        column = {
            align    : 'left'
          , title    : column.name
          , key      : column.name
          , isFilter : true
          , ...column
        }
        if (!column.get) {
            column.get = info => info[column.key]
        }
        if (!column.format) {
            column.format = (value, info) => '' + value
        }
        return column
    }
}

module.exports = {
    Table
  , TableHelper
}