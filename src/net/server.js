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
const chalk      = require('chalk')
const crypto     = require('crypto')
const express    = require('express')
const morgan     = require('morgan')
const prom       = require('prom-client')

const {
    Opponent
  , Red
  , White
} = Constants

const {Match, Dice} = Core

const {castToArray, makeErrorObject} = Util

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
    })
}

class Server {

    static defaults(env) {
        return {
            socketHsTimeout : +env.SOCKET_HSTIMEOUT || 5000
          , webEnabled      : !env.GAMEON_WEB_DISABLED
          , apiEmailTimeout : +env.API_EMAILTIMEOUT || 9 * 1000//undefined
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
                    this.logger.info('Listening on port', this.port, 'with', this.opts.authType, 'auth')
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
        Object.keys(this.matches).forEach(id => this.cancelMatchId(id, 'Server shutdown'))
        if (this.socketServer) {
            Object.values(this.socketServer.conns).forEach(conn => conn.close())
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

        app.use(this.getLoggingMiddleware())

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

    getLoggingMiddleware() {
        const parts = [
          , ':date[iso] '
          , chalk.grey('[INFO]')
          , ' [Server] '
          , ':status ":method :url HTTP/:http-version"'
          , ' :res[content-length] :remote-addr - :remote-user'
        ]
        return morgan(parts.join(''))
    }

    createSocketServer(httpServer) {

        const server = new WsServer({httpServer})
        server.conns = {}

        server.on('request', req => {

            const conn = req.accept(null, req.origin)
            const connId = this.newConnectionId()

            this.logger.info('Peer', connId, 'connected', conn.remoteAddress)

            conn.connId = connId
            server.conns[connId] = conn
            metrics.connections.labels().set(Object.keys(server.conns).length)

            conn.on('close', () => {
                this.logger.info('Peer', connId, 'disconnected')
                this.cancelMatchId(conn.matchId, 'Peer disconnected')
                delete server.conns[connId]
                metrics.connections.labels().set(Object.keys(server.conns).length)
                this.logActive()
            })

            conn.on('message', msg => {
                metrics.messagesReceived.labels().inc()
                this.response(conn, JSON.parse(msg.utf8Data))
            })

            setTimeout(() => {
                if (!conn.secret) {
                    this.logger.warn('Peer', connId, 'handshake timeout', conn.remoteAddress)
                    this.sendMessage(conn, makeErrorObject(new HandshakeError('Client handshake timeout')))
                    conn.close()
                }
            }, this.opts.socketHsTimeout)
        })

        return server
    }

    async response(conn, req) {

        try {

            var {action} = req
            if (action != 'establishSecret') {
                if (!conn.secret) {
                    throw new HandshakeError('no secret')
                }
                var {secret} = conn
                if (req.secret != secret) {
                    throw new HandshakeError('bad secret')
                }
            }

            switch (action) {

                case 'establishSecret':

                    if (!req.secret || req.secret.length != 64) {
                        throw new HandshakeError('bad secret')
                    }
                    if (!conn.secret || conn.secret == req.secret) {
                        if (req.token) {
                            var {username, password} = this.auth.parseToken(req.token)
                        } else {
                            var {username, password} = req
                        }
                        const user = await this.auth.authenticate(username, password)
                        conn.username = username
                        conn.secret = req.secret
                        this.sendMessage(conn, {action: 'acknowledgeSecret', passwordEncrypted: user.passwordEncrypted})
                        this.logger.log('Client connected', conn.secret)
                    } else {
                        throw new HandshakeError('handshake disagreement')
                    }

                    break

                case 'createMatch':

                    var id = Server.matchIdFromSecret(secret)
                    var {total, opts} = req
                    var match = new Match(total, opts)
                    match.id = id
                    match.secrets = {
                        White : secret
                      , Red   : null
                    }
                    match.conns = {
                        White : conn
                      , Red   : null
                    }
                    match.sync = {
                        White : null
                      , Red   : null
                    }
                    conn.matchId = id
                    conn.color = White
                    this.matches[id] = match
                    this.sendMessage(conn, {action: 'matchCreated', id, match: match.meta()})
                    this.logger.info('Match', id, 'created')
                    this.logActive()
                    metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
                    break

                case 'joinMatch':

                    var {id} = req
                    if (!this.matches[id]) {
                        throw new MatchNotFoundError('match not found')
                    }
                    var match = this.matches[id]
                    if (match.secrets.Red) {
                        throw new MatchAlreadyJoinedError('match already joined')
                    }
                    match.secrets.Red = secret
                    match.conns.Red = conn
                    conn.matchId = id
                    conn.color = Red
                    var {total, opts} = match
                    this.sendMessage(match.conns.White, {action: 'opponentJoined', id})
                    this.sendMessage(conn, {action: 'matchJoined', id, total, opts, match: match.meta()})
                    this.logger.info('Match', id, 'started')
                    this.logActive()

                    break

                default:
                    this.matchResponse(req)
                    break

            }
        } catch (err) {
            if (req.password) {
                req.password = '***'
            }
            this.logger.warn('Peer', conn.connId, err.message, err, {req})
            this.sendMessage(conn, makeErrorObject(err))
            if (err.name == 'HandshakeError') {
                conn.close()
            }
        }

        this.logger.debug('message received from', conn.color, conn.connId, req)
    }

    matchResponse(req) {

        const match = this.getMatchForRequest(req)

        const {action, color} = req
        const opponent = Opponent[color]
        
        const {thisGame} = match
        const thisTurn = thisGame && thisGame.thisTurn

        const sync = next => {
            match.sync[color] = action
            this.logger.debug({action, color, sync: match.sync})
            Server.checkSync(match.sync, next)
        }

        const refuse = msg => {
            this.sendMessage(Object.values(match.conns), makeErrorObject(new RequestError(msg)))
        }

        const reply = res => {
            this.sendMessage(Object.values(match.conns), {action, ...res})
        }

        switch (action) {

            case 'nextGame':

                if (thisGame) {
                    thisGame.checkFinished()
                }

                sync(() => {

                    const game = match.nextGame()
                    const res = {
                        game: game.meta()
                    }

                    reply(res)
                })

                break

            case 'firstTurn':

                sync(() => {

                    const turn = thisGame.firstTurn()
                    const res = {
                        dice: turn.dice
                      , turn: turn.serialize()
                    }

                    reply(res)
                })

                break

            case 'nextTurn':

                sync(() => {

                    const turn = thisGame.nextTurn()
                    const res = {
                        turn : turn.meta()
                      , game : thisGame.meta()
                    }

                    reply(res)
                })

                break

            case 'turnOption':

                if (thisTurn.color == color) {
                    if (req.isDouble) {
                        thisTurn.setDoubleOffered()
                    }
                }

                sync(() => {

                    const res = {
                        isDouble : thisTurn.isDoubleOffered && !thisTurn.isRolled
                      , turn     : thisTurn.meta()
                      , game     : thisGame.meta()
                    }

                    reply(res)
                })

                break

            case 'doubleResponse':

                if (thisTurn.color == opponent) {
                    if (req.isAccept) {
                        thisGame.double()
                    } else {
                        thisTurn.setDoubleDeclined()
                    }
                }

                sync(() => {

                    this.checkMatchFinished(match)

                    const res = {
                        isAccept : !thisTurn.isDoubleDeclined
                      , turn     : thisTurn.meta()
                      , game     : thisGame.meta()
                      , match    : match.meta()
                    }

                    reply(res)
                })

                break

            case 'rollTurn':

                if (thisTurn.color == color) {
                    thisTurn.setRoll(this.roll())
                }

                sync(() => {

                    const res = {
                        dice : thisTurn.dice
                      , turn : thisTurn.serialize()
                    }

                    reply(res)
                })

                break

            case 'playRoll':

                if (thisTurn.color == color) {
                    if (!Array.isArray(req.moves)) {
                        refuse('moves missing or invalid format')
                        break
                    }
                    req.moves.forEach(move => thisTurn.move(move.origin, move.face))
                    thisTurn.finish()
                }

                sync(() => {

                    this.checkMatchFinished(match)

                    const res = {
                        moves : thisTurn.moves.map(move => move.coords)
                      , turn  : thisTurn.meta()
                      , game  : thisGame.meta()
                      , match : match.meta()
                    }

                    reply(res)     
                })

                break

            default:
                this.logger.warn('Bad action', action)
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
        if (id && this.matches[id]) {
            this.logger.info('Canceling match', id)
            const match = this.matches[id]
            this.sendMessage(Object.values(match.conns), {action: 'matchCanceled', reason})
            delete this.matches[id]
            metrics.matchesInProgress.labels().set(Object.keys(this.matches).length)
        }
    }

    sendMessage(conns, msg) {
        conns = castToArray(conns)
        const str = JSON.stringify(msg)
        for (var conn of conns) {
            if (conn && conn.connected) {
                this.logger.log('Sending message to', conn.color, msg)
                conn.sendUTF(str)
                metrics.messagesSent.labels().inc()
            }
        }
    }

    newConnectionId() {
        this.connTicker += 1
        return crypto.createHash('md5').update('' + this.connTicker).digest('hex')
    }

    getMatchForRequest(req) {
        const {id, color, secret} = req
        Server.validateColor(color)
        if (!this.matches[id]) {
            throw new MatchNotFoundError('match not found')
        }
        const match = this.matches[id]
        if (secret != match.secrets[color]) {
            throw new HandshakeError('bad secret')
        }
        return match
    }

    roll() {
        return Dice.rollTwo()
    }

    static validateColor(color) {
        if (color != White && color != Red) {
            throw new RequestError('invalid color: ' + color)
        }
    }

    static checkSync(sync, cb) {
        if (sync.White == sync.Red) {
            cb()
            delete sync.Red
            delete sync.White
        }
    }

    static matchIdFromSecret(str) {
        return crypto.createHash('sha256').update(str).digest('hex').substring(0, 8)
    }
}

const {
    HandshakeError
  , MatchAlreadyExistsError
  , MatchAlreadyJoinedError
  , MatchNotFoundError
  , NotYourTurnError
  , RequestError
  , ValidateError
} = Errors

module.exports = Server