/**
 * gameon - Menu Api helper class
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
const Client = require('../../net/client.js')
const {createLogger} = require('../../lib/util.js')
const {RequestError} = require('../../lib/errors.js')

const fetch = require('node-fetch')

class MenuApiHelper {

    constructor(term) {
        this.client = new Client
        this.logger = createLogger(this)
        this.term = term
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
        this.client.logLevel = n
    }

    authenticate({serverUrl, username, password}) {
        const data = {username, password}
        return this._handleRequest(serverUrl, 'authenticate', data)
    }

    signup(serverUrl, username, password) {
        const data = {username, password}
        return this._handleRequest(serverUrl, 'signup', data)
    }

    confirmKey({serverUrl, username}, confirmKey) {
        const data = {username, confirmKey}
        return this._handleRequest(serverUrl, 'confirm-account', data)
    }

    requestConfirmKey({serverUrl, username}) {
        const data = {username}
        return this._handleRequest(serverUrl, 'send-confirm-email', data)
    }

    forgotPassword(serverUrl, username) {
        const data = {username}
        return this._handleRequest(serverUrl, 'forgot-password', data)
    }

    resetPassword({serverUrl, username}, {password, resetKey}) {
        const data = {username, password, resetKey}
        return this._handleRequest(serverUrl, 'reset-password', data)
    }

    changePassword({serverUrl, username}, {oldPassword, newPassword}) {
        const data = {username, oldPassword, newPassword}
        return this._handleRequest(serverUrl, 'change-password', data)
    }

    async _handleRequest(serverUrl, uri, data) {        
        const params = {
            method  : 'POST'
          , headers : {'content-type': 'application/json'}
          , body    : JSON.stringify(data)
        }
        uri = 'api/v1/' + uri
        return this.term.noCursor(async () => {
            this.client.setServerUrl(serverUrl)
            const url = [this.client.serverHttpUrl, uri].join('/')
            const res = await fetch(url, params)
            const body = await res.json()
            if (!res.ok) {
                this.logger.debug(body)
                throw RequestError.forResponse(res, body, uri.split('/').pop() + ' failed')
            }
            return body
        })
    }
}

module.exports = MenuApiHelper