const Lib             = require('./game')
const Logger          = require('./logger')
const Util            = require('./util')
const WebSocketServer = require('websocket').server

const crypto = require('crypto')
const express = require('express') // maybe we don't need express
const {White, Red, Match} = Lib

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
                            this.info('Peer connected', conn.remoteAddress)
                            const conn = req.accept(null, req.origin)
                            const connId = this.newConnectionId()
                            conn.connId = connId
                            this.socketClients[connId] = conn
                            conn.on('close', () => delete this.socketClients[connId])
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
        this.info('message received', {msg})
    }

    newConnectionId() {
        if (!this.connTicker) {
            this.connTicker = 0
        }
        this.connTicker += 1
        return crypto.createHash('md5').update('' + this.connTicker).digest()
    }

    static gameIdFromSecret(str) {
        return crypto.createHash('sha256').update(str).digest().substring(0, 8)
    }

}


class ServerError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

class ValidateError extends ServerError {}
class MatchAlreadyExistsError extends ServerError {}
class MatchNotFoundError extends ServerError {}
class MatchAlreadyJoinedError extends ServerError {}

if (require.main === module) {
    const server = new Server()
    server.listen(process.env.HTTP_PORT || 8080)
}
module.exports = Server