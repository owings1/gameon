/**
 * gameon - S3Auth class
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
const Auth   = require('../auth')
const Logger = require('../../lib/logger')
const Util   = require('../../lib/util')

const AWS = require('aws-sdk')
const path = require('path')

const {InternalError}       = Auth.Errors
const {NotImplementedError} = Auth.Errors
const {UserNotFoundError}   = Auth.Errors

class S3Auth {

    static defaults() {
        return {
            s3_bucket : process.env.AUTH_S3_BUCKET  || ''
          , s3_prefix : process.env.AUTH_S3_PREFIX || 'users/'
        }
    }

    constructor(opts){
        this.opts = Util.defaults(S3Auth.defaults(), opts)
        this.s3 = new AWS.S3()
    }

    async createUser(username, user) {
        await this.updateUser(username, user)
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
                throw err
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
        await this.s3.putObject(params).promise()
    }

    async deleteUser(username) {
        const params = {
            Bucket : this.opts.s3_bucket
          , Key    : this._userKey(username)   
        }
        await this.s3.deleteObject(params).promise()
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
                throw err
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