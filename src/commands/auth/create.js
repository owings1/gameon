/**
 * gameon - auth:create command
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
const Base    = require('../../lib/command').AppCommand

const Auth     = require('../../net/auth')
const Logger   = require('../../lib/logger')
const Util     = require('../../lib/util')
const inquirer = require('inquirer')

// TODO: option to read password from stdin

class AuthCreateCommand extends Base {

    async init(...args) {
        await super.init(...args)
        this.helper = this.helper || new Auth(this.env.AUTH_TYPE)
    }

    async run() {
        const {flags} = this
        this.helper.validateUsername(flags.username)
        if (!flags.password) {
            flags.password = await this.promptPassword()
        }
        const user = await this.helper.createUser(flags.username, flags.password, flags.confirmed)
        if (!flags.confirmed && flags.email) {
            await this.helper.sendConfirmEmail(flags.username)
        }
        if (flags.token) {
            this.logger.info('Token:', user.passwordEncrypted)
        } else {
            this.logger.info('Created user', flags.username)
        }
    }

    async promptPassword() {
        const question = {
            name    : 'password'
          , message : 'Enter password'
          , type    : 'password'
          , validate : value => Util.errMessage(() => this.helper.validatePassword(value))
        }
        const answers = await this.prompt(question)
        return answers.password
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }
}

AuthCreateCommand.description = `Create user`

AuthCreateCommand.flags = {
    username : flags.string({
        char: 'u'
      , description: 'username'
      , required: true
    })
  , password : flags.string({
        char: 'p'
      , description: 'password, default is to prompt'
    })
  , confirmed : flags.boolean({
        char: 'c'
      , description: 'create the user as confirmed'
    })
  , email : flags.boolean({
       char: 'e'
     , description: 'send the confirmation email'
    })
  , token : flags.boolean({
       char: 't'
     , description: 'output enrypted token only'
    })
}

module.exports = AuthCreateCommand
