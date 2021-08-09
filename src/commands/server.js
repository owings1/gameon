/**
 * gameon - server command
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
const Base    = require('../lib/command').AppCommand

const Server = require('../net/server')

class ServerCommand extends Base {

    async init(...args) {
        await super.init(...args)
        this.server = this.server || new Server
        this._loadProcHandlers()
    }

    async run() {
        await this.server.listen(this.getHttpPort(), this.getMetricsPort())
    }

    getHttpPort() {
        return this.flags.port || this.env.HTTP_PORT || 8080
    }

    getMetricsPort() {
        return this.flags.metricsPort || this.env.METRICS_PORT || 8181
    }

    _loadProcHandlers() {
        this._onSigint = this._onSigint.bind(this)
        this.proc.on('SIGINT', this._onSigint)
    }

    _removeProcHandlers() {
        this.proc.removeListener('SIGINT', this._onSigint)
    }

    _onSigint() {
        this.logger.debug('SIGINT handler')
        this._cleanup()
        this.proc.exit(0)
    }

    _cleanup() {
        try {
            this._removeProcHandlers()
        } catch (err) {
            this.logger.error(err)
        }
        try {
            this.server.close()
        } catch (err) {
            this.logger.warn(err)
        }
    }
}

ServerCommand.description = `Server entrypoint`

ServerCommand.flags = {
    'http-port' : flags.string({
        char        : 'p'
      , description : 'the port to listen on. default is env HTTP_PORT or 8080'
    }),
    'metrics-port' : flags.string({
        char        : 'm'
      , description : 'the port for metrics, default is METRICS_PORT or 8181'
    })
}

module.exports = ServerCommand
