/**
 * gameon - Terminal Player class
 *
 * Copyright (C) 2020-2021 Doug Owings
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const Base      = require('../lib/player')
const Constants = require('../lib/constants')
const Core      = require('../lib/core')
const Draw      = require('./draw')
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const Robot     = require('../robot/player')
const Themes    = require('./themes')
const Util      = require('../lib/util')

const {inquirer} = require('./inquirer')
const {Board} = Core
const {DrawHelper, TermHelper} = Draw
const {RobotDelegator} = Robot

const {
    Colors
  , DefaultThemeName
  , DefaultTermEnabled
  , Opponent
  , OriginPoints
  , PointOrigins
} = Constants

const {MatchCanceledError, WaitingFinishedError} = Errors

const {
    castToArray
  , nchars
  , rejectDuplicatePrompter
  , sp
  , uniqueInts
} = Util

const {EventEmitter} = require('events')

const Listeners = {

    matchStart: function(match) {

        if (match.isCanceled) {
            this.emit('matchCanceled', match.cancelError)
            return
        }

        this.isDualTerm = this.opponent.isTerm
        this.isDualRobot = this.isRobot && this.opponent.isRobot

        this.drawer.match = match
        this.drawer.persp = this.persp

        this.removeOpponentListeners(this.opponent)

        const listenersMap = {
            matchCanceled: [
                //this.cancelPrompt.bind(this)
            ]
          , matchResponse: []
        }

        if (this.opponent.isNet) {
            listenersMap.matchResponse.push((req, res) => {
                if (!this.isWaitingPrompt) {
                    return
                }
                const isMyDouble = req.action == 'turnOption' &&
                                   req.color == this.color &&
                                   req.isDouble
                if (!isMyDouble) {
                    this.cancelPrompt(new WaitingFinishedError)
                }
            })
        }

        this.addOpponentListeners(this.opponent, listenersMap)
    }

  , gameStart: function(game, match, players) {

        this.drawer.game = game
        this.drawer.board = game.board

        this.report('gameStart', match ? match.games.length : null)

        if (!this.isDualTerm || this.color == Colors.White) {
            this.output.write(nchars(21, '\n'))
        }
    }

  , firstRoll: function(turn, game, match) {
        this.report('firstRollWinner', turn.color, turn.dice)
        this.report('turnStart', turn.color)
    }

  , afterRoll: function(turn) {
        this.report('playerRoll', turn.color, turn.diceSorted)
        if (turn.color != this.color) {
            // Drawing for this player happens in playRoll
            if (!this.isDualTerm) {
                this.drawBoard()
            }
            if (this.opponent.isNet) {
                this.promptWaitingForOpponent('Waiting for opponent to play')
            }
        }
    }

  , turnStart: function(turn) {
        this.report('turnStart', turn.color)
        if (!this.isDualTerm || turn.color == this.color) {
            this.drawBoard()
        }
    }

  , beforeOption: function(turn) {
        if (this.opponent.isNet && turn.color != this.color) {
            this.promptWaitingForOpponent('Waiting for opponent option')
        }
    }

  , turnEnd: function(turn) {
        if (turn.isCantMove) {
            this.report('cantMove', turn.color)
        }
        if (turn.isRolled) {
            if (turn.color != this.color) {
                // Drawing for this color happens in playRoll
                if (turn.isForceMove) {
                    this.report('forceMove', turn.color, turn.diceSorted)
                }
                turn.moves.forEach(move => this.report('move', move))
            }
        }
    }

  , doubleOffered: function(turn, game) {
        this.report('doubleOffered', turn.color)
        if (!this.isDualTerm || turn.color != this.color) {
            this.drawBoard()
        }
        if (this.opponent.isNet && turn.color == this.color) {
            this.promptWaitingForOpponent('Waiting for opponent to respond')
        }
    }

  , doubleDeclined: function(turn) {
        this.report('doubleDeclined', turn.opponent)
    }

  , doubleAccepted: function(turn, game) {
        this.report('gameDoubled', turn.opponent, game.cubeValue)
    }

  , gameEnd: function(game) {
        const winner = game.getWinner()
        this.report('hr')
        this.report('gameEnd', winner, game.finalValue)
        if (!this.isDualTerm || winner == this.color) {
            this.term.clear()
        }
    }

  , matchEnd: function(match) {
        const winner = match.getWinner()
        const loser = match.getLoser()
        const {scores} = match
        this.report('hr')
        this.report('matchEnd', winner, scores[winner], scores[loser])
        this.report('hr')
        if (!this.isDualTerm || winner == this.color) {
            this.drawBoard()
        }
    }

  , matchCanceled: function(err) {
        this.cancelPrompt(err)
    }

  , resize: function() {
        if (!this.isDualTerm || this.color == Colors.White) {
            this.handleResize()
        }
    }
}

class TermPlayer extends Base {

    static defaults() {
        return {
            fastForced  : false
          , theme       : DefaultThemeName
          , termEnabled : DefaultTermEnabled
            // for suggesting
          , isCustomRobot : false
          , robots        : null
        }
    }

    constructor(color, opts) {

        super(color)

        this.isTerm = true
        this.persp = color
        this.opts = Util.defaults(TermPlayer.defaults(), opts)
        this.term = new TermHelper(this.opts.termEnabled)
        this.theme = Themes.getInstance(this.opts.theme)
        this.logs = []

        this.drawer = DrawHelper.forTermPlayer(this)

        this.inquirer = inquirer.createPromptModule({output: this.output})

        // Track which players we've loaded handlers on
        // {id: {event: [listener, ...]}}
        this.opponentListeners = {}
        // {id: player}
        this.opponentRegistry = {}

        Object.entries(Listeners).forEach(([event, listener]) => {
            this.on(event, listener)
        })
    }

    get output() {
        return this.term.stdout
    }

    set output(strm) {
        this.term.stdout = strm
        this.inquirer.opt.output = strm
    }

    // @override
    async turnOption(turn, game, match) {
        const isDouble = await this.promptTurnOption(turn, game, match)
        if (isDouble) {
            turn.setDoubleOffered()
        }
    }

    // @override
    async decideDouble(turn, game, match) {
        const isAccept = await this.promptDecideDouble(turn, game, match)
        if (!isAccept) {
            turn.setDoubleDeclined()
        }
    }

    // @implement
    async playRoll(turn, game, match) {

        if (turn.isCantMove) {
            return
        }

        if (turn.isForceMove && this.opts.fastForced) {
            this.report('forceMove', turn.color, turn.diceSorted)
            this.drawBoard()
            await this.makeForcedMoves(turn)
            this.drawBoard()
            return
        }

        while (true) {

            this.drawBoard()

            let prefix = null
            if (!this.isRobot) {
                prefix = sp(
                    this.ccolor(this.color)
                  , 'rolled'
                  , turn.diceSorted.join()
                  , 'with'
                  , turn.remainingFaces.join()
                  , 'remaining'
                ) + '\n'
            }

            let moves = turn.getNextAvailableMoves()
            let origins = moves.map(move => move.origin)

            let canUndo = turn.moves.length > 0

            let origin = await this.promptOrigin(turn, origins, canUndo, prefix)

            if (origin == 'undo') {
                turn.unmove()
                this.logs.pop()
                continue
            }

            let faces = moves.filter(move => move.origin == origin).map(move => move.face)
            let face = await this.promptFace(turn, faces)

            let move = turn.move(origin, face)

            this.report('move', move)

            if (turn.getNextAvailableMoves().length == 0) {

                if (!this.isRobot) {
                    this.drawBoard()
                }

                let isFinish = await this.promptFinish()

                if (isFinish) {
                    break
                }

                turn.unmove()
                this.logs.pop()
            }
        }
    }

    report(...args) {
        if (!this.drawer) {
            return
        }
        this.drawer.report(...args)
    }

    async promptTurnOption(turn) {
        const choices = ['r', 'd', 'q']
        const message = sp(this.cchalk(turn.color, turn.color + "'s"), 'turn to (r)oll or (d)ouble')
        const question = {
            name     : 'action'
          , type     : 'input'
          , message
          , default  : 'r'
          , validate : this.choicesValidator(choices, true)
        }
        while (true) {
            var {action} = await this.prompt(question)
            if (action.toLowerCase() == 'q') {
                await this.checkQuit()
                continue
            }
            if (action[0] == '_') {
                await this.doHiddenAction(action, turn)
                continue
            }
            break
        }
        return action.toLowerCase() == 'd'
    }

    async promptDecideDouble() {
        // TODO: make new theme category, e.g. console.* etc.
        const chlk = this.theme.text
        const choices = ['y', 'n']
        const prefix = sp(this.ccolor(this.opponent.color), 'wants to double to', this.thisGame.cubeValue * 2, 'points') + '\n'
        const message = sp('Does', this.ccolor(this.color), 'accept the double?', chlk.dim('(y/n)'))
        const answers = await this.prompt({
            name     : 'accept'
          , type     : 'input'
          , message
          , prefix
          , validate : this.choicesValidator(choices)
        })
        return answers.accept.toLowerCase() == 'y'
    }

    async promptOrigin(turn, origins, canUndo, prefix) {
        const question = this.getOriginQuestion(origins, canUndo, prefix)
        while (true) {
            var {origin} = await this.prompt(question)
            if (origin == 'q') {
                await this.checkQuit()
                continue
            }
            if (origin[0] == '_') {
                await this.doHiddenAction(origin, turn)
                continue
            }
            break
        }
        if (origin == 'u') {
            return 'undo'
        } else if (origin == 'b') {
            return -1
        }
        return this.pointOrigin(+origin)
    }

    async promptFace(turn, faces) {
        faces = uniqueInts(faces).sort(Util.sortNumericDesc)
        if (faces.length == 1) {
            return faces[0]
        }
        const choices = faces.map(face => face.toString())
        const message = 'Die [' + choices.join() + ']'
        const answers = await this.prompt({
            name     : 'face'
          , type     : 'input'
          , message
          , default  : choices[0]
          , validate : this.choicesValidator(choices)
        })
        return +answers.face
    }

    async promptFinish() {
        const choices = ['f', 'u']
        const answers = await this.prompt({
            name     : 'finish'
          , type     : 'input'
          , message  : '(f)inish or (u)ndo'
          , default  : 'f'
          , validate : this.choicesValidator(choices)
        })
        return answers.finish.toLowerCase() == 'f'
    }

    async makeForcedMoves(turn) {
        for (var moves = turn.getNextAvailableMoves(); moves.length; moves = turn.getNextAvailableMoves()) {
            turn.move(moves[0])
        }
    }

    async checkQuit() {
        const answers = await this.prompt({
            name     : 'confirm'
          , message  : 'Are you sure you want to quit?'
          , type     : 'confirm'
          , default  : () => false
        })
        if (answers.confirm) {
            throw new MatchCanceledError(this.color + ' quit')
        }
    }

    async doHiddenAction(action, turn) {

        switch (action) {

            case '_':
                let info = {
                    state28     : turn.board.state28()
                  , stateString : turn.board.stateString()
                }
                Object.entries(info).forEach(([key, value]) => {
                    this.output.write(`${key}: ${value}\n`)
                })
                break

            case '_f':
                this.persp = Opponent[this.persp]
                if (this.drawer) {
                    this.drawer.persp = this.persp
                }
                this.drawBoard()
                break

            case '_r':
                if (!turn.isRolled) {
                    this.output.write('Turn is not rolled\n')
                    break
                }
                if (turn.isCantMove) {
                    this.output.write('No moves available\n')
                    break
                }
                try {
                    let robot = this.newRobot(turn.color)
                    try {
                        let moves = await robot.getMoves(turn, this.thisGame, this.thisMatch)
                        let board = Board.fromStateString(turn.startState)
                        let moveStrs = moves.map(({origin, face}) => {
                            const move = board.move(turn.color, origin, face)
                            return this.drawer.reporter.move(move, true).toString()
                        })
                        this.output.write(`Robot says: ${moveStrs.join(', ')}\n`)
                    } finally {
                        await robot.destroy()
                    }
                } catch (err) {
                    this.logger.error(err)
                }
                break

            default:
                this.output.write('Unknown action\n')
                break
        }
    }

    newRobot(...args) {
        if (!this.opts.isCustomRobot) {
            return RobotDelegator.forDefaults(...args)
        }
        return RobotDelegator.forSettings(this.opts.robots, ...args)
    }

    getOriginQuestion(origins, canUndo, prefix) {

        const points = uniqueInts(origins).map(origin => this.originPoint(origin))
        points.sort(Util.sortNumericAsc)

        const choices = points.map(p => p.toString())

        var message = 'Origin '
        if (points[0] == -1) {
            message += ' [(b)ar]'
            choices[0] = 'b'
        } else {
            message += '[' + choices.join() + ']'
        }
        if (canUndo) {
            choices.push('u')
            message += ' or (u)ndo'
        }

        choices.push('q')

        const question = {
            name     : 'origin'
          , type     : 'input'
          , message
          , prefix
          , validate : this.choicesValidator(choices, true)
        }

        if (points.length == 1) {
            question.default = choices[0]
        }

        return question
    }

    drawBoard() {
        if (!this.drawer) {
            return
        }
        this.term.moveTo(1, 1)
        this.term.eraseDisplayBelow()
        this.output.write(this.drawer.getString())
    }

    originPoint(origin, color) {
        color = color || this.color
        return OriginPoints[color][origin]
    }

    pointOrigin(point, color) {
        color = color || this.color
        return PointOrigins[color][point]
    }

    prompt(questions, answers, opts) {

        return new Promise((resolve, reject) => {

            if (rejectDuplicatePrompter(this.prompter, reject)) {
                return
            }

            // We need to call cleanup at the right time, and can't use promise.finally.

            const cleanup = () => {
                this.logger.debug('prompter.cleanup')
                this.promptReject = null
                this.prompter = null
            }

            opts = {
                theme: this.theme
              , ...opts
            }

            this.logger.debug('prompter.create')

            this.prompter = this.inquirer.prompt(questions, answers, opts)

            this.promptReject = err => {
                this.logger.debug('promptReject')
                if (this.prompter) {
                    try {
                        this.prompter.ui.rl.output.write('\n')
                    } catch (e) {
                        this.logger.debug('Failed to write an extra line', e)
                    }
                    try {
                        this.logger.debug('promptReject.ui.close')
                        this.prompter.ui.close()
                    } catch (e) {
                        this.logger.error('Failed to close UI', e)
                    }
                } else {
                    this.logger.debug('No prompter to close')
                }
                // Cleanup before reject.
                cleanup()
                reject(err)
            }

            this.prompter.then(answers => {
                this.logger.debug('prompter.then')
                // Cleanup before resolve
                cleanup()
                resolve(answers)
            }).catch(err => {
                this.logger.debug('prompter.catch')
                this.promptReject(err)
            })
        })
    }

    cancelPrompt(err) {
        this.logger.debug('cancelPrompt')
        if (this.promptReject) {
            this.promptReject(err)
        }
    }

    async promptWaitingForOpponent(message) {
        if (this.prompter) {
            // Ignore if we have already started another prompt.
            return
        }
        const emitter = new EventEmitter
        emitter.on('afterRender', () => this.term.hideCursor())
        const question = {
            name     : 'waiter'
          , type     : 'input'
          , prefix   : ''
          , validate : () => ''
          , mute     : true
          , spin     : true
          , message
        }
        const opts = {emitter}
        this.isWaitingPrompt = true
        try {
            this.logger.debug('promptWaitingForOpponent.create')
            await this.prompt(question, null, opts)
        } catch (err) {
            if (err.isWaitingFinishedError) {
                return
            }
            this.cancelPrompt(err)
        } finally {
            this.term.showCursor()
            emitter.removeAllListeners()
            this.isWaitingPrompt = false
        }
    }

    handleResize() {
        if (!this.term.enabled) {
            return
        }
        const {prompter} = this
        if (!prompter || !prompter.ui) {
            return
        }
        const {ui} = prompter
        if (typeof ui.onResize != 'function') {
            return
        }
        this.drawBoard()
        ui.onResize()
    }

    cchalk(color, ...args) {
        if (!this.drawer) {
            return sp(...args)
        }
        // TODO: this should be a new base category : log.*, console.*, etc.
        return this.drawer.theme.board.log.piece[color.toLowerCase()](...args)
    }

    ccolor(color) {
        return this.cchalk(color, color)
    }

    choicesValidator(choices, allowHidden) {
        return value => {
            if (allowHidden && value[0] == '_') {
                return true
            }
            if (choices.indexOf(value.toLowerCase()) > -1) {
                return true
            }
            return sp('Please enter one of', choices.join())
        }
    }

    removeOpponentListeners(player) {
        if (!this.opponentListeners[player.id]) {
            return
        }
        const registry = this.opponentListeners[player.id]
        Object.entries(registry).forEach(([event, listeners]) => {
            listeners.splice(0).forEach(listener => {
                player.removeListener(event, listener)
                this.logger.debug('Removed', event, 'listener from opponent', player.id)
            })
        })
        delete this.opponentListeners[player.id]
        delete this.opponentRegistry[player.id]
    }

    addOpponentListeners(player, listenersMap) {
        if (!this.opponentRegistry[player.id]) {
            this.opponentRegistry[player.id] = player
        }
        if (!this.opponentListeners[player.id]) {
            this.opponentListeners[player.id] = {}
        }
        const registry = this.opponentListeners[player.id]
        Object.entries(listenersMap).forEach(([event, listeners]) => {
            if (!registry[event]) {
                registry[event] = []
            }
            castToArray(listeners).forEach(listener => {
                player.on(event, listener)
                registry[event].push(listener)
                this.logger.debug('Added', event, 'listener to opponent', player.id)
            })
        })
    }

    destroy() {

        Object.values(this.opponentRegistry).forEach(player => {
            try {
                this.removeOpponentListeners(player)
            } catch (err) {
                const id = player ? player.id : null
                this.logger.error('Failed to remove opponent listeners for player id', id, err)
            }
        })

        Object.entries(Listeners).forEach(([event, listener]) => {
            this.removeListener(event, listener)
        })

        return super.destroy()
    }
}

class TermRobot extends TermPlayer {

    static defaults() {
        return {delay: 0.5}
    }

    constructor(robot, opts) {

        super(robot.color, opts)

        this.opts = {...this.opts, ...Util.defaults(TermRobot.defaults(), opts)}
        this.isRobot = true
        this.persp = Colors.White
        this.robot = robot
    }

    async playRoll(turn, game, match) {
        this.thisMoves = await this.robot.getMoves(turn, game, match)
        await super.playRoll(turn, game, match)
    }

    async promptTurnOption(turn, game, match) {
        await this.robot.turnOption(turn, game, match)
        return turn.isDoubleOffered
    }

    async promptDecideDouble(turn, game, match) {
        await this.robot.decideDouble(turn, game, match)
        return !turn.isDoubleDeclined
    }

    async promptOrigin(turn, origins) {
        this.thisMove = this.thisMoves.shift()
        await this.delay()
        return this.thisMove.origin
    }

    async promptFace(turn, faces) {
        await this.delay()
        return this.thisMove.face
    }

    async promptFinish() {
        return true
    }

    async delay() {
        if (this.opts.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.opts.delay * 1000))
        }
    }

    destroy() {
        this.robot.destroy()
        return super.destroy()
    }

    meta() {
        return {...super.meta(), ...this.robot.meta()}
    }
}

TermPlayer.Robot = TermRobot

module.exports = TermPlayer