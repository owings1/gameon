/**
 * gameon - Menu alerts helper
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
const Errors = require('../../lib/errors')
const Util   = require('../../lib/util')

const {ProgrammerError} = Errors
const {update} = Util

const {EventEmitter} = require('events')

const LevelsMap = {
    success : {
        logLevel     : 'info'
      , isPrintLevel : false
    }
  , info    : {
        logLevel     : 'info'
      , isPrintLevel : false
    }
  , warn    : {
        logLevel     : 'warn'
      , levelString  : '[WARN]'
      , isPrintLevel : true
    }
  , error   : {
        logLevel     : 'error'
      , levelString  : '[ERROR]'
      , isPrintLevel : true
    }
}

const DefaultLevel = 'warn'

class Alerts extends EventEmitter {

    constructor(menu) {
        super()
        this.menu = menu
        this.alerts = []
    }

    info(...args) {
        return this.level('info', ...args)
    }

    warn(...args) {
        return this.level('warn', ...args)
    }

    error(...args) {
        return this.level('error', ...args)
    }

    success(...args) {
        return this.level('success', ...args)
    }

    level(level, ...args) {
        const obj = this.buildObject(level, args)
        if (obj.error) {
            this.lastError = obj.error
        }
        this.alerts.push(obj)
        this.emit('log', level, obj)
        this.emit('log.' + level, obj)
        return this
    }

    async consume(cb) {
        const alerts = this.splice(0)
        const ret = []
        try {
            for (var alert = alerts.shift(); alert || alerts.length; alert = alerts.shift()) {
                if (!alert) {
                    continue
                }
                if (!alert.isLogObj) {
                    alert = this.buildObject(null, alert)
                }
                if (cb) {
                    await cb(alert)
                }
                ret.push(alert)
            }
        } finally {
            if (alerts.length) {
                this.alerts = alerts
            }
        }
        return ret
    }

    getErrors() {
        return this.alerts.map(it => it.errors).flat()
    }

    buildObject(level, args) {

        level = (level in LevelsMap) ? level : DefaultLevel

        const chlk = this.chlk[level]
        const {logLevel, isPrintLevel} = LevelsMap[level]
        let {levelString} = LevelsMap[level]

        const messages = args.map(arg => this.buildStringForArg(arg))

        const parts = messages.slice(0)

        const fmt = {
            messages: messages.map(msg => chlk.message(msg))
        }
        fmt.parts = fmt.messages.slice(0)
        
        if (isPrintLevel) {
            update(fmt, {
                level       : chlk.level(level)
              , levelString : chlk.level(levelString)
            })
            parts.unshift(levelString)
            fmt.parts.unshift(fmt.levelString)
        } else {
            levelString = null
        }

        const errors = args.filter(arg => arg instanceof Error)

        const joiner = chlk.message(' ')
        return {
            level
          , levelString
          , logLevel
          , errors
          , messages
          , parts
          , message : messages.join(' ')
          , string  : parts.join(' ')
          , error   : errors[0]
          , formatted : {
                ...fmt
              , joiner
              , message : fmt.messages.join(joiner)
              , string  : fmt.parts.join(joiner)
            }
          , isLogObj : true
        }
    }

    buildStringForArg(arg) {
        if (arg instanceof Error) {
            return [arg.name || arg.constructor.name, arg.message].join(': ')
        }
        if (typeof arg == 'object') {
            if (arg.constructor == Object) {
                try {
                    return JSON.stringify(arg)
                } catch (err) {
                    
                }
            }
        }
        return String(arg)
    }

    get chlk() {
        return this.menu.theme.alert
    }

    get length() {
        return this.alerts.length
    }
}

const Methods = [
    'concat'
  , 'copyWithin'
  , 'entries'
  , 'every'
  , 'fill'
  , 'filter'
  , 'find'
  , 'findIndex'
  , 'flat'
  , 'flatMap'
  , 'forEach'
  , 'includes'
  , 'indexOf'
  , 'join'
  , 'keys'
  , 'lastIndexOf'
  , 'map'
  , 'pop'
  , 'push'
  , 'reduce'
  , 'reduceRight'
  , 'reverse'
  , 'shift'
  , 'slice'
  , 'some'
  , 'sort'
  , 'splice'
  , 'toLocaleString'
  , 'toString'
  , 'unshift'
  , 'values'
]

const Overrides = {
    toLocaleString : true
  , toString       : true
}

Methods.forEach(method => {
    if (!Overrides[method] && (method in Alerts.prototype)) {
        throw new ProgrammerError(`Class ${Alerts.name} prototype already has property ${method}`)
    }
    Alerts.prototype[method] = function(...args) {
        return this.alerts[method](...args)
    }
})

module.exports = Alerts