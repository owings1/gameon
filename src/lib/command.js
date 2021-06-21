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
const {Command} = require('@oclif/command')

const Logger = require('./logger')
const Menu   = require('../term/menu')

class AppCommand extends Command {

    async init(..._args) {
        await super.init(..._args)
        this.logger = this.logger || new Logger
        this.env = this.env || process.env
        const {flags, args} = this.parse(this.constructor)
        this.flags = flags
        this.args = args
    }
}

class UserCommand extends AppCommand {

    async init(...args) {
        await super.init(...args)
        await this._loadConfigs()
    }

    async _loadConfigs() {
        this.menu = this.menu || new Menu(this._getConfigDir())
        await this.menu.loadSettings()
        await this.menu.loadCustomThemes(true)
        this.Settings = this.menu.settings
    }

    _getConfigDir() {
        return Menu.getDefaultConfigDir()
    }
}

module.exports = {
    AppCommand
  , UserCommand
}