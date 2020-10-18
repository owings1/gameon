/**
 * gameon - DirectoryAuth class
 *
 * Copyright (C) 2020 Doug Owings
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

const fs        = require('fs')
const fse       = require('fs-extra')
const {merge}   = Util
const path      = require('path')
const {resolve} = path

const {InternalError}      = Auth.Errors
const {UserNotFoundError}  = Auth.Errors

class DirectoryAuth {

    defaults() {
        return {
            authDir : process.env.AUTH_DIR  || ''
        }
    }

    constructor(opts){
        this.opts = merge({}, this.defaults(), opts)
        if (!this.opts.authDir) {
            throw new InternalError('Auth directory not set.')
        }
        if (!fs.existsSync(this.opts.authDir)) {
            throw new InternalError('Auth directory not found: ' + this.opts.authDir)
        }
    }

    async createUser(username, user) {
        return this.updateUser(username, user)
    }

    async readUser(username) {
        var user
        try {
            user = await fse.readJson(this._userFile(username))
        } catch (err) {
            if ('ENOENT' == err.code) {
                throw new UserNotFoundError
            } else {
                throw err
            }
        }
        return user
    }

    async updateUser(username, user) {
        await fse.writeJson(this._userFile(username), user)
    }

    async deleteUser(username) {
        await fse.remove(this._userFile(username))
    }

    async userExists(username) {
        return await fse.pathExists(this._userFile(username))
    }

    async listAllUsers() {
        return new Promise((resolve, reject) => {
            fs.readdir(this.opts.authDir, (err, files) => {
                if (err) {
                    reject(new InternalError(err))
                    return
                }
                resolve(files)
            })
        })
    }

    _userFile(username) {
        return resolve(this.opts.authDir, this._userFilename(username))
    }

    _userFilename(username) {
        return path.basename(username)
    }
}

module.exports = DirectoryAuth