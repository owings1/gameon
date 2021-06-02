/**
 * gameon - Robot Pofiling Helper class
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
const Coordinator = require('../lib/coordinator')
const Core        = require('../lib/core')
const Logger      = require('../lib/logger')
const Robot       = require('./player')
const Util        = require('../lib/util')

const chalk = require('chalk')
const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {intRange, Timer} = Util
const {resolve} = path

const {Match, Colors, Profiler} = Core
const {White, Red} = Colors

const {RobotDelegator} = Robot

const TableChars = {
    topLeft      : '\u250f'
  , topMiddle    : '\u2533'
  , topRight     : '\u2513'
  , middleLeft   : '\u2523'
  , middleMiddle : '\u254b'
  , middleRight  : '\u252b'
  , bottomLeft   : '\u2523'//'\u2517'
  , bottomMiddle : '\u253b'
  , bottomRight  : '\u252b'//'\u251b'
  , footerLeft   : '\u2517'
  , footerMiddle : '\u2501'
  , footerRight  : '\u251b'
  , dash         : '\u2501'
  , pipe         : '\u2503'
}

function getTableChars(color) {
    const chrs = {}
    for (var k in TableChars) {
        chrs[k] = chalk[color](TableChars[k])
    }
    return chrs
}

function repeat(str, n) {
    return intRange(0, n - 1).map(() => str).join('')
}

const AvailableColumns = [
    'name'
  , 'elapsed'
  , 'average'
  , 'count'
  , 'game'
  , 'match'
  , 'turn'
]

const SortableColumns = AvailableColumns

class Helper {

    static sortableColumns() {
        return SortableColumns.slice(0)
    }

    static defaults() {
        return {
            outDir      : null
          , matchTotal  : 1
          , numMatches  : 500
          , sortBy      : 'name'
          , indent      : 4
          , columns     : [
                'name'
              , 'elapsed'
              , 'average'
              , 'count'
              , 'game'
              //, 'match'
              , 'turn'
            ]
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(Helper.defaults(), opts)
        if (SortableColumns.indexOf(this.opts.sortBy) < 0) {
            throw new Error('Invalid sort column: ' + this.opts.sortBy)
        }
        this.logger = new Logger
        this.coordinator = new Coordinator
    }

    async run() {
        Profiler.enabled = true
        Profiler.resetAll()
        const white = RobotDelegator.forDefaults(White)
        const red = RobotDelegator.forDefaults(Red)
        try {
            this.logger.info('Running', this.opts.numMatches, 'matches of', this.opts.matchTotal, 'points each')
            var matchCount = 0
            var gameCount = 0
            var turnCount = 0
            const summaryTimer = new Timer
            summaryTimer.start()
            for (var i = 0; i < this.opts.numMatches; ++i) {
                var match = new Match(this.opts.matchTotal)
                await this.coordinator.runMatch(match, white, red)
                matchCount += 1
                gameCount += match.games.length
                for (var j = 0, jlen = match.games.length; j < jlen; ++j) {
                    turnCount += match.games[j].getTurnCount()
                }
            }
            summaryTimer.stop()
            this.logger.info('Done')
            const summary = {
                elapsed : summaryTimer.elapsed
              , matchCount
              , gameCount
              , turnCount
            }
            this.logTimers(Object.values(Profiler.timers), summary)
        } finally {
            white.destroy()
            red.destroy()
            Profiler.resetAll()
        }
    }

    logTimers(timers, summary) {

        const columns = this.opts.columns

        const titles = {
            // optional
            name    : 'timer'
          , elapsed : 't-total'
          , average : 't-avg'
          , count   : 'n-total'
          , match   : 'n-match'
          , game    : 'n-game'
          , turn    : 'n-turn'
        }

        const getters = {
            // required
            name    : timer => timer.name
          , elapsed : timer => timer.elapsed
          , average : timer => timer.elapsed / timer.startCount
          , count   : timer => timer.startCount
          , match   : timer => timer.startCount / this.opts.numMatches
          , game    : timer => timer.startCount / summary.gameCount
          , turn    : timer => timer.startCount / summary.turnCount
        }

        const format = {
            // optional, but should return string
            round   : value => Math.round(value).toString()
          , elapsed : value => value + ' ms'
          , average : value => value.toFixed(4) + ' ms'
          , match   : value => format.round(value)
          , game    : value => format.round(value)
          , turn    : value => format.round(value)
        }

        const footerLines = [
            ['Total Elapsed :', format.elapsed(summary.elapsed)]
          , ['Total Matches :', summary.matchCount.toString()]
          , ['Total Games   :', summary.gameCount.toString()]
          , ['Total Turns   :', summary.turnCount.toString()]
          , ['Games / Match :', format.round(summary.gameCount / summary.matchCount)]
          , ['Turns / Game  :', format.round(summary.turnCount / summary.gameCount)]
        ].map(arr => arr.join(' '))

        const colors = {
            border: 'grey'
        }

        const aligns = {
            // optional, default is padStart (right align)
            name : 'padEnd'
        }

        const widths = {
            // optional min width
        }

        const data = timers.map(timer => {
            const row = {}
            columns.forEach(key => {
                row[key] = getters[key](timer)
            })
            return row
        })

        var cmp

        switch (this.opts.sortBy) {
            case 'name':
                // ascending
                cmp = (a, b) => (a.name + '').localeCompare(b.name + '')
                break
            case 'elapsed':
                // descending
                cmp = (a, b) => b.elapsed - a.elapsed
                break
            case 'average':
                // descending
                cmp = (a, b) => b.average - a.average
                break
            case 'count':
                // descending
                cmp = (a, b) => b.count - a.count
                break
            case 'match':
                // descending
                cmp = (a, b) => b.match - a.match
            case 'game':
                // descending
                cmp = (a, b) => b.game - a.game
                break
            case 'turn':
                // descending
                cmp = (a, b) => b.turn - a.turn
                break
            default:
                this.logger.warn('Invalid sort column:', this.opts.sortBy)
                break
        }

        if (cmp) {
            data.sort(cmp)
        }

        // setup columns
        var rowWidth = 0
        const dashParts = []
        columns.forEach(key => {
            // defaults
            titles[key] = titles[key] || key
            format[key] = format[key] || (value => '' + value)
            aligns[key] = aligns[key] || 'padStart'
            widths[key] = widths[key] || 0
            // fit column width to data
            widths[key] = Math.max(widths[key], titles[key].length, ...data.map(row => format[key](row[key]).length))
            rowWidth += widths[key]
        })

        rowWidth += Math.max(columns.length - 1, 0) * 3

        // verify footer will fit in column
        const minFooterWidth = Math.max(...footerLines.map(str => str.length))
        var widthDeficit = minFooterWidth - rowWidth
        if (widthDeficit > 0) {
            if (columns.length) {
                // adjust the last column width
                widths[columns[columns.length - 1]] += widthDeficit
            } else {
                // corner case of no columns
                // create dummy column space of dashes
                var dummyDashes = repeat(TableChars.dash, widthDeficit)
                dashParts.push(chalk[colors.border](dummyDashes))
            }
            rowWidth += widthDeficit
        }

        columns.forEach(key => {
            // some reason dash doesn't pad when chalked
            const dashes = repeat(TableChars.dash, widths[key])
            dashParts.push(chalk[colors.border](dashes))
        })

        // setup border
        const border = getTableChars(colors.border)
        border.pipeSpaced = ' ' + border.pipe + ' '
        for (var vpos of ['top', 'middle', 'bottom', 'footer']) {
            var joiner = [border.dash, border[vpos + 'Middle'], border.dash].join('')
            border[vpos] = [
                border[vpos + 'Left'], dashParts.join(joiner), border[vpos + 'Right']
            ].join(border.dash)
        }

        // build header
        const headerInnerStr = columns.map(key =>
            titles[key][aligns[key]](widths[key], ' ')).join(border.pipeSpaced)
        const headerStr = [
            border.pipe, headerInnerStr.padEnd(rowWidth, ' '), border.pipe
        ].join(' ')

        // build body
        const bodyStrs = data.map(row => {
            const innerStr = columns.map(key =>
                format[key](row[key])[aligns[key]](widths[key], ' ')
            ).join(border.pipeSpaced)
            return [border.pipe, innerStr.padEnd(rowWidth, ' '), border.pipe].join(' ')
        })

        // build footer
        const footerStrs = footerLines.map(line =>
            [border.pipe, line.padEnd(rowWidth, ' '), border.pipe].join(' ')
        )

        // Write

        this.println(border.top)
        this.println(headerStr)
        this.println(border.middle)

        bodyStrs.forEach(rowStr => this.println(rowStr))

        this.println(border.bottom)
        footerStrs.forEach(footerStr => this.println(footerStr))
        this.println(border.footer)
    }

    println(line) {
        this.logger.writeStdout(''.padEnd(this.opts.indent, ' '))
        this.logger.writeStdout(line)
        this.logger.writeStdout('\n')
    }
}

module.exports = Helper