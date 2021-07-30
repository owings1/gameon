/**
 * gameon - Server class
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

const Api       = require('./api')
const Auth      = require('./auth')
const Web       = require('./web')
const WsServer  = require('websocket').server

const bodyParser = require('body-parser')
const express    = require('express')
const onFinished = require('on-finished')
const prom       = require('prom-client')

const {
    MatchCancelRef
  , Opponent
  , Red
  , White
} = Constants

const {castToArray, hash, makeErrorObject, update, uuid} = Util

const {
    HandshakeError
  , InvalidActionError
  , MatchAlreadyExistsError
  , MatchAlreadyJoinedError
  , MatchNotFoundError
  , RequestError
  , ValidateError
} = Errors

function statusLogLevel(code) {
    if (code >= 500) {
        return 'error'
    }
    if (code >= 400) {
        return 'warn'
    }
    return 'info'
}

function httpVersion(req) {
    return req.httpVersionMajor + '.' + req.httpVersionMinor
}

function httpVersionString(req) {
    return 'HTTP/' + httpVersion(req)
}

function formatLog(req, res) {
    return [
        res.statusCode
      , req.method
      , req.url
      , httpVersionString(req)
      , res.get('Content-Length')
      , req.ip
    ].join(' ')
}

class Server {

    /**
     * Get the default options.
     *
     * @param {object} (optional) The environment variables
     * @return {object} The default options
     */
    static defaults(env) {
        return {
            socketHsTimeout : +env.SOCKET_HSTIMEOUT || 5000
          , webEnabled      : !env.GAMEON_WEB_DISABLED
        }
    }

    /**
     * @constructor
     *
     * @param {object} (optional) The options
     * @throws {TypeError}
     */
    constructor(opts) {

        this.logger = new Logger(this.constructor.name, {server: true})

        this.opts = Util.defaults(Server.defaults(process.env), opts)
        this.auth = Auth.create({...opts, ...this.opts})
        this.api  = new Api(this.auth, opts)
        this.web  = new Web(this.auth, opts)

        this.app = this.createApp()
        this.metricsApp = this.createMetricsApp()

        this.promRegistry = null
        this.metrics = null

        this.matches = {}
        this.httpServer = null
        this.socketServer = null
        this.port = null
        this.metricsPort = null
    }

    /**
     * @async
     *
     * @param {integer} (optional)
     * @param {integer} (optional)
     */
    async listen(port, metricsPort) {

        this.close(true)

        await new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(port, resolve)
            } catch (err) {
                reject(err)
            }
        })
        this.port = this.httpServer.address().port
        this.logger.info('Listening on port', this.port, 'with', this.auth.type, 'auth')

        this.socketServer = this.createSocketServer(this.httpServer)

        await new Promise((resolve, reject) => {
            try {
                this.promRegistry = new prom.Registry
                this.metrics = this.createMetrics()
                prom.collectDefaultMetrics({register: this.promRegistry})
                this.metricsHttpServer = this.metricsApp.listen(metricsPort, resolve)
            } catch (err) {
                reject(err)
            }
        })

        this.metricsPort = this.metricsHttpServer.address().port
        this.logger.info('Metrics listening on port', this.metricsPort)
        return this
    }

    /**
     * @param {boolean} (optional)
     * @return self
     */
    close(isSkipLog = false) {
        if (!isSkipLog) {
            this.logger.info('Shutting down server')
        }
        Object.keys(this.matches).forEach(id =>
            this.cancelMatchId(id, MatchCancelRef.serverShutdown)
        )
        if (this.socketServer) {
            this.closeConn(Object.values(this.socketServer.conns))
            this.socketServer.shutDown()
            this.socketServer = null
        }
        if (this.httpServer) {
            this.httpServer.close()
            this.httpServer = null
        }
        if (this.metricsHttpServer) {
            this.metricsHttpServer.close()
            this.metricsHttpServer = null
        }
        if (this.promRegistry) {
            this.promRegistry.clear()
            this.promRegistry = null
        }
        if (!isSkipLog) {
            this.logger.info('Server shutdown complete')
        }
        return this
    }

    /**
     * @return {function} Express app
     */
    createApp() {

        const app = express()

        app.use((req, res, next) => {
            const level = statusLogLevel(res.statusCode)
            onFinished(res, () => this.logger[level](formatLog(req, res)))
            next()
        })

        app.get('/health', (req, res) => {
            res.status(200).send('OK')
        })

        app.use('/api/v1', this.api.v1)

        if (this.opts.webEnabled) {
            app.use('/', this.web.app)
        }

        return app
    }

    /**
     * @return {function} Express app
     */
    createMetricsApp() {

        const app = express()

        app.get('/metrics', (req, res) => {
            try {
                res.set('content-type', this.promRegistry.contentType)
                this.fetchMetrics().then(metrics => res.status(200).end(metrics))
            } catch (err) {
                const error = {name: err.name, message: err.message}
                const body = {status: 500, message: 'Internal Error', error}
                res.status(500).send(body)
            }
        })

        return app
    }

    /**
     * @return {object} Prometheus metrics
     */
    createMetrics() {
        return {
            connections: new prom.Gauge({
                name: 'open_connections',
                help: 'Open connections',
                registers: [this.promRegistry]
            }),
            matchesCompleted: new prom.Counter({
                name: 'matches_completed',
                help: 'Total matches completed',
                registers: [this.promRegistry]
            }),
            matchesInProgress: new prom.Gauge({
                name: 'matches_in_progress',
                help: 'Matches in progress',
                registers: [this.promRegistry]
            }),
            messagesReceived: new prom.Counter({
                name: 'messages_received',
                help: 'Messages received',
                registers: [this.promRegistry]
            }),
            messagesSent: new prom.Counter({
                name: 'messages_sent',
                help: 'Messages sent',
                registers: [this.promRegistry]
            }),
            errorsSending: new prom.Counter({
                name: 'errors_sending',
                help: 'Errors sending messages',
                registers: [this.promRegistry]
            })
        }
    }

    /**
     * @async
     *
     * @return {object}
     */
    fetchMetrics() {
        return this.promRegistry.metrics()
    }

    /**
     * @param {http.Server}
     * @return {WebSocketServer}
     */
    createSocketServer(httpServer) {

        const server = new WsServer({httpServer})
        server.conns = {}

        server.on('request', request => {

            const {conns} = server
            const connId = Server.newConnectionId()

            // Being extra careful not to keep a reference to conn in this scope.
            conns[connId] = request.accept(null, request.origin)
            conns[connId].connId = connId

            this.logger.info('Peer', connId, 'connected', conns[connId].remoteAddress)

            this.metrics.connections.labels().set(Object.keys(conns).length)

            conns[connId].on('close', () => {
                const conn = conns[connId]
                clearTimeout(conn.handShakeTimeoutId)
                this.logger.info('Peer', connId, 'disconnected')
                this.cancelMatchId(conn.matchId, MatchCancelRef.peerDisconnected)
                delete conns[connId]
                this.metrics.connections.labels().set(Object.keys(conns).length)
                this.logActive()
            })

            conns[connId].on('message', msg => {
                const conn = conns[connId]
                this.metrics.messagesReceived.labels().inc()
                let req
                try {
                    req = JSON.parse(msg.utf8Data)
                } catch (err) {
                    this.logger.warn('Invalid JSON from', conn.color, connId, err)
                    return
                }
                this.logger.log('Received message from', conn.color, connId, req.action)
                this.response(conn, req)
            })

            conns[connId].handShakeTimeoutId = setTimeout(() => {
                const conn = conns[connId]
                if (conn && conn.connected && !conn.secret) {
                    this.logger.warn('Peer', connId, 'handshake timeout', conn.remoteAddress)
                    const err = new HandshakeError('Client handshake timeout')
                    this.sendMessage(conn, msg)
                    this.closeConn(conn)
                }
            }, this.opts.socketHsTimeout)
        })

        return server
    }

    /**
     * Response to a request from a connection. Delegates to one of four
     * response types:
     *
     *   ❯ handshakeResponse
     *   ❯ matchCreateResponse
     *   ❯ matchJoinResponse
     *   ❯ matchPlayResponse
     *
     * Error Responses:
     *
     *   ❯ AuthError
     *   ❯ InternalError
     *   ❯ RequestError
     *   ❯ ValidateError
     *
     * @async
     *
     * @param {WebSocketConnection} The client connection
     * @param {object} The request data
     * @return {undefined}
     */
    async response(conn, req) {

        try {

            if (typeof req != 'object') {
                throw new RequestError('Invalid request data')
            }

            const {action} = req

            if (action != 'establishSecret') {
                if (!conn.secret) {
                    throw new HandshakeError('no secret')
                }
                if (req.secret != conn.secret) {
                    throw new HandshakeError('bad secret')
                }
            }

            switch (action) {

                case 'establishSecret':
                    await this.handshakeResponse(conn, req)
                    break

                case 'createMatch':
                    this.matchCreateResponse(conn, req)
                    break

                case 'joinMatch':
                    this.matchJoinResponse(conn, req)
                    break

                default:
                    this.matchPlayResponse(req)
                    break
            }

        } catch (err) {
            if (req.password) {
                req.password = '***'
            }
            this.logger.warn('Peer', conn.connId, err.message, err, {req})
            this.sendMessage(conn, err)
            if (err.isHandshakeError) {
                this.closeConn(conn)
            }
        }
    }

    /**
     * @async
     *
     * @throws {AuthError}
     * @throws {InternalError}
     * @throws {RequestError}
     * @throws {ValidateError}
     *
     * @param {WebSocketConnection} The client connection
     * @param {object} The request data
     * @return {undefined}
     */
    async handshakeResponse(conn, req) {

        clearTimeout(conn.handShakeTimeoutId)

        try {
            Server.validateSecret(req.secret)
        } catch (err) {
            throw new HandshakeError(err.message)
        }

        if (conn.secret && conn.secret != req.secret) {
            throw new HandshakeError('handshake disagreement')
        }

        if (req.token) {
            try {
                var {username, password} = this.auth.parseToken(req.token)
            } catch (err) {
                if (!err.isArgumentError) {
                    this.logger.error(err)
                }
                // Reduce error tree, only pass message.
                throw new ValidateError(err.message)
            }
        } else {
            var {username, password} = req
        }

        const {passwordEncrypted} = await this.auth.authenticate(username, password)

        update(conn, {
            username
          , secret: req.secret
        })

        this.sendMessage(conn, {action: 'acknowledgeSecret', passwordEncrypted})
        this.logger.log('Client connected', conn.connId)
    }

    /**
     * Handle a createMatch response.
     *
     * @throws {ValidateError}
     *
     * @param {WebSocketConnection} The client connection
     * @param {object} The request data
     * @return {undefined}
     */
    matchCreateResponse(conn, req) {

        const id = Server.matchIdFromSecret(conn.secret)

        Server.validateMatchId(id)

        const {total, opts} = req
        let match
        try {
            match = new Match(total, opts)
        } catch (err) {
            if (!err.isArgumentError) {
                this.logger.error(err)
            }
            // Reduce error tree, only pass message.
            throw new ValidateError(err.message)
        }

        this.logger.info('Match', id, 'created')

        update(match, {id, conns: {White: conn, Red: null}, sync: {}})
        update(conn, {matchId: id, color: White})

        this.matches[id] = match

        this.sendMessage(conn, {action: 'matchCreated', id, match: match.meta()})

        this.logActive()
        this.metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
    }

    /**
     * Handle a `joinMatch` response. On success, this will send a `matchJoined`
     * response to the requester (Red) with the match information, and an
     * `opponentJoined` response to the waiting match creator (White) with
     * the match ID.
     *
     * @throws {RequestError.MatchAlreadyJoinedError}
     * @throws {RequestError.MatchNotFoundError}
     * @throws {ValidateError}
     *
     * @param {WebSocketConnection} The client connection
     * @param {object} The request data
     * @return {undefined}
     */
    matchJoinResponse(conn, req) {

        const {id} = req

        Server.validateMatchId(id)

        const match = this.matches[id]

        if (!match) {
            throw new MatchNotFoundError('match not found')
        }

        if (match.conns.Red) {
            throw new MatchAlreadyJoinedError('match already joined')
        }

        const {total, opts} = match

        match.conns.Red = conn
        update(conn, {matchId: id, color: Red})

        this.logger.info('Match', id, 'joined')

        this.sendMessage(match.conns.White, {action: 'opponentJoined', id})
        this.sendMessage(conn, {action: 'matchJoined', id, total, opts, match: match.meta()})
        
        this.logActive()
    }

    /**
     * Handle a match play response. Since connection IDs for a match are stored
     * internally, only the request data is needed.
     *
     * Error Responses:
     *
     *   ❯ RequestError
     *   ❯ ValidateError
     *
     * @throws {RequestError.HandshakeError}
     * @throws {RequestError.MatchNotFoundError}
     * @throws {ValidateError}
     *
     * @param {object} The request data
     * @return {undefined}
     */
    matchPlayResponse(req) {

        const match = this.getMatchForRequest(req)

        const {action, color} = req

        Server.validateColor(color)

        const opponent = Opponent[color]
        const isFirst = !Object.keys(match.sync).length
        const {thisGame} = match
        const thisTurn = thisGame && thisGame.thisTurn

        const resolve = res => {
            this.sendMessage(Object.values(match.conns), {action, ...res})
        }

        const reject = err => {
            // When one client sends a bad request, it doesn't make sense to
            // send the same error to the other client. This is not ideal, since
            // the offending client may not retry the request, and thus will
            // leave the innocent one waiting.
            //this.sendMessage(Object.values(match.conns), err)
            this.sendMessage(match.conns[color], err)
        }

        const sync = next => {
            match.sync[color] = action
            this.logger.debug({action, color, sync: match.sync})
            if (match.sync.White == match.sync.Red) {
                match.sync = {}
                resolve(next())
            }
        }

        const handle = (before, done) => {
            let ret
            try {
                ret = before()
            } catch (err) {
                reject(err)
                return
            }
            sync(() => done(ret))
        }

        switch (action) {

            case 'nextGame':

                handle(
                    () => {
                        if (thisGame) {
                            thisGame.checkFinished()
                        }
                        if (isFirst) {
                            return match.nextGame()
                        }
                        return thisGame
                    }
                  , game => ({game: game.meta()})
                )

                break

            case 'firstTurn':

                handle(
                    () => isFirst ? thisGame.firstTurn() : thisTurn
                  , turn => ({
                        dice: turn.dice
                      , turn: turn.serialize()
                    })
                )

                break

            case 'nextTurn':

                handle(
                    () => {
                        if (isFirst) {
                            return thisGame.nextTurn()
                        }
                        return thisTurn
                    }                            
                  , turn => ({
                        turn: turn.meta()
                      , game: thisGame.meta()
                    })
                )

                break

            case 'turnOption':

                handle(
                    () => {
                        if (thisTurn.color == color) {
                            if (req.isDouble) {
                                thisTurn.setDoubleOffered()
                            }
                        }
                        return thisTurn
                    }
                  , turn => ({
                        isDouble : turn.isDoubleOffered && !turn.isRolled
                      , turn     : turn.meta()
                      , game     : thisGame.meta()
                    })
                )

                break

            case 'doubleResponse':

                handle(
                    () => {
                        if (thisTurn.color == opponent) {
                            if (req.isAccept) {
                                thisGame.double()
                            } else {
                                thisTurn.setDoubleDeclined()
                            }
                        }
                        if (!isFirst) {
                            this.checkMatchFinished(match)
                        }
                        return thisTurn
                    }
                  , turn => ({
                        isAccept : !turn.isDoubleDeclined
                      , turn     : turn.meta()
                      , game     : thisGame.meta()
                      , match    : match.meta()
                    })
                )

                break

            case 'rollTurn':

                handle(
                    () => {
                        if (thisTurn.color == color) {
                            thisTurn.roll()
                        }
                        return thisTurn
                    }
                  , turn => ({
                        dice : turn.dice
                      , turn : turn.serialize()
                    })
                )

                break

            case 'playRoll':

                handle(
                    () => {
                        if (thisTurn.color == color) {
                            if (!Array.isArray(req.moves)) {
                                throw new ValidateError('moves missing or invalid format')
                            }
                            req.moves.forEach(move => thisTurn.move(move.origin, move.face))
                            thisTurn.finish()
                        }
                        if (!isFirst) {
                            this.checkMatchFinished(match)
                        }
                        return thisTurn
                    }
                  , turn => ({
                        moves : turn.moves.map(move => move.coords)
                      , turn  : turn.meta()
                      , game  : thisGame.meta()
                      , match : match.meta()
                    })
                )

                break

            default:
                reject(new InvalidActionError(`Bad action ${action}`))
                break
        }
    }

    /**
     * Send a message to one or more socket connections.
     *
     * @param {WebSocketConnection|array} The connection, or array of connections
     * @param {object} The message data
     * @return {boolean} Whether all messages were send successfully
     */
    sendMessage(conns, data) {

        data = data || {}

        let title = data.action
        if (data instanceof Error) {
            if (!data.isRequestError) {
                data = RequestError.forError(data)
            }
            data = makeErrorObject(data)
            title = data.namePath || data.name
        }

        const body = JSON.stringify(data)

        let isSuccess = true
        castToArray(conns).forEach(conn => {
            try {
                if (conn && conn.connected) {
                    this.logger.log('Sending message to', conn.color, conn.connId, title)
                    conn.sendUTF(body)
                    this.metrics.messagesSent.labels().inc()
                }
            } catch (err) {
                isSuccess = false
                const id = (conn && conn.id) || null
                this.logger.warn('Failed sending message', {id}, err)
                this.metrics.errorsSending.labels().inc()
                this.closeConn(conn)
            }
        })

        return isSuccess
    }

    /**
     * Check if a match is finished, and update the match score. If the match
     * is finished, delete the match from the stored matches.
     *
     * @param {Match} The match to check
     * @return {boolean} Whether the match is finished
     */
    checkMatchFinished(match) {
        if (match.thisGame && match.thisGame.checkFinished()) {
            match.updateScore()
            match.checkFinished()
        }
        if (match.hasWinner()) {
            this.logger.info('Match', match.id, 'is completed')
            this.metrics.matchesCompleted.labels().inc()
            delete this.matches[match.id]
            this.metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
            this.logActive()
            return true
        }
        return false
    }

    /**
     * Log the current active connection information.
     * @return {undefined}
     */
    logActive() {
        const numConns = this.socketServer ? Object.keys(this.socketServer.conns).length : 0
        const numMatches = Object.keys(this.matches).length
        this.logger.info('There are now', numMatches, 'active matches, and', numConns, 'active connections')
    }

    /**
     *
     * @param {string} The match ID
     * @param {string} The reference object {reason, attrs}
     * @return self
     */
    cancelMatchId(id, {reason, attrs}) {
        const match = this.matches[id]
        if (!match) {
            return this
        }
        this.logger.info('Canceling match', id)
        this.sendMessage(Object.values(match.conns), {action: 'matchCanceled', reason, attrs})
        delete this.matches[id]
        this.metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
        return this
    }

    /**
     * @throws {RequestError.HandshakeError}
     * @throws {RequestError.MatchNotFoundError}
     * @throws {ValidateError}
     *
     * @param {object} The request data
     * @return {Match} The match from the stored matches
     */
    getMatchForRequest(req) {
        const {id, color, secret} = req
        if (!secret || secret.length != 64) {
            throw new HandshakeError('bad secret')
        }
        Server.validateColor(color)
        if (!this.matches[id]) {
            throw new MatchNotFoundError('match not found')
        }
        const match = this.matches[id]
        if (!match.conns[color] || secret != match.conns[color].secret) {
            throw new HandshakeError('bad secret')
        }
        return match
    }

    /**
     * Safely close connection(s).
     *
     * @param {WebSocketConnection|array} The connection, or array of connections
     * @return self
     */
    closeConn(conns) {

        castToArray(conns).forEach(conn => {
            try {
                if (conn && conn.connected) {
                    conn.close()
                }
            } catch (err) {
                const id = (conn && conn.id) || null
                this.logger.warn('Failed to close connection', {id}, err)
            }
        })

        return this
    }

    /**
     * The loglevel (integer).
     */
    get loglevel() {
        return this.logger.loglevel
    }

    /**
     * Setter for loglevel (integer). Propagates to auth, api, and web.
     */
    set loglevel(n) {
        this.logger.loglevel = n
        this.auth.loglevel = n
        this.api.loglevel = n
        this.web.loglevel = n
    }

    /**
     * Validate a color string.
     *
     * @throws {ValidateError}
     *
     * @param {string} The color string to test
     * @return {string} The color string
     */
    static validateColor(color) {
        if (color != White && color != Red) {
            throw new ValidateError(`Invalid color: ${color}.`)
        }
        return color
    }

    /**
     * Validate a match ID string.
     *
     * @throws {ValidateError}
     *
     * @param {string} The string to test
     * @return {string} The match ID string
     */
    static validateMatchId(str) {
        if (!str || typeof str != 'string' || str.length != 8) {
            throw new ValidateError('Invalid match ID.')
        }
        return str
    }

    /**
     * Validate a client secret string.
     *
     * @throws {ValidateError}
     *
     * @param {string} The string to test
     * @return {string} The secret string
     */
    static validateSecret(str) {
        if (!str || typeof str != 'string' || str.length != 64) {
            throw new ValidateError('Invalid secret.')
        }
        return str
    }

    /**
     * Generate a new connection ID.
     *
     * @return {string} The connection ID
     */
    static newConnectionId() {
        return uuid()
    }

    /**
     * Generate a match ID from a client secret.
     *
     * @throws {ValidateError}
     *
     * @param {string} The client secret
     * @return {string} The 8-character match ID
     */
    static matchIdFromSecret(str) {
        Server.validateSecret(str)
        return hash('sha256', str, 'hex').substring(0, 8)
    }
}

module.exports = Server