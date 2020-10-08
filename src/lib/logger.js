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
        const oldError = obj.error
        obj.error = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    if (opts.server) {
                        console.error(arg)
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