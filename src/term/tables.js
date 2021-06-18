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
const Util      = require('../lib/util')

const chalk = require('chalk')

const {StringBuilder} = Util

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

class Table {

    static defaults() {
        return {
            colorBorder  : 'grey'
          , colorHead    : 'white'
          , colorEven    : 'white'
          , colorOdd     : 'white'
          , footerAlign  : 'left'
          , innerBorders : false
          , name         : 'Table'
          , footerLines  : null
        }
    }

    constructor(columns, data, opts) {
        this.opts = Util.defaults(Table.defaults(), opts)
        Table.validateOpts(this.opts)
        this.name = this.opts.name
        this.columns = columns
        this.data = data
        this.rows = null
        this.footerLines = this.opts.footerLines || null
        this.lines = []
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
        const ch = chalk[this.opts.colorHead]
        this.headerStrings = this.columns.map((column, i) =>
            pad(ch(column.title), column.align, column.width)
        )
    }

    buildRowStringParts() {
        const chodd = chalk[this.opts.colorOdd]
        const cheven = chalk[this.opts.colorEven]
        this.rowStringParts = this.rows.map((row, i) => {
            const ch = i % 2 ? cheven : chodd
            return this.columns.map((column, i) =>
                pad(ch(row[i]), column.align, column.width)
            )
        })
    }

    buildFooterInnerStrings() {
        this.footerInnerStrings = (this.footerLines || []).map(footerLine =>
            pad(footerLine, this.opts.footerAlign, this.innerWidth)
        )
    }

    buildBorderStrings() {
        const bch = chalk[this.opts.colorBorder]
        const dashParts = this.columns.map(column =>
            pad('', 'left', column.width, TableChars.dash)
        )
        const dashesFootOnly = pad('', 'left', this.innerWidth, TableChars.dash)
        this.borderStrings = {
            top : bch([
                TableChars.topLeft
              , dashParts.join(
                    TableChars.dash + TableChars.topMiddle + TableChars.dash
                )
              , TableChars.topRight
            ].join(TableChars.dash))
          , middle: bch([
                TableChars.middleLeft
              , dashParts.join(
                    TableChars.dash + TableChars.middleMiddle + TableChars.dash
                )
              , TableChars.middleRight
            ].join(TableChars.dash))
          , prefoot: bch([
                TableChars.bottomLeft
              , dashParts.join(
                    TableChars.dash + TableChars.bottomMiddle + TableChars.dash
                )
              , TableChars.bottomRight
            ].join(TableChars.dash))
          , postfoot: bch([
                TableChars.footerLeft
              , dashParts.join(
                    TableChars.dash + TableChars.footerMiddle + TableChars.dash
                )
              , TableChars.footerRight
            ].join(TableChars.dash))
          , bottom: bch([
                TableChars.footerLeft
              , dashParts.join(
                    TableChars.dash + TableChars.bottomMiddle + TableChars.dash
                )
              , TableChars.footerRight
            ].join(TableChars.dash))
          , topFootOnly : bch([
                TableChars.topLeft
              , dashesFootOnly
              , TableChars.topRight
            ].join(TableChars.dash))
          , bottomFootOnly : bch([
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

        const bch = chalk[this.opts.colorBorder]

        this.headerString = [
            bch(TableChars.pipe)
          , ' '
          , this.headerStrings.join(' ' + bch(TableChars.pipe) + ' ')
          , ' '
          , bch(TableChars.pipe)
        ].join('')

        this.rowStrings = this.rowStringParts.map(parts =>
            [
                bch(TableChars.pipe)
              , ' '
              , parts.join(' ' + bch(TableChars.pipe) + ' ')
              , ' '
              , bch(TableChars.pipe)
            ].join('')
        )

        this.footerStrings = this.footerInnerStrings.map(innerStr =>
            [
                bch(TableChars.pipe)
              , ' '
              , innerStr
              , ' '
              , bch(TableChars.pipe)
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

    static validateOpts(opts) {
        for (var opt of ['colorHead', 'colorOdd', 'colorEven']) {
            try {
                chalk[opts[opt]]('')
            } catch (err) {
                if (err.name == 'TypeError' && err.message.indexOf('not a function')) {
                    throw new Error("Unsupported chalk color '" + opts[opt] + "' for option " + opt)
                }
                throw err
            }
        }
    }
}

module.exports = {
    Table
}