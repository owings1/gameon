;(function($) {

    $(document).ready(function() {

        const maxLogSize = 1024
        const socketUrl = window.location.origin.replace(/^http/, 'ws')

        const Red   = 'Red'
        const White = 'White'

        const ColorAbbr = {
            White : 'W'
          , Red   : 'R'
        }

        const ColorNorm = {
            White
          , Red
          , W : White
          , R : Red
        }

        const Direction = {
            White : 1
          , Red   : -1
        }

        const Opponent = {
            White : Red
          , Red   : White
        }

        $('#joinMatch').on('submit', function(e) {
            e.preventDefault()
            const total = +$('#total').val()
            joinMatch(total)
        })

        $('#createMatch').on('submit', function(e) {
            e.preventDefault()
            const total = +$('#total').val()
            const opts = {
                isJacoby   : !!$('#isJacoby').is(':checked')
              , isCrawford : !!$('#isCrawford').is(':checked')
            }
            createMatch(total, opts)
        })

        function clientLog(msg) {
            const lines = $('#clientLog').text().split('\n')
            lines.push(msg)
            while (lines.length > maxLogSize) {
                lines.shift()
            }
            $('#clientLog').text(lines.join('\n'))
        }

        function getCredentials() {
            return {
                username : $('#username').val()
              , password : $('#password').val()
            }
        }

        async function joinMatch(matchId) {
            const {username, password} = getCredentials()
            const client = new Client(socketUrl, username, password)
            try {
                const match = await client.joinMatch(id)
                const player = new Player(client, match, Red)
                await player.run()
            } catch (err) {
                clientLog([err.name, err.message].join(': '))
            } finally {
                client.close()
            }
        }

        async function createMatch(total, opts) {
            
        }

        function intRange(a, b) {
            const range = []
            for (var i = a; i <= b; i++) {
                range.push(i)
            }
            return range
        }

        class Player {

            constructor(client, match, color) {
                this.client = client
                this.match = match
                this.color = color
            }

            async runMatch() {
                while (!this.match.isFinished) {
                    clientLog('Starting game')
                    var {game} = await this.playRequest('nextGame')
                    var {turn} = await this.playRequest('firstTurn', {extended: true})
                    if (turn.color == this.color) {
                        await this.playRoll(turn)
                    } else {
                        await this.opponentPlayRoll(turn)
                    }
                    while (!game.isFinished) {
                        var res = await this.playRequest('nextTurn', {extended: true}))
                        turn = res.turn
                        if (turn.color == this.color) {
                            res = await this.playTurn(turn)
                        } else {
                            res = await this.opponentPlayTurn(turn)
                        }
                    }
                }
            }

            async playTurn(turn) {
                
            }

            async playRoll(turn) {
                
            }

            async opponentPlayTurn(turn) {
                
            }

            async opponentPlayRoll(turn) {
                
            }

            async playRequest(action, params) {
                params = params || {}
                params.action = action
                params.id = this.match.id
                params.color = this.color
                return await this.client.sendAndWaitForResponse(action, params)
            }
        }

        class Client {

            constructor(socketUrl, username, password) {
                this.socketUrl = socketUrl
                this.username = username
                this.password = password
                this.secret = Client.generateSecret()
                this.socketClient = null
                this.isHandshake = null
                this._onceResolve = null
            }

            async createMatch(opts) {

                const {total} = opts

                await this.connect()

                clientLog('Creating new match')
                const {match} = await this.sendAndWaitForResponse({action: 'startMatch', total, opts}, 'matchCreated')
                clientLog('Created new match', match.id)

                clientLog('Waiting for opponent to join')
                await this.waitForResponse('opponentJoined')
                clientLog('Opponent joined')

                return match
            }

            async joinMatch(id) {

                await this.connect()

                clientLog('Joining match', id)
                const {match} = await this.sendAndWaitForResponse({action: 'joinMatch', id}, 'matchJoined')
                clientLog('Joined match', id)

                return match
            }

            async connect() {
                if (this.socketClient) {
                    return
                }
                this.socketClient = new WebSocket(this.socketUrl)
                await new Promise((resolve, reject) => {
                    this.socketClient.onopen = e => {
                        clientLog('Socket connected')
                        resolve()
                    }
                })
                this.socketClient.onerror = err => {
                    clientLog([err.name, err.message].join(': '))
                }
                this.socketClient.onclose = () => {
                    this.socketClient = null
                    this.isHandshake = false
                    clientLog('Socket disconnected')
                }
                this.socketClient.onmessage = event => this.handleIncomingMessage(event)
                return await this.handshake()
            }

            close() {
                if (this.socketClient) {
                    this.socketClient.close()
                }
            }

            async handshake() {
                const {username, password} = this
                const res = await this.sendAndWaitForResponse({action: 'establishSecret', username, password}, 'acknowledgeSecret')
                clientLog('Socket handshake success')
                this.isHandshake = true
                return res
            }

            async sendAndWaitForResponse(msg, action) {
                const p = this.waitForResponse(action)
                this.sendMessage(msg)
                return await p
            }

            sendMessage(msg) {
                msg.secret = this.secret
                this.socketClient.send(JSON.stringify(msg))
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
                return await new Promise((resolve) => {
                    this._onceResolve = resolve
                })
            }

            handleIncomingMessage(event) {
                var msg
                try {
                    msg = JSON.parse(event.data)
                } catch (err) {
                    clientLog('Error parsing response: ' + err.message)
                    return
                }
                if (msg.isError) {
                    clientLog([msg.name, msg.error].join(': '))
                    return
                }
                if (this._onceResolve) {
                    this._onceResolve(msg)
                    this._onceResolve = null
                }
            }

            static buildError(msg, fallbackMessage) {
                const err = new ClientError(msg.error || fallbackMessage || 'Unknown server error')
                for (var k in msg) {
                    err[k] = msg[k]
                }
                return err
            }

            static generateSecret() {
                return Client.makeid(64);
                //return crypto.createHash('sha256').update(Math.random().toString()).digest('hex')
            }

            // from https://stackoverflow.com/a/1349426
            static makeid(length) {
                var result             = ''
                const characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                const charactersLength = characters.length
                for (var i = 0; i < length; i++) {
                   result += characters.charAt(Math.floor(Math.random() * charactersLength))
                }           
                return result
            }
        }

        class Board {

            constructor() {
                this.clear()
            }

            static setup() {
                const board = new Board
                board.setup()
                return board
            }

            getPossibleMovesForFace(color, face) {
                if (this.hasBar(color)) {
                    return [this.getMoveIfCanMove(color, -1, face)].filter(move => move != null)
                }
                return this.originsOccupied(color).map(origin =>
                    this.getMoveIfCanMove(color, origin, face)
                ).filter(move => move != null)
            }

            hasWinner() {
                return this.getWinner() != null
            }

            getWinner() {
                if (this.isAllHome(Red)) {
                    return Red
                }
                if (this.isAllHome(White)) {
                    return White
                }
                return null
            }

            isGammon() {
                return this.hasWinner() && this.homes[Opponent[this.getWinner()]].length == 0
            }

            isBackgammon() {
                if (this.isGammon()) {
                    const winner = this.getWinner()
                    return this.bars[Opponent[winner]].length > 0 ||
                           undefined != InsideSlots[winner].find(i => this.slots[i].length)
                }
                return false
            }

            originsOccupied(color) {
                return Object.keys(this.slots).filter(i =>
                    this.slots[i].length > 0 && this.slots[i][0].color == color
                ).map(i => +i)
            }

            clear() {
                this.slots = intRange(0, 23).map(i => [])
                this.bars  = {Red: [], White: []}
                this.homes = {Red: [], White: []}
            }

            hasBar(color) {
                return this.bars[color].length > 0
            }

            mayBearoff(color) {
                return !this.hasBar(color) && undefined == OutsideSlots[color].find(i =>
                    this.slots[i].find(piece =>
                        piece.color == color
                    )
                )
            }

            isAllHome(color) {
                return this.homes[color].length == 15
            }

            hasPieceBehind(color, i) {
                const behinds = Direction[color] == 1 ? intRange(0, i - 1) : intRange(i + 1, 23)
                return undefined != behinds.find(i =>
                    this.slots[i].length > 0 &&
                    this.slots[i][0].color == color
                )
            }

            setup() {
                this.clear()
                this.slots[0]  = Piece.make(2, White)
                this.slots[5]  = Piece.make(5, Red)
                this.slots[7]  = Piece.make(3, Red)
                this.slots[11] = Piece.make(5, White)
                this.slots[12] = Piece.make(5, Red)
                this.slots[16] = Piece.make(3, White)
                this.slots[18] = Piece.make(5, White)
                this.slots[23] = Piece.make(2, Red)
            }

            setStateString(str) {
                const locs = str.split('|')
                this.bars.White = Piece.make(locs[0], White)
                this.bars.Red = Piece.make(locs[1], Red)
                for (var i = 0; i < 24; i++) {
                    this.slots[i] = Piece.make(...locs[i + 2].split(':'))
                }
                this.homes.White = Piece.make(locs[26], White)
                this.homes.Red = Piece.make(locs[27], Red)
            }

            stateString() {
                // <White bar count>|<Red bar count>|<slot count>:<Red/White/empty>|...|<White home count>|<Red home count>
                return [
                    this.bars.White.length
                  , this.bars.Red.length
                ].concat(this.slots.map(slot =>
                    [slot.length, slot.length > 0 ? slot[0].color : ''].join(':')
                )).concat([
                    this.homes.White.length
                  , this.homes.Red.length
                ]).join('|')
            }

            pointOrigin(color, point) {
                return Board.pointOrigin(color, point)
            }

            originPoint(color, origin) {
                return Board.originPoint(color, origin)
            }

            toString() {
                return this.stateString()
            }

            static pointOrigin(color, point) {
                if (point == -1) {
                    return -1
                }
                if (color == Red) {
                    return point - 1
                }
                return 24 - point
            }

            static originPoint(color, origin) {
                if (origin == -1) {
                    return -1
                }
                if (color == Red) {
                    return origin + 1
                }
                return 24 - origin
            }
        }

        class Piece {

            constructor(color) {
                this.color = ColorNorm[color]
                this.c = ColorAbbr[this.color]
            }

            toString() {
                return this.color
            }

            static make(n, color) {
                return intRange(0, +n - 1).map(i => new Piece(color))
            }
        }

        class ClientError extends Error {
            constructor(...args) {
                super(...args)
                this.name = this.constructor.name
            }
        }

        class MatchCanceledError extends ClientError {}

    })
})(window.jQuery);