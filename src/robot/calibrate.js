/**
 * gameon - Robot Calibrate Helper class
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
const Constants   = require('../lib/constants')
const Core        = require('../lib/core')
const Logger      = require('../lib/logger')
const Robot       = require('./player')
const Util        = require('../lib/util')

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')
const {sp} = Util

const {resolve} = path

const {Match, Board, Colors} = Constants
const {White, Red} = Colors

const {ConfidenceRobot} = Robot
const {RobotDelegator} = Robot

const E_Action = {
    Run      : 'run'
  , Generate : 'generate'
}

class Helper {

    static defaults() {
        return {
            action      : E_Action.Run
          , outDir      : null
          , chunkFile   : null
          , matchTotal  : 100
          , startWeight : 0.1
          , endWeight   : 1.0
          , increment   : 0.1
          , chunkSize   : 1000
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(Helper.defaults(), opts)
        this.outDir = resolve(this.opts.outDir)
        this.casesDir = resolve(this.outDir, 'cases')
        this.chunksDir = resolve(this.outDir, 'chunks')
        this.casePad = null
        this.caseNumber = null
        this.bestCases = null
        this.logger = new Logger
        this.coordinator = new Coordinator
    }

    async run() {
        await this.runAction(this.opts.action)
    }

    runAction(action) {
        switch (action) {
            case E_Action.Generate:
                return this.actionGenerate()
            case E_Action.Run:
                return this.actionRun()
            default:
                throw new UnknownActionError('Unknown action ' + action)
        }
    }

    async actionGenerate() {
        await fse.ensureDir(this.chunksDir)
        this.logger.info('Generating configs cases')
        const configsCases = this.generateConfigsCases()
        const numCases = configsCases.length
        this.logger.info('Generated', numCases, 'cases')
        const numChunks = Math.ceil(numCases / this.opts.chunkSize)
        this.logger.info('Writing', numChunks, 'chunk files')
        const chunks = Util.chunkArray(configsCases, numChunks)
        const chunkPad = numChunks.toString().length
        const casePad = numCases.toString().length
        var chunkNumber = 1
        while (chunks.length > 0) {
            var chunk = chunks.shift()
            var chunkFile = this.getChunkFile(chunkNumber, chunkPad)
            await fse.writeJson(
                chunkFile
              , {
                    chunkNumber
                  , numChunks
                  , chunkPad
                  , numCases
                  , casePad
                  , matchTotal   : this.opts.matchTotal
                  , configsCases : chunk
                }
              , {spaces: 2}
            )
            chunkNumber += 1
        }
        this.logger.info('Done')
    }

    async actionRun() {
        await fse.ensureDir(this.casesDir)
        this.logger.info('Reading data file')
        const chunkFile = resolve(this.chunksDir, this.opts.chunkFile)
        const {configsCases, chunkNumber, chunkPad, numCases, casePad, matchTotal} = await fse.readJson(chunkFile)
        this.logger.info('Running', configsCases.length, 'cases of', numCases, 'total as chunk', chunkNumber)
        await this.runConfigsCases({configsCases, casePad, matchTotal, chunkNumber, chunkPad})
    }

    async runConfigsCases({configsCases, casePad, matchTotal, chunkNumber, chunkPad}) {
        this.bestMargin = 0
        this.bestCases = []
        while (configsCases.length > 0) {
            var {configs, caseNumber} = configsCases.shift()
            this.logger.info('Running case', caseNumber)
            var startTime = +new Date
            var {match, players} = await this.runConfigsCase({configs, matchTotal})
            var durationMillis = +new Date - startTime
            this.logger.info('Case', caseNumber, 'took', durationMillis, 'milliseconds')
            await this.handleCaseResult({configs, players, caseNumber, match, casePad})
        }
        const bestCasesFile = this.getBestCasesFile(chunkNumber, chunkPad)
        this.logger.info('Writing', this.bestCases.length, 'best cases')
        await fse.writeJson(bestCasesFile, this.bestCases, {spaces: 2})
    }

    async runConfigsCase({configs, matchTotal}) {

        const players = {
            White : this.newBaselineRobot(White)
          , Red   : this.newVariableRobot(configs, Red)
        }

        const match = this.newMatch(matchTotal)

        const startTime = +new Date
        await this.coordinator.runMatch(match, players.White, players.Red)

        await Promise.all(Object.values(players).map(player => player.destroy()))
        return {match, players}
    }

    async handleCaseResult({configs, players, caseNumber, match, casePad}) {

        const caseDir = this.getCaseDir(caseNumber, casePad)
        const caseFile = resolve(caseDir, 'case.json')
        const matchFile = resolve(caseDir, 'match.json')

        const margin = match.scores.Red - match.scores.White

        const caseInfo = {caseNumber, margin, match: match.meta(), configs}

        if (match.getWinner() == Red) {
            const winStr = sp('Case', caseNumber, 'wins by', margin)
            if (margin < this.bestMargin) {
                this.logger.info(winStr, 'but not the best')
            } else if (margin > this.bestMargin) {
                this.logger.info(winStr, 'BEST so far')
                this.bestCases.splice(0)
                this.bestCases.push(caseInfo)
                this.bestMargin = margin
            } else {
                this.logger.info(winStr, 'TIE for best')
                this.bestCases.push(caseInfo)
            }
            if (margin == this.bestMargin) {
                await fse.ensureDir(caseDir)
                await Promise.all([
                    fse.writeJson(caseFile, caseInfo, {spaces: 2})
                  , this.coordinator.recordMatch(match, matchFile, players)
                ])
            }
        } else {
            this.logger.info("Case", caseNumber, "loses by", Math.abs(margin))
        }
    }

    generateConfigsCases() {
        const {opts} = this

        const names = RobotDelegator.listClassNames().filter(name =>
            ConfidenceRobot.getClassMeta(name).isCalibrate
        )
        const version = 'v1' // TODO: multiple versions

        const configsCases = []
        const weights = names.map(() => opts.startWeight)
        var caseNumber = 0
        do {
            caseNumber += 1
            configsCases.push({
                caseNumber
              , configs: names.map((name, i) => {
                    return {name, version, moveWeight: weights[i], doubleWeight: 0}
                })
            })
        } while (Util.arrayIncrement(weights, opts.increment, opts.startWeight, opts.endWeight))
        return configsCases
    }

    getCaseDir(caseNumber, casePad) {
        return resolve(this.casesDir, caseNumber.toString().padStart(casePad, '0'))
    }

    getChunkFile(chunkNumber, chunkPad) {
        return resolve(this.chunksDir, ['chunk_', chunkNumber.toString().padStart(chunkPad, '0'), '.json'].join(''))
    }

    getBestCasesFile(chunkNumber, chunkPad) {
        return resolve(this.outDir, ['bestCases_', chunkNumber.toString().padStart(chunkPad, '0'), '.json'].join(''))
    }

    newMatch(matchTotal) {
        return new Match(matchTotal)
    }

    newBaselineRobot(...args) {
        return RobotDelegator.forDefaults(...args)
    }

    newVariableRobot(configs, ...args) {
        return RobotDelegator.forConfigs(configs.concat(this.getFixedConfigs()), ...args)
    }

    getFixedConfigs() {
        return RobotDelegator.getDefaultConfigs().filter(config => !config.isCalibrate)
    }
}

class UnknownActionError extends Error {

    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

Helper.E_Action = E_Action

module.exports = {Helper}