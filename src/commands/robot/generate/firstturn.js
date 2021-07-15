/**
 * gameon - Generate FirstTurnRobot static data.
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
const {flags} = require('@oclif/command')
const Base    = require('../../../lib/command').AppCommand
const {Board} = require('../../../lib/core')
const Robot   = require('../../../robot/robots/first-turn')

const path = require('path')
const {resolve} = path

const fse = require('fs-extra')

const ResDir = resolve(__dirname, '../../../robot/robots/res')

class FirstTurnGenerate extends Base {

    async run() {
        const file = this.flags.output
        const board = new Board
        const source = resolve(ResDir, 'first-turn.source')
        this.logger.info('Loading source', path.basename(source))
        const pointMoves = require(source)
        this.logger.info('Generating index')
        const data = Robot.generateMoveIndex(pointMoves, board)
        this.logger.info('Writing to', file)
        await fse.ensureDir(path.dirname(file))
        await fse.writeJson(file, data, {spaces: 2})
        this.logger.info('Done')
    }
}

FirstTurnGenerate.description = `Generate FirstTurnRobot static data`

FirstTurnGenerate.flags = {
    output: flags.string({
        char        : 'o'
      , description : 'output file'
      , default     : resolve(ResDir, 'first-turn.config.json')
    })
}

module.exports = FirstTurnGenerate
