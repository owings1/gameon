/**
 * gameon - Logger class
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
const Logging = require('better-logging')
const Util    = require('./util')
const chalk   = require('chalk')

const {merge} = Util
const Levels = {
   debug : 4
 , log   : 3
 , info  : 2
 , warn  : 1
 , error : 0
 , line  : 1
}

const TypeColor = {
   '[debug]' : 'grey'
 , '[log]'   : 'grey'
 , '[info]'  : 'grey'
 , '[warn]'  : 'yellow'
 , '[error]' : 'red'
 , '[line]'  : 'grey'
}

class Logger {

    static format(ctx) {
        return chalk.grey(Util.stripAnsi(ctx.type).toUpperCase()) + ' ' + ctx.msg
    }

    static getFormatServer(name) {
        return ctx => {
            name = name || ''
            const type = Util.stripAnsi(ctx.type)
            return [
                (new Date()).toISOString()
              , chalk[TypeColor[type]](type.toUpperCase())
              , '[' + name + ']'
              , ctx.msg
            ].join(' ')
        }
    }

    static defaults() {
        return {server: false}
    }

    constructor(name, opts) {
        this.name = name || ''
        this.opts = merge({}, Logger.defaults(), opts)
        this.opts.name = this.name
        Logger.logify(this, this.opts)
    }

    getStdout() {
        return this.stdout || process.stdout
    }

    writeStdout(str) {
        this.getStdout().write(str)
    }

    static logify(obj, opts) {
        opts = merge({}, Logger.defaults(), opts)
        Logging(obj, {
            format: opts.server ? Logger.getFormatServer(opts.name) : Logger.format
        })
        obj.loglevel = Levels[process.env.LOG_LEVEL || 'info']
        obj.logLevel = obj.loglevel
        obj.console = console
        const oldError = obj.error
        obj.error = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    if (opts.server && obj.loglevel >= 0) {
                        obj.console.error(arg)
                    }
                    return [arg.name || arg.constructor.name, arg.message].join(': ')
                }
                return arg
            })
            return oldError.call(obj, ...args)
        }
        return obj
    }
}

module.exports = Logger