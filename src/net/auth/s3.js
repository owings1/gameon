const Auth   = require('../auth')
const Logger = require('../../lib/logger')
const Util   = require('../../lib/util')

const AWS = require('aws-sdk')
const {merge} = Util
const path = require('path')

const {InternalError}       = Auth.Errors
const {NotImplementedError} = Auth.Errors
const {UserNotFoundError}   = Auth.Errors

class S3Auth {

    defaults() {
        return {
            s3_bucket : process.env.AUTH_S3_BUCKET  || ''
          , s3_prefix : process.env.AUTH_S3_PREFIX || 'users/'
        }
    }

    constructor(opts){
        this.opts = merge({}, this.defaults(), opts)
        this.s3 = new AWS.S3()
    }

    async createUser(username, user) {
        return this.updateUser(username, user)
    }

    async readUser(username) {
        const params = {
            Bucket      : this.opts.s3_bucket
          , Key         : this._userKey(username)   
        }
        try {
            const result = await this.s3.getObject(params).promise()
            return JSON.parse(result.Body)
        } catch (err) {
            if (err.statusCode == 404) {
                throw new UserNotFoundError
            } else {
                throw new InternalError(err)
            }
        }
    }

    async updateUser(username, user) {
        const params = {
            Bucket      : this.opts.s3_bucket
          , Key         : this._userKey(username)
          , Body        : Buffer.from(JSON.stringify(user, null, 2))
          , ContentType : 'application/json'
        }
        try {
            await this.s3.putObject(params).promise()
        } catch (err) {
            throw new InternalError(err)
        }
    }

    async deleteUser(username) {
        const params = {
            Bucket : this.opts.s3_bucket
          , Key    : this._userKey(username)   
        }
        try {
            await this.s3.deleteObject(params).promise()
        } catch (err) {
            throw new InternalError(err)
        }
    }

    async userExists(username) {
        const params = {
            Bucket : this.opts.s3_bucket
          , Key    : this._userKey(username)   
        }
        try {
            await this.s3.headObject(params).promise()
        } catch (err) {
            if (err.statusCode == 404) {
                return false
            } else {
                throw new InternalError(err)
            }
        }
        return true
    }

    async listAllUsers() {
        throw new InternalError(new NotImplementedError)
    }

    _userKey(username) {
        return this.opts.s3_prefix + username
    }
}

module.exports = S3Auth