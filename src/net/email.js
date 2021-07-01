/**
 * gameon - Email class
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
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const path    = require('path')

const DefaultType = 'mock'

class Email {

    static defaults(env) {
        return {
            fromName    : env.EMAIL_FROM_NAME    || 'Gameon'
          , fromAddress : env.EMAIL_FROM_ADDRESS || 'noreply@nowhere.example'
        }
    }

    constructor(impl, opts) {
        this.opts = Util.defaults(Email.defaults(process.env), opts)
        const Impl = require('./email/' + path.basename(impl))
        this.impl = new Impl(opts)
    }

    // standard is SES sendEmail structure
    // see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SES.html#sendEmail-property
    async send(params) {
        const source = this.opts.fromName + ' <' + this.opts.fromAddress + '>'
        params = {...params, ...{Source: source}}
        try {
            await this.impl.send(params)
        } catch (err) {
            throw new InternalError(err)
        }
    }
}

Email.DefaultType = DefaultType

class EmailError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
        this.isEmailError = true
    }
}

class InternalError extends EmailError {
    constructor(...args) {
        super(...args)
        this.isInternalError = true
        this.cause = args.find(arg => arg instanceof Error)
    }
}

Email.Errors = {
    EmailError
  , InternalError
}

module.exports = Email