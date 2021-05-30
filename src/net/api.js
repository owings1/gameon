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
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const bodyParser = require('body-parser')
const express    = require('express')
const {merge}    = Util

class Api {

    defaults() {
        return {}
    }

    constructor(auth, opts) {
        this.logger = new Logger(this.constructor.name, {server: true})
        this.auth = auth
        this.opts = merge({}, this.defaults(), opts)
        this.v1 = this.create_v1()
    }

    create_v1() {

        const app = express()
        const jsonParser = bodyParser.json()

        app.post('/signup', jsonParser, (req, res) => {
            const {username, password} = req.body
            this.auth.createUser(username, password).then(user => {
                this.auth.sendConfirmEmail(username).then(() => {
                    res.status(201).send({
                        status: 201
                      , message: 'Account created, check your email to confirm.'
                      , passwordEncrypted: user.passwordEncrypted
                    })
                }).catch(err => this.handleInternalError(err, res))
            }).catch(err => this.handleError(err, res))
        })

        app.post('/send-confirm-email', jsonParser, (req, res) => {
            const {username} = req.body
            const message = 'A confirm key has been sent if the account exists and is unconfirmed, check your email.'
            this.auth.sendConfirmEmail(username).then(() => {
                res.status(200).send({status: 200, message})
            }).catch(err => {
                if (err.name == 'UserNotFoundError' || err.name == 'UserConfirmedError') {
                    this.logger.warn('Invalid send-confirm-email request', {username}, err)
                    res.status(200).send({status: 200, message})
                } else {
                    this.handleError(err, res)
                }
            })            
        })

        app.post('/forgot-password', jsonParser, (req, res) => {
            const {username} = req.body
            const message = 'A reset key has been sent if the account exists, check your email.'
            this.auth.sendResetEmail(username).then(() => {
                res.status(200).send({status: 200, message})
            }).catch(err => {
                if (err.name == 'UserNotFoundError' || err.name == 'UserNotConfirmedError') {
                    this.logger.warn('Invalid forgot-password request', {username}, err)
                    res.status(200).send({status: 200, message})
                } else {
                    this.handleError(err, res)
                }
            })
        })

        app.post('/confirm-account', jsonParser, (req, res) => {
            const {username, confirmKey} = req.body
            this.auth.confirmUser(username, confirmKey).then(() => {
                res.status(200).send({status: 200, message: 'Account confirmed'})
            }).catch(err => this.handleError(err, res))
        })

        app.post('/change-password', jsonParser, (req, res) => {
            const {username, oldPassword, newPassword} = req.body
            this.auth.changePassword(username, oldPassword, newPassword).then(user => {
                res.status(200).send({status: 200, message: 'Password changed', passwordEncrypted: user.passwordEncrypted})
            }).catch(err => this.handleError(err, res))
        })

        app.post('/reset-password', jsonParser, (req, res) => {
            const {username, password, resetKey} = req.body
            this.auth.resetPassword(username, password, resetKey).then(user => {
                res.status(200).send({status: 200, message: 'Password reset', passwordEncrypted: user.passwordEncrypted})
            }).catch(err => this.handleError(err, res))
        })

        return app
    }

    handleInternalError(err, res) {
        res.status(500).send({status: 500, message: 'Internal Error', error: {name: 'InternalError', message: 'Internal Error'}})
        this.logger.error(err, err.cause)
    }

    handleError(err, res) {
        if (err.isInternalError || !err.isAuthError) {
            this.handleInternalError(err, res)
        } else {
            res.status(400).send({status: 400, message: 'Bad Request', error: {name: err.name, message: err.message}})
        }
    }
}

module.exports = Api