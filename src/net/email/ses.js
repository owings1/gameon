const Email   = require('../Email')
const Logger = require('../../lib/logger')
const Util   = require('../../lib/util')

const AWS = require('aws-sdk')
const {merge} = Util
const path = require('path')

const {InternalError} = Email.Errors

class SesEmail {

    defaults(env) {
        return {
            
        }
    }

    constructor(opts) {
        this.opts = merge({}, this.defaults(process.env), opts)
        this.ses = new AWS.SES()
    }

    async send(params) {
        try {
            await this.ses.sendEmail(params).promise()
        } catch (err) {
            throw new InternalError(err)
        }
    }
}

module.exports = SesEmail