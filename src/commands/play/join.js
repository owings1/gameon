/**
 * gameon - play:join command
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
const Base    = require('../../lib/command').UserCommand

class PlayJoinCommand extends Base {

    async run() {
        try {
            await this.menu.joinMenu()
        } catch (err) {
            if (err.isAuthError) {
                this.logger.warn(err)
                this.logger.error('Authentication error, go to Account to sign up or log in.')   
                return
            }
            throw err
        }
    }
}

PlayJoinCommand.aliases = ['join']

PlayJoinCommand.description = `Join an online match`

PlayJoinCommand.flags = {
    id : flags.string({
        char: 'i'
      , description: 'match id to join'
    })
}

//MatchJoinCommand.args = [
//    {name: 'matchId'}
//]


module.exports = PlayJoinCommand