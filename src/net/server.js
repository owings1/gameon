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
const Api       = require('./api')
const Auth      = require('./auth')
const Constants = require('../lib/constants')
const Core      = require('../lib/core')
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')
const Web       = require('./web')
const WsServer  = require('websocket').server

const bodyParser = require('body-parser')
const express    = require('express')
const onFinished = require('on-finished')
const prom       = require('prom-client')

const {
    Opponent
  , Red
  , White
} = Constants

const {Match, Dice} = Core

const {castToArray, hash, makeErrorObject, update} = Util

const {
    // RequestErrors
    HandshakeError
  , InvalidActionError
  , MatchAlreadyExistsError
  , MatchAlreadyJoinedError
  , MatchNotFoundError
  , RequestError
  , ValidateError
} = Errors

prom.collectDefaultMetrics()

const metrics = {
    connections: new prom.Gauge({
        name: 'open_connections',
        help: 'Open connections'
    }),
    matchesCompleted: new prom.Counter({
        name: 'matches_completed',
        help: 'Total matches completed'
    }),
    matchesInProgress: new prom.Gauge({
        name: 'matches_in_progress',
        help: 'Matches in progress'
    }),
    messagesReceived: new prom.Counter({
        name: 'messages_received',
        help: 'Messages received'
    }),
    messagesSent: new prom.Counter({
        name: 'messages_sent',
        help: 'Messages sent'
    }),
    errorsSending: new prom.Counter({
        name: 'errors_sending',
        help: 'Errors sending messages'
    })
}

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

    static defaults(env) {
        return {
            socketHsTimeout : +env.SOCKET_HSTIMEOUT || 5000
          , webEnabled      : !env.GAMEON_WEB_DISABLED
          , apiEmailTimeout : +env.API_EMAILTIMEOUT || 5 * 1000
        }
    }

    constructor(opts) {

        this.logger = new Logger(this.constructor.name, {server: true})

        this.opts = Util.defaults(Server.defaults(process.env), opts)
        this.auth = Auth.create({...opts, ...this.opts, loggerPrefix: this.constructor.name})
        this.api  = new Api({...opts, emailTimeout: this.opts.apiEmailTimeout})
        this.web  = new Web(opts)

        this.app = this.createApp()
        this.metricsApp = this.createMetricsApp()

        this.matches = {}
        this.connTicker = 0
        this.httpServer = null
        this.port = null
        this.socketServer = null
    }

    listen(port, metricsPort) {

        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(port, () => {
                    this.port = this.httpServer.address().port
                    this.logger.info('Listening on port', this.port, 'with', this.auth.type, 'auth')
                    try {
                        this.socketServer = this.createSocketServer(this.httpServer)
                        this.metricsHttpServer = this.metricsApp.listen(metricsPort, () => {
                            this.metricsPort = this.metricsHttpServer.address().port
                            this.logger.info('Metrics listening on port', this.metricsPort)
                            resolve()
                        })
                    } catch (err) {
                        reject(err)
                    }
                })
            } catch (err) {
                reject(err)
            }
        })
    }

    close() {
        Object.keys(this.matches).forEach(id =>
            this.cancelMatchId(id, 'Server shutdown')
        )
        if (this.socketServer) {
            this.closeConn(Object.values(this.socketServer.conns))
        }
        if (this.httpServer) {
            this.httpServer.close()
        }
        if (this.metricsHttpServer) {
            this.metricsHttpServer.close()
        }
    }

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

    createMetricsApp() {

        const app = express()

        app.get('/metrics', (req, res) => {
            try {
                res.set('content-type', prom.register.contentType)
                this.fetchMetrics().then(metrics => res.status(200).end(metrics))
            } catch (err) {
                const error = {name: err.name, message: err.message}
                const body = {status: 500, message: 'Internal Error', error}
                res.status(500).send(body)
            }
        })

        return app
    }

    fetchMetrics() {
        return prom.register.metrics()
    }

    createSocketServer(httpServer) {

        const server = new WsServer({httpServer})
        server.conns = {}

        server.on('request', request => {

            const {conns} = server
            const connId = this.newConnectionId()

            // Being extra careful not to keep a reference to conn in this scope.
            conns[connId] = request.accept(null, request.origin)
            conns[connId].connId = connId

            this.logger.info('Peer', connId, 'connected', conns[connId].remoteAddress)

            metrics.connections.labels().set(Object.keys(conns).length)

            conns[connId].on('close', () => {
                const conn = conns[connId]
                clearTimeout(conn.handShakeTimeoutId)
                this.logger.info('Peer', connId, 'disconnected')
                this.cancelMatchId(conn.matchId, 'Peer disconnected')
                delete conns[connId]
                metrics.connections.labels().set(Object.keys(conns).length)
                this.logActive()
            })

            conns[connId].on('message', msg => {
                const conn = conns[connId]
                metrics.messagesReceived.labels().inc()
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

    async response(conn, req) {

        try {

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
                    await this.establishSecretResponse(conn, req)
                    break

                case 'createMatch':
                    await this.createMatchResponse(conn, req)
                    break

                case 'joinMatch':
                    await this.joinMatchResponse(conn, req)
                    break

                default:
                    await this.matchResponse(req)
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

    async establishSecretResponse(conn, req) {

        clearTimeout(conn.handShakeTimeoutId)

        if (!req.secret || req.secret.length != 64) {
            throw new HandshakeError('bad secret')
        }

        if (conn.secret && conn.secret != req.secret) {
            throw new HandshakeError('handshake disagreement')
        }

        if (req.token) {
            var {username, password} = this.auth.parseToken(req.token)
        } else {
            var {username, password} = req
        }

        const {passwordEncrypted} = await this.auth.authenticate(username, password)

        conn.username = username
        conn.secret = req.secret

        this.sendMessage(conn, {action: 'acknowledgeSecret', passwordEncrypted})
        this.logger.log('Client connected', conn.connId)
    }

    createMatchResponse(conn, req) {

        const id = Server.matchIdFromSecret(conn.secret)
        const {total, opts} = req
        const match = new Match(total, opts)

        this.logger.info('Match', id, 'created')

        update(match, {id, conns: {White: conn, Red: null}, sync: {}})
        update(conn, {matchId: id, color: White})

        this.matches[id] = match

        this.sendMessage(conn, {action: 'matchCreated', id, match: match.meta()})

        this.logActive()
        metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
    }

    joinMatchResponse(conn, req) {

        const {id} = req
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

    matchResponse(req) {

        const match = this.getMatchForRequest(req)

        const {action, color} = req
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
                            thisTurn.setRoll(this.roll())
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

    checkMatchFinished(match) {
        if (match.thisGame && match.thisGame.checkFinished()) {
            match.updateScore()
            match.checkFinished()
        }
        if (match.hasWinner()) {
            this.logger.info('Match', match.id, 'is completed')
            metrics.matchesCompleted.labels().inc()
            delete this.matches[match.id]
            metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
            this.logActive()
        }
    }

    logActive() {
        const numConns = this.socketServer ? Object.keys(this.socketServer.conns).length : 0
        const numMatches = Object.keys(this.matches).length
        this.logger.info('There are now', numMatches, 'active matches, and', numConns, 'active connections')
    }

    cancelMatchId(id, reason) {
        const match = this.matches[id]
        if (!match) {
            return
        }
        this.logger.info('Canceling match', id)
        this.sendMessage(Object.values(match.conns), {action: 'matchCanceled', reason})
        delete this.matches[id]
        metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
    }

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

        castToArray(conns).forEach(conn => {
            try {
                if (conn && conn.connected) {
                    this.logger.log('Sending message to', conn.color, conn.connId, title)
                    conn.sendUTF(body)
                    metrics.messagesSent.labels().inc()
                }
            } catch (err) {
                const id = (conn && conn.id) || null
                this.logger.warn('Failed sending message', {id}, err)
                metrics.errorsSending.labels().inc()
                this.closeConn(conn)
            }
        })
    }

    newConnectionId() {
        this.connTicker += 1
        return hash('md5', this.connTicker.toString(), 'hex')
    }

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

    // close safely
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
    }

    roll() {
        return Dice.rollTwo()
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
        this.auth.loglevel = n
        this.api.loglevel = n
        this.web.loglevel = n
    }

    static validateColor(color) {
        if (color != White && color != Red) {
            throw new ValidateError(`invalid color: ${color}`)
        }
    }

    static matchIdFromSecret(str) {
        return hash('sha256', str, 'hex').substring(0, 8)
    }
}

module.exports = Server