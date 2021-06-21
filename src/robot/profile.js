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
const {Table}     = require('../term/tables')
const Util        = require('../lib/util')

const chalk = require('chalk')
const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {Timer}   = Util
const {resolve} = path

const {Colors, White, Red} = Constants

const {Match, Profiler} = Core

const {RobotDelegator} = Robot

function f_round(value) {
    return Math.round(value).toLocaleString()
}

function f_elapsed(value) {
    return value == null ? '' : value.toLocaleString() + ' ms'
}

function numCmp(a, b) {
    if (a == null && b != null) {
        return -1
    }
    if (b == null && a != null) {
        return 1
    }
    return a - b
}

const Columns = {
    name: {
        def : {
            name       : 'name'
          , title      : 'Name'
          , align      : 'left'
        }
      , sortable   : true
      , defaultDir : 'asc'
      , sorter     : (a, b) => (a.name + '').localeCompare(b.name + '')
      , g_counter  : counter => counter.name
      , g_timer    : timer => timer.name
    }

  , elapsed: {
        def : {
            name       : 'elapsed'
          , title      : 'Elapsed (ms)'
          , align      : 'right'
          , format     : f_elapsed
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.elapsed, b.elapsed)
      , g_counter  : counter => null
      , g_timer    : timer => timer.elapsed
    }

  , average: {
        def : {
            name       : 'average'
          , title      : 'Average (ms)'
          , align      : 'right'
          , format     : value => value == null ? '' : value.toFixed(4) + ' ms'
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.average, b.average)
      , g_counter  : counter => null
      , g_timer    : timer => timer.elapsed / timer.startCount
    }

  , count: {
        def : {
            name       : 'count'
          , title      : 'Count'
          , align      : 'right'
          , format     : f_round
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.count, b.count)
      , g_counter  : counter => counter.value
      , g_timer    : timer => timer.startCount
    }

  , match: {
        def : {
            name       : 'match'
          , title      : 'Match (avg)'
          , align      : 'right'
          , format     : f_round
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.match, b.match)
      , g_counter  : (counter, summary) => counter.value / summary.matchCount
      , g_timer    : (timer, summary) => timer.startCount / summary.matchCount
    }

  , game: {
        def : {
            name       : 'game'
          , title      : 'Game (avg)'
          , align      : 'right'
          , format     : f_round
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.game, b.game)
      , g_counter  : (counter, summary) => counter.value / summary.gameCount
      , g_timer    : (timer, summary) => timer.startCount / summary.gameCount
    }

  , turn : {
        def : {
            name       : 'turn'
          , title      : 'Turn (avg)'
          , align      : 'right'
          , format     : f_round
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.turn, b.turn)
      , g_counter  : (counter, summary) => counter.value / summary.turnCount
      , g_timer    : (timer, summary) => timer.startCount / summary.turnCount
    }
}

class Helper {

    static sortableColumns() {
        return Object.values(Columns).filter(column => column.sortable).map(column => column.name)
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
          , theme        : 'Default'
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

        this.columns = this.opts.columns.toLowerCase().split(',').map(it => it.trim()).filter(it => it.length)
        
        this.columns.forEach(name => {
            if (!Columns[name]) {
                throw new Error('Invalid column: ' + name)
            }
        })

        this.sortColumns = []
        this.sortDirs = []

        this.opts.sortBy.toLowerCase().split(',').forEach(sortBy => {
            var [name, dir] = sortBy.split(':')
            if (Columns[name].sortabe) {
                throw new Error('Invalid sort column: ' + name)
            }
            dir = dir || Columns[name].defaultDir
            if (dir != 'asc' && dir != 'desc') {
                throw new Error("Invalid sort direction '" + dir + "' for column " + name)
            }
            this.sortColumns.push(name)
            this.sortDirs.push(dir == 'asc' ? 1 : -1)
        })

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
            var gameCount  = 0
            var turnCount  = 0

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
            const table = this.buildTable(data, summary)

            this.logTable(table)

        } finally {
            white.destroy()
            red.destroy()
            Profiler.resetAll()
        }
    }

    buildData(profiler, summary, filters) {

        const {columns, sortColumns, sortDirs} = this

        const filter = gauge => !filters.find(filter => !filter(gauge))

        const data = []

        Object.values(profiler.timers).forEach(timer => {
            if (!filter(timer)) {
                return
            }
            const row = {}
            columns.forEach(name => {
                row[name] = Columns[name].g_timer(timer, summary)
            })
            data.push(row)
        })

        Object.values(profiler.counters).forEach(counter => {
            if (!filter(counter)) {
                return
            }
            const row = {}
            columns.forEach(name => {
                row[name] = Columns[name].g_counter(counter, summary)
            })
            data.push(row)
        })

        data.sort((a, b) => {
            var res = 0
            for (var i = 0; i < sortColumns.length; ++i) {
                var name = sortColumns[i]
                var dir = sortDirs[i]
                res = Columns[name].sorter(a, b) * dir
                if (res) {
                    break
                }
            }
            return res
        })

        return data
    }

    buildTable(data, summary) {

        const columns = this.columns.map(name => Columns[name].def)

        const footerInfo = [
            ['Total Elapsed' , f_elapsed(summary.elapsed)]
          , ['Total Matches' , summary.matchCount.toLocaleString()]
          , ['Total Games'   , summary.gameCount.toLocaleString()]
          , ['Total Turns'   , summary.turnCount.toLocaleString()]
          , ['Games / Match' , f_round(summary.gameCount / summary.matchCount)]
          , ['Turns / Game'  , f_round(summary.turnCount / summary.gameCount)]
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

        return new Table(columns, data, {...this.opts, footerLines}).build()
    }

    logTable(table) {
        table.lines.forEach(line => this.println(line))
    }

    println(line) {
        const {logger} = this
        logger.writeStdout(''.padEnd(this.opts.indent, ' '))
        logger.writeStdout(line)
        logger.writeStdout('\n')
    }

    loadRollsFile(file) {
        const data = JSON.parse(fs.readFileSync(resolve(file), 'utf-8'))
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