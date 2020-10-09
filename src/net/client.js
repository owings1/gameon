const Core            = require('../lib/core')
const Logger          = require('../lib/logger')
const Util            = require('../lib/util')
const WebSocketClient = require('websocket').client

const {merge} = Util

const crypto = require('crypto')
const fetch  = require('node-fetch')

const {White, Red, Match} = Core

class Client {

    constructor(serverUrl, username, password) {
        this.logger = new Logger
        this.serverSocketUrl = Util.httpToWs(serverUrl)
        this.serverHttpUrl = Util.stripTrailingSlash(Util.wsToHttp(serverUrl))
        this.username = username
        this.password = password
        this.socketClient = new WebSocketClient
        this.conn = null
        this.isHandshake = null
        this.secret = Client.generateSecret()
        this.matchId = null
    }

    async connect() {

        if (this.conn && this.conn.connected) {
            return
        }

        await new Promise((resolve, reject) => {
            this.socketClient.on('error', reject)
            this.socketClient.on('connectFailed', reject)
            this.socketClient.on('connect', conn => {
                this.conn = conn
                conn.on('error', err => this.logger.error(err))
                conn.on('close', () => {
                    this.conn = null
                    this.isHandshake = false
                })
                resolve()
            })
            try {
                this.socketClient.connect(this.serverSocketUrl)
            } catch (err) {
                reject(err)
            }
        })

        return this.handshake()
    }

    async close() {
        if (this.conn) {
            this.conn.close()
        }
    }

    async handshake() {
        const {username, password} = this
        const res = await this.sendAndWaitForResponse({action: 'establishSecret', username, password}, 'acknowledgeSecret')
        this.logger.info('Server handshake success')
        this.isHandshake = true
        return res
    }

    async startMatch(opts) {
        const {total} = opts
        await this.connect()
        const {id} = await this.sendAndWaitForResponse({action: 'startMatch', total, opts}, 'matchCreated')
        this.logger.info('Started new match', id)
        this.logger.info('Waiting for opponent to join')
        this.matchId = id
        await this.waitForResponse('opponentJoined')
        this.logger.info('Opponent joined', id)
        this.match = new Match(total, opts)
        this.color = White
        return this.match
    }

    async joinMatch(id) {
        await this.connect()
        this.logger.info('Joining match', id)
        const res = await this.sendAndWaitForResponse({action: 'joinMatch', id}, 'matchJoined')
        this.matchId = res.id
        const {total, opts} = res
        this.logger.info('Joined match', res.id, 'to', total, 'points')
        this.match = new Match(total, opts)
        this.color = Red
        return this.match
    }

    async matchRequest(action, params) {
        const req = merge({}, this.matchParams(action), params)
        return await this.sendAndWaitForResponse(req, action)
    }

    async sendAndWaitForResponse(msg, action) {
        const p = this.waitForResponse(action)
        this.sendMessage(msg)
        return await p
    }

    async waitForResponse(action) {
        const msg = await this.waitForMessage()
        if (msg.error) {
            throw Client.buildError(msg)
        }
        if (action && msg.action != action) {
            if (msg.action == 'matchCanceled') {
                throw new MatchCanceledError(msg.reason)
            }
            throw new ClientError('Expecting response ' + action + ', but got ' + msg.action + ' instead')
        }
        return msg
    }

    async waitForMessage() {
        return await new Promise((resolve, reject) => {
            this.conn.once('message', msg => {
                resolve(JSON.parse(msg.utf8Data))
            })
        })
    }

    async postJson(uri, data) {
        const url = [this.serverHttpUrl, Util.stripLeadingSlash(uri)].join('/')
        const params = {
            method  : 'post'
          , headers : {
                'content-type': 'application/json'
            }
          , body    : JSON.stringify(data)
        }
        return this.fetch(url, params)
    }

    fetch(...args) {
        return fetch(...args)
    }

    matchParams(params) {
        if (typeof(params) == 'string') {
            params = {action: params}
        }
        return merge({}, {id: this.matchId, color: this.color}, params)
    }

    sendMessage(msg) {
        msg = merge({secret: this.secret}, msg)
        this.logger.debug('sendMessage', msg)
        this.conn.sendUTF(JSON.stringify(msg))
    }

    static generateSecret() {
        return crypto.createHash('sha256').update(Util.uuid()).digest('hex')
    }

    static buildError(msg, fallbackMessage) {
        const err = new ClientError(msg.error || fallbackMessage || 'Unknown server error')
        for (var k in msg) {
            err[k] = msg[k]
        }
        return err
    }
}

class ClientError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

class MatchCanceledError extends ClientError {}

module.exports = Client