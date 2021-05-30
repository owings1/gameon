/**
 * gameon - Robot Dataset Helper class
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

const {Game, Board, Colors} = Core
const {White, Red} = Colors

class Helper {

    static defaults() {
        return {
            numGames : 100
          , outDir   : null
          , delim    : 0
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(Helper.defaults(), opts)
        this.outDir = resolve(this.opts.outDir)
        this.logger = new Logger
    }

    newBestRobot(...args) {
        return Robot.RobotDelegator.forDefaults(...args)
    }

    async run() {

        const {opts, outDir} = this

        await fse.ensureDir(outDir)
        const players = {
            White : this.newBestRobot(White)
          , Red   : this.newBestRobot(Red)
        }

        const turnDatas = []

        const parr = Object.values(players)

        parr.forEach(player => player.on('turnData', (turn, data) => {
            turnDatas.push(data)
        }))

        try {
            const gamesDir = resolve(outDir, 'games')
            const trainDir = resolve(outDir, 'train')
            await fse.ensureDir(gamesDir)
            await fse.ensureDir(trainDir)
            const coordinator = new Coordinator
            for (var i = 0; i < opts.numGames; i++) {
                var g = i + 1
                var game = new Game
                var gameFile = resolve(gamesDir, this.gameFilename(game, g))
                var trainFile = resolve(trainDir, this.gameFilename(game, g))
                this.logger.info('Running game', i + 1)
                await coordinator.runGame(players, game)
                this.logger.info('Writing turn data')
                await fse.writeJson(gameFile, turnDatas, {spaces: 2})
                this.logger.info('Writing train data')
                await fse.writeJson(trainFile, this.prepTurnsData(turnDatas), {spaces: 2})
                turnDatas.splice(0)
            }
            this.logger.info('Done')
        } finally {
            await Promise.all(parr.map(player => player.destroy()))
        }
    }

    prepTurnsData(turnDatas) {
        const trains = []
        turnDatas.forEach(({startState, rankings}) => {
            const spreadRankings = Util.spreadRanking(rankings)
            const startStructure = Board.fromStateString(startState).stateStructure()
            const startPos = startStructure.map(i => 1 / (i + 15))
            const startSpread = Util.spreadRanking(startStructure)
            Object.entries(rankings).forEach(([endState, score]) => {
                const endStructure = Board.fromStateString(endState).stateStructure()
                const endPos = endStructure.map(i => 1 / (i + 15))
                const endSpread = Util.spreadRanking(endStructure)
                const scoreSpread = spreadRankings[endState]
                trains.push({
                    input  : startPos.concat(endPos)
                  , output : scoreSpread
                })
            })
        })
        return trains
    }

    gameFilename(game, g) {
        //return 'game.json'
        //return ['game', g.toString().padStart(this.opts.numGames.toString().length, '0'), game.uuid].join('_') + '.json'
        return ['game', g.toString().padStart(this.opts.numGames.toString().length, '0')].join('_') + '.json'
    }


}

module.exports = {
    Helper
}