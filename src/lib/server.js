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
        this.socketClients = null
    }

    listen(port) {
        this.port = port
        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(port, () => {
                    try {
                        this.info('Listening on port', port)
                        this.socketClients = {}
                        this.socketServer = new WebSocketServer({httpServer: this.httpServer})
                        this.socketServer.on('request', req => {
                            const conn = req.accept(null, req.origin)
                            const connId = this.newConnectionId()
                            conn.connId = connId
                            this.info('Peer connected', conn.connId, conn.remoteAddress)
                            this.socketClients[connId] = conn
                            conn.on('close', () => {
                                this.info('Peer disconnected', conn.connId)
                                this.cancelMatchId(conn.matchId)
                                delete this.socketClients[connId]
                            })
                            conn.on('message', msg => this.receiveMessage(conn, msg))
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

    receiveMessage(conn, msg) {
        msg = JSON.parse(msg.utf8Data)
        try {
            var {action} = msg
            if (action != 'establishSecret') {
                if (!conn.secret) {
                    throw new HandshakeError('no secret')
                }
                var {secret} = conn
                if (msg.secret != secret) {
                    throw new HandshakeError('bad secret')
                }
            }
            switch (action) {
                case 'establishSecret':
                    if (!msg.secret || msg.secret.length != 64) {
                        throw new HandshakeError('bad secret')
                    }
                    if (!conn.secret || conn.secret == msg.secret) {
                        conn.secret = msg.secret
                        this.sendMessage(conn, {action: 'acknowledgeSecret'})
                        this.log('Client connected', conn.secret)
                    } else {
                        throw new HandshakeError('handshake disagreement')
                    }
                    break
                case 'startMatch':
                    var id = Server.gameIdFromSecret(secret)
                    var {total, opts} = msg
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
                    var {id} = msg
                    if (!this.matches[id]) {
                        throw new MatchNotFoundError('match not found')
                    }
                    var match = this.matches[id]
                    if (match.secrets.Red) {
                        throw new MatchAlreadyJoinedError('match already joined')
                    }
                    match.secrets.Red = secret
                    match.conns.Red = conn
                    conn.color = Red
                    var {total, opts} = match
                    this.sendMessage(match.conns.White, {action: 'opponentJoined', id})
                    this.sendMessage(conn, {action: 'matchJoined', id, total, opts})
                    this.info('Match', id, 'started')
                    this.logActiveMatches()
                    break
                case 'nextGame':
                    var {id, color} = msg
                    var match = this.getMatchWithColorSecret(id, color, secret)
                    var {sync, conns} = match
                    if (match.thisGame) {
                        match.thisGame.checkFinished()
                    }
                    sync[color] = 'nextGame'
                    if (Server.checkSync(sync)) {
                        match.nextGame()
                        this.sendMessage(conns.White, {action})
                        this.sendMessage(conns.Red, {action})
                        Server.clearSync(sync)
                    }
                    break
                case 'firstTurn':
                    var {id, color} = msg
                    var match = this.getMatchWithColorSecret(id, color, secret)
                    var {sync, conns} = match
                    sync[color] = 'firstTurn'
                    if (Server.checkSync(sync)) {
                        var turn = match.thisGame.firstTurn()
                        var {dice} = turn
                        this.sendMessage(Object.values(conns), {action, dice})
                        Server.clearSync(sync)
                    }
                    break
                case 'movesFinished':
                    var {id, color} = msg
                    var match = this.getMatchWithColorSecret(id, color, secret)
                    var {sync, conns} = match
                    var game = match.thisGame
                    var turn = game.thisTurn
                    if (color == turn.color) {
                        var {moves} = msg
                        moves.forEach(move => turn.move(move.origin, move.face))
                        turn.finish()
                    }
                    sync[color] = 'movesFinished'
                    if (Server.checkSync(sync)) {
                        var moves = turn.moves.map(move => move.coords())
                        var stateString = game.board.stateString()
                        this.checkMatchFinished(match)
                        this.sendMessage(conns[Opponent[turn.color]], {action, moves, stateString})
                        this.sendMessage(conns[turn.color], {action, stateString})
                        game.checkFinished()
                        match.updateScore()
                        this.checkMatchFinished(match)
                        Server.clearSync(sync)
                    }
                    break
                case 'nextTurn':
                    var {id, color} = msg
                    var match = this.getMatchWithColorSecret(id, color, secret)
                    var {sync, conns} = match
                    sync[color] = 'nextTurn'
                    if (Server.checkSync(sync)) {
                        match.thisGame.nextTurn()
                        this.sendMessage(Object.values(conns), {action})
                        Server.clearSync(sync)
                    }
                    break
                case 'offerDouble':
                case 'rollTurn':
                case 'turnOption':
                    var {id, color} = msg
                    var match = this.getMatchWithColorSecret(id, color, secret)
                    var {sync, conns} = match
                    var game = match.thisGame
                    var turn = game.thisTurn
                    if (action == 'turnOption') {
                        Server.validateTurnFor(turn, Opponent[color])
                    } else {
                        Server.validateTurnFor(turn, color)
                        if (action == 'rollTurn') {
                            var dice = this.roll()
                            turn.setRoll(dice)
                        } else {
                            turn.setDoubleOffered()
                        }
                    }
                    sync[color] = 'turnOption'
                    this.debug({action, color, sync})
                    if (Server.checkSync(sync)) {
                        var {isDoubleOffered, isRolled, dice} = turn
                        this.sendMessage(Object.values(conns), {isDoubleOffered, isRolled, dice, action: 'turnOption'})
                        Server.clearSync(sync)
                    }
                    break
                case 'acceptDouble':
                case 'declineDouble':
                case 'doubleResponse':
                    var {id, color} = msg
                    var match = this.getMatchWithColorSecret(id, color, secret)
                    var {sync, conns} = match
                    var game = match.thisGame
                    var turn = game.thisTurn
                    if (action == 'doubleResponse') {
                        Server.validateTurnFor(turn, color)
                    } else {
                        Server.validateTurnFor(turn, Opponent[color])
                        if (action == 'declineDouble') {
                            turn.setDoubleDeclined()
                        }
                    }
                    sync[color] = 'doubleResponse'
                    this.debug({action, color, sync})
                    if (Server.checkSync(sync)) {
                        var {isDoubleDeclined} = turn
                        var isAccepted = !isDoubleDeclined
                        if (isAccepted) {
                            game.cubeValue *= 2
                            game.cubeOwner = Opponent[turn.color]
                        }
                        game.checkFinished()
                        match.updateScore()
                        this.checkMatchFinished(match)
                        var {cubeValue, cubeOwner} = game
                        this.sendMessage(Object.values(conns), {isDoubleDeclined, isAccepted, cubeValue, cubeOwner, action: 'doubleResponse'})
                        Server.clearSync(sync)
                    }
                    break
                    
            }
        } catch (err) {
            this.error(err)
            this.sendMessage(conn, {error: err.message, name: err.name || err.constructor.name})
        }
        
        this.debug('message received from', conn.color, conn.connId, msg)
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
            delete this.matches[id]
            this.logActiveMatches()
        }
    }

    sendMessage(conns, msg) {
        conns = Util.castToArray(conns)
        const str = JSON.stringify(msg)
        for (var conn of conns) {
            this.log('Sending message to', conn.color, msg)
            conn.sendUTF(str)
        }
    }

    newConnectionId() {
        if (!this.connTicker) {
            this.connTicker = 0
        }
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

    static validateTurnFor(turn, color) {
        if (turn.color != color) {
            throw new NotYourTurnError('It is not your turn')
        }
    }

    static checkSync(sync) {
        return sync.White == sync.Red
    }

    static clearSync(sync) {
        delete sync.Red
        delete sync.White
    }

    static gameIdFromSecret(str) {
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