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
        this.secret = Client.generateSecret()
        this.matchId = null
    }

    async connect() {
        
        await new Promise((resolve, reject) => {
            if (this.conn) {
                resolve()
                return
            }
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

    async startMatch(matchOpts) {
        await this.connect()
        const res = await this.sendAndWait({action: 'startMatch', total: matchOpts.total, opts: matchOpts}, 'matchCreated')
        const {id} = res
        this.info('Started new match', id)
        this.info('Waiting for opponent to join')
        await this.waitForMessage('opponentJoined')
        this.matchId = id
        this.info('Opponent joined', id)
        this.match = new Match(matchOpts.total, matchOpts)
        this.color = White
        return this.match
    }

    async joinMatch(id) {
        await this.connect()
        this.info('Joining match', id)
        const res = await this.sendAndWait({action: 'joinMatch', id}, 'matchJoined')
        this.matchId = res.id
        const {total, opts} = res
        this.info('Joined match', res.id, 'to', total, 'points')
        this.match = new Match(total, opts)
        this.color = Red
        return this.match
    }

    async nextGame() {
        const id = this.matchId
        const {color} = this
        await this.sendAndWait({action: 'nextGame', id, color}, 'nextGame')
        return this.match.nextGame()
    }

    async firstTurn(game) {
        const id = this.matchId
        const {color} = this
        const res = await this.sendAndWait({action: 'firstTurn', id, color}, 'firstTurn')
        const {dice} = res
        game._rollFirst = () => dice
        return game.firstTurn()
    }

    async nextTurn(game) {
        const id = this.matchId
        const {color} = this
        const action = 'nextTurn'
        const res = await this.sendAndWait(this.matchParams(action), action)
        return game.nextTurn()
    }

    async finishMoves(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'movesFinished'
        const moves = turn.moves.map(move => move.coords())
        const res = await this.sendAndWait(this.matchParams({action, moves}), action)
        turn.finish()
        // check stateString
    }

    async waitForOpponentMoves(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'movesFinished'
        const res = await this.sendAndWait(this.matchParams(action), action)
        const moves = res.moves.map(move => turn.move(move.origin, move.face))
        turn.finish()
        // check stateString
    }

    async rollTurn(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'turnOption'
        const isDouble = false
        const {dice} = await this.sendAndWait(this.matchParams({action, isDouble}), action)
        turn.setRoll(dice)
    }

    async offerDouble(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'turnOption'
        const isDouble = true
        await this.sendAndWait(this.matchParams({action, isDouble}), action)
        turn.setDoubleOffered()
        await this.waitForDoubleResponse(turn, game)
    }

    async waitForOpponentOption(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'turnOption'
        const {isDouble, dice} = await this.sendAndWait(this.matchParams(action), action)
        if (isDouble) {
            turn.setDoubleOffered()
        } else {
            turn.setRoll(dice)
        }
    }

    async waitForDoubleResponse(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'doubleResponse'
        const {isAccept} = await this.sendAndWait(this.matchParams(action), action)
        if (isAccept) {
            game.double()
        } else {
            turn.setDoubleDeclined()
        }
    }

    async declineDouble(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'doubleResponse'
        const isAccept = false
        await this.sendAndWait(this.matchParams({action, isAccept}), action)
        turn.setDoubleDeclined()
    }

    async acceptDouble(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'doubleResponse'
        const isAccept = true
        await this.sendAndWait(this.matchParams({action, isAccept}), action)
        game.double()
    }

    async sendAndWait(msg, action) {
        const p = this.waitForMessage(action)
        this.sendMessage(msg)
        return await p
    }

    async waitForMessage(action) {
        return await new Promise((resolve, reject) => {
            this.conn.once('message', msg => {
                msg = JSON.parse(msg.utf8Data)
                if (msg.error) {
                    reject(Client.buildServerError(msg))
                    return
                }
                if (action && msg.action != action) {
                    reject(new ClientError('Expecting response ' + action + ', but got ' + msg.action + ' instead'))
                    return
                }
                resolve(msg)
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
        msg.secret = this.secret
        this.conn.sendUTF(JSON.stringify(msg))
    }

    static generateSecret() {
        return crypto.createHash('sha256').update(uuid.v4()).digest('hex')
    }

    static buildServerError(msg, fallbackMessage) {
        const err = new ClientError(msg.error || fallbackMessage || 'Generic server error')
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