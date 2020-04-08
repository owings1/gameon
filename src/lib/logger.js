const Logging = require('better-logging')

const chalk     = require('chalk')
const stripAnsi = require('strip-ansi')

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
        return chalk.grey(stripAnsi(ctx.type).toUpperCase()) + ' ' + ctx.msg
    }

    constructor() {
        Logging(this, {
            format: Logger.format
        })
        this.loglevel = Levels[process.env.LOG_LEVEL || 'info']
        const oldError = this.error
        this.error = (...args) => {
            args = args.map(arg => {
                if (arg instanceof Error) {
                    return [arg.name || arg.constructor.name, arg.message].join(': ')
                }
                return arg
            })
            return oldError.call(this, ...args)
        }
    }

    getStdout() {
        return this.stdout || process.stdout
    }

    writeStdout(str) {
        this.getStdout().write(str)
    }
}

module.exports = Logger