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

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')

const {resolve} = path

const {Match, Colors, Profiler} = Core
const {White, Red} = Colors

const {RobotDelegator} = Robot

class Helper {

    static defaults() {
        return {
            outDir      : null
          , matchTotal  : 1
          , numMatches  : 500
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
            this.logSummary(Profiler.summary(), endTime - startTime)
        } finally {
            white.destroy()
            red.destroy()
            Profiler.resetAll()
        }
    }

    logSummary(summary, msTotal) {
        const names = Object.keys(summary)
        const maxNameLength = Math.max(...names.map(name => name.length))
        const maxValueLength = msTotal.toString().length
        names.sort()
        const hr = ''.padEnd(maxNameLength + maxValueLength + 4, '-')
        this.logger.info(hr)
        for (var name of names) {
            var elapsed = summary[name]
            this.logger.info(name.padEnd(maxNameLength, ' '), elapsed.toString().padStart(maxValueLength, ' '), 'ms')
        }
        this.logger.info(hr)
        this.logger.info('Total'.padEnd(maxNameLength, ' '), msTotal.toString().padStart(maxValueLength, ' '), 'ms')
    }
}

module.exports = Helper