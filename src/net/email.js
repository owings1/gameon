const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const {merge} = Util
const path    = require('path')

const DefaultType = 'ses'

class Email {

    defaults(env) {
        return {
            fromName    : env.EMAIL_FROM_NAME    || 'Gameon'
          , fromAddress : env.EMAIL_FROM_ADDRESS || 'noreply@nowhere.example'
        }
    }

    constructor(impl, opts) {
        this.opts = merge({}, this.defaults(process.env), opts)
        this.source = this.opts.fromName + ' <' + this.opts.fromAddress + '>'
        const Impl = require('./email/' + path.basename(impl))
        this.impl = new Impl(this.opts)
        
    }

    // standard is SES sendEmail structure
    // see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SES.html#sendEmail-property
    async send(params) {
        params = merge({}, params, {Source: this.source})
        await this.impl.send(params)
    }
}

Email.DefaultType = DefaultType

class EmailError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
        this.isEmailError = true
    }
}

class InternalError extends EmailError {
    constructor(...args) {
        super(...args)
        this.cause = args.find(arg => arg instanceof Error)
    }
}

Email.Errors = {
    EmailError
  , InternalError
}

module.exports = Email