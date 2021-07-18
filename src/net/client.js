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
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const {Match}   = require('../lib/core')
const Util      = require('../lib/util')

const fetch = require('node-fetch')

const {EventEmitter} = require('events')
const WsClient       = require('websocket').client

const {White, Red} = Constants

const {
    httpToWs
  , secret1
  , stripLeadingSlash
  , stripTrailingSlash
  , update
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

function trimMessageData(data) {
    if (!data || !data.turn) {
        return data
    }
    const {turn} = data
    const trimmed = {
        ...data
      , turn: {...turn}
    }
    if (turn.allowedMoveIndex) {
        update(trimmed.turn, {
            allowedEndStates: '[trimmed]'
          , allowedMoveIndex: '[trimmed]'
          , endStatesToSeries: '[trimmed]'
        })
    }
    return trimmed
}
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

    /**
     * @param object (optional) The credentials, serverUrl, username, password.
     */
    constructor(credentials) {

        super()

        this.logger = new Logger(this.constructor.name, {named: true})

        const {serverUrl, username, password} = credentials || {}

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
                    //  ❯ ECONNRESET
                    //  ❯ EPIPE, syscall: write, errno: -32
                    this.logger.debug('conn.error', err)
                    const isHandled = this.cancelMatch(err)
                    try {
                        this.close()
                    } finally {
                        if (!isHandled) {
                            // Only emit error if there is an active match
                            if (this.match) {
                                this.emit('error', err)
                            } else {
                                this.logger.warn(err)
                            }
                        }
                    }
                })
                conn.on('close', () => {
                    this.logger.debug('conn.close')
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
                    this.handleMessage(data)
                })
                resolve()
                // In case we reject afterward, probably a noop.
                reject = err => this.emit('error', err)
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
        try {
            if (this.isWaiting) {
                // NB: this can throw an unhandled promise rejection if a caller of
                //     waitForMessage does not handle the error.
                this.cancelWaiting(new ConnectionClosedError('Client closing'))
            }
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
     * @async
     *
     * @throws ClientError
     *
     * @returns object
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
     * @param Error
     *
     * @returns boolean Whether a reject handler was called.
     */
    cancelWaiting(err) {
        this.logger.debug('cancelWaiting')
        if (this.messageReject) {
            this.messageReject(err)
            this.logger.debug('cancelWaiting handled')
            return true
        }
        this.logger.debug('cancelWaiting not handled')
        return false
    }

    /**
     * @async
     *
     * @param object The match options, which must include `total`.
     *
     * @emits matchCreated
     * @emits opponentJoined
     *
     * @throws ClientError
     * @throws GameError.MatchCanceledError
     *
     * @returns Match
     */
    async createMatch(opts) {

        await this.connect()

        const {total} = opts
        const req = {action: 'createMatch', total, opts}
        let res = await this.sendAndWaitForResponse(req, 'matchCreated')

        // Corner case of a generic responseError being handled
        if (res instanceof Error) {
            throw res
        }

        const {id, match} = res

        this.matchId = id
        this.match = Match.unserialize(match)
        this.color = White

        this.logger.info('Created new match', id)
        this.emit('matchCreated', id, this.match)

        this.logger.info('Waiting for opponent to join')

        res = await this.waitForResponse('opponentJoined')
        // If matchCanceled is handled, then an error is returned. This can
        // happen if the server shuts down while waiting.
        if (res instanceof Error) {
            this.cancelMatch(res)
            throw res
        }

        this.logger.info('Opponent joined', id)
        this.emit('opponentJoined', this.match)

        return this.match
    }

    /**
     * @async
     *
     * @param integer The match ID.
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
        let res = await this.sendAndWaitForResponse(req, 'matchJoined')

        // Corner case of a generic responseError being handled.
        if (res instanceof Error) {
            throw res
        }

        const {match} = res

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
     * @param string The play action.
     * @param object (optional) Additional request data.
     *
     * @emits response
     * @emits matchCanceled
     * @emits responseError
     *
     * @throws ClientError
     * @throws GameError.MatchCanceledError
     * @throws MenuError.WaitingAbortedError
     *
     * @returns object|Error|null
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
     * @param object The request data.
     * @param string (optional) The expected action of the response.
     *
     * @emits response
     * @emits matchCanceled
     * @emits responseError
     *
     * @throws ClientError
     * @throws GameError.MatchCanceledError
     * @throws MenuError.WaitingAbortedError
     *
     * @returns object|Error|null
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
     * @param string (optional) The expected action of the response.
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
     * @returns object|Error|null
     */
    async waitForResponse(action = null) {

        const data = await this.waitForMessage()

        if (data.isError) {
            this.logger.debug('data.isError', 'throwing')
            throw ClientError.forData(data)
        }

        if (!action || data.action == action) {
            this.logger.debug('action met', action)
            return data
        }

        let err

        if (data.action == 'matchCanceled') {
            err = new MatchCanceledError(data.reason)
        } else {
            err = new UnexpectedResponseError(
                `Expecting response ${action}, but got ${data.action} instead`
            )
        }

        // This is probably a noop.
        if (this.cancelWaiting(err)) {
            // To check for test coverage.
            let foo = 'bar'
        }

        if (err.isMatchCanceledError) {
            // Return the error if there is an active match and a matchCanceled
            // listener.
            if (this.cancelMatch(err)) {
                return err
            }
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
     * @returns object
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
                this.logger.debug('response', trimMessageData(data))
                resolve(data)
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
     * @param object
     *
     * @returns self
     */
    sendMessage(req) {
        req = {secret: this.secret, ...req}
        this.logger.debug('sendMessage', req)
        this.conn.sendUTF(JSON.stringify(req))
        return this
    }

    /**
     * Message event handler.
     *
     * @param object
     *
     * @emits matchCanceled
     * @emits unhandledMessage
     * @emits error
     */
    handleMessage(data) {
        this.logger.debug('message', trimMessageData(data))
        if (this.messageResolve) {
            this.messageResolve(data)
            return
        }
        // If there is no messageResolve, there is no messageReject.
        let err
        if (data.action == 'matchCanceled') {
            err = new MatchCanceledError(data.reason)
            // Let the matchCanceled handler take care of the error.
            if (this.cancelMatch(err)) {
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

    cancelMatch(err) {
        if (!this.match) {
            this.logger.log('No match to cancel')
            return false
        }
        let isHandled = false
        try {
            isHandled = this.emit('matchCanceled', err)
        } finally {
            update(this, {
                match   : null
              , matchId : null
              , color   : null
            })
        }
        if (isHandled) {
            this.logger.debug('matchCanceled', 'handled')
        }
        // ?
        return isHandled
    }
    /**
     * @async
     *
     * @param string
     * @param object
     *
     * @returns node-fetch.Response
     */
    postJson(uri, data) {
        const url = [this.serverHttpUrl, stripLeadingSlash(uri)].join('/')
        const params = {
            method  : 'post'
          , headers : {'content-type': 'application/json'}
          , body    : JSON.stringify(data)
        }
        return fetch(url, params)
    }

    /**
     *
     * @param object|string
     *
     * @returns object
     */
    matchParams(params) {
        if (typeof params == 'string') {
            params = {action: params}
        }
        return {id: this.matchId, color: this.color, ...params}
    }

    /**
     * @param string|null The server URL.
     *
     * @returns self
     */
    setServerUrl(serverUrl) {
        this.serverSocketUrl = httpToWs(serverUrl)
        this.serverHttpUrl = stripTrailingSlash(wsToHttp(serverUrl))
        return this
    }

    /**
     * Getter for loglevel (integer).
     */
    get loglevel() {
        return this.logger.loglevel
    }

    /**
     * Setter for loglevel (integer).
     */
    set loglevel(n) {
        this.logger.loglevel = n
    }

    /**
     *
     * @returns string
     */
    static generateSecret() {
        return secret1()
    }
}

module.exports = Client