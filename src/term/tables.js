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
const Themes    = require('./themes')
const Util      = require('../lib/util')

const {TableChars} = Constants

function strlen(str) {
    if (str == null) {
        return 0
    }
    return Util.stripAnsi(str.toString()).length
}

function pad(str, align, width, chr = ' ') {
    if (align == 'right') {
        return Util.padStart(str, width, chr)
    }
    return Util.padEnd(str, width, chr)
}

function wrapDash(str) {
    return TableChars.dash + str + TableChars.dash
}

class Table {

    static defaults() {
        return {
            theme        : 'Default'
          , footerAlign  : 'left'
          , innerBorders : false
          , name         : 'Table'
          , footerLines  : null
        }
    }

    constructor(columns, data, opts) {
        this.opts = Util.defaults(Table.defaults(), opts)
        this.name = this.opts.name
        this.columns = columns
        this.data = data
        this.rows = null
        this.footerLines = this.opts.footerLines || null
        this.lines = []
        this.theme = Themes.getInstance(this.opts.theme)
    }

    build() {

        this.columns = Table.buildColumns(this.columns)
        this.rows = Table.buildRows(this.columns, this.data)

        this.calculateColumnWidths()
        this.calculateTableInnerWidth()

        this.buildHeaderStrings()
        this.buildRowStringParts()
        this.buildFooterInnerStrings()
        this.buildBorderStrings()

        this.buildFinalStrings()
        this.buildLines()

        this.outerWidth = strlen(this.lines[0])

        return this
    }

    buildHeaderStrings() {
        const ch = this.theme.table.head
        this.headerStrings = this.columns.map((column, i) =>
            pad(ch(column.title), column.align, column.width, ch(' '))
        )
    }

    buildRowStringParts() {
        const ch = this.theme.table
        this.rowStringParts = this.rows.map((row, i) => {
            const chn = i % 2 ? ch.even : ch.odd
            return this.columns.map((column, i) =>
                pad(chn(row[i]), column.align, column.width, chn(' '))
            )
        })
    }

    buildFooterInnerStrings() {
        const ch = this.theme.table.foot
        this.footerInnerStrings = (this.footerLines || []).map(footerLine =>
            pad(ch(footerLine), this.opts.footerAlign, this.innerWidth, ch(' '))
        )
    }

    buildBorderStrings() {
        const ch = this.theme.table.border
        const dashParts = this.columns.map(column =>
            pad('', 'left', column.width, TableChars.dash)
        )
        const dashesFootOnly = pad('', 'left', this.innerWidth, TableChars.dash)
        this.borderStrings = {
            top : ch([
                TableChars.topLeft
              , dashParts.join(wrapDash(TableChars.topMiddle))
              , TableChars.topRight
            ].join(TableChars.dash))
          , middle: ch([
                TableChars.middleLeft
              , dashParts.join(wrapDash(TableChars.middleMiddle))
              , TableChars.middleRight
            ].join(TableChars.dash))
          , prefoot: ch([
                TableChars.bottomLeft
              , dashParts.join(wrapDash(TableChars.bottomMiddle))
              , TableChars.bottomRight
            ].join(TableChars.dash))
          , postfoot: ch([
                TableChars.footerLeft
              , dashParts.join(wrapDash(TableChars.footerMiddle))
              , TableChars.footerRight
            ].join(TableChars.dash))
          , bottom: ch([
                TableChars.footerLeft
              , dashParts.join(wrapDash(TableChars.bottomMiddle))
              , TableChars.footerRight
            ].join(TableChars.dash))
          , topFootOnly : ch([
                TableChars.topLeft
              , dashesFootOnly
              , TableChars.topRight
            ].join(TableChars.dash))
          , bottomFootOnly : ch([
                TableChars.footerLeft
              , dashesFootOnly
              , TableChars.footerRight
            ].join(TableChars.dash))
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

    calculateTableInnerWidth() {
        // start with column inner widths
        this.innerWidth = Util.sumArray(this.columns.map(column => column.width))
        // add inner borders/padding
        this.innerWidth += Math.max(this.columns.length - 1, 0) * 3
        if (this.footerLines && this.footerLines.length) {
            // check if footers will fit
            const minFooterWidth = Math.max(...this.footerLines.map(strlen))
            if (minFooterWidth > this.innerWidth) {
                const deficit = minFooterWidth - this.innerWidth
                // adjust innerWidth
                this.innerWidth += deficit
                if (this.columns.length) {
                    // adjust width of last column
                    this.columns[this.columns.length - 1].width += deficit
                }
            }
        }
    }

    buildFinalStrings() {

        const ch = this.theme.table

        this.headerString = [
            ch.border(TableChars.pipe)
          , ch.head(' ')
          , this.headerStrings.join(ch.head(' ') + ch.border(TableChars.pipe) + ch.head(' '))
          , ch.head(' ')
          , ch.border(TableChars.pipe)
        ].join('')

        this.rowStrings = this.rowStringParts.map((parts, i) => {
            const chn = i % 2 ? ch.even : ch.odd
            return [
                ch.border(TableChars.pipe)
              , chn(' ')
              , parts.join(chn(' ') + ch.border(TableChars.pipe) + chn(' '))
              , chn(' ')
              , ch.border(TableChars.pipe)
            ].join('')
        })

        this.footerStrings = this.footerInnerStrings.map(innerStr =>
            [
                ch.border(TableChars.pipe)
              , ch.foot(' ')
              , innerStr
              , ch.foot(' ')
              , ch.border(TableChars.pipe)
            ].join('')
        )
    }

    buildLines() {
        if (this.columns.length) {
            this.buildLinesNormal()
        } else if (this.footerStrings.length) {
            // corner case of no columns
            this.buildLinesFooterOnly()
        } else {
            // corner case of no columns, no footerLines
            this.lines = []
        }
    }

    buildLinesNormal() {
        this.lines = [
            this.borderStrings.top
          , this.headerString
          , this.borderStrings.middle
        ]
        this.rowStrings.forEach((rowStr, i) => {
            if (this.opts.innerBorders && i > 0) {
                this.lines.push(this.borderStrings.middle)
            }
            this.lines.push(rowStr)
        })
        if (this.footerStrings.length) {
            this.lines.push(this.borderStrings.prefoot)
            this.footerStrings.forEach(footerStr => this.lines.push(footerStr))
            this.lines.push(this.borderStrings.postfoot)
        } else {
            this.lines.push(this.borderStrings.bottom)
        }
    }

    buildLinesFooterOnly() {
        this.lines = []
        this.lines.push(this.borderStrings.topFootOnly)
        this.footerStrings.forEach(footerStr => this.lines.push(footerStr))
        this.lines.push(this.borderStrings.bottomFootOnly)
    }

    toString() {
        return this.lines.join('\n')
    }

    static buildColumns(arr) {
        return arr.map(col => this.buildColumn(col))
    }

    static buildColumn(col) {
        var column = {}
        if (typeof(col) == 'object') {
            column = {...col}
        } else if (typeof(col) == 'string') {
            column.name = col
        }
        column = {
            align : 'left'
          , title : column.name
          , key   : column.name
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

    static buildRows(columns, data) {
        return data.map(info =>
            columns.map(column =>
                column.format(column.get(info), info)
            )
        )
    }
}

module.exports = {
    Table
}