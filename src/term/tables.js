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

const {
    StringBuilder
  , stripAnsi
  , padEnd
  , padStart
} = Util

const {TableChars} = Constants

function pad(str, align, width, chr = ' ') {
    if (align == 'right') {
        return padStart(str, width, chr)
    }
    return padEnd(str, width, chr)
}

class Table {

    static defaults() {
        return {
            borderColor : 'grey'
        }
    }

    constructor(columns, data, opts) {
        this.opts = Util.defaults(Table.defaults(), opts)
        this.columns = columns
        this.data = data
        this.rows = null
    }

    build() {

        this.columns = Table.buildColumns(this.columns)
        this.rows = Table.buildRows(this.columns, this.data)

        this.calculateColumnWidths()
        this.buildHeaderStrings()
        this.buildRowStringParts()
        this.buildBorderStrings()
        this.buildFinalStrings()
        this.buildLines()

        return this.lines.join('\n')
    }

    buildHeaderStrings() {
        this.headerStrings = this.columns.map((column, i) =>
            pad(column.title, column.align, column.width)
        )
    }

    buildRowStringParts() {
        this.rowStringParts = this.rows.map(row =>
            this.columns.map((column, i) =>
                pad(row[i], column.align, column.width)
            )
        )
    }

    buildBorderStrings() {
        const bch = chalk[this.opts.borderColor]
        this.borderStrings = {
            top : bch([
                TableChars.topLeft
              , this.columns.map(column =>
                    pad('', 'right', column.width, TableChars.dash)
                ).join(
                    TableChars.dash + TableChars.topMiddle + TableChars.dash
                )
              , TableChars.topRight
            ].join(TableChars.dash))
          , middle: bch([
                TableChars.middleLeft
              , this.columns.map(column =>
                    pad('', 'left', column.width, TableChars.dash)
                ).join(
                    TableChars.dash + TableChars.middleMiddle + TableChars.dash
                )
              , TableChars.middleRight
            ].join(TableChars.dash))
          , bottom: bch([
                TableChars.footerLeft
              , this.columns.map(column =>
                    pad('', 'left', column.width, TableChars.dash)
                ).join(
                    TableChars.dash + TableChars.bottomMiddle + TableChars.dash
                )
              , TableChars.footerRight
            ].join(TableChars.dash))
        }
    }

    calculateColumnWidths() {
        this.columns.forEach((column, i) => {
            column.width = Math.max(
                stripAnsi(column.title).length
              , ...this.rows.map(row => {
                    const value = row[i]
                    if (value == null) {
                        return 0
                    }
                    const len = stripAnsi(value.toString()).length
                    if (isNaN(len)) {
                        return 0
                    }
                    return len
                })
            )
        })
    }

    buildFinalStrings() {

        const bch = chalk[this.opts.borderColor]

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
    }

    buildLines() {
        this.lines = [
            this.borderStrings.top
          , this.headerString
          , this.borderStrings.middle
        ]
        this.rowStrings.forEach(rowStr => this.lines.push(rowStr))
        this.lines.push(this.borderStrings.bottom)
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
            align  : 'left'
          , title  : column.name
          , key    : column.name
          , format : (value, info) => '' + value
          , ...column
        }
        if (!column.get) {
            column.get = info => info[column.key]
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