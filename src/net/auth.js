/**
 * gameon - Auth class
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
const Constants = require('../lib/constants')
const Email     = require('./email')
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')

const path = require('path')

const {
    DefaultAuthType
  , DefaultEmailImpl
  , DefaultPasswordHelp
  , DefaultPasswordRegex
  , DefaultSalt
  , EncryptedFlagPrefix
  , InvalidUsernameChars
} = Constants

const {
    AuthError
  , BadCredentialsError
  , InternalError
  , NotImplementedError
  , SecurityError
  , UserConfirmedError
  , UserExistsError
  , UserLockedError
  , UserNotConfirmedError
  , UserNotFoundError
  , ValidateError
} = Errors

const {
    decrypt1
  , encrypt1
  , hash
  , isValidEmail
  , tstamp
  , uuid
} = Util

const ImplClasses = {
    anonymous : require('./auth/anonymous')
  , directory : require('./auth/directory')
  , s3        : require('./auth/s3')
}

const GenericMessage = 'Invalid username/password combination'

class Auth {

    static defaults(env) {
        const opts = {
            salt          : env.AUTH_SALT || DefaultSalt
          , hash          : env.AUTH_HASH || 'sha512'
          , saltHash      : env.AUTH_SALT_HASH || 'sha256'
          , passwordMin   : +env.AUTH_PASSWORD_MIN || 8
          , passwordRegex : env.AUTH_PASSWORD_REGEX || DefaultPasswordRegex
          , passwordHelp  : env.AUTH_PASSWORD_HELP || DefaultPasswordHelp
          , emailTimeout  : +env.AUTH_EMAILTIMEOUT   || 30 * 1000
          , confirmExpiry : +env.AUTH_CONFIRM_EXPIRY || 86400
          , resetExpiry   : +env.AUTH_RESET_EXPIRY   || 3600
          , loggerPrefix  : null
        }
        if (opts.passwordRegex != DefaultPasswordRegex && !env.AUTH_PASSWORD_HELP) {
            // If a custom regex is defined, but not a help message, make a generic message.
            opts.passwordHelp = 'Must meet regex: ' + opts.passwordRegex
        }
        return opts
    }

    static create(opts, env) {
        env = env || process.env
        const type = (opts && opts.authType) || env.AUTH_TYPE || DefaultAuthType
        const impl = new ImplClasses[type](opts)
        const auth = new Auth(impl, opts)
        auth.type = type
        return auth
    }

    constructor(impl, opts) {

        this.impl = impl

        this.opts = Util.defaults(Auth.defaults(process.env), opts)

        const loggerName = [this.opts.loggerPrefix, this.constructor.name].filter(it => it).join('.')
        this.logger = new Logger(loggerName, {server: true})

        this.email = Email.create({...opts, ...this.opts, connectTimeout: this.opts.emailTimeout})

        this.checkSecurity()

        this.saltHash = hash(this.opts.saltHash, this.opts.salt, 'base64')

        this.saltMd5 = hash('md5', this.opts.salt, 'hex')

        this.passwordRegex = new RegExp(this.opts.passwordRegex)

        // fail fast
        hash(this.opts.hash)
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
        this.email.loglevel = n
    }

    async authenticate(username, password) {
        if (this.impl.isAnonymous) {
            return {
                passwordEncrypted : password ? this.encryptPassword(password) : ''
            }
        }
        this.validateUsername(username)
        username = username.toLowerCase()
        var user
        try {
            user = await this.impl.readUser(username)
        } catch (err) {
            this.logger.warn(err, {username})
            if (err.name == 'UserNotFoundError') {
                // Do not reveal non-existence of user
                throw new BadCredentialsError(GenericMessage)
            }
            throw new InternalError(err)
        }
        try {
            if (this.isEncryptedPassword(password)) {
                password = this.decryptPassword(password)
            }
            if (!password || !password.length || user.password != this.hashPassword(password)) {
                throw new BadCredentialsError(GenericMessage)
            }
            if (user.locked) {
                throw new UserLockedError('The user account is locked')
            }
            if (!user.confirmed) {
                throw new UserNotConfirmedError('The user account is not confirmed')
            }
        } catch (err) {
            this.logger.warn(err, {username})
            throw err
        }
        user.passwordEncrypted = this.encryptPassword(password)
        user.token = this.getToken(username, password)
        this.logger.info('Authenticate', {username})
        return user
    }

    getToken(username, password) {
        return this.encryptPassword([username, password].join('\t'))
    }

    parseToken(token) {
        const [username, password] = this.decryptPassword(token).split('\t')
        return {username, password}
    }

    async createUser(username, password, confirmed) {
        this.validateUsername(username)
        username = username.toLowerCase()
        if (await this.userExists(username)) {
            throw new UserExistsError('User already exists.')
        }
        this.validatePassword(password)
        const timestamp = tstamp()
        const user = {
            username
          , password          : this.hashPassword(password)
          , confirmed         : !!confirmed
          , confirmKey        : null
          , confirmKeyCreated : null
          , resetKey          : null
          , resetKeyCreated   : null
          , locked            : false
          , created           : timestamp
          , updated           : timestamp
        }
        await this.wrapInternalError(() => this.impl.createUser(username, user))
        user.passwordEncrypted = this.encryptPassword(password)
        this.logger.info('CreateUser', {username})
        return user
    }

    async readUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        return this.wrapInternalError(() => this.impl.readUser(username))
    }

    async userExists(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        return this.wrapInternalError(() => this.impl.userExists(username))
    }

    // TODO: this is scaffolding -- make scalable
    async listAllUsers() {
        return this.impl.listAllUsers()
    }

    async deleteUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        if (!(await this.userExists(username))) {
            throw new UserNotFoundError('User not found.')
        }
        await this.wrapInternalError(() => this.impl.deleteUser(username))
        this.logger.info('DeleteUser', {username})
    }

    // Update Operations

    async sendConfirmEmail(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.readUser(username)
        if (user.confirmed) {
            throw new UserConfirmedError
        }
        const timestamp = tstamp()
        const confirmKey = this.generateConfirmKey()
        user = {
            ...user
          , confirmed         : false
          , confirmKey        : this.hashPassword(confirmKey)
          , confirmKeyCreated : timestamp
          , updated           : timestamp
        }
        await this._updateUser(username, user)
        const params = {
            Destination: {
                ToAddresses: [username]
            }
          , Message : {
                Subject : {
                    Charset: 'UTF-8'
                  , Data: 'confirm your gameon account'
                }
              , Body : {
                    Text: {
                        Charset: 'UTF-8'
                      , Data: 'Key: ' + confirmKey
                    }
                  , Html: {
                        Charset: 'UTF-8'
                      , Data: 'Key: ' + confirmKey
                    }
                }
            }
        }
        await this.email.send(params)
        this.logger.info('SendConfirmEmail', {username})
    }

    async sendResetEmail(username) {
        // TODO: should this block locked accounts?
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.readUser(username)
        if (!user.confirmed) {
            throw new UserNotConfirmedError
        }
        const timestamp = tstamp()
        const resetKey = this.generateConfirmKey()
        user = {
            ...user
          , resetKey        : this.hashPassword(resetKey)
          , resetKeyCreated : timestamp
          , updated         : timestamp
        }
        await this._updateUser(username, user)
        const params = {
            Destination: {
                ToAddresses: [username]
            }
          , Message : {
                Subject : {
                    Charset: 'UTF-8'
                  , Data: 'reset your gameon password'
                }
              , Body : {
                    Text: {
                        Charset: 'UTF-8'
                      , Data: 'Key: ' + resetKey
                    }
                  , Html: {
                        Charset: 'UTF-8'
                      , Data: 'Key: ' + resetKey
                    }
                }
            }
        }
        await this.email.send(params)
        this.logger.info('SendResetEmail', {username})
    }

    async confirmUser(username, confirmKey) {
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.readUser(username)
        if (!confirmKey || this.hashPassword(confirmKey) != user.confirmKey) {
            throw new BadCredentialsError('Invalid username and confirm key combination')
        }
        const timestamp = tstamp()
        if (tstamp() > user.confirmKeyCreated + this.opts.confirmExpiry) {
            throw new BadCredentialsError('Confirm key expired')
        }
        user = {
            ...user
          , confirmed         : true
          , confirmKey        : null
          , confirmKeyCreated : null
          , updated           : timestamp
        }
        await this._updateUser(username, user)
        this.logger.info('ConfirmUser', {username})
    }

    async resetPassword(username, password, resetKey) {
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.readUser(username)
        if (!resetKey || this.hashPassword(resetKey) != user.resetKey) {
            throw new BadCredentialsError('Invalid username and reset key combination')
        }
        const timestamp = tstamp()
        if (tstamp() > user.resetKeyCreated + this.opts.resetExpiry) {
            throw new BadCredentialsError('Reset key expired')
        }
        this.validatePassword(password)
        user = {
            ...user
          , password        : this.hashPassword(password)
          , resetKey        : null
          , resetKeyCreated : null
          , updated         : timestamp
        }
        await this._updateUser(username, user)
        user.passwordEncrypted = this.encryptPassword(password)
        this.logger.info('ResetPassword', {username})
        return user
    }

    async changePassword(username, oldPassword, newPassword) {
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.readUser(username)
        if (!oldPassword || this.hashPassword(oldPassword) != user.password) {
            throw new BadCredentialsError(GenericMessage)
        }
        this.validatePassword(newPassword)
        user = {
            ...user
          , password : this.hashPassword(newPassword)
          , updated  : tstamp()
        }
        await this._updateUser(username, user)
        user.passwordEncrypted = this.encryptPassword(newPassword)
        this.logger.info('ChangePassword', {username})
        return user
    }

    async lockUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.impl.readUser(username)
        user = {
            ...user
          , locked  : true
          , updated : tstamp()
        }
        await this._updateUser(username, user)
        this.logger.info('LockUser', {username})
    }

    async unlockUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        var user = await this.impl.readUser(username)
        user = {
            ...user
          , locked  : false
          , updated : tstamp()
        }
        await this._updateUser(username, user)
        this.logger.info('UnlockUser', {username})
    }

    // Validation

    validateUsername(str) {
        if (!str || !str.length) {
            throw new ValidateError('Username cannot be empty.')
        }
        const badChar = InvalidUsernameChars.find(c => str.indexOf(c) > -1)
        if (badChar) {
            throw new ValidateError('Bad character in username:' + badChar)
        }
        if (!isValidEmail(str)) {
            throw new ValidateError('Username is not a valid email address.')
        }
    }

    validatePassword(str) {
        if (!str || !str.length) {
            throw new ValidateError('Password cannot be empty.')
        }
        if (str.length < this.opts.passwordMin) {
            throw new ValidateError('Password must be at least ' + this.opts.passwordMin + ' characters.')
        }
        if (str.indexOf(EncryptedFlagPrefix) == 0) {
            throw new ValidateError('Password cannot begin with ' + EncryptedFlagPrefix)
        }
        if (!this.passwordRegex.test(str)) {
            throw new ValidateError('Invalid password: ' + this.opts.passwordHelp)
        }
    }

    // Util

    hashPassword(password) {
        return hash(this.opts.hash, password + this.opts.salt, 'base64')
    }

    encryptPassword(password) {
        return EncryptedFlagPrefix + encrypt1(password, this.saltMd5)
    }

    decryptPassword(passwordEncrypted) {
        return decrypt1(passwordEncrypted.substring(EncryptedFlagPrefix.length), this.saltMd5)
    }

    generateConfirmKey() {
        return hash(this.opts.hash, uuid() + this.opts.salt, 'hex')
    }

    isEncryptedPassword(password) {
        return password && password.indexOf(EncryptedFlagPrefix) == 0
    }

    async _updateUser(username, user) {
        return this.wrapInternalError(() => this.impl.updateUser(username, user))
    }

    async wrapInternalError(cb) {
        try {
            return await cb()
        } catch (err) {
            if (!err.isAuthError) {
                throw new InternalError(err)
            }
            throw err
        }
    }

    checkSecurity() {
        if (this.opts.salt == DefaultSalt) {
            if (!process.env.GAMEON_TEST) {
                this.logger.warn(
                    'AUTH_SALT not set, using default.'
                  , 'For security, AUTH_SALT must be set'
                  , 'in production environemnts.'
                )
            }
            if (process.env.NODE_ENV == 'production') {
                throw new SecurityError(
                    'Must set custom AUTH_SALT when NODE_ENV=production'
                )
            }
        }
    }
}

module.exports = Auth