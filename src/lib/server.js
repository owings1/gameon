const Lib             = require('./game')
const Logger          = require('./logger')
const Util            = require('./util')
const WebSocketServer = require('websocket').server

const crypto = require('crypto')
const express = require('express') // maybe we don't need express
const {White, Red, Match, Opponent, Dice} = Lib

class Server extends Logger {

    constructor() {
        super()
        this.app = express()
        this.matches = {}
        this.clients = null
        this.connTicker = 0
    }

    listen(port) {
        this.port = port
        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(port, () => {
                    try {
                        this.info('Listening on port', port)
                        this.clients = {}
                        this.socketServer = new WebSocketServer({httpServer: this.httpServer})
                        this.socketServer.on('request', req => {
                            const conn = req.accept(null, req.origin)
                            const connId = this.newConnectionId()
                            conn.connId = connId
                            this.info('Peer connected', conn.connId, conn.remoteAddress)
                            this.clients[connId] = conn
                            conn.on('close', () => {
                                this.info('Peer disconnected', conn.connId)
                                this.cancelMatchId(conn.matchId)
                                delete this.clients[connId]
                            })
                            conn.on('message', msg => {
                                const req = JSON.parse(msg.utf8Data)
                                this.response(conn, req)
                            })
                        })
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
                    this.logActiveMatches()

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
                    this.logActiveMatches()

                    break

                default:
                    this.matchResponse(conn, req)
                    break

            }
        } catch (err) {
            this.error(err)
            this.sendMessage(conn, {error: err.message, name: err.name || err.constructor.name})
        }
        
        this.debug('message received from', conn.color, conn.connId, req)
    }

    matchResponse(conn, req) {

        const {action, id, color, secret} = req
        const match = this.getMatchWithColorSecret(id, color, secret)
        const {sync, conns, thisGame} = match
        const opponent = Opponent[color]
        const thisTurn = thisGame && thisGame.thisTurn

        const checkSync = (...args) => {
            this.debug({action, color, sync})
            Server.checkSync(sync, ...args)
        }

        sync[color] = action

        switch (action) {

            case 'nextGame':

                if (thisGame) {
                    thisGame.checkFinished()
                }

                checkSync(() => {
                    match.nextGame()
                    this.sendMessage(Object.values(conns), {action})
                })

                break

            case 'firstTurn':

                checkSync(() => {
                    const firstTurn = thisGame.firstTurn()
                    const {dice} = firstTurn
                    this.sendMessage(Object.values(conns), {action, dice})
                })

                break

            case 'movesFinished':

                if (color == thisTurn.color) {
                    req.moves.forEach(move => thisTurn.move(move.origin, move.face))
                    thisTurn.finish()
                }

                checkSync(() => {

                    const moves = thisTurn.moves.map(move => move.coords())
                    
                    this.sendMessage(conns[Opponent[thisTurn.color]], {action, moves})
                    this.sendMessage(conns[thisTurn.color], {action})

                    thisGame.checkFinished()
                    match.updateScore()
                    this.checkMatchFinished(match)
                })

                break

            case 'nextTurn':

                checkSync(() => {
                    thisGame.nextTurn()
                    this.sendMessage(Object.values(conns), {action})
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

                checkSync(() => {
                    const isDouble = thisTurn.isDoubleOffered && !thisTurn.isRolled
                    const {dice} = thisTurn
                    this.sendMessage(Object.values(conns), {isDouble, dice, action})
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

                checkSync(() => {

                    const isAccept = !thisTurn.isDoubleDeclined
                    this.sendMessage(Object.values(conns), {isAccept, action})

                    thisGame.checkFinished()
                    match.updateScore()
                    this.checkMatchFinished(match)
                })

                break

            default:
                this.warn('Bad action', action)
                break
        }
    }

    checkMatchFinished(match) {
        if (match.hasWinner()) {
            this.info('Match', match.id, 'is finished')
            delete this.matches[match.id]
            this.logActiveMatches()
        }
    }

    logActiveMatches() {
        this.info('There are now', Object.keys(this.matches).length, 'active matches')
    }

    cancelMatchId(id) {
        if (id && this.matches[id]) {
            this.info('Canceling match', id)
            const match = this.matches[id]
            this.sendMessage(Object.values(match.conns), {action: 'matchCanceled'})
            delete this.matches[id]
            this.logActiveMatches()
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

    getMatchWithColorSecret(id, color, secret) {
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
            throw new ServerError('invalid color')
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


class ServerError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

class HandshakeError extends ServerError {}
class ValidateError extends ServerError {}
class MatchAlreadyExistsError extends ServerError {}
class MatchNotFoundError extends ServerError {}
class MatchAlreadyJoinedError extends ServerError {}
class NotYourTurnError extends ServerError {}

Server.Errors = {
    HandshakeError
  , ValidateError
  , MatchAlreadyExistsError
  , MatchNotFoundError
  , MatchAlreadyJoinedError
}

if (require.main === module) {
    const server = new Server()
    server.listen(process.env.HTTP_PORT || 8080)
}

module.exports = Server