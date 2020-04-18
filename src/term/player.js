const Base   = require('../lib/player')
const Core   = require('../lib/core')
const Draw   = require('./draw')
const Util   = require('../lib/util')

const chalk    = require('chalk')
const inquirer = require('inquirer')

const {White, Red} = Core
const {Opponent}   = Core
const {merge}      = Util
const sp           = Util.joinSpace

const Chars = {
    rarrow : '\u2b62 '
}
class TermPlayer extends Base {

    static defaults() {
        return {
            fastForced: false
        }
    }

    constructor(color, opts) {
        super(color)
        this.opts = Util.defaults(TermPlayer.defaults(), opts)
        this.isTerm = true
        this.on('gameStart', (game, match, players) => {
            this.isDualTerm = this.opponent.isTerm
            this.isDualRobot = this.isRobot && this.opponent.isRobot
            this.infoOnce('Starting game')
        })
        this.on('firstRoll', (turn, game, match) => {
            const {dice} = turn
            const diceStr = [this.cchalk(White, dice[0]), this.cchalk(Red, dice[1])].join()
            this.infoOnce(this.ccolor(turn.color), 'wins the first roll with', diceStr)
        })
        this.on('afterRoll', turn => {
            if (turn.color != this.color && !this.isDualTerm) {
                this.drawBoard()
            }
            this.infoOnce(this.ccolor(turn.color), 'rolls', turn.diceSorted.join())
        })
        this.on('turnStart', turn => {
            this.infoOnce(this.ccolor(turn.color) + "'s turn")
        })
        this.on('turnEnd', turn => {
            if (turn.isCantMove) {
                this.infoOnce(this.ccolor(turn.color), 'cannot move')
            }
            this.drawBoard(true)
            if (turn.isRolled) {
                this.infoOnce(this.ccolor(turn.color), 'rolled', turn.diceSorted.join())
                turn.moves.forEach(move => this.infoOnce(this.describeMove(move)))
            }
        })
        this.on('doubleOffered', (turn, game) => {
            this.infoOnce(this.ccolor(turn.color), 'wants to double the stakes to', game.cubeValue * 2, 'points')
            if (turn.color == this.color && this.opponent.isNet) {
                this.info('Waiting for', this.ccolor(turn.opponent), 'to respond')
            }
        })
        this.on('doubleDeclined', turn => {
            this.infoOnce(this.ccolor(turn.opponent), 'has declined the double')
        })
        this.on('doubleAccepted', (turn, game) => {
            this.infoOnce(this.ccolor(turn.opponent), 'owns the cube at', game.cubeValue, 'points')
        })
        this.on('gameEnd', game => {
            this.infoOnce(this.ccolor(game.getWinner()), 'has won the game with', game.finalValue, 'points')
        })
        this.on('matchEnd', match => {
            this.drawBoard(true)
            const winner = match.getWinner()
            const loser = match.getLoser()
            this.infoOnce(this.ccolor(winner), 'wins the match', match.scores[winner], 'to', match.scores[loser])
        })
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
        while (true) {
            if (this.opts.fastForced && turn.allowedEndStates.length == 1) {
                this.logger.info('Forced move for', this.ccolor(turn.color), 'with', turn.diceSorted.join())
                turn.allowedMoveSeries[0].forEach(move => {
                    turn.move(move)
                    this.describeMove(move)
                })
                //this.drawBoard()
                break
            }
            this.drawBoard(false, true)
            this.info(this.ccolor(this.color), 'rolled', turn.diceSorted.join(), 'with', turn.remainingFaces.join(), 'remaining')
            var moves = turn.getNextAvailableMoves()
            var origins = moves.map(move => move.origin)
            var canUndo = turn.moves.length > 0
            var origin = await this.promptOrigin(turn, origins, canUndo)
            if (origin == 'undo') {
                turn.unmove()
                continue
            }
            var faces = moves.filter(move => move.origin == origin).map(move => move.face)
            var face = await this.promptFace(faces)
            var move = turn.move(origin, face)
            this.info(this.describeMove(move))
            if (turn.getNextAvailableMoves().length == 0) {
                if (!this.isRobot) {
                    this.drawBoard(false, true)
                }
                var isFinish = await this.promptFinish()
                if (isFinish) {
                    //this.drawBoard()
                    break
                }
                turn.unmove()
            }
        }
    }

    info(...args) {
        this.logger.info(...args)
    }

    infoOnce(...args) {
        if (this.isDualTerm && this.color == Red) {
            return
        }
        this.info(...args)
    }

    cchalk(color, ...args) {
        return chalk.bold[color.toLowerCase()](...args)
    }

    ccolor(color) {
        return chalk.bold[color.toLowerCase()](color)
    }

    describeMove(move) {
        const {board} = move
        const me = move.color
        const them = Opponent[move.color]
        const chalkMe = str => chalk.bold[me.toLowerCase()](str)
        const chalkThem = str => chalk.bold[them.toLowerCase()](str)
        const mine = {
            origin : chalkMe(move.isComeIn ? 'bar' : board.originPoint(me, move.origin))
          , dest   : chalkMe(move.isBearoff ? 'home' : board.originPoint(me, move.dest))
        }
        const theirs = {
            origin : move.isComeIn ? chalkMe('bar') : chalkThem(board.originPoint(them, move.origin))
          , dest   : move.isBearoff ? chalkMe('home') : chalkThem(board.originPoint(them, move.dest))
        }
        const origin = move.isComeIn ? 'bar' : move.board.originPoint(move.color, move.origin)
        const dest = move.isBearoff ? 'home' : move.board.originPoint(move.color, move.dest)
        const sargs = [chalkMe(me), 'moves', mine.origin, Chars.rarrow, mine.dest, '/', theirs.origin, Chars.rarrow, theirs.dest]
        if (move.isHit) {
            sargs.push(chalk.bold.yellow('HIT'))
        }
        return sp(...sargs)
    }

    drawBoard(isOnce, isPersp) {

        if (isOnce && this.isDualTerm && this.color == Red) {
            return
        }

        var persp = this.isRobot ? White : this.color
        if (isPersp && !this.isRobot && this.color == Red) {
            persp = Red
        }

        this.logger.writeStdout(Draw.drawBoard(this.thisGame, this.thisMatch, persp))
    }

    async promptTurnOption() {
        const choices = ['r', 'd']
        const answers = await this.prompt({
            name     : 'action'
          , message  : '(r)oll or (d)ouble'
          , default  : () => 'r'
          , type     : 'input'
          , validate : value => choices.indexOf(value.toLowerCase()) > -1 || sp('Please enter one of', choices.join())
        })
        return answers.action.toLowerCase() == 'd'
    }

    async promptDecideDouble() {
        const answers = await this.prompt({
            name    : 'accept'
          , type    : 'confirm'
          , message : sp('Does', this.ccolor(this.color), 'accept the double?')
          , default : null
        })
        return answers.accept
    }

    async promptOrigin(turn, origins, canUndo) {
        const points = Util.uniqueInts(origins).map(origin => turn.board.originPoint(turn.color, origin))
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
        const question = {
            name     : 'origin'
          , type     : 'input'
          , message
          , validate : value => (choices.indexOf(value) > -1) || 'Please enter one of ' + choices.join()
        }
        if (points.length == 1) {
            question.default = choices[0]
        }
        const answers = await this.prompt(question)
        if (answers.origin == 'u') {
            return 'undo'
        } else if (answers.origin == 'b') {
            return -1
        }
        return turn.board.pointOrigin(turn.color, +answers.origin)
    }

    async promptFace(faces) {
        faces = Util.uniqueInts(faces).sort(Util.sortNumericDesc)
        if (faces.length == 1) {
            return faces[0]
        }
        const answers = await this.prompt({
            name     : 'face'
          , type     : 'input'
          , message  : 'Die [' + faces.join() + ']'
          , validate : value => (faces.indexOf(+value) > -1) || 'Please enter one of ' + faces.join()
          , default  : '' + faces[0]
        })
        return +answers.face
    }

    async promptFinish() {
        const choices = ['f', 'u']
        const answers = await this.prompt({
            name     : 'finish'
          , message  : '(f)inish or (u)ndo'
          , default  : () => 'f'
          , type     : 'input'
          , validate : value => choices.indexOf(value.toLowerCase()) > -1 || sp('Please enter one of', choices.join())
        })
        return answers.finish.toLowerCase() == 'f'
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }
}

class TermRobot extends TermPlayer {

    constructor(robot, opts) {
        super(robot.color)
        this.opts = merge({delay: 0.5}, opts)
        this.isRobot = true
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

    async promptFace(faces) {
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

    async destroy() {
        await Promise.all([this.robot.destroy(), super.destroy()])
    }

    meta() {
        return merge(super.meta(), this.robot.meta())
    }
}

TermPlayer.Robot = TermRobot

module.exports = TermPlayer