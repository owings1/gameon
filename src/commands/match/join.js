/**
 * gameon - match:join command
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

const Logger = require('../../lib/logger')
const Menu = require('../../term/menu')

class MatchJoinCommand extends Command {

    async init() {
        const {flags, args} = this.parse(this.constructor)
        this.flags = flags
        this.args = args
        this.helper = this.helper || new Menu(this.getConfigDir())
        this.logger = new Logger
    }

    async run() {
        try {
            await this.helper.joinMenu()
        } catch (err) {
            if (err.isAuthError) {
                this.logger.warn(err)
                this.logger.error('Authentication error, go to Account to sign up or log in.')   
                return
            }
            throw err
        }
    }

    getConfigDir() {
        return Menu.getDefaultConfigDir()
    }
}

MatchJoinCommand.aliases = ['join']

MatchJoinCommand.description = `Join an online match`

MatchJoinCommand.flags = {
    id : flags.string({
        char: 'i'
      , description: 'match id to join'
    })
}

//MatchJoinCommand.args = [
//    {name: 'matchId'}
//]


module.exports = MatchJoinCommand
