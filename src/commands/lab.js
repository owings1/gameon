/**
 * gameon - lab command
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
const {Command, flags} = require('@oclif/command')
const {Board}  = require('../lib/core')
const {Colors, BoardStrings} = require('../lib/constants')
const {InvalidColorError} = require('../lib/errors')
const Logger = require('../lib/logger')
const Helper = require('../term/lab')
const fs = require('fs')
const fse = require('fs-extra')
const os = require('os')
const path = require('path')

class LabCommand extends Command {

    async init() {
        const {flags} = this.parse(LabCommand)
        this.flags = flags
        this.logger = new Logger
        const stateString = await this.getInitialState()//this.flags.board || BoardStrings.Initial
        const board = Board.fromStateString(stateString)
        board.analyzer.validateLegalBoard()
        const persp = await this.getInitialPersp()
        if (!Colors[persp]) {
            throw new InvalidColorError('Invalid color: ' + persp)
        }
        this.opts = {
            board
          , persp
          , interactive: !!this.flags.interactive
        }
        this.helper = new Helper(this.opts)
    }

    async run() {
        if (this.opts.interactive) {
            return this.runInteractive()
        } else {
            return this.runNonInteractive()
        }
    }

    async runInteractive() {
        await this.helper.interactive()
        try {
            await this.saveLastState()
        } catch (err) {
            this.logger.debug(err)
            this.logger.error('Failed to save board state:', err.message)
        }
    }

    async runNonInteractive() {
        this.helper.draw(true)
    }

    async getInitialPersp() {
        if (this.flags.persp) {
            return this.flags.persp
        }
        const data = await this.fetchLastData()
        if (data.persp && Colors[data.persp]) {
            return Colors[data.persp]
        }
        return Colors.White
    }

    async getInitialState() {
        if (this.flags.state) {
            return this.flags.state
        }
        const data = await this.fetchLastData()
        if (data.lastState) {
            try {
                const board = Board.fromStateString(data.lastState)
                board.analyzer.validateLegalBoard()
                this.logger.info('Loaded initial state')
                return board.state28()
            } catch (err) {
                this.logger.debug(err)
                this.logger.warn('Failed to load last board:', err.message)
                delete this._lastState.lastState
            }
        }
        return BoardStrings.Initial
    }
    async fetchLastData() {
        if (!this._lastState) {
            const stateFile = this.getSaveStateFile()
            this._lastState = {}
            if (fs.existsSync(stateFile)) {
                try {
                    const data = await fse.readJson(stateFile)
                    this._lastState = data
                } catch (err) {
                    this.logger.debug(err)
                    this.logger.error('Failed to load saved state:', err.message)
                }
            }
        }
        return this._lastState
    }

    async saveLastState() {
        const stateFile = this.getSaveStateFile()
        const data = {
            lastState : this.helper.board.state28()
          , persp     : this.helper.persp
        }
        await fse.writeJson(stateFile, data, {spaces: 2})
    }

    getSaveStateFile() {
        return path.resolve(os.homedir(), '.gameon/lab.json')
    }
}

LabCommand.description = `Run performance profiling`

LabCommand.flags = {
    state: flags.string({
        char        : 's'
      , description : 'board state string'
    })
  , persp: flags.string({
        char        : 'p'
      , description : 'perspective'
    })
  , interactive: flags.boolean({
        char        : 'i'
      , description : 'interactive mode'
    })
}

module.exports = LabCommand
