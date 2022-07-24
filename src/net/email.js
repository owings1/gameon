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
import AWS from 'aws-sdk'
import {merge} from '@quale/term/merging.js'
import {SMTPClient} from 'emailjs'
import fs from 'fs'
import process from 'process'
import {
    DefaultEmailFromAddress,
    DefaultEmailFromName,
    DefaultEmailType,
} from '../lib/constants.js'

import {InternalError} from '../lib/errors.js'

import {createLogger, defaults, induceBool} from '../lib/util.js'


export default class Email {

    /**
     * @param {object} env
     * @return {object}
     */
    static defaults(env) {
        return {
            fromName       : env.EMAIL_FROM_NAME    || DefaultEmailFromName,
            fromAddress    : env.EMAIL_FROM_ADDRESS || DefaultEmailFromAddress,
            connectTimeout : +env.EMAIL_CONNECTTIMEOUT || 60 * 1000,
            logAllMessages : induceBool(env.EMAIL_LOGALLMESSAGES),
        }
    }

    /**
     * @param {object} opts
     * @param {object} env
     * @return {Email}
     */
    static create(opts, env) {
        env = env || process.env
        const type = (opts && opts.emailType) || env.EMAIL_TYPE || DefaultEmailType
        const impl = new ImplClasses[type](opts)
        const email = new Email(impl, opts)
        email.type = type
        return email
    }

    /**
     * @param {Email} impl
     * @param {object} opts
     */
    constructor(impl, opts) {
        this.impl = impl
        this.opts = defaults(Email.defaults(process.env), opts)
        this.logger = createLogger(this, {type: 'server', inspect: {depth: 4}})
    }

    /**
     * @async
     * @param {object} params
     */
    async send(params) {
        // standard is SES sendEmail structure
        // see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SES.html#sendEmail-property
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

    /** @type {Number} */
    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
        this.impl.logLevel = n
    }
}

class MockEmail {

    static defaults(env) {
        return {}
    }

    constructor(opts) {
        this.opts = defaults(MockEmail.defaults(process.env), opts)
        this.lastEmail = null
    }

    async send(params) {
        this.lastEmail = params
    }
}

class SmtpEmail {

    static defaults(env) {
        return {
            host     : env.SMTP_HOST,
            port     : env.SMTP_PORT,
            user     : env.SMTP_USERNAME,
            password : env.SMTP_PASSWORD,
            helo     : env.SMTP_HELO,
            starttls : induceBool(env.SMTP_STARTTLS),
            tlsKeyFile  : env.SMTP_TLSKEY_FILE,
            tlsCertFile : env.SMTP_TLSCERT_FILE,
            tlsCaFile   : env.SMTP_TLSCA_FILE,
        }
    }

    constructor(opts) {
        this.logger = createLogger(this)
        opts = this.opts = merge(SmtpEmail.defaults(process.env), opts)
        const clientOpts = {
            host     : opts.host,
            port     : opts.port,
            user     : opts.user,
            password : opts.password,
            domain   : opts.helo,
            logger   : this.logger,
            timeout  : opts.connectTimeout,
        }
        if (opts.starttls) {
            clientOpts.tls = {}
            if (opts.tlsKeyFile) {
                this.logger.debug('Reading', {file: opts.tlsKeyFile})
                clientOpts.tls.key = fs.readFileSync(opts.tlsKeyFile)
            }
            if (opts.tlsCertFile) {
                this.logger.debug('Reading', {file: opts.tlsCertFile})
                clientOpts.tls.cert = fs.readFileSync(opts.tlsCertFile)
            }
            if (opts.tlsCaFile) {
                this.logger.debug('Reading', {file: opts.tlsCaFile})
                clientOpts.tls.ca = fs.readFileSync(opts.tlsCaFile)
            }
        }
        this.client = new SMTPClient(clientOpts)
    }

    async send(params) {
        // TODO: This will exit the process if the cert/key are invalid. See if
        //       we can catch that error earlier with:
        //       https://nodejs.org/dist/latest-v14.x/docs/api/tls.html#tls_tls_createsecurecontext_options
        return this.client.sendAsync({
            from    : params.Source,
            to      : params.Destination.ToAddresses.join(','),
            subject : params.Message.Subject.Data,
            text    : params.Message.Body.Text.Data,
        })
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
    }
}

class SesEmail {

    constructor(opts) {
        this.ses = new AWS.SES(SesEmail.getSesOpts(opts))
    }

    async send(params) {
        await this.ses.sendEmail(params).promise()
    }

    static getSesOpts(opts) {
        return {
            httpOptions: {
                connectTimeout: opts.connectTimeout
            }
        }
    }
}

const ImplClasses = {
    mock: MockEmail,
    ses: SesEmail,
    smtp: SmtpEmail,
}