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
const Errors      = require('../lib/errors')
const Logger      = require('../lib/logger')
const Robot       = require('./player')
const Tables      = require('../term/tables')
const Util        = require('../lib/util')

const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {Table, TableHelper} = Tables
const {Timer}   = Util
const {resolve} = path

const {Colors, DefaultThemeName} = Constants

const {Dice, Match, Profiler} = Core

const {RobotDelegator} = Robot

const {
    InvalidColumnError
  , InvalidRegexError
  , InvalidSortDirError
} = Errors

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
            name  : 'name'
          , title : 'Name'
          , align : 'left'
        }
      , sortable   : true
      , defaultDir : 'asc'
      , sorter     : (a, b) => (a.name + '').localeCompare(b.name + '')
      , g_counter  : counter => counter.name
      , g_timer    : timer => timer.name
    }

  , elapsed: {
        def : {
            name     : 'elapsed'
          , title    : 'Elapsed (ms)'
          , align    : 'right'
          , format   : f_elapsed
          , isFilter : false
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.elapsed, b.elapsed)
      , g_counter  : counter => null
      , g_timer    : timer => timer.elapsed
    }

  , average: {
        def : {
            name     : 'average'
          , title    : 'Average (ms)'
          , align    : 'right'
          , format   : value => value == null ? '' : value.toFixed(4) + ' ms'
          , isFilter : false
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.average, b.average)
      , g_counter  : counter => null
      , g_timer    : timer => timer.elapsed / timer.startCount
    }

  , count: {
        def : {
            name     : 'count'
          , title    : 'Count'
          , align    : 'right'
          , format   : f_round
          , isFilter : false
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.count, b.count)
      , g_counter  : counter => counter.value
      , g_timer    : timer => timer.startCount
    }

  , match: {
        def : {
            name     : 'match'
          , title    : 'Match (avg)'
          , align    : 'right'
          , format   : f_round
          , isFilter : false
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.match, b.match)
      , g_counter  : (counter, summary) => counter.value / summary.matchCount
      , g_timer    : (timer, summary) => timer.startCount / summary.matchCount
    }

  , game: {
        def : {
            name     : 'game'
          , title    : 'Game (avg)'
          , align    : 'right'
          , format   : f_round
          , isFilter : false
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.game, b.game)
      , g_counter  : (counter, summary) => counter.value / summary.gameCount
      , g_timer    : (timer, summary) => timer.startCount / summary.gameCount
    }

  , turn : {
        def : {
            name     : 'turn'
          , title    : 'Turn (avg)'
          , align    : 'right'
          , format   : f_round
          , isFilter : false
        }
      , sortable   : true
      , defaultDir : 'desc'
      , sorter     : (a, b) => numCmp(a.turn, b.turn)
      , g_counter  : (counter, summary) => counter.value / summary.turnCount
      , g_timer    : (timer, summary) => timer.startCount / summary.turnCount
    }
}

class ProfileHelper {

    static sortableColumns() {
        return Object.values(Columns).filter(column => column.sortable).map(column => column.name)
    }

    static defaults() {
        return {
            outDir       : null
          , matchTotal   : 1
          , numMatches   : 500
          , sortBy       : ['elapsed', 'count', 'name'].join(',')
          , innerBorders : false
          , interactive  : false
          , title        : 'Profile Results'
          , breadthTrees : false
          , gaugeRegex   : null
          , theme        : DefaultThemeName
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

        this.opts = Util.defaults(ProfileHelper.defaults(), opts)

        this.logger = new Logger

        this.columns = this.opts.columns.toLowerCase().split(',').map(it => it.trim()).filter(it => it.length)
        
        this.columns.forEach(name => {
            if (!Columns[name]) {
                throw new InvalidColumnError('Invalid column: ' + name)
            }
        })

        this.sortColumns = []
        this.sortDirs = []

        this.opts.sortBy.toLowerCase().split(',').forEach(sortBy => {
            var [name, dir] = sortBy.split(':')
            if (Columns[name].sortabe) {
                throw new InvalidColumnError('Invalid sort column: ' + name)
            }
            dir = dir || Columns[name].defaultDir
            if (dir != 'asc' && dir != 'desc') {
                throw new InvalidSortDirError("Invalid sort direction '" + dir + "' for column " + name)
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
                throw new InvalidRegexError('gauge regex must be a RegExp')
            }
        }
    }

    async run() {

        const {
            breadthTrees
          , gaugeRegex
          , matchTotal
          , numMatches
          , rollsFile
        } = this.opts

        const matchOpts = {breadthTrees}

        if (breadthTrees) {
            this.logger.info('Using breadth trees')
        }

        if (rollsFile) {
            this.logger.info('Loading rolls file', path.basename(rollsFile))
            matchOpts.roller = await this.loadRollsFile(rollsFile)
        }

        const filters = []
        if (gaugeRegex) {
            this.logger.info('Using regex filter', gaugeRegex.toString())
            filters.push(gauge => gaugeRegex.test(gauge.name))
        }

        Profiler.enabled = true
        Profiler.resetAll()

        const summaryTimer = new Timer
        const coordinator = new Coordinator

        var matchCount = 0
        var gameCount  = 0
        var turnCount  = 0

        const players = [
            RobotDelegator.forDefaults(Colors.White)
          , RobotDelegator.forDefaults(Colors.Red)
        ]

        try {

            this.logger.info('Running', numMatches, 'matches of', matchTotal, 'points each')

            summaryTimer.start()

            for (var i = 0; i < numMatches; ++i) {

                var match = new Match(matchTotal, matchOpts)

                await coordinator.runMatch(match, ...players)

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

            if (this.opts.interactive) {
                const helper = new TableHelper({termEnabled: true, ...this.opts})
                await helper.interactive(table)
            } else {
                this.logTable(table)
            }

        } finally {
            await Util.destroyAll(players)
            Profiler.resetAll()
        }
    }

    buildData(profiler, summary, filters) {

        const {columns, sortColumns, sortDirs} = this

        const filter = gauge => !filters.find(filter => !filter(gauge))

        const data = []

        Object.values(profiler.timers).filter(filter).forEach(timer => {
            const row = {}
            columns.forEach(name => {
                row[name] = Columns[name].g_timer(timer, summary)
            })
            data.push(row)
        })

        Object.values(profiler.counters).filter(filter).forEach(counter => {
            const row = {}
            columns.forEach(name => {
                row[name] = Columns[name].g_counter(counter, summary)
            })
            data.push(row)
        })

        data.sort((a, b) => {
            var cmp = 0
            for (var i = 0; i < sortColumns.length; ++i) {
                var name = sortColumns[i]
                var dir = sortDirs[i]
                cmp = Columns[name].sorter(a, b) * dir
                if (cmp) {
                    break
                }
            }
            return cmp
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
        const {rolls} = Dice.validateRollsFile(resolve(file))
        return Dice.createRoller(rolls)
    }
}

module.exports = ProfileHelper