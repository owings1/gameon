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

const {intRange} = Util
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
  , bottomLeft   : '\u2517'
  , bottomMiddle : '\u253b'
  , bottomRight  : '\u251b'
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

class Helper {

    static defaults() {
        return {
            outDir      : null
          , matchTotal  : 1
          , numMatches  : 500
          , sortBy      : 'name'
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(Helper.defaults(), opts)
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
            const startTime = +new Date
            for (var i = 0; i < this.opts.numMatches; i++) {
                var match = new Match(this.opts.matchTotal)
                await this.coordinator.runMatch(match, white, red)
            }
            const endTime = +new Date
            this.logger.info('Done')
            this.logTimers(Object.values(Profiler.timers), endTime - startTime)
        } finally {
            white.destroy()
            red.destroy()
            Profiler.resetAll()
        }
    }

    logTimers(timers, msTotal) {

        const columns = ['name', 'elapsed', 'average', 'count', 'match']

        const titles = {
            // optional
            name    : 'timer',
            elapsed : 't-total',
            average : 't-avg',
            count   : 'n-total',
            match   : 'n-match'
        }

        const getters = {
            // required
            name    : timer => timer.name,
            elapsed : timer => timer.elapsed,
            average : timer => timer.elapsed / timer.startCount,
            count   : timer => timer.startCount,
            match   : timer => timer.startCount / this.opts.numMatches
        }

        const format = {
            // optional, but should return string
            elapsed : value => value + ' ms',
            average : value => value.toFixed(4) + ' ms',
            match   : value => Math.round(value).toString()
        }

        const colors = {
            border: 'grey'
        }

        const aligns = {
            // optional, default is padStart (right align)
            name : 'padEnd'
        }

        const widths = {
            // optional min width
            elapsed: (msTotal.toString() + ' ms').length
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
                cmp = (a, b) => a.name.localeCompare(b.name)
                break
            case 'elapsed':
                // descending
                cmp = (a, b) => b.elapsed - a.elapsed
                break
            case 'average':
                cmp = (a, b) => b.average - a.elapsaverageed
                break
            case 'count':
                cmp = (a, b) => b.count - a.count
                break
            case 'match':
                cmp = (a, b) => b.match - a.match
                break
            default:
                this.logger.warn('Invalid sort column:', this.opts.sortBy)
                break
        }

        if (cmp) {
            data.sort(cmp)
        }



        const border = getTableChars(colors.border)

        border.pipeSpaced = ' ' + border.pipe + ' '

        // setup columns
        const dashParts = []
        columns.forEach(key => {
            // defaults
            titles[key] = titles[key] || key
            format[key] = format[key] || (value => '' + value)
            aligns[key] = aligns[key] || 'padStart'
            widths[key] = widths[key] || 0
            // fit column width to data
            widths[key] = Math.max(widths[key], titles[key].length, ...data.map(row => format[key](row[key]).length))
            // some reason dash doesn't pad when chalked
            const dashes = intRange(0, widths[key] - 1).map(() => TableChars.dash).join('')
            dashParts.push(chalk[colors.border](dashes))
        })

        // make border rows
        for (var vpos of ['top', 'middle', 'bottom']) {
            var joiner = [border.dash, border[vpos + 'Middle'], border.dash].join('')
            border[vpos] = [
                border[vpos + 'Left'], border.dash, dashParts.join(joiner), border.dash, border[vpos + 'Right']
            ].join('')
        }

        // build header
        const headerInnerStr = columns.map(key => titles[key][aligns[key]](widths[key], ' ')).join(border.pipeSpaced)
        const headerStr = [border.pipe, headerInnerStr, border.pipe].join(' ')

        // build body
        const bodyStrs = data.map(row => {
            const innerStr = columns.map(key =>
                format[key](row[key])[aligns[key]](widths[key], ' ')
            ).join(border.pipeSpaced)
            return [border.pipe, innerStr, border.pipe].join(' ')
        })

        // build footer
        const footerInnerStr = [
            'Total'.padEnd(widths.name, ' '),
            format.elapsed(msTotal).padStart(widths.elapsed, ' '),
            ...columns.slice(2).map(key => ''.padEnd(widths[key], ' '))
        ].join(border.pipeSpaced)
        const footerStr = [border.pipe, footerInnerStr, border.pipe].join(' ')

        // Write

        this.logger.info(border.top)
        this.logger.info(headerStr)
        this.logger.info(border.middle)

        bodyStrs.forEach(rowStr => this.logger.info(rowStr))

        this.logger.info(border.middle)
        this.logger.info(footerStr)
        this.logger.info(border.bottom)
    }
}

module.exports = Helper