const Logging = require('better-logging')
const Util    = require('./util')
const chalk   = require('chalk')

const Levels = {
   debug : 4
 , log   : 3
 , info  : 2
 , warn  : 1
 , error : 0
 , line  : 1
}

class Logger {

    static format(ctx) {
        return chalk.grey(Util.stripAnsi(ctx.type).toUpperCase()) + ' ' + ctx.msg
    }

    constructor() {
        Logger.logify(this)
    }

    getStdout() {
        return this.stdout || process.stdout
    }

    writeStdout(str) {
        this.getStdout().write(str)
    }

    static logify(obj) {
        Logging(obj, {
            format: Logger.format
        })
        obj.loglevel = Levels[process.env.LOG_LEVEL || 'info']
        const oldError = obj.error
        obj.error = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
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