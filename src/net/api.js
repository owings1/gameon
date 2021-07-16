/**
 * gameon - API class
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
const Auth      = require('./auth')
const Constants = require('../lib/constants')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')

const bodyParser = require('body-parser')
const express    = require('express')

const Messages = {
    accountConfirmed : 'Account confirmed.'
  , accountCreated   : 'Account created, check your email to confirm.'
  , authenticated    : 'User authenticated.'
  , confirmKeySent   : 'A confirm key has been sent if the account exists and is unconfirmed, check your email.'
  , passwordChanged  : 'Password changed.'
  , passwordReset    : 'Password reset.'
  , resetKeySent     : 'A reset key has been sent if the account exists, check your email.'
}

class Api {

    static defaults(env) {
        return {}
    }

    constructor(opts) {

        this.opts = Util.defaults(Api.defaults(process.env), opts)
        this.logger = new Logger(this.constructor.name, {server: true})

        this.auth = Auth.create({...opts, ...this.opts, loggerPrefix: this.constructor.name})
        this.v1 = this.create_v1()
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
        this.auth.loglevel = n
    }

    create_v1() {

        const app = express()
        const jsonParser = bodyParser.json()

        app.use((req, res, next) => {
            res.errorHandler = err => this.handleError(err, res)
            next()
        })

        app.post('/authenticate', jsonParser, (req, res) => {

            const message = Messages.authenticated
            const {username, password} = req.body

            this.auth.authenticate(username, password).then(user => {

                const status = 200
                const {passwordEncrypted} = user
                const body = {status, message, passwordEncrypted}

                res.status(status).send(body)

            }).catch(res.errorHandler)
        })

        app.post('/signup', jsonParser, (req, res) => {

            const message = Messages.accountCreated
            const {username, password} = req.body

            this.auth.createUser(username, password).then(user => {

                const status = 201
                const {passwordEncrypted} = user
                const body = {status, message, passwordEncrypted}

                this.auth.sendConfirmEmail(username).then(() =>
                    res.status(status).send(body)
                ).catch(res.errorHandler)

            }).catch(res.errorHandler)
        })

        app.post('/send-confirm-email', jsonParser, (req, res) => {

            const message = Messages.confirmKeySent
            const {username} = req.body

            const status = 200
            const body = {status, message}

            this.auth.sendConfirmEmail(username).then(() => 
                res.status(status).send(body)
            ).catch(err => {
                // Do not reveal non-existence of user.
                if (err.isUserNotFoundError || err.isUserConfirmedError) {
                    this.logger.warn('Invalid send-confirm-email request', {username}, err)
                    res.status(status).send(body)
                    return
                }
                res.errorHandler(err)
            })            
        })

        app.post('/forgot-password', jsonParser, (req, res) => {

            const message = Messages.resetKeySent
            const {username} = req.body

            const status = 200
            const body = {status, message}

            this.auth.sendResetEmail(username).then(() =>
                res.status(status).send(body)
            ).catch(err => {
                // Do not reveal non-existence of user.
                if (err.isUserNotFoundError || err.isUserNotConfirmedError || err.isUserLockedError) {
                    this.logger.warn('Invalid forgot-password request', {username}, err)
                    res.status(status).send(body)
                    return
                }
                res.errorHandler(err)
            })
        })

        app.post('/confirm-account', jsonParser, (req, res) => {

            const message = Messages.accountConfirmed
            const {username, confirmKey} = req.body

            const status = 200
            const body = {status, message}

            this.auth.confirmUser(username, confirmKey).then(() =>
                res.status(status).send(body)
            ).catch(res.errorHandler)
        })

        app.post('/change-password', jsonParser, (req, res) => {

            const message = Messages.passwordChanged
            const {username, oldPassword, newPassword} = req.body

            this.auth.changePassword(username, oldPassword, newPassword).then(user => {

                const status = 200
                const {passwordEncrypted} = user
                const body = {status, message, passwordEncrypted}

                res.status(status).send(body)

            }).catch(res.errorHandler)
        })

        app.post('/reset-password', jsonParser, (req, res) => {

            const message = Messages.passwordReset
            const {username, password, resetKey} = req.body

            this.auth.resetPassword(username, password, resetKey).then(user => {

                const status = 200
                const {passwordEncrypted} = user
                const body = {status, message, passwordEncrypted}

                res.status(status).send(body)

            }).catch(res.errorHandler)
        })

        return app
    }

    handleInternalError(err, res) {
        const status = 500
        const error = {name: 'InternalError', message: 'Internal Error'}
        const body = {status, message: 'Internal Error', error}
        res.status(status).send(body)
        this.logger.error(err)
    }

    handleError(err, res) {
        if (err.isInternalError || (!err.isAuthError && !err.isValidateError)) {
            this.handleInternalError(err, res)
            return
        }
        const status = 400
        const error = {name: err.name, message: err.message}
        const body = {status, message: 'Bad Request', error}
        res.status(status).send(body)
    }
}

module.exports = Api