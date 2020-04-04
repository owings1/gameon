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

    constructor() {
        Logging(this, {
            format: ctx => chalk.grey(stripAnsi(ctx.type).toUpperCase()) + ' ' + ctx.msg
        })
        this.loglevel = Levels[process.env.LOG_LEVEL || 'info']
    }
}

module.exports = Logger