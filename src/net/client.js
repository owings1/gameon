/**
 * gameon - Client class
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
const Core      = require('../lib/core')
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')
const WsClient  = require('websocket').client

const fetch  = require('node-fetch')

const {EventEmitter} = require('events')

const {White, Red} = Constants
const {Match} = Core

const {
    httpToWs
  , secret1
  , stripLeadingSlash
  , stripTrailingSlash
  , wsToHttp
} = Util

const {
    ClientError
  , ConnectionClosedError
  , ConnectionFailedError
  , MatchCanceledError
} = Errors

class Client extends EventEmitter {

    constructor(...args) {

        super()

        if (typeof args[0] == 'object') {
            var {serverUrl, username, password} = args[0]
        } else {
            var [serverUrl, username, password] = args
        }

        this.serverSocketUrl = httpToWs(serverUrl)
        this.serverHttpUrl = stripTrailingSlash(wsToHttp(serverUrl))

        this.username = username
        this.password = password

        this.logger = new Logger('Client', {named: true})
        this.socketClient = new WsClient
        this.secret = Client.generateSecret()

        this.token = null
        this.conn = null
        this.isHandshake = null
        this.match = null
        this.matchId = null
    }

    async connect() {

        if (this.conn && this.conn.connected) {
            return
        }

        await new Promise((resolve, reject) => {
            // TODO make sure these do not leak (recreate socketClient?)
            this.socketClient.on('connectFailed', err => {
                // WebSocketClient throws generic Error
                //this.logger.debug('connectFailed', err)
                reject(ClientError.forConnectFailedError(err))
            })
            this.socketClient.on('connect', conn => {
                this.conn = conn
                conn.on('error', err => {
                    this.logger.error(err)
                })
                conn.on('close', () => {
                    this.conn = null
                    this.isHandshake = false
                })
                conn.on('message', msg => {
                    this.handleMessage(JSON.parse(msg.utf8Data))
                })
                resolve()
            })
            try {
                this.socketClient.connect(this.serverSocketUrl)
            } catch (err) {
                reject(err)
            }
        })

        return await this.handshake()
    }

    async close() {
        if (this.isWaiting) {
            // NB: this can throw an unhandled promise rejection if a caller of
            //     waitForMessage does not handle the error.
            this.cancelWaiting(new ConnectionClosedError('Client closing'))
        }
        if (this.conn) {
            this.conn.close()
        }
        this.removeAllListeners()
    }

    async handshake() {
        const {username, password, token} = this
        const req = {action: 'establishSecret', username, password, token}
        const res = await this.sendAndWaitForResponse(req, 'acknowledgeSecret')
        this.logger.log('Server handshake success')
        this.isHandshake = true
        return res
    }

    cancelWaiting(err) {
        if (this.messageReject) {
            this.messageReject(err)
        }
    }

    async createMatch(opts) {

        await this.connect()

        const {total} = opts
        const req = {action: 'createMatch', total, opts}
        const {id, match} = await this.sendAndWaitForResponse(req, 'matchCreated')

        this.matchId = id
        this.match = Match.unserialize(match)
        this.color = White

        this.logger.info('Created new match', id)
        this.emit('matchCreated', id)

        this.logger.info('Waiting for opponent to join')        
        await this.waitForResponse('opponentJoined')

        this.logger.info('Opponent joined', id)
        this.emit('opponentJoined', this.match)

        return this.match
    }

    async joinMatch(id) {

        await this.connect()

        this.logger.info('Joining match', id)
        const req = {action: 'joinMatch', id}
        const {match} = await this.sendAndWaitForResponse(req, 'matchJoined')

        this.matchId = id
        this.match = Match.unserialize(match)
        this.color = Red

        this.logger.info('Joined match', id, 'to', this.match.total, 'points')
        this.emit('matchJoined', this.match)

        return this.match
    }

    matchRequest(action, params) {
        const req = {...this.matchParams(action), ...params}
        return this.sendAndWaitForResponse(req, action)
    }

    sendAndWaitForResponse(req, action) {
        const promise = this.waitForResponse(action)
        this.sendMessage(req)
        return promise
        /*
        try {
            var promise = this.waitForResponse(action)
        } catch (err) {
            throw err
        }
        try {
            this.sendMessage(req)
        } catch (err) {
            this.logger.debug(['catch sendMessage', 'throwing'])
            throw err
        }
        return promise
        */
    }

    async waitForResponse(action) {
        const res = await this.waitForMessage()
        if (res.error) {
            throw Client.buildError(res)
        }
        if (action && res.action != action) {
            if (res.action == 'matchCanceled') {
                this.logger.warn('Received matchCanceled message from server:', res.reason)
                throw new MatchCanceledError(res.reason)
            }
            throw new ClientError('Expecting response ' + action + ', but got ' + res.action + ' instead')
        }
        return res
    }

    waitForMessage() {

        if (!this.conn) {
            throw new ConnectionClosedError('Connection lost')
        }

        this.isWaiting = true

        return new Promise((resolve, reject) => {
            this.messageReject = err => {
                this.messageResolve = null
                this.messageReject = null
                this.isWaiting = false
                this.logger.warn(err.name, err.message)
                reject(err)
            }
            this.messageResolve = res => {
                this.messageResolve = null
                this.messageReject = null
                this.isWaiting = false
                resolve(res)
            }
        })
    }

    // Event hanlder, so should not throw
    handleMessage(res) {
        if (this.messageResolve) {
            this.messageResolve(res)
            return
        }
        if (res.action == 'matchCanceled') {
            const err = new MatchCanceledError(res.reason)
            if (!this.emit('matchCanceled', err)) {
                this.logger.warn('Received matchCanceled message from server:', res.reason)
                if (!this.emit('error', err)) {
                    this.logger.error('Unhandled error', err)
                    this.logger.console.error(err)
                }
            }
        } else {
            this.logger.warn('Unhandled message', {action: res.action})
        }
    }

    postJson(uri, data) {
        const url = [this.serverHttpUrl, stripLeadingSlash(uri)].join('/')
        const params = {
            method  : 'post'
          , headers : {'content-type': 'application/json'}
          , body    : JSON.stringify(data)
        }
        return this.fetch(url, params)
    }

    fetch(...args) {
        return fetch(...args)
    }

    matchParams(params) {
        if (typeof params == 'string') {
            params = {action: params}
        }
        return {id: this.matchId, color: this.color, ...params}
    }

    sendMessage(req) {
        req = {secret: this.secret, ...req}
        this.logger.debug('sendMessage', req)
        this.conn.sendUTF(JSON.stringify(req))
    }

    static generateSecret() {
        return secret1()
    }

    static buildError(data, fallbackMessage) {
        const message = data.error || fallbackMessage || 'Unknown server error'
        const err = new ClientError(message)
        for (var k in data) {
            err[k] = data[k]
        }
        return err
    }
}

module.exports = Client