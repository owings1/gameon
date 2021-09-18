/**
 * gameon - SmtpEmail class
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
const {merging: {merge}} = require('@quale/term')
const {createLogger, induceBool} = require('../../lib/util.js')
const {SMTPClient, Message} = require('emailjs')

const fs = require('fs')

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

module.exports = SmtpEmail