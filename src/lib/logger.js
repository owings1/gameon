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
const Themes  = require('../term/themes')
const Util    = require('./util')
const chalk   = require('chalk')

const {stringWidth, stripAnsi} = Util

const Levels = {
   debug : 4
 , log   : 3
 , info  : 2
 , line  : 1
 , warn  : 1
 , error : 0
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

    static defaults() {
        return {
            server : false,
            named  : false,
            raw    : false,
            theme  : null,
        }
    }

    constructor(name, opts) {
        this.opts = Util.defaults(Logger.defaults(), opts)
        this.name = name || ''
        //this.opts.name = this.name
        this.theme = Themes.getSemiSafe(this.opts.theme)
        this.console = console
        this.init()
        this.loglevel = Levels[process.env.LOG_LEVEL || 'info']
    }

    get logLevel() {
        return this.loglevel
    }

    set logLevel(n) {
        this.loglevel = n
    }

    getMessageForError(err) {
        return [err.name || err.constructor.name, err.message].join(': ')
    }

    // Alias for .info
    success(...args) {
        return this.info(...args)
    }

    init() {

        Logging(this, {format: this.format.bind(this)})

        const {error, warn, line, info, log, debug} = this

        this._parent = Object.fromEntries(
            Object.keys(Levels).map(level =>
                [level, this[level].bind(this)]
            )
        )


        this.error = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    if ((this.opts.server && this.loglevel >= 0) || this.loglevel > 3) {
                        this.console.error(arg)
                    }
                    return this.getMessageForError(arg)
                }
                return arg
            })
            return this._parent.error(...args)
        }

        this.warn = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    return this.getMessageForError(arg)
                }
                return arg
            })
            return this._parent.warn(...args)
        }
    }

    format(ctx) {
        const parts = []
        const {opts} = this
        if (opts.raw) {
            parts.push(ctx.msg)
        } else {
            const type = stripAnsi(ctx.type)
            if (opts.server) {
                parts.push((new Date()).toISOString())
            }
            if (opts.named || opts.server) {
                parts.push('[' + this.name + ']')
            }
            parts.push(chalk[TypeColor[type]](type.toUpperCase()))
            parts.push(ctx.msg)
        }
        this.lastMessage = ctx.msg
        return parts.join(' ')
    }
}

module.exports = Logger