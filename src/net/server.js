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
import {update} from '@quale/core/objects.js'
import {castToArray} from '@quale/core/types.js'
import express from 'express'
import onFinished from 'on-finished'
import prom from 'prom-client'
import WebSocket from 'websocket'
import {Match} from '../lib/core.js'
import Api from './api.js'
import Auth from './auth.js'
import Web from './web.js'
import {
    Red, White,
    MatchCancelRef,
    Opponent,
} from '../lib/constants.js'
import {
    createLogger,
    defaults,
    hash,
    makeErrorObject,
    uuid,
} from '../lib/util.js'
import {
    HandshakeError,
    InvalidActionError,
    MatchAlreadyJoinedError,
    MatchNotFoundError,
    RequestError,
    ValidateError,
} from '../lib/errors.js'

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
        res.statusCode,
        req.method,
        req.url,
        httpVersionString(req),
        res.get('Content-Length'),
        req.ip,
    ].join(' ')
}

const symMcnt = Symbol('matchCount')
const symCcnt = Symbol('connCount')

export default class Server {

    /**
     * Get the default options.
     *
     * @param {object} env The environment variables
     * @return {object} The default options
     */
    static defaults(env) {
        return {
            socketHsTimeout : +env.SOCKET_HSTIMEOUT || 5000,
            webEnabled      : !env.GAMEON_WEB_DISABLED,
        }
    }

    /**
     * @param {object} opts The options
     */
    constructor(opts = undefined) {
        this.logger = createLogger(this, {type: 'server'})
        this.opts = defaults(Server.defaults(process.env), opts)
        this.auth = Auth.create({...opts, ...this.opts})
        this.api = new Api(this.auth, opts)
        this.web = new Web(this.auth, opts)
        this.app = this.createApp()
        this.metricsApp = this.createMetricsApp()
        this.promRegistry = null
        this.metrics = null
        this.matches = {}
        this[symMcnt] = 0
        this[symCcnt] = 0
        this.httpServer = null
        this.socketServer = null
        this.port = null
        this.metricsPort = null
    }

    /**
     * @async
     * @param {Number} port
     * @param {Number} metricsPort
     */
    async listen(port = undefined, metricsPort = undefined) {
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
     * @param {Boolean} isSkipLog
     * @return {Server} self
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
     * @return {Function} Express app
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
     * @return {Function} Express app
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
     * @return {object}
     */
    fetchMetrics() {
        return this.promRegistry.metrics()
    }

    /**
     * @param {http.Server} httpServer
     * @return {WebSocket.server}
     */
    createSocketServer(httpServer) {
        const server = new WebSocket.server({httpServer})
        server.conns = {}
        server.on('request', request => {
            const {conns} = server
            const connId = Server.newConnectionId()
            // Being extra careful not to keep a reference to conn in this scope.
            conns[connId] = request.accept(null, request.origin)
            conns[connId].connId = connId
            this[symCcnt] += 1
            this.logger.info('Peer', connId, 'connected', conns[connId].remoteAddress)
            this.metrics.connections.labels().set(this[symCcnt])
            conns[connId].on('close', () => {
                const conn = conns[connId]
                clearTimeout(conn.handShakeTimeoutId)
                this.logger.info('Peer', connId, 'disconnected')
                this.cancelMatchId(conn.matchId, MatchCancelRef.peerDisconnected)
                delete conns[connId]
                this[symCcnt] -= 1
                this.metrics.connections.labels().set(this[symCcnt])
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
     * @param {WebSocketConnection} conn The client connection
     * @param {object} req The request data
     */
    async response(conn, req) {
        try {
            if (typeof req !== 'object') {
                throw new RequestError('Invalid request data')
            }
            const {action} = req
            if (action !== 'establishSecret') {
                if (!conn.secret) {
                    throw new HandshakeError('no secret')
                }
                if (req.secret !== conn.secret) {
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
     * @param {WebSocketConnection} conn The client connection
     * @param {object} req The request data
     * @throws {AuthError}
     * @throws {InternalError}
     * @throws {RequestError}
     * @throws {ValidateError}
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
        update(conn, {username, secret: req.secret})
        this.sendMessage(conn, {action: 'acknowledgeSecret', passwordEncrypted})
        this.logger.log('Client connected', conn.connId)
    }

    /**
     * Handle a createMatch response.
     * @param {WebSocketConnection} conn The client connection
     * @param {object} req The request data
     * @throws {ValidateError}
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
        this[symMcnt] += 1
        this.sendMessage(conn, {action: 'matchCreated', id, match: match.meta()})
        this.logActive()
        this.metrics.matchesInProgress.labels().set(this[symMcnt])
    }

    /**
     * Handle a `joinMatch` response. On success, this will send a `matchJoined`
     * response to the requester (Red) with the match information, and an
     * `opponentJoined` response to the waiting match creator (White) with
     * the match ID.
     *
     * @param {WebSocketConnection} conn The client connection
     * @param {object} req The request data
     * @throws {RequestError}
     * @throws {ValidateError}
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
     * @param {object} req The request data
     * @throws {RequestError}
     * @throws {ValidateError}
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
            if (match.sync.White === match.sync.Red) {
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
                    },
                    game => ({game: game.meta()})
                )
                break
            case 'firstTurn':
                handle(
                    () => isFirst ? thisGame.firstTurn() : thisTurn,
                    turn => ({
                        dice: turn.dice,
                        turn: turn.serialize(),
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
                    },
                    turn => ({
                        turn: turn.meta(),
                        game: thisGame.meta(),
                    })
                )
                break
            case 'turnOption':
                handle(
                    () => {
                        if (thisTurn.color === color) {
                            if (req.isDouble) {
                                thisTurn.setDoubleOffered()
                            }
                        }
                        return thisTurn
                    },
                    turn => ({
                        isDouble : turn.isDoubleOffered && !turn.isRolled,
                        turn     : turn.meta(),
                        game     : thisGame.meta(),
                    })
                )
                break
            case 'doubleResponse':
                handle(
                    () => {
                        if (thisTurn.color === opponent) {
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
                    },
                    turn => ({
                        isAccept : !turn.isDoubleDeclined,
                        turn     : turn.meta(),
                        game     : thisGame.meta(),
                        match    : match.meta(),
                    })
                )
                break
            case 'rollTurn':
                handle(
                    () => {
                        if (thisTurn.color === color) {
                            thisTurn.roll()
                        }
                        return thisTurn
                    },
                    turn => ({
                        dice : turn.dice,
                        turn : turn.serialize(),
                    })
                )
                break
            case 'playRoll':
                handle(
                    () => {
                        if (thisTurn.color === color) {
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
                    },
                    turn => ({
                        moves : turn.moves.map(move => move.coords),
                        turn  : turn.meta(),
                        game  : thisGame.meta(),
                        match : match.meta(),
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
     * @param {WebSocketConnection|Array} conns The connection, or array of connections
     * @param {object} data The message data
     * @return {Boolean} Whether all messages were send successfully
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
     * @param {Match} match The match to check
     * @return {Boolean} Whether the match is finished
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
            this[symMcnt] -= 1
            this.metrics.matchesInProgress.labels().set(this[symMcnt])
            this.logActive()
            return true
        }
        return false
    }

    /**
     * Log the current active connection information.
     */
    logActive() {
        const numConns = this.socketServer
            ? this[symCcnt]
            : 0
        const numMatches = this[symMcnt]
        this.logger.info('There are now', this[symMcnt], 'active matches, and', numConns, 'active connections')
    }

    /**
     *
     * @param {String} id The match ID
     * @param {String} reason
     * @param {object} attrs
     * @return {Server} self
     */
    cancelMatchId(id, {reason, attrs}) {
        const match = this.matches[id]
        if (!match) {
            return this
        }
        this.logger.info('Canceling match', id)
        this.sendMessage(Object.values(match.conns), {action: 'matchCanceled', reason, attrs})
        delete this.matches[id]
        this[symMcnt] -= 1
        this.metrics.matchesInProgress.labels().set(this[symMcnt])
        return this
    }

    /**
     * @throws {RequestError}
     * @throws {ValidateError}
     *
     * @param {object} req The request data
     * @return {Match} The match from the stored matches
     */
    getMatchForRequest(req) {
        const {id, color, secret} = req
        if (!secret || secret.length !== 64) {
            throw new HandshakeError('bad secret')
        }
        Server.validateColor(color)
        const match = this.matches[id]
        if (!match) {
            throw new MatchNotFoundError('match not found')
        }
        if (!match.conns[color] || secret !== match.conns[color].secret) {
            throw new HandshakeError('bad secret')
        }
        return match
    }

    /**
     * Safely close connection(s).
     *
     * @param {WebSocketConnection|array} conns connection, or array of connections
     * @return {Server} self
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
     * The logLevel (integer).
     */
    get logLevel() {
        return this.logger.logLevel
    }

    /**
     * Setter for logLevel (integer). Propagates to auth, api, and web.
     */
    set logLevel(n) {
        this.logger.logLevel = n
        this.auth.logLevel = n
        this.api.logLevel = n
        this.web.logLevel = n
    }

    /**
     * Validate a color string.
     *
     * @throws {ValidateError}
     *
     * @param {String} color The color string to test
     * @return {String} The color string
     */
    static validateColor(color) {
        if (color !== White && color !== Red) {
            throw new ValidateError(`Invalid color: ${color}.`)
        }
        return color
    }

    /**
     * Validate a match ID string.
     *
     * @throws {ValidateError}
     *
     * @param {String} str The string to test
     * @return {String} The match ID string
     */
    static validateMatchId(str) {
        if (!str || typeof str !== 'string' || str.length !== 8) {
            throw new ValidateError('Invalid match ID.')
        }
        return str
    }

    /**
     * Validate a client secret string.
     *
     * @throws {ValidateError}
     *
     * @param {String} str The string to test
     * @return {String} The secret string
     */
    static validateSecret(str) {
        if (!str || typeof str !== 'string' || str.length !== 64) {
            throw new ValidateError('Invalid secret.')
        }
        return str
    }

    /**
     * Generate a new connection ID.
     *
     * @return {String} The connection ID
     */
    static newConnectionId() {
        return uuid()
    }

    /**
     * Generate a match ID from a client secret.
     *
     * @throws {ValidateError}
     *
     * @param {String} str The client secret
     * @return {String} The 8-character match ID
     */
    static matchIdFromSecret(str) {
        Server.validateSecret(str)
        return hash('sha256', str, 'hex').substring(0, 8)
    }
}
