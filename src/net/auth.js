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
const {objects: {update}} = require('utils-h')

const Email = require('./email')

const {
    DefaultAuthHash,
    DefaultAuthSalt,
    DefaultAuthSaltHash,
    DefaultAuthType,
    DefaultEmailImpl,
    DefaultPasswordHelp,
    DefaultPasswordMin,
    DefaultPasswordRegex,
    EncryptedFlagPrefix,
    InvalidUsernameChars,
    IsTest,
} = require('../lib/constants')

const {
    AuthError,
    BadCredentialsError,
    InternalError,
    NotImplementedError,
    SecurityError,
    UserConfirmedError,
    UserExistsError,
    UserLockedError,
    UserNotConfirmedError,
    UserNotFoundError,
    ValidateError,
} = require('../lib/errors')

const {
    createLogger,
    decrypt2,
    encrypt2,
    defaults,
    hash,
    isValidEmail,
    securityCheck,
    tstamp,
    uuid,
} = require('../lib/util')

const ImplClasses = {
    get anonymous() { return require('./auth/anonymous') },
    get directory() { return require('./auth/directory') },
    get s3()        { return require('./auth/s3') },
}

const ErrorMessages = {
    badConfirmKey     : 'Invalid username and confirm key combination',
    badResetKey       : 'Invalid username and reset key combination',
    confirmed         : 'User account is already confirmed',
    expiredConfirmKey : 'Confirm key expired',
    expiredResetKey   : 'Reset key expired',
    generic           : 'Invalid username/password combination',
    locked            : 'User account is locked',
    notFound          : 'User not found',
    unconfirmed       : 'User account is not confirmed',
    userExists        : 'User already exists',
}

const ValidateMessages = {
    badCharUsername : chr => `Bad character in username: '${chr}'.`,
    email           : 'Username is not a valid email address.',
    emptyPassword   : 'Password cannot be empty.',
    emptyUsername   : 'Username cannot be empty.',
    minPassword     : min => `Password must be at least ${min} characters.`,
    prefixPassword  : prefix => `Password cannot begin with '${prefix}'.`,
    regexPassword   : help => `Invalid password: ${help}`,
}

class Auth {

    /**
     * Get the default options.
     *
     * @param {object} (optional) The environment variables
     * @return {object} The default options
     */
    static defaults(env) {
        const opts = {
            salt          : env.AUTH_SALT || DefaultAuthSalt,
            hash          : env.AUTH_HASH || DefaultAuthHash,
            saltHash      : env.AUTH_SALT_HASH || DefaultAuthSaltHash,
            passwordMin   : +env.AUTH_PASSWORD_MIN || DefaultPasswordMin,
            passwordRegex : env.AUTH_PASSWORD_REGEX || DefaultPasswordRegex,
            passwordHelp  : env.AUTH_PASSWORD_HELP || DefaultPasswordHelp,
            emailTimeout  : +env.AUTH_EMAILTIMEOUT   || 15 * 1000,
            confirmExpiry : +env.AUTH_CONFIRM_EXPIRY || 86400,
            resetExpiry   : +env.AUTH_RESET_EXPIRY   || 3600,
        }
        if (opts.passwordRegex != DefaultPasswordRegex && !env.AUTH_PASSWORD_HELP) {
            // If a custom regex is defined, but not a help message, make a
            // generic default message.
            opts.passwordHelp = 'Must meet regex: ' + opts.passwordRegex
        }
        return opts
    }

    /**
     * Create an Auth instance with the implementation instance.
     *
     * @throws {TypeError}
     *
     * @param {object} (optional) The combined auth and impl options, with a key
     *       `authType` specifying the implmentation (directory, s3, anonymous)
     * @param {object} (optional) The environment variables
     * @return {Auth} The auth instance
     */
    static create(opts, env) {
        env = env || process.env
        const type = (opts && opts.authType) || env.AUTH_TYPE || DefaultAuthType
        const impl = new ImplClasses[type](opts)
        const auth = new Auth(impl, opts)
        return auth
    }

    /**
     * @constructor
     *
     * @throws {Error}
     *
     * @param {AuthImpl} The implementation instance
     * @param {object} (optional) The options
     */
    constructor(impl, opts) {

        this.impl = impl

        this.opts = defaults(Auth.defaults(process.env), opts)

        this.logger = createLogger(this, {type: 'server'})

        // TODO: should this be passed in constructor?
        this.email = Email.create({
            ...opts,
            ...this.opts,
            connectTimeout: this.opts.emailTimeout,
        })

        this._checkSecurity(process.env)

        this.saltHash = hash(this.opts.saltHash, this.opts.salt, 'base64')

        this.saltMd5 = hash('md5', this.opts.salt, 'hex')

        this.passwordRegex = new RegExp(this.opts.passwordRegex)

        // Fail fast.
        hash(this.opts.hash)
    }

    /**
     * Authenticate user credentials.
     *
     * @async
     *
     * @throws {AuthError.BadCredentialsError}
     * @throws {AuthError.UserLockedError}
     * @throws {AuthError.UserNotConfirmedError}
     * @throws {InternalError}
     * @throws {ValidateError}
     *
     * @param {string} The username
     * @param {string} The password
     * @return {object} The user data with `passwordEncrypted` and `token` keys
     */
    async authenticate(username, password) {

        if (this.impl.isAnonymous) {
            const anonEnc = password ? this.encryptPassword(password) : ''
            return {passwordEncrypted: anonEnc}
        }

        let user
        try {
            user = await this.readUser(username)
            username = user.username
        } catch (err) {
            this.logger.warn(err, {username})
            if (err.isUserNotFoundError) {
                // Do not reveal non-existence of user
                throw new BadCredentialsError(ErrorMessages.generic)
            }
            throw err
        }

        try {
            if (this.isEncryptedPassword(password)) {
                password = this.decryptPassword(password)
            }
            if (!this.checkHashed(password, user.password)) {
                throw new BadCredentialsError(ErrorMessages.generic)
            }
            this.assertNotLocked(user)
            this.assertConfirmed(user)
        } catch (err) {
            this.logger.warn(err, {username})
            throw err
        }

        this.logger.info('Authenticate', {username})

        return update(user, {
            passwordEncrypted : this.encryptPassword(password)
          , token             : this.getToken(username, password)
        })
    }

    /**
     * Create a new user.
     *
     * @async
     *
     * @throws {AuthError}
     * @throws {InternalError}
     * @throws {ValidateError}
     *
     * @param {string} The new username
     * @param {string} The password
     * @param {boolean} (optional) Whether to create the user as already confirmed
     * @return {object} The user data with `passwordEncrypted` and `token` keys
     */
    async createUser(username, password, confirmed = false) {

        username = this.validateUsername(username)
        this.validatePassword(password)

        if (await this.userExists(username)) {
            throw new UserExistsError(ErrorMessages.userExists)
        }

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

        this.logger.info('CreateUser', {username})

        return update(user, {
            passwordEncrypted : this.encryptPassword(password)
          , token             : this.getToken(username, password)
        })
    }

    /**
     * Fetch user data.
     *
     * @async
     *
     * @throws {AuthError}
     * @throws {InternalError}
     * @throws {ValidateError}
     *
     * @param {string} The username
     * @return {object} The user data
     */
    async readUser(username) {
        username = this.validateUsername(username)
        return this.wrapInternalError(() => this.impl.readUser(username))
    }

    /**
     * Check whether a username exists.
     *
     * @async
     *
     * @throws {AuthError}
     * @throws {InternalError}
     * @throws {ValidateError}
     *
     * @param {string} The username
     * @return {boolean} Whether the user exists
     */
    async userExists(username) {
        username = this.validateUsername(username)
        return this.wrapInternalError(() => this.impl.userExists(username))
    }
 
    /**
     * TODO: this is scaffolding -- make scalable
     *
     * @async
     *
     * @throws {AuthError}     * @throws {InternalError}     *
     * @return array[string]
     */
    async listAllUsers() {
        return this.wrapInternalError(() => this.impl.listAllUsers())
    }

    /**
     * Delete a user.
     *
     * @async
     *
     * @param {string} The username
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return undefined
     */
    async deleteUser(username) {
        if (!(await this.userExists(username))) {
            throw new UserNotFoundError(ErrorMessages.notFound)
        }
        username = this.validateUsername(username)
        await this.wrapInternalError(() => this.impl.deleteUser(username))
        this.logger.info('DeleteUser', {username})
    }

    /**
     * Send the user an email with a new key to confirm the account.
     *
     * @async
     *
     * @param {string} The username
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return {object} The user data
     */
    async sendConfirmEmail(username) {

        const user = await this.readUser(username)
        username = user.username

        this.assertNotLocked(user)
        this.assertNotConfirmed(user)

        const timestamp = tstamp()
        const confirmKey = this.generateConfirmKey()

        await this._updateUser(username, update(user, {
            confirmed         : false
          , confirmKey        : this.hashPassword(confirmKey)
          , confirmKeyCreated : timestamp
          , updated           : timestamp
        }))

        await this.email.send({
            Destination: {
                ToAddresses: [username]
            }
          , Message : {
                Subject : {
                    Charset: 'UTF-8'
                  , Data: 'Confirm your gameon account'
                }
              , Body : {
                    Text: {
                        Charset: 'UTF-8'
                      , Data: `Key: ${confirmKey}`
                    }
                  , Html: {
                        Charset: 'UTF-8'
                      , Data: `Key: ${confirmKey}`
                    }
                }
            }
        })

        this.logger.info('SendConfirmEmail', {username})

        return user
    }

    /**
     * Send the user an email with a new key to reset the password.
     *
     * @async
     *
     * @param {string} The username
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return {object} The user data
     */
    async sendResetEmail(username) {

        const user = await this.readUser(username)
        username = user.username

        this.assertNotLocked(user)
        this.assertConfirmed(user)

        const timestamp = tstamp()
        const resetKey = this.generateConfirmKey()

        await this._updateUser(username, update(user, {
            resetKey        : this.hashPassword(resetKey)
          , resetKeyCreated : timestamp
          , updated         : timestamp
        }))

        await this.email.send({
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
        })

        this.logger.info('SendResetEmail', {username})

        return user
    }

    /**
     * Confirm the user account with the valid confirm key.
     *
     * @async
     *
     * @param {string} The username
     * @param {string} The confirm key
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return {object} The user data
     */
    async confirmUser(username, confirmKey) {

        const user = await this.readUser(username)
        username = user.username

        if (!confirmKey || this.hashPassword(confirmKey) != user.confirmKey) {
            throw new BadCredentialsError(ErrorMessages.badConfirmKey)
        }

        const timestamp = tstamp()
        if (timestamp > user.confirmKeyCreated + this.opts.confirmExpiry) {
            throw new BadCredentialsError(ErrorMessages.expiredConfirmKey)
        }

        this.assertNotLocked(user)

        await this._updateUser(username, update(user, {
            confirmed         : true
          , confirmKey        : null
          , confirmKeyCreated : null
          , updated           : timestamp
        }))

        this.logger.info('ConfirmUser', {username})

        return user
    }

    /**
     * Reset the password with the valid reset key.
     *
     * @async
     *
     * @param {string} The username
     * @param {string} The new password
     * @param {string} The reset key
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return {object} The user data
     */
    async resetPassword(username, password, resetKey) {

        const user = await this.readUser(username)
        username = user.username

        if (!this.checkHashed(resetKey, user.resetKey)) {
            throw new BadCredentialsError(ErrorMessages.badResetKey)
        }

        const timestamp = tstamp()
        if (tstamp() > user.resetKeyCreated + this.opts.resetExpiry) {
            throw new BadCredentialsError(ErrorMessages.expiredResetKey)
        }

        this.assertNotLocked(user)
        this.validatePassword(password)
        
        await this._updateUser(username, update(user, {
            password        : this.hashPassword(password)
          , resetKey        : null
          , resetKeyCreated : null
          , updated         : timestamp
        }))

        this.logger.info('ResetPassword', {username})

        return update(user, {
            passwordEncrypted : this.encryptPassword(password)
          , token             : this.getToken(username, password)
        })
    }

    /**
     * Change a user's password.
     *
     * @async
     *
     * @param {string} The username
     * @param {string} The old password
     * @param {string} The new password
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return {object} The user data
     */
    async changePassword(username, oldPassword, newPassword) {

        const user = await this.readUser(username)
        username = user.username

        if (!this.checkHashed(oldPassword, user.password)) {
            throw new BadCredentialsError(ErrorMessages.generic)
        }

        this.assertNotLocked(user)
        this.validatePassword(newPassword)

        await this._updateUser(username, update(user, {
            password : this.hashPassword(newPassword)
          , updated  : tstamp()
        }))

        this.logger.info('ChangePassword', {username})

        return update(user, {
            passwordEncrypted : this.encryptPassword(newPassword)
          , token             : this.getToken(username, newPassword)
        })
        return user
    }

    /**
     * Lock a user.
     *
     * @async
     *
     * @param {string} The username
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return {object} The user data
     */
    async lockUser(username) {

        const user = await this.readUser(username)
        username = user.username

        await this._updateUser(username, update(user, {
            locked  : true
          , updated : tstamp()
        }))

        this.logger.info('LockUser', {username})

        return user
    }

    /**
     * Unlock a user.
     *
     * @async
     *
     * @param {string} The username
     */
    async unlockUser(username) {

        const user = await this.readUser(username)
        username = user.username

        await this._updateUser(username, update(user, {
            locked  : false
          , updated : tstamp()
        }))

        this.logger.info('UnlockUser', {username})

        return user
    }

    // Validation

    /**
     * @param {string} The username to test
     *
     * @throws RequestError.ValidateError
     *
     * @return {string} The username lowercased
     */
    validateUsername(str) {
        const Msg = ValidateMessages
        if (!str || !str.length) {
            throw new ValidateError(Msg.emptyUsername)
        }
        const badChar = InvalidUsernameChars.find(c => str.indexOf(c) > -1)
        if (badChar) {
            throw new ValidateError(Msg.badCharUsername(badChar))
        }
        if (!isValidEmail(str)) {
            throw new ValidateError(Msg.email)
        }
        return str.toLowerCase()
    }

    /**
     * @param {string} The password to test
     *
     * @throws RequestError.ValidateError
     *
     * @return {string} The input string
     */
    validatePassword(str) {
        const {opts} = this
        const Msg = ValidateMessages
        if (!str || !str.length) {
            throw new ValidateError(Msg.emptyPassword)
        }
        if (str.length < opts.passwordMin) {
            throw new ValidateError(Msg.minPassword(opts.passwordMin))
        }
        if (str.indexOf(EncryptedFlagPrefix) == 0) {
            throw new ValidateError(Msg.prefixPassword(EncryptedFlagPrefix))
        }
        if (!this.passwordRegex.test(str)) {
            throw new ValidateError(Msg.regexPassword(opts.passwordHelp))
        }
        return str
    }

    /**
     * Assert the user is confirmed.
     *
     * @param {object} The user data
     *
     * @throws AuthError.UserNotConfirmedError
     *
     * @return self
     */
    assertConfirmed(user) {
        if (!user.confirmed) {
            throw new UserNotConfirmedError(ErrorMessages.unconfirmed)
        }
        return this
    }

    /**
     * Assert the user is not confirmed.
     *
     * @param {object} The user data
     *
     * @throws AuthError.UserConfirmedError
     *
     * @return self
     */
    assertNotConfirmed(user) {
        if (user.confirmed) {
            throw new UserConfirmedError(ErrorMessages.confirmed)
        }
        return this
    }

    /**
     * Assert the user is not locked.
     *
     * @param {object} The user data
     *
     * @throws AuthError.UserLockedError
     *
     * @return self
     */
    assertNotLocked(user) {
        if (user.locked) {
            throw new UserLockedError(ErrorMessages.locked)
        }
        return this
    }

    // Util

    /**
     * Hash a password.
     *
     * @param {string} The password to hash
     *
     * @return {string} The hased password
     */
    hashPassword(password) {
        return hash(this.opts.hash, password + this.opts.salt, 'base64')
    }

    /**
     * Compare a plain input to a stored hash.
     *
     * @param {string} The plain text input
     * @param {string} The stored hashed string
     *
     * @return {boolean} Whether they match
     */
    checkHashed(input, stored) {
        return Boolean(
            input && input.length && stored == this.hashPassword(input)
        )
    }

    /**
     * @param {string} The password string to test
     *
     * @return {boolean} Whether it is an encrypted password string
     */
    isEncryptedPassword(password) {
        return password && password.indexOf(EncryptedFlagPrefix) == 0
    }

    /**
     * Encrypt a password.
     *
     * @param {string} The password to encrypt
     *
     * @throws {ArgumentError}     *
     * @return {string} The encrypted password
     */
    encryptPassword(password) {
        return EncryptedFlagPrefix + encrypt2(password, this.saltMd5)
    }

    /**
     * Decrypt an encrypted password string.
     *
     * @param {string} The encrypted string
     *
     * @throws {ArgumentError}     *
     * @return {string} The decrypted password
     */
    decryptPassword(passwordEncrypted) {
        return decrypt2(passwordEncrypted.substring(EncryptedFlagPrefix.length), this.saltMd5)
    }

    /**
     * Get an encrypted token string for credentials.
     *
     * @param {string} The username
     * @param {string} The password
     *
     * @throws {ArgumentError}     *
     * @return {string} The encrypted token string
     */
    getToken(username, password) {
        return this.encryptPassword([username, password].join('\t'))
    }

    /**
     * Parse an encrypted token string into credentials.
     *
     * @param {string} Then encrypted token string
     *
     * @throws {ArgumentError}     *
     * @return {object} The credentials
     */
    parseToken(token) {
        const [username, password] = this.decryptPassword(token).split('\t')
        return {username, password}
    }

    /**
     * Generate a new confirm key.
     *
     * @return {string} The new confirm key
     */
    generateConfirmKey() {
        return hash(this.opts.hash, uuid() + this.opts.salt, 'hex')
    }

    /**
     * Internal method to update user data.
     *
     * @async
     *
     * @param {string} The username
     * @param {object} The user data
     *
     * @throws {AuthError}     * @throws {InternalError}     * @throws {ValidateError}     *
     * @return undefined
     */
    _updateUser(username, user) {
        username = this.validateUsername(username)
        return this.wrapInternalError(() => this.impl.updateUser(username, user))
    }

    /**
     * Wraps any error that is not an AuthError or an InternalError in an
     * InternalError.
     *
     * @async
     *
     * @param function The callback to execute
     *
     * @throws {AuthError}     * @throws {InternalError}     *
     * @return The return value of the callback
     */
    async wrapInternalError(cb) {
        try {
            return await cb()
        } catch (err) {
            //console.log(err)
            if (!err.isAuthError && !err.isInternalError) {
                throw new InternalError(err)
            }
            throw err
        }
    }

    /**
     * Ensure the defaults are not used in production environments.
     *
     * @throws {SecurityError}     *
     * @param {object} (optional) The environment variables
     * @return {boolean} Whether all values are custom
     */
    _checkSecurity(env) {

        const checks = [
            {
                name    : 'AUTH_SALT',
                value   : this.opts.salt,
                default : DefaultAuthSalt,
            }
        ]

        const {error, warning} = securityCheck(checks, env)

        if (error) {
            throw new SecurityError(error)
        }

        if (warning) {
            if (!IsTest) {
                this.logger.warn(warning)
            }
            return false
        }

        return true
    }

    /**
     * Getter for type. Delegates to impl.type.
     */
    get type() {
        return this.impl.type
    }

    /**
     * Getter for logLevel (integer).
     */
    get logLevel() {
        return this.logger.logLevel
    }

    /**
     * Setter for logLevel (integer).
     */
    set logLevel(n) {
        this.logger.logLevel = n
        this.email.logLevel = n
    }
}

module.exports = Auth