const Lib             = require('./game')
const Logger          = require('./logger')
const Util            = require('./util')
const WebSocketClient = require('websocket').client

const crypto = require('crypto')
const merge  = require('merge')
const uuid   = require('uuid')

const {White, Red, Match} = Lib

class Client extends Logger {

    constructor(serverUrl) {
        super()
        this.serverUrl = serverUrl
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
            this.socketClient.on('connect', conn => {
                this.conn = conn
                conn.on('error', err => this.error(err))
                conn.on('close', () => {
                    this.conn = null
                    this.isHandshake = false
                })
                resolve()
            })
            this.socketClient.connect(this.serverUrl)
        })

        await new Promise((resolve, reject) => {
            this.conn.once('message', msg => {
                msg = JSON.parse(msg.utf8Data)
                if (msg.action == 'acknowledgeSecret') {
                    this.info('Server handshake success')
                    this.isHandshake = true
                    resolve()
                } else {
                    reject(Client.buildServerError(msg, 'Unexpected handshake response'))
                }
            })
            this.sendMessage({action: 'establishSecret', secret: this.secret})
        })
    }

    async close() {
        if (this.conn) {
            this.conn.close()
        }
    }

    async startMatch(opts) {
        const {total} = opts
        await this.connect()
        const {id} = await this.sendAndWaitForResponse({action: 'startMatch', total, opts}, 'matchCreated')
        this.info('Started new match', id)
        this.info('Waiting for opponent to join')
        await this.waitForResponse('opponentJoined')
        this.matchId = id
        this.info('Opponent joined', id)
        this.match = new Match(total, opts)
        this.color = White
        return this.match
    }

    async joinMatch(id) {
        await this.connect()
        this.info('Joining match', id)
        const res = await this.sendAndWaitForResponse({action: 'joinMatch', id}, 'matchJoined')
        this.matchId = res.id
        const {total, opts} = res
        this.info('Joined match', res.id, 'to', total, 'points')
        this.match = new Match(total, opts)
        this.color = Red
        return this.match
    }

    async nextGame() {
        await this.matchRequest('nextGame')
        this.match.nextGame()
    }

    async firstTurn(game) {
        const {dice} = await this.matchRequest('firstTurn')
        game._rollFirst = () => dice
        game.firstTurn()
    }

    async nextTurn(game) {
        await this.matchRequest('nextTurn')
        game.nextTurn()
    }

    async finishMoves(turn, game) {
        const moves = turn.moves.map(move => move.coords())
        await this.matchRequest('movesFinished', {moves})
        turn.finish()
    }

    async waitForOpponentMoves(turn, game) {
        const {moves} = await this.matchRequest('movesFinished')
        moves.forEach(move => turn.move(move.origin, move.face))
        turn.finish()
    }

    async rollTurn(turn, game) {
        const {dice} = await this.matchRequest('turnOption', {isDouble: false})
        turn.setRoll(dice)
    }

    async offerDouble(turn, game) {
        await this.matchRequest('turnOption', {isDouble: true})
        turn.setDoubleOffered()
    }

    async waitForOpponentOption(turn, game) {
        const {isDouble, dice} = await this.matchRequest('turnOption')
        if (isDouble) {
            turn.setDoubleOffered()
        } else {
            turn.setRoll(dice)
        }
    }

    async waitForDoubleResponse(turn, game) {
        const {isAccept} = await this.matchRequest('doubleResponse')
        if (!isAccept) {
            turn.setDoubleDeclined()
        }
    }

    async declineDouble(turn, game) {
        await this.matchRequest('doubleResponse', {isAccept: false})
        turn.setDoubleDeclined()
    }

    async acceptDouble(turn, game) {
        await this.matchRequest('doubleResponse', {isAccept: true})
        game.double()
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

    async sendAndWait(msg) {
        const p = this.waitForMessage()
        this.sendMessage(msg)
        return await p
    }

    async waitForResponse(action) {
        const msg = await this.waitForMessage()
        if (msg.error) {
            throw Client.buildServerError(msg)
        }
        if (action && msg.action != action) {
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

    matchParams(params) {
        if (typeof(params) == 'string') {
            params = {action: params}
        }
        return merge({}, {id: this.matchId, color: this.color}, params)
    }

    sendMessage(msg) {
        msg = merge({secret: this.secret}, msg)
        this.conn.sendUTF(JSON.stringify(msg))
    }

    static generateSecret() {
        return crypto.createHash('sha256').update(uuid.v4()).digest('hex')
    }

    static buildServerError(msg, fallbackMessage) {
        const err = new ClientError(msg.error || fallbackMessage || 'Unknown server error')
        if (msg.name) {
            err.name = msg.name
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


module.exports = Client