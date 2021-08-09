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
const Dice        = require('../lib/dice')
const Errors      = require('../lib/errors')
const Logger      = require('../lib/logger')
const {Match}     = require('../lib/core')
const Util        = require('../lib/util')

const Tables = require('../term/tables')

const Robot = require('./player')

const fse  = require('fs-extra')
const path = require('path')

const {Table, TableHelper} = Tables
const {Timer}   = Util
const {resolve} = path

const {Colors, DefaultThemeName} = Constants

const {RobotDelegator} = Robot

const {InvalidColumnError} = Errors

const Profiler = Util.Profiler.getDefaultInstance()

function f_round(value) {
    return Math.round(value).toLocaleString()
}

function f_elapsed(value) {
    return value == null ? '' : value.toLocaleString() + ' ms'
}

const Columns = [
    {
        name       : 'name'
      , title      : 'Name'
      , align      : 'left'
      , isFilter   : true
      , sortable   : true
      , defaultDir : 'asc'
    }
  , {
        name       : 'elapsed'
      , title      : 'Elapsed (ms)'
      , align      : 'right'
      , format     : f_elapsed
      , isFilter   : false
      , sortable   : true
      , defaultDir : 'desc'
    }
  , {
        name       : 'average'
      , title      : 'Average (ms)'
      , align      : 'right'
      , format     : value => value == null ? '' : value.toFixed(4) + ' ms'
      , isFilter   : false
      , sortable   : true
      , defaultDir : 'desc'
    }
  , {
        name       : 'count'
      , title      : 'Count'
      , align      : 'right'
      , format     : f_round
      , isFilter   : false
      , sortable   : true
      , defaultDir : 'desc'
      , get        : it => it.getCount()
    }
  , {
        name       : 'match'
      , title      : 'Match (avg)'
      , align      : 'right'
      , format     : f_round
      , isFilter   : false
      , sortable   : true
      , defaultDir : 'desc'
      , get        : (it, {summary}) => it.getCount() / summary.matchCount
    }
  , {
        name       : 'game'
      , title      : 'Game (avg)'
      , align      : 'right'
      , format     : f_round
      , isFilter   : false
      , sortable   : true
      , defaultDir : 'desc'
      , get        : (it, {summary}) => it.getCount() / summary.gameCount
    }
  , {
        name       : 'turn'
      , title      : 'Turn (avg)'
      , align      : 'right'
      , format     : f_round
      , isFilter   : false
      , sortable   : true
      , defaultDir : 'desc'
      , get        : (it, {summary}) => it.getCount() / summary.turnCount
    }
]

class ProfileHelper {

    static sortableColumns() {
        return Columns.filter(column => column.sortable).map(column => column.name)
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
          , filterRegex  : null
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
        this.logger = new Logger(this.constructor.name, {named: true})
    }

    async run() {

        const table = new Table(Columns, null, this.opts)

        // fail fast
        table.buildColumns().buildOpts()

        const {
            breadthTrees
          , filterRegex
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

        if (filterRegex) {
            this.logger.info('Using filter', filterRegex.toString())
        }

        Profiler.enabled = true
        Profiler.resetAll()

        const summaryTimer = new Timer
        const coordinator = new Coordinator

        let matchCount = 0
        let gameCount  = 0
        let turnCount  = 0

        const players = [
            RobotDelegator.forDefaults(Colors.White)
          , RobotDelegator.forDefaults(Colors.Red)
        ]

        try {

            this.logger.info('Running', numMatches, 'matches of', matchTotal, 'points each')

            summaryTimer.start()

            for (let i = 0; i < numMatches; ++i) {

                let match = new Match(matchTotal, matchOpts)

                await coordinator.runMatch(match, ...players)

                matchCount += 1
                gameCount += match.games.length
                for (let j = 0, jlen = match.games.length; j < jlen; ++j) {
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

            table.data = this.buildData(Profiler)
            table.opts.footerLines = this.buildFooters(summary)
            table.summary = summary

            table.build()

            const helper = this.newTableHelper(this.opts)

            if (this.opts.interactive) {
                await helper.interactive(table)
            } else {
                helper.printTable(table)
            }

        } finally {
            await Util.destroyAll(players)
            Profiler.resetAll()
        }
    }

    buildData(profiler) {
        return Object.values(profiler.timers).concat(Object.values(profiler.counters))
    }

    buildFooters(summary) {
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
        return footerLines
    }

    newTableHelper(...args) {
        return new TableHelper(...args)
    }

    async loadRollsFile(file) {
        const data = await fse.readJson(resolve(file))
        const {rolls} = Dice.validateRollsData(data)
        return Dice.createRoller(rolls)
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
    }
}

module.exports = ProfileHelper