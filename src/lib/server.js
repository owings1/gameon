const Core             = require('./core')
const Logger          = require('./logger')
const Util            = require('./util')
const WebSocketServer = require('websocket').server

const crypto = require('crypto')
const express = require('express') // maybe we don't need express
const merge = require('merge')

const {White, Red, Match, Opponent, Dice} = Core

class Server extends Logger {

    constructor() {
        super()
        this.app = express()
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
                    this.info('Listening on port', this.port)
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
        Object.keys(this.matches).forEach(id => this.cancelMatchId(id))
        if (this.socketServer) {
            Object.values(this.socketServer.conns).forEach(conn => conn.close())
        }
        if (this.httpServer) {
            this.httpServer.close()
        }
    }

    createSocketServer(httpServer) {

        const server = new WebSocketServer({httpServer})
        server.conns = {}

        server.on('request', req => {

            const conn = req.accept(null, req.origin)
            const connId = this.newConnectionId()

            this.info('Peer connected', connId, conn.remoteAddress)

            conn.connId = connId
            server.conns[connId] = conn

            conn.on('close', () => {
                this.info('Peer disconnected', connId)
                this.cancelMatchId(conn.matchId)
                delete server.conns[connId]
            })

            conn.on('message', msg => {
                this.response(conn, JSON.parse(msg.utf8Data))
            })
        })

        return server
    }

    response(conn, req) {

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
                        conn.secret = req.secret
                        this.sendMessage(conn, {action: 'acknowledgeSecret'})
                        this.log('Client connected', conn.secret)
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
                    this.info('Match', id, 'created')
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
                    this.info('Match', id, 'started')
                    this.logActive()

                    break

                default:
                    this.matchResponse(req)
                    break

            }
        } catch (err) {
            this.error(err)
            this.sendMessage(conn, Server.makeErrorObject(err))
        }
        
        this.debug('message received from', conn.color, conn.connId, req)
    }

    matchResponse(req) {

        const match = this.getMatchForRequest(req)

        const {action, color} = req
        const opponent = Opponent[color]
        
        const {thisGame} = match
        const thisTurn = thisGame && thisGame.thisTurn

        const sync = next => {
            match.sync[color] = action
            this.debug({action, color, sync: match.sync})
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

            case 'movesFinished':

                if (thisTurn.color == color) {
                    if (!Array.isArray(req.moves)) {
                        refuse('moves missing or invalid format')
                        break
                    }
                    req.moves.forEach(move => thisTurn.move(move.origin, move.face))
                    thisTurn.finish()
                }

                sync(() => {

                    const moves = thisTurn.moves.map(move => move.coords())

                    reply({moves})

                    this.checkMatchFinished(match)
                })

                break

            case 'nextTurn':

                sync(() => {
                    thisGame.nextTurn()
                    reply()
                })

                break

            case 'turnOption':

                if (thisTurn.color == color) {
                    if (req.isDouble) {
                        thisTurn.setDoubleOffered()
                    } else {
                        thisTurn.setRoll(this.roll())
                    }
                }

                sync(() => {
                    const isDouble = thisTurn.isDoubleOffered && !thisTurn.isRolled
                    const {dice} = thisTurn
                    reply({isDouble, dice})
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
                this.warn('Bad action', action)
                break
        }
    }

    checkMatchFinished(match) {
        if (match.thisGame && match.thisGame.checkFinished()) {
            match.updateScore()
        }
        if (match.hasWinner()) {
            this.info('Match', match.id, 'is finished')
            delete this.matches[match.id]
            this.logActive()
        }
    }

    logActive() {
        const numConns = this.socketServer ? Object.keys(this.socketServer.conns).length : 0
        const numMatches = Object.keys(this.matches).length
        this.info('There are now', numMatches, 'active matches, and', numConns, 'active connections')
    }

    cancelMatchId(id) {
        if (id && this.matches[id]) {
            this.info('Canceling match', id)
            const match = this.matches[id]
            this.sendMessage(Object.values(match.conns), {action: 'matchCanceled'})
            delete this.matches[id]
            this.logActive()
        }
    }

    sendMessage(conns, msg) {
        conns = Util.castToArray(conns)
        const str = JSON.stringify(msg)
        for (var conn of conns) {
            if (conn && conn.connected) {
                this.log('Sending message to', conn.color, msg)
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
            isError: true
            , error: err.message
            , name: err.name || err.constructor.name
            , isRequestError: err.isRequestError
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

    static doMainIfEquals(lhs, rhs) {
        if (lhs === rhs) {
            Server.main(new Server)
        }
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


Server.main = server => {
    server.listen(process.env.HTTP_PORT || 8080)
    return server
}

Server.doMainIfEquals(require.main, module)

module.exports = Server