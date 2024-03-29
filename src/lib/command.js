/**
 * gameon - command base class for oclif
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
import {Command} from '@oclif/core'

import {createLogger} from './util.js'
import Menu from '../term/menu.js'

export class AppCommand extends Command {

    async init(..._args) {
        await super.init(..._args)
        this.logger = this.logger || createLogger(this)
        this.proc = this.proc || process
        this.env = this.env || this.proc.env
        const {flags, args, argv} = await this.parse(this.constructor)
        this.flags = flags
        this.args = args
        this.argv = argv
    }
}

export class UserCommand extends AppCommand {

    async init(...args) {
        await super.init(...args)
        await this._loadConfigs()
        this._loadProcHandlers()
        this.eraseScreenOnExit = true
    }

    async _loadConfigs() {
        this.menu = this.menu || new Menu(this._getConfigDir())
        await this.menu.loadSettings()
        await this.menu.loadCustomThemes(true)
        this.Settings = this.menu.settings
    }

    _loadProcHandlers() {
        // For some reason we need an interval otherwise somebody else is
        // exiting first. So we set it to 30mins
        this._hackIntervalId = setInterval(() => {}, 1800 * 1000)
        this._onResize = this._onResize.bind(this)
        this._onSigint = this._onSigint.bind(this)
        this.proc.on('SIGINT', this._onSigint)
        this.proc.stdout.on('resize', this._onResize)
    }

    _removeProcHandlers() {
        clearInterval(this._hackIntervalId)
        this.proc.removeListener('SIGINT', this._onSigint)
        this.proc.stdout.removeListener('resize', this._onResize)
    }

    _getConfigDir() {
        return Menu.getDefaultConfigDir()
    }

    _onResize() {
        this.logger.debug('resize handler')
        this.menu.emit('resize')
    }

    _onSigint() {
        this.logger.debug('SIGINT handler')
        let code
        try {
            code = this.menu.handleInterrupt()
        } catch (err) {
            this.logger.error(err)
            code = 1
        }
        if (code === true) {
            return
        }
        code = Math.abs(+code)
        if (isNaN(code) || code > 127) {
            code = 1
        }
        this._cleanup()
        this.proc.exit(code)
    }

    finally(e, ...args) {
        try {
            if (this.eraseScreenOnExit) {
                this.menu.eraseScreen()
            }
            if (this.menu.alerts.length) {
                this.menu.consumeAlerts()
            }
            if (e) {
                throw e
            }
        } catch (err) {
            this.logger.error(err)
        }
        this._cleanup()
        return super.finally(e, ...args)
    }

    _cleanup() {
        try {
            this._removeProcHandlers()
        } catch (err) {
            this.logger.error(err)
        }
        try {
            this.menu.destroy()
        } catch (err) {
            this.logger.warn(err)
        }
    }
}
