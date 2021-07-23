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

    static defaults() {
        return {server: false, named: false, raw: false, theme: null/*, maxWidth: Infinity*/}
    }

    constructor(name, opts) {
        this.opts = Util.defaults(Logger.defaults(), opts)
        this.name = name || ''
        this.opts.name = this.name
        if (this.opts.theme) {
            this.theme = Themes.getInstance(this.opts.theme)
        } else {
            this.theme = Themes.getDefaultInstance()
        }
        Logger.logify(this, this.opts)
    }

    getStdout() {
        return this.stdout || process.stdout
    }

    writeStdout(str) {
        this.getStdout().write(str)
        return this
    }

    getMessageForError(err) {
        return [err.name || err.constructor.name, err.message].join(': ')
    }

    success(...args) {
        return this.info(...args)
    }

    static logify(obj, opts) {
        opts = {...opts}
        if (opts.server) {
            var format = Logger.getFormatServer(obj)
        } else if (opts.named) {
            var format = Logger.getFormatNamed(obj)
        } else if (opts.raw) {
            var format = Logger.getFormatRaw(obj)
        } else {
            var format = Logger.format
        }
        Logging(obj, {format})

        obj.loglevel = Levels[process.env.LOG_LEVEL || 'info']

        obj.console = console
        obj._parentError = obj.error
        obj._parentWarn = obj.warn
        obj.error = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    if ((opts.server && obj.loglevel >= 0) || obj.loglevel > 3) {
                        obj.console.error(arg)
                    }
                    return obj.getMessageForError(arg)
                }
                return arg
            })
            return obj._parentError(...args)
        }
        obj.warn = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    return obj.getMessageForError(arg)
                }
                return arg
            })
            return obj._parentWarn(...args)
        }
        return obj
    }

    static format(ctx) {
        return chalk.grey(stripAnsi(ctx.type).toUpperCase()) + ' ' + ctx.msg
    }

    static getFormatServer(obj) {
        return ctx => {
            const name = obj.name || ''
            const type = stripAnsi(ctx.type)
            return [
                (new Date()).toISOString()
              , chalk[TypeColor[type]](type.toUpperCase())
              , '[' + name + ']'
              , ctx.msg
            ].join(' ')
        }
    }

    static getFormatNamed(obj) {
        return ctx => {
            const name = obj.name || ''
            const type = stripAnsi(ctx.type)
            return [
                chalk[TypeColor[type]](type.toUpperCase())
              , '[' + name + ']'
              , ctx.msg
            ].join(' ')
        }
    }

    static getFormatRaw(obj) {
        return ctx => {
            obj.lastMessage = ctx.msg
            return ctx.msg
        }
    }
}

module.exports = Logger