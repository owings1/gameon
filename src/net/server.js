const Auth            = require('./auth')
const Core            = require('../lib/core')
const Logger          = require('../lib/logger')
const Util            = require('../lib/util')
const WebSocketServer = require('websocket').server

const audit      = require('express-requests-logger')
const bodyParser = require('body-parser')
const crypto     = require('crypto')
const express    = require('express')

const {White, Red, Match, Opponent, Dice} = Core

const {merge} = Util

class Server {

    defaults() {
        return {
            authType: process.env.AUTH_TYPE || 'anonymous'
          , auth : {}
        }
    }

    constructor(opts) {
        this.logger = new Logger(this.constructor.name, {server: true})
        this.opts = merge({}, this.defaults(), opts)
        this.auth = new Auth(this.opts.authType, this.opts.auth)
        this.app = this.createExpressApp()
        this.matches = {}
        this.connTicker = 0
        this.httpServer = null
        this.port = null
        this.socketServer = null
    }

    listen(port) {

        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(port, () => {
                    this.port = this.httpServer.address().port
                    this.logger.info('Listening on port', this.port, 'with', this.opts.authType, 'auth')
                    try {
                        this.socketServer = this.createSocketServer(this.httpServer)
                        resolve()
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
    }

    createExpressApp() {

        const app = express()
        const jsonParser = bodyParser.json()

        app.use(audit({
            logger : this.logger
          , request : {
                excludeBody    : ['*']
              , excludeHeaders : ['*']
            }
          , response : {
                excludeBody    : ['*']
              , excludeHeaders : ['*']
            }
        }))

        const handleInternalError = (err, res) => {
            res.status(500).send({status: 500, message: 'Internal Error', error: {name: 'InternalError', message: 'Internal Error'}})
            this.logger.error(err, err.cause)
        }

        const handleError = (err, res) => {
            if (err.isInternalError || !err.isAuthError) {
                handleInternalError(err, res)
            } else {
                res.status(400).send({status: 400, message: 'Bad Request', error: {name: err.name, message: err.message}})
            }
        }

        app.post('/api/v1/signup', jsonParser, (req, res) => {
            const {username, password} = req.body
            this.auth.createUser(username, password).then(user => {
                this.auth.sendConfirmEmail(username).then(() => {
                    res.status(201).send({
                        status: 201
                      , message: 'Account created, check your email to confirm.'
                      , passwordEncrypted: user.passwordEncrypted
                    })
                }).catch(err => handleInternalError(err, res))
            }).catch(err => handleError(err, res))
        })

        app.post('/api/v1/send-confirm-email', jsonParser, (req, res) => {
            const {username} = req.body
            const message = 'A confirm key has been sent if the account exists and is unconfirmed, check your email.'
            this.auth.sendConfirmEmail(username).then(() => {
                res.status(200).send({status: 200, message})
            }).catch(err => {
                if (err.name == 'UserNotFoundError' || err.name == 'UserConfirmedError') {
                    this.logger.warn('Invalid send-confirm-email request', {username}, err)
                    res.status(200).send({status: 200, message})
                } else {
                    handleError(err, res)
                }
            })            
        })

        app.post('/api/v1/forgot-password', jsonParser, (req, res) => {
            const {username} = req.body
            const message = 'A reset key has been sent if the account exists, check your email.'
            this.auth.sendResetEmail(username).then(() => {
                res.status(200).send({status: 200, message})
            }).catch(err => {
                if (err.name == 'UserNotFoundError' || err.name == 'UserNotConfirmedError') {
                    this.logger.warn('Invalid forgot-password request', {username}, err)
                    res.status(200).send({status: 200, message})
                } else {
                    handleError(err, res)
                }
            })
        })

        app.post('/api/v1/confirm-account', jsonParser, (req, res) => {
            const {username, confirmKey} = req.body
            this.auth.confirmUser(username, confirmKey).then(() => {
                res.status(200).send({status: 200, message: 'Account confirmed'})
            }).catch(err => handleError(err, res))
        })

        app.post('/api/v1/change-password', jsonParser, (req, res) => {
            const {username, oldPassword, newPassword} = req.body
            this.auth.changePassword(username, oldPassword, newPassword).then(user => {
                res.status(200).send({status: 200, message: 'Password changed', passwordEncrypted: user.passwordEncrypted})
            }).catch(err => handleError(err, res))
        })

        app.post('/api/v1/reset-password', jsonParser, (req, res) => {
            const {username, password, resetKey} = req.body
            this.auth.resetPassword(username, password, resetKey).then(user => {
                res.status(200).send({status: 200, message: 'Password reset', passwordEncrypted: user.passwordEncrypted})
            }).catch(err => handleError(err, res))
        })

        return app
    }

    createSocketServer(httpServer) {

        const server = new WebSocketServer({httpServer})
        server.conns = {}

        server.on('request', req => {

            const conn = req.accept(null, req.origin)
            const connId = this.newConnectionId()

            this.logger.info('Peer', connId, 'connected', conn.remoteAddress)

            conn.connId = connId
            server.conns[connId] = conn

            conn.on('close', () => {
                this.logger.info('Peer', connId, 'disconnected')
                this.cancelMatchId(conn.matchId, 'Peer disconnected')
                delete server.conns[connId]
            })

            conn.on('message', msg => {
                this.response(conn, JSON.parse(msg.utf8Data))
            })
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
                        const user = await this.auth.authenticate(req.username, req.password)
                        conn.username = req.username
                        conn.secret = req.secret
                        this.sendMessage(conn, {action: 'acknowledgeSecret', passwordEncrypted: user.passwordEncrypted})
                        this.logger.log('Client connected', conn.secret)
                    } else {
                        throw new HandshakeError('handshake disagreement')
                    }

                    break

                case 'startMatch':

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
                    this.sendMessage(conn, {action: 'matchCreated', id})
                    this.logger.info('Match', id, 'created')
                    this.logActive()

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
                    this.sendMessage(conn, {action: 'matchJoined', id, total, opts})
                    this.logger.info('Match', id, 'started')
                    this.logActive()

                    break

                default:
                    this.matchResponse(req)
                    break

            }
        } catch (err) {
            this.logger.warn('Peer', conn.connId, err)
            this.sendMessage(conn, Server.makeErrorObject(err))
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

        const refuse = err => {
            this.sendMessage(Object.values(match.conns), Server.makeErrorObject(err))
        }

        const reply = res => {
            this.sendMessage(Object.values(match.conns), merge({action}, res))
        }

        switch (action) {

            case 'nextGame':

                if (thisGame) {
                    thisGame.checkFinished()
                }

                sync(() => {
                    match.nextGame()
                    reply()
                })

                break

            case 'firstTurn':

                sync(() => {
                    const {dice} = thisGame.firstTurn()
                    reply({dice})
                })

                break

            case 'rollTurn':

                if (thisTurn.color == color) {
                    thisTurn.setRoll(this.roll())
                }

                sync(() => {
                    const {dice} = thisTurn
                    reply({dice})
                })

                break

            case 'playRoll':

                if (thisTurn.color == color) {
                    if (!Array.isArray(req.moves)) {
                        refuse('moves missing or invalid format')
                        break
                    }
                    req.moves.forEach(move => thisTurn.move(move.origin, move.face))
                    
                }

                sync(() => {

                    thisTurn.finish()

                    const moves = thisTurn.moves.map(move => move.coords())

                    reply({moves})

                    this.checkMatchFinished(match)
                })

                break

            case 'turnOption':

                if (thisTurn.color == color) {
                    if (req.isDouble) {
                        thisTurn.setDoubleOffered()
                    }
                }

                sync(() => {
                    const isDouble = thisTurn.isDoubleOffered && !thisTurn.isRolled
                    reply({isDouble})
                })

                break

            case 'nextTurn':

                sync(() => {
                    thisGame.nextTurn()
                    reply()
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

                    const isAccept = !thisTurn.isDoubleDeclined

                    reply({isAccept})

                    this.checkMatchFinished(match)
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
        }
        if (match.hasWinner()) {
            this.logger.info('Match', match.id, 'is finished')
            delete this.matches[match.id]
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
            this.logActive()
        }
    }

    sendMessage(conns, msg) {
        conns = Util.castToArray(conns)
        const str = JSON.stringify(msg)
        for (var conn of conns) {
            if (conn && conn.connected) {
                this.logger.log('Sending message to', conn.color, msg)
                conn.sendUTF(str)
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

    static makeErrorObject(err) {
        if (typeof(err) == 'string') {
            err = new RequestError(err)
        }
        return {
            isError         : true
          , error           : err.message || err.name
          , name            : err.name || err.constructor.name
          , isRequestError  : err.isRequestError
          , isAuthError     : err.isAuthError
          , isInternalError : err.isInternalError
        }
    }

    static validateColor(color) {
        if (color != White && color != Red) {
            throw new RequestError('invalid color')
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


class RequestError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
        this.isRequestError = true
    }
}

class HandshakeError extends RequestError {}
class ValidateError extends RequestError {}
class MatchAlreadyExistsError extends RequestError {}
class MatchNotFoundError extends RequestError {}
class MatchAlreadyJoinedError extends RequestError {}
class NotYourTurnError extends RequestError {}

module.exports = Server