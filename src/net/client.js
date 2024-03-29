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
import {EventEmitter} from 'events'
import {update} from '@quale/core/objects.js'
import WebSocket from 'websocket'
import {Match} from '../lib/core.js'
import {White, Red} from '../lib/constants.js'
import {
    createLogger,
    httpToWs,
    secret1,
    stripTrailingSlash,
    trimMessageData,
    wsToHttp,
} from '../lib/util.js'

import {
    ClientError,
    ConnectionClosedError,
    MatchCanceledError,
    ParallelRequestError,
    UnexpectedResponseError,
} from '../lib/errors.js'

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
 */
export default class Client extends EventEmitter {

    /**
     * @constructor
     *
     * @param {object} credentials The credentials {serverUrl, username, password}
     */
    constructor(credentials = undefined) {
        super()
        this.name = this.constructor.name
        this.logger = createLogger(this, {type: 'named'})
        const {serverUrl, username, password} = credentials || {}
        this.setServerUrl(serverUrl)
        this.username = username
        this.password = password
        this.socketClient = new WebSocket.client
        this.secret = secret1()
        this.token = null
        this.conn = null
        this.isHandshake = null
        this.match = null
        this.matchId = null
        this.isClosing = false
    }

    /**
     * Connect to the socket server.
     *
     * @throws {ClientError}
     * @return {Promise}
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                resolve()
                return
            }
            this.isClosing = false
            this.socketClient
                .removeAllListeners('connectFailed')
                .removeAllListeners('connect')
            this.socketClient.on('connectFailed', err => {
                // WebSocketClient throws generic Error
                reject(ClientError.forConnectFailedError(err))
            })
            this.socketClient.on('connect', conn => {
                this.conn = conn
                conn.on('error', err => {
                    // Observed errors:
                    //  ❯ ECONNRESET, syscall: read, errno: -54
                    //  ❯ EPIPE, syscall: write, errno: -32
                    this.logger.debug('conn.error', err)
                    this.logger.debug('cancelMatch.from.conn.error')
                    const isHandled = this.cancelMatch(err)
                    if (!this.isClosing) {
                        this.logger.error(err)
                    }
                })
                conn.on('close', (code, description) => {
                    /**
                     * ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
                     * ┃ WebSocketConnection.CLOSE_DESCRIPTIONS                ┃
                     * ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
                     * ┃ 1000  ┃ Normal connection closure                     ┃
                     * ┃ 1001  ┃ Remote peer is going away                     ┃
                     * ┃ 1002  ┃ Protocol error                                ┃
                     * ┃ 1003  ┃ Unprocessable input                           ┃
                     * ┃ 1004  ┃ Reserved                                      ┃
                     * ┃ 1005  ┃ Reason not provided                           ┃
                     * ┃ 1006  ┃ Abnormal closure, no further detail available ┃
                     * ┃ 1007  ┃ Invalid data received                         ┃
                     * ┃ 1008  ┃ Policy violation                              ┃
                     * ┃ 1009  ┃ Message too big                               ┃
                     * ┃ 1010  ┃ Extension requested by client is required     ┃
                     * ┃ 1011  ┃ Internal Server Error                         ┃
                     * ┃ 1015  ┃ TLS Handshake Failed                          ┃
                     * ┗━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                     */
                    this.logger.debug('conn.close', code, description)
                    this.conn = null
                    this.isHandshake = false
                    // Removing listeners could swallow some errors, for example
                    // a connection reset on a server shutdown. But in theory
                    // these represent more general events handled elsewhere.
                    conn.removeAllListeners()
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
                    this._handleMessage(data)
                })
                this._handshake().then(() => {
                    resolve()
                    // In case we reject afterward, probably a noop.
                    reject = err => this.emit('error', err)
                }).catch(reject)
            })
            try {
                this.socketClient.connect(this.serverSocketUrl)
            } catch (err) {
                reject(ClientError.forConnectThrowsError(err))
            }
        })
    }

    /**
     * @param {Error} err
     * @throws {ClientError} When a pending response is expected
     */
    close(err = undefined) {
        this.isClosing = true
        try {
            err = err || new ConnectionClosedError('Client closing')
            this.logger.debug('cancelMatch.from.client.close')
            this.cancelMatch(err)
            // NB: this can throw an unhandled promise rejection if a caller of
            //     waitForMessage does not handle the error.
            this.cancelWaiting(err)
        } finally {
            if (this.conn) {
                this.conn.close()
            }
            this.socketClient
                .removeAllListeners('connectFailed')
                .removeAllListeners('connect')
        }
    }

    /**
     * Create a new match. Sends a `createMatch` request to the server. Emits
     * the `matchCreated` event once the server creates the match. Emits the
     * `opponentJoined` event when the opponent joins, and returns the match.
     *
     * @async
     * @param {object} opts The match options, which must include `total`
     * @return {Match}
     * @throws {ClientError}
     * @throws {MatchCanceledError}
     * @emits matchCreated
     * @emits opponentJoined
     */
    async createMatch(opts) {
        await this.connect()
        const {total} = opts
        const req = {action: 'createMatch', total, opts}
        let res = await this._sendAndWaitForResponse(req, 'matchCreated')
        const {id, match} = res
        this.matchId = id
        this.match = Match.unserialize(match)
        this.color = White
        this.logger.info('Created new match', id)
        this.emit('matchCreated', id, this.match)
        this.logger.info('Waiting for opponent to join')
        res = await this._waitForResponse('opponentJoined')
        this.logger.info('Opponent joined', id)
        this.emit('opponentJoined', this.match)
        return this.match
    }

    /**
     * @async
     * @param {integer} id The match ID
     * @return {Match}
     * @throws {ClientError}
     * @emits matchJoined
     */
    async joinMatch(id) {
        await this.connect()
        this.logger.info('Joining match', id)
        const req = {action: 'joinMatch', id}
        const {match} = await this._sendAndWaitForResponse(req, 'matchJoined')
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
     * @param {string} action The play action
     * @param {object} params Additional request data
     * @return {object} The response
     * @throws {ClientError}     
     * @throws {MatchCanceledError}
     * @throws {WaitingAbortedError}
     * @emits matchRequest
     * @emits matchResponse
     */
    async matchRequest(action, params) {
        const req = {...this.matchParams(action), ...params}
        this.emit('matchRequest', req)
        const res = await this._sendAndWaitForResponse(req, action)
        this.emit('matchResponse', req, res)
        return res
    }

    /**
     *
     * @param {Error} err
     * @return {Boolean} Whether a reject handler was called.
     */
    cancelWaiting(err) {
        if (this.messageReject) {
            this.logger.debug('cancelWaiting.rejecting')
            this.messageReject(err)
            return true
        }
        this.logger.debug('cancelWaiting.nothing.waiting')
        return false
    }

    /**
     * Emit matchCanceled if there is an active match, and clear the current
     * match properties.
     *
     * @param {Error} err The error to pass to the matchCanceled event
     * @return {Boolean} Whether there was an active match AND a listener attached
     */
    cancelMatch(err) {
        if (!this.match) {
            this.logger.log('No match to cancel')
            return false
        }
        try {
            if (this.emit('matchCanceled', err)) {
                this.logger.debug('matchCanceled', 'handled')
                return true
            }
            return false
        } finally {
            this.clearCurrentMatch()
        }
    }

    /**
     * Clear the current match properties.
     *
     * @return {Client} self
     */
    clearCurrentMatch() {
        return update(this, {
            match   : null,
            matchId : null,
            color   : null,
        })
    }

    /**
     * @param {object|string} params
     * @return {object}
     */
    matchParams(params) {
        if (typeof params === 'string') {
            params = {action: params}
        }
        return {id: this.matchId, color: this.color, ...params}
    }

    /**
     * @param {string|null} serverUrl The server URL
     * @return {Client} self
     */
    setServerUrl(serverUrl) {
        this.serverSocketUrl = httpToWs(serverUrl)
        this.serverHttpUrl = stripTrailingSlash(wsToHttp(serverUrl))
        return this
    }

    /**
     * @type {Boolean}
     */
    get isConnected() {
        return Boolean(this.conn && this.conn.connected)
    }

    /**
     * @type {Number}
     */
    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
    }

    /**
     * Send a message, then wait for a response, optionally of a specific action.
     *
     * See {@method waitForResponse}
     *
     * @async
     * @param {object} req The request data.
     * @param {string} action The expected action of the response.
     * @return {object|Error|null}
     * @throws {ClientError}
     * @throws {GameError.MatchCanceledError}
     * @throws {MenuError.WaitingAbortedError}
     */
    _sendAndWaitForResponse(req, action = undefined) {
        const promise = this._waitForResponse(action)
        this._sendMessage(req)
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
     *    is no attached listener, the responseError event is emitted.
     *
     *  ❯ If the error has the attribute isClientShouldClose, the client is closed.
     *
     *  ❯ Then the error is thrown.
     *
     * @async
     * @param {string} action The expected action of the response
     * @return {object|Error|null}
     * @emits matchCanceled
     * @emits responseError
     * @throws {ConnectionClosedError}
     * @throws {ParallelRequestError}
     * @throws {UnexpectedResponseError}
     * @throws {ClientError}
     * @throws {MatchCanceledError}
     * @throws {WaitingAbortedError}
     */
    async _waitForResponse(action = undefined) {
        const data = await this._waitForMessage()
        try {
            if (data.isError) {
                this.logger.debug('data.isError', 'throwing')
                throw ClientError.forData(data)
            }
            if (!action || data.action === action) {
                this.logger.debug('action met', action)
                return data
            }
            if (data.action === 'matchCanceled') {
                throw new MatchCanceledError(data.reason, {attrs: data.attrs})
            }
            throw new UnexpectedResponseError(
                `Expecting response ${action}, but got ${data.action} instead`
            )
        } catch (err) {
            try {
                if (err.isMatchCanceledError) {
                    this.logger.debug('cancelMatch.from._waitForResponse')
                    if (!this.cancelMatch(err)) {
                        // This is for debugging.
                        if (this.emit('responseError', err, data)) {
                            this.logger.warn(err)
                        } else {
                            this.logger.error(err)
                        }
                    }
                }
            } finally {
                if (err.isClientShouldClose) {
                    this.logger.debug('waitForResponse.isClientShouldClose')
                    this.close(err)
                }
            }
            throw err
        }
    }

    /**
     * Wait for any valid JSON message.
     *
     * @async
     * @return {object}
     * @throws {ClientError}
     * @throws {ClientError}
     * @throws {GameError}
     * @throws {MenuError}
     * @emits response
     */
    _waitForMessage() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
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
                this.logger.debug('response', trimMessageData(data))
                resolve(data)
                // Clear current match if finished.
                if (data.match && data.match.uuid && data.match.isFinished) {
                    if (this.match && this.match.uuid === data.match.uuid) {
                        this.clearCurrentMatch()
                    }
                }
            }
            this.messageReject = err => {
                this.logger.debug('messageReject')
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
     * @param {object} data
     * @emits matchCanceled
     * @emits unhandledMessage
     * @emits error
     */
    _handleMessage(data) {
        this.logger.debug('message', trimMessageData(data))
        if (this.messageResolve) {
            this.messageResolve(data)
            return
        }
        // If there is no messageResolve, there is no messageReject.
        let err
        try {
            if (data.action === 'matchCanceled') {
                err = new MatchCanceledError(data.reason, {attrs: data.attrs})
                // Let the matchCanceled handler take care of the error.
                this.logger.debug('cancelMatch.from._handleMessage')
                if (this.cancelMatch(err)) {
                    return
                }
            }
            if (!err) {
                err = ClientError.forData(data)
            }
            if (this.emit('unhandledMessage', data)) {
                return
            }
            this.logger.warn('Unhandled message from server', err)
            // Since this is recoverable, we emit an error instead of throwing.
            // Interesting: this exits the process even on tests, no matter
            // whether we throw or emit.
            //throw err
            this.emit('error', err)
        } finally {
            if (err && err.isClientShouldClose) {
                this.logger.debug('handleMessage.isClientShouldClose')
                this.close(err)
            }
        }
    }

    /**
     * @param {object} req
     * @return {self}
     */
    _sendMessage(req) {
        req = {secret: this.secret, ...req}
        this.logger.debug('sendMessage', trimMessageData(req))
        this.conn.sendUTF(JSON.stringify(req))
        return this
    }

    /**
     * @return {object}
     * @async
     * @throws {ClientError}
     */
    async _handshake() {
        const {username, password, token} = this
        const req = {action: 'establishSecret', username, password, token}
        const res = await this._sendAndWaitForResponse(req, 'acknowledgeSecret')
        this.logger.log('Server handshake success')
        this.isHandshake = true
        return res
    }
}
