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
import {Flags} from '@oclif/core'
import {AppCommand as Base} from '../../lib/command.js'
import {castToArray} from '@quale/core/types.js'
import {errMessage} from '../../lib/util.js'

import Auth from '../../net/auth.js'
import inquirer from '../../term/inquirer.js'

// TODO: option to read password from stdin

export default class AuthCreateCommand extends Base {

    async init(...args) {
        await super.init(...args)
        this.helper = this.helper || new Auth(this.env.AUTH_TYPE)
        this.inquirer = inquirer.createPromptModule()
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
            name    : 'password',
            message : 'Enter password',
            type    : 'password',
            validate : value => errMessage(() => this.helper.validatePassword(value))
        }
        const answers = await this.prompt(question)
        return answers.password
    }

    prompt(questions) {
        this._prompt = this.inquirer.prompt(castToArray(questions))
        return this._prompt
    }
}

AuthCreateCommand.description = `Create user`

AuthCreateCommand.flags = {
    username : Flags.string({
        char: 'u',
        description: 'username',
        required: true,
    }),
    password : Flags.string({
        char: 'p',
        description: 'password, default is to prompt',
    }),
    confirmed : Flags.boolean({
        char: 'c',
        description: 'create the user as confirmed',
    }),
    email : Flags.boolean({
       char: 'e',
       description: 'send the confirmation email',
    }),
    token : Flags.boolean({
       char: 't',
       description: 'output enrypted token only',
    }),
}

