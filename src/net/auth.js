const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const crypto  = require('crypto')
const {merge} = Util
const path    = require('path')

// This should be set by AUTH_SALT in production environments
const DefaultSalt  = 'RYm!BtLhPTx4%QrGku_6?Q*NZsfM54Q=Y9?p^q5$9#TM42YcY4WfEGb#48-x88-n'

// Minimum eight characters, at least one letter and one number:
// from: https://stackoverflow.com/questions/19605150/regex-for-password-must-contain-at-least-eight-characters-at-least-one-number-a
const DefaultPasswordRegex = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d\\w\\W]{8,}$'
const DefaultPasswordHelp = 'Minimum eight characters, at least one lowercase letter, one uppercase letter, and one number'

const InvalidUsernameChars = '/\\?%*:|"\'&#'.split('')

class Auth {

    defaults(env) {
        const opts = {
            salt          : env.AUTH_SALT || DefaultSalt
          , hash          : env.AUTH_HASH || 'sha512'
          , saltHash      : env.AUTH_SALT_HASH || 'sha256'
          , passwordMin   : +env.AUTH_PASSWORD_MIN || 8
          , passwordRegex : env.AUTH_PASSWORD_REGEX || DefaultPasswordRegex
          , passwordHelp  : env.AUTH_PASSWORD_HELP || DefaultPasswordHelp
        }
        if (opts.passwordRegex != DefaultPasswordRegex && !env.AUTH_PASSWORD_HELP) {
            // If a custom regex is defined, but not a help message, make a generic message.
            opts.passwordHelp = 'Must meet regex: ' + opts.passwordRegex
        }
        return opts
    }

    constructor(authType, opts) {
        this.opts = merge({}, this.defaults(process.env), opts)
        this.passwordRegex = new RegExp(this.opts.passwordRegex)
        const AuthType = require('./auth/' + path.basename(authType))
        this.impl = new AuthType(this.opts)
        this.isAnonymous = 'anonymous' == authType
        const saltHash = crypto.createHash(this.opts.saltHash)
        saltHash.update(this.opts.salt)
        this.saltHash = saltHash.digest('base64')
        // fail fast
        crypto.createHash(this.opts.hash)
    }

    async authenticate(username, password) {
        if (this.isAnonymous) {
            return
        }
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.impl.readUser(username)
        if (!password || !password.length || user.password != this.hashPassword(password)) {
            throw new BadCredentialsError
        }
        if (user.locked) {
            throw new UserLockedError
        }
    }

    async createUser(username, password) {
        this.validateUsername(username)
        username = username.toLowerCase()
        if (await this.impl.userExists(username)) {
            throw new UserExistsError('User already exists.')
        }
        this.validatePassword(password)
        const timestamp = Util.timestamp()
        const user = {
            username
          , password : this.hashPassword(password)
          , saltHash : this.saltHash
          , locked   : false
          , created  : timestamp
          , updated  : timestamp
        }
        await this.impl.createUser(username, user)
        return user
    }

    async readUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        return this.impl.readUser(username)
    }

    async userExists(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        return this.impl.userExists(username)
    }

    // TODO: this is scaffolding -- make scalable
    async listAllUsers() {
        return this.impl.listAllUsers()
    }

    async deleteUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        if (!(await this.impl.userExists(username))) {
            throw new UserNotFoundError('User not found.')
        }
        return this.impl.deleteUser(username)
    }

    // Update Operations

    async lockUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.impl.readUser(username)
        user.locked = true
        user.updated = Util.timestamp()
        return this.impl.updateUser(username, user)
    }

    async unlockUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.impl.readUser(username)
        user.locked = false
        user.updated = Util.timestamp()
        return this.impl.updateUser(username, user)
    }

    // Validation

    validateUsername(str) {
        if (!str || !str.length) {
            throw new ValidationError('Username cannot be empty.')
        }
        const badChar = InvalidUsernameChars.find(c => str.indexOf(c) > -1)
        if (badChar) {
            throw new ValidationError('Bad character in username:' + badChar)
        }
        if (!Util.isValidEmail(str)) {
            throw new ValidationError('Username is not a valid email address.')
        }
    }

    validatePassword(str) {
        if (!str || !str.length) {
            throw new ValidationError('Password cannot be empty.')
        }
        if (str.length < this.opts.passwordMin) {
            throw new ValidationError('Password must be at least ' + this.opts.passwordMin + ' characters.')
        }
        if (!this.passwordRegex.test(str)) {
            throw new ValidationError('Invalid password: ' + this.opts.passwordHelp)
        }
    }

    // Util

    hashPassword(password) {
        const hash = crypto.createHash(this.opts.hash)
        hash.update(password + this.opts.salt)
        return hash.digest('base64')
    }
}


class AuthError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
        this.isAuthError = true
    }
}
class BadCredentialsError extends AuthError {}
class NotImplementedError extends AuthError {}
class UserExistsError extends AuthError {}
class UserLockedError extends AuthError {}
class UserNotFoundError extends AuthError {}
class ValidationError extends AuthError {}

Auth.Errors = {
    AuthError
  , BadCredentialsError
  , NotImplementedError
  , UserExistsError
  , UserLockedError
  , UserNotFoundError
  , ValidationError
}

module.exports = Auth