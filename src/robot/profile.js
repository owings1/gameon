/**
 * gameon - Robot Performance Pofiling Helper class
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
const Constants   = require('../lib/constants')
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

const {Match, Colors} = Constants
const {White, Red} = Colors

const {Profiler} = Core

const {RobotDelegator} = Robot

// https://codepoints.net/box_drawing
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

const DefaultSortDirections = {
    'name'    : 'asc'
  , 'elapsed' : 'desc'
  , 'average' : 'desc'
  , 'count'   : 'desc'
  , 'game'    : 'desc'
  , 'match'   : 'desc'
  , 'turn'    : 'desc'
}

class Helper {

    static sortableColumns() {
        return SortableColumns.slice(0)
    }

    static defaults() {
        return {
            outDir       : null
          , matchTotal   : 1
          , numMatches   : 500
          , sortBy       : 'elapsed,count,name'
          , innerBorders : false
          , breadthTrees : false
          , gaugeRegex   : null
          , colorHead    : 'green'
          , colorOdd     : 'white'
          , colorEven    : 'cyan'
          , indent       : 4
          , rollsFile    : null
          , columns      : [
                'name'
              , 'elapsed'
              , 'average'
              , 'count'
              , 'game'
              //, 'match'
              , 'turn'
            ].join(',')
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(Helper.defaults(), opts)
        this.columns = this.opts.columns.toLowerCase().split(',')
        
        this.columns.forEach(column => {
            if (AvailableColumns.indexOf(column) < 0) {
                throw new Error('Invalid column: ' + column)
            }
        })
        this.sortColumns = []
        this.sortDirs = []
        this.opts.sortBy.toLowerCase().split(',').forEach(sortBy => {
            var [column, dir] = sortBy.split(':')
            if (SortableColumns.indexOf(column) < 0) {
                throw new Error('Invalid sort column: ' + column)
            }
            dir = dir || DefaultSortDirections[column]
            if (dir != 'asc' && dir != 'desc') {
                throw new Error("Invalid sort direction '" + dir + "' for column " + column)
            }
            this.sortColumns.push(column)
            this.sortDirs.push(dir == 'asc' ? 1 : -1)
        })

        for (var opt of ['colorHead', 'colorOdd', 'colorEven']) {
            try {
                chalk[this.opts[opt]]('')
            } catch (err) {
                if (err.name == 'TypeError' && err.message.indexOf('not a function')) {
                    throw new Error("Unsupported chalk color '" + this.opts[opt] + "' for option " + opt)
                }
                throw err
            }
        }

        if (this.opts.gaugeRegex) {
            if (typeof this.opts.gaugeRegex == 'string') {
                if (this.opts.gaugeRegex[0] == '/') {
                    var [str, flags] = this.opts.gaugeRegex.substring(1).split('/')
                } else {
                    var str = Util.escapeRegex(this.opts.gaugeRegex)
                    var flags = undefined
                }
                this.opts.gaugeRegex = new RegExp(str, flags)
            }
            if (!(this.opts.gaugeRegex instanceof RegExp)) {
                throw new Error('gauge regex must be a RegExp')
            }
            
        }
        this.logger = new Logger
        this.coordinator = new Coordinator
        this.roller = null
    }

    async run() {
        if (this.opts.breadthTrees) {
            this.logger.info('Using breadth trees')
        }
        if (this.opts.rollsFile) {
            this.logger.info('Loading rolls file', path.basename(this.opts.rollsFile))
            await this.loadRollsFile(this.opts.rollsFile)
        }
        const filters = []
        if (this.opts.gaugeRegex) {
            this.logger.info('Using regex filter', this.opts.gaugeRegex.toString())
            filters.push(gauge => this.opts.gaugeRegex.test(gauge.name))
        }
        Profiler.enabled = true
        Profiler.resetAll()
        const white = RobotDelegator.forDefaults(White)
        const red = RobotDelegator.forDefaults(Red)
        try {
            this.logger.info('Running', this.opts.numMatches, 'matches of', this.opts.matchTotal, 'points each')
            var matchCount = 0
            var gameCount = 0
            var turnCount = 0
            const matchOpts = {breadthTrees: this.opts.breadthTrees, roller: this.roller}
            const summaryTimer = new Timer
            summaryTimer.start()
            for (var i = 0; i < this.opts.numMatches; ++i) {
                var match = new Match(this.opts.matchTotal, matchOpts)
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
            const data = this.buildData(Profiler, summary, filters)
            this.logData(data, summary)
        } finally {
            white.destroy()
            red.destroy()
            Profiler.resetAll()
        }
    }

    buildData(profiler, summary, filters) {

        const {columns, sortColumns, sortDirs} = this

        const timerGetters = {
            name    : timer => timer.name
          , elapsed : timer => timer.elapsed
          , average : timer => timer.elapsed / timer.startCount
          , count   : timer => timer.startCount
          , match   : timer => timer.startCount / summary.matchCount
          , game    : timer => timer.startCount / summary.gameCount
          , turn    : timer => timer.startCount / summary.turnCount
        }

        const counterGetters = {
            name    : counter => counter.name
          , elapsed : counter => null
          , average : counter => null
          , count   : counter => counter.value
          , match   : counter => counter.value / summary.matchCount
          , game    : counter => counter.value / summary.gameCount
          , turn    : counter => counter.value / summary.turnCount
        }

        const numCmp = (a, b) => {
            if (a == null && b != null) {
                return -1
            }
            if (b == null && a != null) {
                return 1
            }
            return a - b
        }

        const sorters = {
            name    : (a, b) => (a.name + '').localeCompare(b.name + '')
          , elapsed : (a, b) => numCmp(a.elapsed, b.elapsed)
          , average : (a, b) => numCmp(a.average, b.average)
          , count   : (a, b) => numCmp(a.count, b.count)
          , match   : (a, b) => numCmp(a.match, b.match)
          , game    : (a, b) => numCmp(a.game, b.game)
          , turn    : (a, b) => numCmp(a.turn, b.turn)
        }

        const filter = gauge => !filters.find(filter => !filter(gauge))

        const data = []

        Object.values(profiler.timers).forEach(timer => {
            if (!filter(timer)) {
                return
            }
            const row = {}
            columns.forEach(key => {
                row[key] = timerGetters[key](timer)
            })
            data.push(row)
        })

        Object.values(profiler.counters).forEach(counter => {
            if (!filter(counter)) {
                return
            }
            const row = {}
            columns.forEach(key => {
                row[key] = counterGetters[key](counter)
            })
            data.push(row)
        })

        data.sort((a, b) => {
            var res = 0
            for (var i = 0; i < sortColumns.length; ++i) {
                var column = sortColumns[i]
                var dir = sortDirs[i]
                res = sorters[column](a, b) * dir
                if (res) {
                    break
                }
            }
            return res
        })

        return data
    }

    logData(data, summary) {

        const {columns} = this
        const {innerBorders, colorOdd, colorEven, colorHead} = this.opts

        const titles = {
            // optional
            name    : 'Name'
          , elapsed : 'Elapsed (ms)'
          , average : 'Average (ms)'
          , count   : 'Count'
          , match   : 'Match (avg)'
          , game    : 'Game (avg)'
          , turn    : 'Turn (avg)'
        }

        const round =  value => Math.round(value).toLocaleString()
        const format = {
            // optional, but should return string
            elapsed : value => value == null ? '' : value.toLocaleString() + ' ms'
          , average : value => value == null ? '' : value.toFixed(4) + ' ms'
          , count   : round
          , match   : round
          , game    : round
          , turn    : round
        }

        const footerInfo = [
            ['Total Elapsed', format.elapsed(summary.elapsed)]
          , ['Total Matches', summary.matchCount.toLocaleString()]
          , ['Total Games',   summary.gameCount.toLocaleString()]
          , ['Total Turns',   summary.turnCount.toLocaleString()]
          , ['Games / Match', round(summary.gameCount / summary.matchCount)]
          , ['Turns / Game',  round(summary.turnCount / summary.gameCount)]
        ]
        const footerTitleWidth = Math.max(...footerInfo.map(it => it[0].length))
        const footerValueWidth = Math.max(...footerInfo.map(it => it[1].length))

        const footerLines = footerInfo.map(([title, value]) => {
            title = title.padEnd(footerTitleWidth, ' ')
            if (value.indexOf(' ms') < 0) {
                value += '   '
            }
            value = value.padStart(footerValueWidth, ' ')
            return [title, value].join(' : ')
        })

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
            chalk[colorHead](titles[key][aligns[key]](widths[key], ' '))).join(border.pipeSpaced)
        const headerStr = [
            border.pipe, headerInnerStr.padEnd(rowWidth, ' '), border.pipe
        ].join(' ')

        // build body
        const alt = (str, i) => {
            const method = i % 2 ? colorEven : colorOdd
            return chalk[method](str)
        }
        const bodyStrs = data.map((row, i) => {
            const innerStr = columns.map(key =>
                alt(format[key](row[key])[aligns[key]](widths[key], ' '), i)
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

        bodyStrs.forEach((rowStr, i) => {
            if (innerBorders && i > 0) {
                this.println(border.middle)
            }
            this.println(rowStr)
        })

        this.println(border.bottom)
        footerStrs.forEach(footerStr => this.println(footerStr))
        this.println(border.footer)
    }

    println(line) {
        this.logger.writeStdout(''.padEnd(this.opts.indent, ' '))
        this.logger.writeStdout(line)
        this.logger.writeStdout('\n')
    }

    loadRollsFile(file) {
        file = resolve(file)
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
        if (!Array.isArray(data.rolls)) {
            throw new Error('Invalid rolls data, expects rolls key to be an array')
        }
        this.loadRolls(data.rolls)
    }

    loadRolls(rolls) {
        if (!rolls.length) {
            throw new Error('Rolls cannot be empty')
        }
        // check for at least one valid first roll
        var isFound = false
        for (var i = 0; i < rolls.length; ++i) {
            var dice = rolls[i]
            if (dice[0] != dice[1]) {
                isFound = true
                break
            }
        }
        if (!isFound) {
            throw new Error('Cannot find one unique roll')
        }
        var rollIndex = 0
        var maxIndex = rolls.length - 1
        this.roller = () => {
            if (rollIndex > maxIndex) {
                rollIndex = 0
            }
            return rolls[rollIndex++]
        }
    }
}

module.exports = Helper