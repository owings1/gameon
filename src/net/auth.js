const Email  = require('./email')
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

const EncryptedFlagPrefix = 'encrypted_'

class Auth {

    defaults(env) {
        const opts = {
            salt          : env.AUTH_SALT || DefaultSalt
          , hash          : env.AUTH_HASH || 'sha512'
          , saltHash      : env.AUTH_SALT_HASH || 'sha256'
          , passwordMin   : +env.AUTH_PASSWORD_MIN || 8
          , passwordRegex : env.AUTH_PASSWORD_REGEX || DefaultPasswordRegex
          , passwordHelp  : env.AUTH_PASSWORD_HELP || DefaultPasswordHelp
          , emailType     : env.AUTH_EMAIL_TYPE || env.EMAIL_TYPE || Email.DefaultType
          , confirmExpiry : +env.AUTH_CONFIRM_EXPIRY || 86400
          , resetExpiry   : +env.AUTH_RESET_EXPIRY || 3600
        }
        if (opts.passwordRegex != DefaultPasswordRegex && !env.AUTH_PASSWORD_HELP) {
            // If a custom regex is defined, but not a help message, make a generic message.
            opts.passwordHelp = 'Must meet regex: ' + opts.passwordRegex
        }
        return opts
    }

    constructor(authType, opts) {
        this.opts = merge({}, this.defaults(process.env), opts)
        this.logger = new Logger(this.constructor.name, {server: true})
        this.passwordRegex = new RegExp(this.opts.passwordRegex)
        const AuthType = require('./auth/' + path.basename(authType))
        this.impl = new AuthType(this.opts)
        this.email = new Email(this.opts.emailType, this.opts)
        this.isAnonymous = 'anonymous' == authType
        const saltHash = crypto.createHash(this.opts.saltHash)
        saltHash.update(this.opts.salt)
        this.saltHash = saltHash.digest('base64')
        const saltMd5 = crypto.createHash('md5')
        saltMd5.update(this.opts.salt)
        this.saltMd5 = saltMd5.digest('hex')
        // fail fast
        crypto.createHash(this.opts.hash)
    }

    async authenticate(username, password) {
        if (this.isAnonymous) {
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
                throw new BadCredentialsError
            }
            throw err
        }
        try {
            if (this.isEncryptedPassword(password)) {
                password = this.decryptPassword(password)
            }
            if (!password || !password.length || user.password != this.hashPassword(password)) {
                throw new BadCredentialsError
            }
            if (user.locked) {
                throw new UserLockedError
            }
            if (!user.confirmed) {
                throw new UserNotConfirmedError
            }
        } catch (err) {
            this.logger.warn(err, {username})
            throw err
        }
        user.passwordEncrypted = this.encryptPassword(password)
        this.logger.info('Authenticate', {username})
        return user
    }

    async createUser(username, password, confirmed) {
        this.validateUsername(username)
        username = username.toLowerCase()
        if (await this.impl.userExists(username)) {
            throw new UserExistsError('User already exists.')
        }
        this.validatePassword(password)
        const timestamp = Util.timestamp()
        const user = {
            username
          , password   : this.hashPassword(password)
          , saltHash   : this.saltHash
          , confirmed  : !!confirmed
          , confirmKey : null
          , confirmKeyCreated : null
          , resetKey   : null
          , resetKeyCreated : null
          , locked     : false
          , created    : timestamp
          , updated    : timestamp
        }
        await this.impl.createUser(username, user)
        user.passwordEncrypted = this.encryptPassword(password)
        this.logger.info('CreateUser', {username})
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
        await this.impl.deleteUser(username)
        this.logger.info('DeleteUser', {username})
    }

    // Update Operations

    async sendConfirmEmail(username) {
        const user = await this.readUser(username)
        if (user.confirmed) {
            throw new UserConfirmedError
        }
        const timestamp = Util.timestamp()
        const confirmKey = this.generateConfirmKey()
        merge(user, {
            confirmed         : false
          , confirmKey        : this.hashPassword(confirmKey)
          , confirmKeyCreated : timestamp
          , updated           : timestamp
        })
        await this.impl.updateUser(username, user)
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
        const user = await this.readUser(username)
        const timestamp = Util.timestamp()
        const resetKey = this.generateConfirmKey()
        merge(user, {
            resetKey        : this.hashPassword(resetKey)
          , resetKeyCreated : timestamp
          , updated         : timestamp
        })
        await this.impl.updateUser(username, user)
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
        const user = await this.readUser(username)
        if (!confirmKey || this.hashPassword(confirmKey) != user.confirmKey) {
            throw new BadCredentialsError
        }
        const timestamp = Util.timestamp()
        if (Util.timestamp() > user.confirmKeyCreated + this.opts.confirmExpiry) {
            throw new BadCredentialsError('Confirm key expired')
        }
        merge(user, {
            confirmed: true
          , confirmKey : null
          , confirmKeyCreated : null
          , updated : timestamp
        })
        await this.impl.updateUser(username, user)
        this.logger.info('ConfirmUser', {username})
    }

    async resetPassword(username, password, resetKey) {
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.readUser(username)
        if (!resetKey || this.hashPassword(resetKey) != user.resetKey) {
            throw new BadCredentialsError
        }
        const timestamp = Util.timestamp()
        if (Util.timestamp() > user.resetKeyCreated + this.opts.resetExpiry) {
            throw new BadCredentialsError('Reset key expired')
        }
        this.validatePassword(password)
        merge(user, {
            password        : this.hashPassword(password)
          , resetKey        : null
          , resetKeyCreated : null
          , updated         : timestamp
        })
        await this.impl.updateUser(username, user)
        user.passwordEncrypted = this.encryptPassword(password)
        this.logger.info('ResetPassword', {username})
        return user
    }

    async changePassword(username, oldPassword, newPassword) {
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.readUser(username)
        if (!oldPassword || this.hashPassword(oldPassword) != user.password) {
            throw new BadCredentialsError
        }
        this.validatePassword(newPassword)
        merge(user, {
            password : this.hashPassword(newPassword)
          , updated  : Util.timestamp()
        })
        await this.impl.updateUser(username, user)
        user.passwordEncrypted = this.encryptPassword(newPassword)
        this.logger.info('ChangePassword', {username})
        return user
    }

    async lockUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.impl.readUser(username)
        merge(user, {
            locked  : true
          , updated : Util.timestamp()
        })
        await this.impl.updateUser(username, user)
        this.logger.info('LockUser', {username})
    }

    async unlockUser(username) {
        this.validateUsername(username)
        username = username.toLowerCase()
        const user = await this.impl.readUser(username)
        merge(user, {
            locked  : false
          , updated : Util.timestamp()
        })
        await this.impl.updateUser(username, user)
        this.logger.info('UnlockUser', {username})
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
        if (str.indexOf(EncryptedFlagPrefix) == 0) {
            throw new ValidationError('Password cannot begin with ' + EncryptedFlagPrefix)
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

    encryptPassword(password) {
        return EncryptedFlagPrefix + Util.encrypt1(password, this.saltMd5)
    }

    decryptPassword(passwordEncrypted) {
        return Util.decrypt1(passwordEncrypted.substring(EncryptedFlagPrefix.length), this.saltMd5)
    }

    generateConfirmKey() {
        const hash = crypto.createHash(this.opts.hash)
        hash.update(Util.uuid() + this.opts.salt)
        return hash.digest('hex')
    }

    isEncryptedPassword(password) {
        return password && password.indexOf(EncryptedFlagPrefix) == 0
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
class InternalError extends AuthError {
    constructor(...args) {
        super(...args)
        this.isInternalError = true
        this.cause = args.find(arg => arg instanceof Error)
    }
}
class NotImplementedError extends AuthError {}
class UserConfirmedError extends AuthError {}
class UserExistsError extends AuthError {}
class UserLockedError extends AuthError {}
class UserNotConfirmedError extends AuthError {}
class UserNotFoundError extends AuthError {}
class ValidationError extends AuthError {}

Auth.Errors = {
    AuthError
  , BadCredentialsError
  , InternalError
  , NotImplementedError
  , UserConfirmedError
  , UserExistsError
  , UserLockedError
  , UserNotConfirmedError
  , UserNotFoundError
  , ValidationError
}

module.exports = Auth