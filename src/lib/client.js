const Lib             = require('./game')
const Logger          = require('./logger')
const Util            = require('./util')
const ServerErrors    = require('./server').Errors
const WebSocketClient = require('websocket').client

const crypto = require('crypto')
const merge  = require('merge')
const uuid   = require('uuid')
const {White, Red, Match, Opponent} = Lib

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
        const action = 'rollTurn'
        const res = await this.sendAndWait(this.matchParams(action), 'turnOption')
        const {dice} = res
        turn.setRoll(dice)
    }

    async waitForOpponentOption(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'turnOption'
        const res = await this.sendAndWait(this.matchParams(action), 'turnOption')
        const {isRolled, dice, isDoubleOffered} = res
        if (isDoubleOffered) {
            turn.setDoubleOffered()
        }
        if (dice) {
            turn.setRoll(dice)
        }
    }

    async offerDouble(turn, game) {
        const id = this.matchId
        const {color} = this
        var action = 'offerDouble'
        await this.sendAndWait(this.matchParams(action), 'turnOption')
        //await new Promise(resolve => setTimeout(resolve, 1000))
        turn.setDoubleOffered()
        const res = await this.sendAndWait(this.matchParams('doubleResponse'), 'doubleResponse')
        const {isDoubleDeclined, cubeValue, cubeOwner} = res
        if (isDoubleDeclined) {
            turn.setDoubleDeclined()
        } else {
            game.cubeValue = cubeValue
            game.cubeOwner = cubeOwner
        }
    }

    async declineDouble(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'declineDouble'
        await this.sendAndWait(this.matchParams(action), 'doubleResponse')
        turn.setDoubleDeclined()
    }

    async acceptDouble(turn, game) {
        const id = this.matchId
        const {color} = this
        const action = 'acceptDouble'
        const res = await this.sendAndWait(this.matchParams(action), 'doubleResponse')
        const {cubeValue, cubeOwner} = res
        game.cubeValue = cubeValue
        game.cubeOwner = cubeOwner
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
                    reject(new Error('unexpected action ' + action))
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
        return new (ServerErrors[msg.name] || Error)(msg.error || fallbackMessage || 'Generic server error')
    }
}


class ClientError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}


module.exports = Client