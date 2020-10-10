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
            dir : process.env.AUTH_DIR  || ''
        }
    }

    constructor(opts){
        this.opts = merge({}, this.defaults(), opts)
        if (!this.opts.dir) {
            throw new InternalError('Auth directory not set.')
        }
        if (!fs.existsSync(this.opts.dir)) {
            throw new InternalError('Auth directory not found: ' + this.opts.dir)
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
        return fse.pathExists(this._userFile(username))
    }

    async listAllUsers() {
        return new Promise((resolve, reject) => {
            fs.readdir(this.opts.dir, (err, files) => {
                if (err) {
                    reject(new InternalError(err))
                    return
                }
                resolve(files)
            })
        })
    }

    _userFile(username) {
        return resolve(this.opts.dir, this._userFilename(username))
    }

    _userFilename(username) {
        return path.basename(username)
    }
}

module.exports = DirectoryAuth