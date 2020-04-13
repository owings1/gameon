const Base   = require('../lib/player')
const Core   = require('../lib/core')
const Draw   = require('./draw')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const inquirer = require('inquirer')
const merge    = require('merge')

const {White, Red} = Core
const sp           = Util.joinSpace

class TermPlayer extends Base {

    constructor(color) {
        super(color)
        this.logger = new Logger
        this.isTerm = true
        this.on('gameStart', (game, match, players) => {
            this.isDualTerm = this.opponent.isTerm
        })
        this.on('firstRoll', (turn, game, match) => {
            this.infoOnce(turn.color, 'wins the first roll with', turn.dice.join())
        })
        this.on('afterRoll', turn => {
            if (turn.color != this.color && !this.isDualTerm) {
                this.drawBoard()
            }
            this.infoOnce(turn.color, 'rolls', turn.diceSorted.join())
        })
        this.on('turnStart', turn => {
            this.infoOnce(turn.color + "'s turn")
        })
        this.on('turnEnd', turn => {
            if (turn.isCantMove) {
                this.infoOnce(turn.color, 'cannot move')
            }
            this.drawBoard(true)
            turn.moves.forEach(move => this.infoOnce(this.describeMove(move)))
        })
        this.on('doubleOffered', (turn, game) => {
            this.infoOnce(turn.color, 'wants to double the stakes to', game.cubeValue * 2, 'points')
        })
        this.on('doubleDeclined', turn => {
            this.infoOnce(turn.opponent, 'has declined the double')
        })
        this.on('doubleAccepted', (turn, game) => {
            this.infoOnce(turn.opponent, 'owns the cube at', game.cubeValue, 'points')
        })
        this.on('gameEnd', game => {
            this.infoOnce(game.winner, 'has won the game with', game.finalValue, 'points')
        })
        this.on('matchEnd', match => {
            const winner = match.getWinner()
            const loser = match.getLoser()
            this.infoOnce(winner, 'wins the match', match.scores[winner], 'to', match.scores[loser])
        })
    }

    // @override
    async turnOption(turn, game, match) {
        const isDouble = await this.promptTurnOption()
        if (isDouble) {
            turn.setDoubleOffered()
        }
    }

    // @override
    async decideDouble(turn, game, match) {
        const isAccept = await this.promptDecideDouble()
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
            this.drawBoard()
            this.info(this.color, 'rolled', turn.diceSorted.join(), 'with', turn.remainingFaces.join(), 'remaining')
            var moves = turn.getNextAvailableMoves()
            var origins = moves.map(move => move.origin)
            var canUndo = turn.moves.length > 0
            var origin = await this.promptOrigin(origins, canUndo)
            if (origin == 'undo') {
                turn.unmove()
                continue
            }
            var faces = moves.filter(move => move.origin == origin).map(move => move.face)
            var face = await this.promptFace(faces)
            var move = turn.move(origin, face)
            this.info(this.describeMove(move))
            if (turn.getNextAvailableMoves().length == 0) {
                this.drawBoard()
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

    describeMove(move) {
        const origin = move.isComeIn ? 'bar' : move.origin + 1
        const dest = move.isBearoff ? 'home' : move.dest + 1
        return sp(move.color, 'moves from', origin, 'to', dest)
    }

    drawBoard(isOnce) {

        if (isOnce && this.isDualTerm && this.color == Red) {
            return
        }

        this.writeStdout(Draw.drawBoard(this.thisGame, this.thisMatch))
    }

    getStdout() {
        return this.stdout || process.stdout
    }

    writeStdout(str) {
        this.getStdout().write(str)
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
          , message : sp('Does', this.color, 'accept the double?')
        })
        return answers.accept
    }

    async promptOrigin(origins, canUndo) {
        origins = Util.uniqueInts(origins).sort(Util.sortNumericAsc).map(i => i > -1 ? i + 1 : i)
        const choices = origins.map(i => '' + i)
        var message = 'Origin '
        if (origins[0] == -1) {
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
        if (origins.length == 1) {
            question.default = '' + choices[0]
        }
        const answers = await this.prompt(question)
        if (answers.origin == 'u') {
            return 'undo'
        } else if (answers.origin == 'b') {
            return -1
        }
        return +answers.origin - 1
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

    async promptTurnOption() {
        return false
    }

    async promptDecideDouble() {
        return true
    }

    async promptOrigin(origins) {
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

    meta() {
        return this.robot.meta()
    }
}

TermPlayer.Robot = TermRobot

module.exports = TermPlayer