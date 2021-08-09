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
const {
    DefaultEmailFromAddress,
    DefaultEmailFromName,
    DefaultEmailType,
} = require('../lib/constants')

const {InternalError} = require('../lib/errors')

const {createLogger, defaults} = require('../lib/util')

const ImplClasses = {
    get mock() { return require('./email/mock') },
    get ses()  { return require('./email/ses') },
}

class Email {

    static defaults(env) {
        return {
            fromName       : env.EMAIL_FROM_NAME    || DefaultEmailFromName
          , fromAddress    : env.EMAIL_FROM_ADDRESS || DefaultEmailFromAddress
          , connectTimeout : +env.EMAIL_CONNECTTIMEOUT || 60 * 1000
          , logAllMessages : !!env.EMAIL_LOGALLMESSAGES
        }
    }

    static create(opts, env) {
        env = env || process.env
        const type = (opts && opts.emailType) || env.EMAIL_TYPE || DefaultEmailType
        const impl = new ImplClasses[type](opts)
        const email = new Email(impl, opts)
        email.type = type
        return email
    }

    constructor(impl, opts) {
        this.impl = impl
        this.opts = defaults(Email.defaults(process.env), opts)
        this.logger = createLogger(this, {type: 'server'})
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
        } finally {
            if (this.opts.logAllMessages) {
                this.logger.info(params)
            }
        }
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
        this.impl.logLevel = n
    }
}

module.exports = Email