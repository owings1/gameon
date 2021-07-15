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

const fetch = require('node-fetch')

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
  , ParallelRequestError
  , UnexpectedResponseError
  , UnhandledMessageError
} = Errors

/**
 * Events:
 *
 *  Normal success events:
 *
 *   - matchCreated
 *   - opponentJoined
 *   - matchJoined
 *   - matchRequest
 *   - matchResponse
 *   - response
 *
 *  Other events, if not handled, will throw unhandled promise.
 *
 *    - unhandledMessage
 *    - matchCanceled
 *    - responseError
 *   
 *  If you listen on matchCanceled, the code must be able to 
 *  handle null return values from matchRequest.
 *
 *  The unhandledMessage event means there was nothing waiting a message.
 *
 *  The responseError should only be used for testing since it will
 *  break a lot of code expecting a response, e.g. handshake, createMatch, etc.
 */
class Client extends EventEmitter {

    constructor(...args) {

        super()

        this.logger = new Logger(this.constructor.name, {named: true})

        if (typeof args[0] == 'object') {
            var {serverUrl, username, password} = args[0]
        } else {
            var [serverUrl, username, password] = args
        }

        this.setServerUrl(serverUrl)

        this.username = username
        this.password = password

        this.socketClient = new WsClient
        this.secret = Client.generateSecret()

        this.token = null
        this.conn = null
        this.isHandshake = null
        this.match = null
        this.matchId = null
    }

    /**
     * @async
     *
     * @throws ClientError
     *
     * @returns Object
     */
    async connect() {

        if (this.conn && this.conn.connected) {
            return
        }

        await new Promise((resolve, reject) => {

            this.socketClient.removeAllListeners()

            this.socketClient.on('connectFailed', err => {
                // WebSocketClient throws generic Error
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
                    let data
                    try {
                        data = JSON.parse(msg.utf8Data)
                    } catch (err) {
                        if (!this.emit('responseError', err)) {
                            this.logger.error(err)
                        }
                        return
                    }
                    this.handleMessage(data)
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

    /**
     * @throws ClientError.ConnectionClosedError
     *         ❯ If there is pending response expected.
     */
    close() {
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

    /**
     * @async
     *
     * @throws ClientError
     *
     * @returns Object
     */
    async handshake() {
        const {username, password, token} = this
        const req = {action: 'establishSecret', username, password, token}
        const res = await this.sendAndWaitForResponse(req, 'acknowledgeSecret')
        this.logger.log('Server handshake success')
        this.isHandshake = true
        return res
    }

    /**
     *
     */
    cancelWaiting(err) {
        if (this.messageReject) {
            this.messageReject(err)
        }
    }

    /**
     * @async
     *
     * @emits matchCreated
     * @emits opponentJoined
     *
     * @throws ClientError
     *
     * @returns Match
     */
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

    /**
     * @returns self
     */
    setServerUrl(serverUrl) {
        this.serverSocketUrl = httpToWs(serverUrl)
        this.serverHttpUrl = stripTrailingSlash(wsToHttp(serverUrl))
        return this
    }

    /**
     * @async
     *
     * @emits matchJoined
     *
     * @throws ClientError
     *
     * @returns Match
     */
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

   /**
    * Make a match play request.
    *
    * See {@method waitForResponse}
    *
    * @async
    *
    * @emits response
    * @emits matchCanceled
    * @emits responseError
    *
    * @throws ClientError
    * @throws GameError.MatchCanceledError
    * @throws MenuError.WaitingAbortedError
    *
    * @returns Object|Error|null
    */
    async matchRequest(action, params) {
        const req = {...this.matchParams(action), ...params}
        this.emit('matchRequest', req)
        const res = await this.sendAndWaitForResponse(req, action)
        this.emit('matchResponse', req, res)
        return res
    }

    /**
     * Send a message, then wait for a response, optionally of a specific action.
     *
     * See {@method waitForResponse}
     *
     * @async
     *
     * @emits response
     * @emits matchCanceled
     * @emits responseError
     *
     * @throws ClientError
     * @throws GameError.MatchCanceledError
     * @throws MenuError.WaitingAbortedError
     *
     * @returns Object|Error|null
     */
    sendAndWaitForResponse(req, action = null) {
        const promise = this.waitForResponse(action)
        this.sendMessage(req)
        return promise
    }

    /**
     * Wait for a non-error response, optionally of a specific action.
     *
     * The return/emit behavior is as follows:
     *
     *  ❯ Any error response is wrapped in a ClientError and thrown.
     *
     *  ❯ If no action is specified, then any non-error response is returned.
     *
     *  ❯ If an action is specified, and the response action matches, the
     *    response is returned.
     *
     *  ❯ Otherwise an error is created, which is either an UnexpectedResponseError,
     *    or, if the response action is matchCanceled, a MatchCanceledError.
     *
     *  ❯ For a MatchCanceledError, the matchCanceled event is emitted. If there
     *    is an attached listener, the error is returned.
     *
     *  ❯ Otherwise, the responseError event is emitted. If there is an attached
     *    listener, then null is returned.
     *
     *  ❯ Otherwise, the error is thrown.
     *
     *    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
     *    ┃ NB: The responseError event is primarily for testing purposes. ┃
     *    ┃     Attaching a listener on this event can cause unpredictable ┃
     *    ┃     program behavior.                                          ┃
     *    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
     *
     * @async
     *
     * @emits response
     * @emits matchCanceled
     * @emits responseError
     *
     * @throws ClientError.ConnectionClosedError
     * @throws ClientError.ParallelRequestError
     * @throws ClientError.UnexpectedResponseError
     * @throws ClientError
     * @throws GameError.MatchCanceledError
     * @throws MenuError.WaitingAbortedError
     *
     * @returns Object|Error|null
     */
    async waitForResponse(action = null) {

        const data = await this.waitForMessage()

        if (data.isError) {
            throw ClientError.forData(data)
        }

        if (!action || data.action == action) {
            return data
        }

        let err

        if (data.action == 'matchCanceled') {
            err = new MatchCanceledError(data.reason)
            if (this.emit('matchCanceled', err)) {
                return err
            }
        }

        if (!err) {
            err = new UnexpectedResponseError(
                `Expecting response ${action}, but got ${data.action} instead`
            )
        }

        // This is for testing only, not recoverable in most cases.
        if (this.emit('responseError', err, data)) {
            this.logger.error(err)
            return null
        }

        this.logger.warn(err)

        throw err
    }

    /**
     * Wait for any valid JSON message.
     *
     * @async
     *
     * @emits response
     *
     * @throws ClientError.ConnectionClosedError
     * @throws ClientError.ParallelRequestError
     * @throws GameError.MatchCanceledError
     * @throws MenuError.WaitingAbortedError
     *
     * @returns Object
     */
    waitForMessage() {
        return new Promise((resolve, reject) => {
            if (!this.conn) {
                reject(new ConnectionClosedError('Connection lost'))
                return
            }
            if (this.isWaiting) {
                reject(new ParallelRequestError('A request is already pending'))
                return
            }
            this.isWaiting = true
            this.messageResolve = data => {
                this.emit('response', data)
                resolve(data)
            }
            this.messageReject = err => {
                this.logger.warn(err.name, err.message)
                reject(err)
            }
        }).finally(() => {
            this.isWaiting = false
            this.messageResolve = null
            this.messageReject = null
        })
    }

    /**
     * Message event handler.
     *
     * @emits matchCanceled
     * @emits unhandledMessage
     * @emits error
     */
    handleMessage(data) {
        if (this.messageResolve) {
            this.messageResolve(data)
            return
        }
        // If there is no messageResolve, there is no messageReject.
        let err
        if (data.action == 'matchCanceled') {
            err = new MatchCanceledError(data.reason)
            if (this.emit('matchCanceled', err)) {
                return
            }
        }
        if (this.emit('unhandledMessage', data)) {
            return
        }
        if (!err) {
            err = ClientError.forData(data)
        }
        this.logger.warn('Unhandled message from server', err)
        // Since this is recoverable, we emit an error instead of throwing.
        // Very interesting: this exits the process even on tests, no matter
        // whether we throw or emit.
        //throw err
        this.emit('error', err)
    }

    /**
     * @returns self
     */
    sendMessage(req) {
        req = {secret: this.secret, ...req}
        this.logger.debug('sendMessage', req)
        this.conn.sendUTF(JSON.stringify(req))
        return this
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
    }

    postJson(uri, data) {
        const url = [this.serverHttpUrl, stripLeadingSlash(uri)].join('/')
        const params = {
            method  : 'post'
          , headers : {'content-type': 'application/json'}
          , body    : JSON.stringify(data)
        }
        return fetch(url, params)
    }

    matchParams(params) {
        if (typeof params == 'string') {
            params = {action: params}
        }
        return {id: this.matchId, color: this.color, ...params}
    }

    static generateSecret() {
        return secret1()
    }
}

module.exports = Client