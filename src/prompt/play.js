const {Game, Opponent} = require('../lib/game')
const Util = require('../lib/util')
const Logger = require('../lib/logger')

const chalk = require('chalk')
const inquirer = require('inquirer')
const sp = Util.joinSpace

function wr(str) {
    process.stdout.write(str)
}

class PromptPlayer extends Logger {

    constructor() {
        super()
    }

    static drawBoard(board) {

        const topHalf = board.slots.slice(0, 12)
        const botHalf = board.slots.slice(12, 24)
        const p = 4
        const m = 1

        wr('\n')

        wr(' ')
        for (var i = 11; i >= 0; i--) {
            wr(('' + i).padStart(p, ' '))
            if (i == 6) {
                wr('    ')
            }
        }
        wr('\n')
        wr('+'.padEnd(12 * p + 2 + 4, '-') + '+\n')

        for (var d = 0; d < 6; d++) {
            wr('|')
            for (var i = topHalf.length - 1; i >= 0; i--) {
                var slot = topHalf[i]
                var c = slot[d] ? slot[d].c : ''
                var str = c.padStart(p, ' ')
                if (c == 'R') {
                    str = chalk.bold.red(str)
                } else if (c == 'W') {
                    str = chalk.bold.white(str)
                }
                wr(str)
                if (i == 6) {
                    wr(chalk.grey('  ||'))
                }
            }
            wr(' |')
            if (d == 0) {
                wr('  ')
                if (board.homes.Red.length > 0) {
                    wr(chalk.bold.red('R') + ' ' + chalk.grey(board.homes.Red.length))
                }
            }
            wr('\n')
        }


        wr('|')
        for (var i = topHalf.length - 1; i >= 0; i--) {
            var slot = topHalf[i]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(p, ' ')))
            if (i == 6) {
                wr(chalk.grey('  ||'))
            }
        }
        wr(' |\n')

        wr('|'.padEnd(6 * p + 1, ' '))
        if (board.bars.White.length > 0) {
            wr('  ' + chalk.bold.white('W ') + chalk.grey(board.bars.White.length))
        } else {
            wr(chalk.grey('  || '))
        }
        wr(''.padEnd(6 * p, ' ') + '|\n')

        for (var i = 0; i < m; i++) {
            wr('|'.padEnd(6 * p + 1, ' '))
            wr(chalk.grey('  ||'))
            wr(''.padEnd(6 * p + 1, ' ') + '|\n')
            //wr('|'.padEnd(12 * p + 2 + 4, ' ') + '|\n')
        }

        wr('|'.padEnd(6 * p + 1, ' '))
        if (board.bars.Red.length > 0) {
            wr('  ' + chalk.bold.red('R ') + chalk.grey(board.bars.Red.length))
        } else {
            wr(chalk.grey('  || '))
        }
        wr(''.padEnd(6 * p, ' ') + '|\n')

        wr('|')
        for (var i = 0; i < botHalf.length; i++) {
            var slot = botHalf[i]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(p, ' ')))
            if (i == 5) {
                wr(chalk.grey('  ||'))
            }
        }
        wr(' |\n')

        for (var d = 5; d >= 0; d--) {
            wr('|')
            for (var i = 0; i < botHalf.length; i++) {
                var slot = botHalf[i]
                var c = slot[d] ? slot[d].c : ''
                var str = c.padStart(p, ' ')
                if (c == 'R') {
                    str = chalk.bold.red(str)
                } else if (c == 'W') {
                    str = chalk.bold.white(str)
                }
                wr(str)
                if (i == 5) {
                    wr(chalk.grey('  ||'))
                }
            }
            wr(' |')
            if (d == 0) {
                wr('  ')
                if (board.homes.White.length > 0) {
                    wr(chalk.bold.white('W') + ' ' + chalk.grey(board.homes.White.length))
                }
            }
            wr('\n')
        }

        wr('+'.padEnd(12 * p + 2 + 4, '-') + '+\n')
        wr(' ')
        for (var i = 12; i < 24; i++) {
            wr(('' + i).padStart(p, ' '))
            if (i == 17) {
                wr('    ')
            }
        }
        wr('\n')

        wr('\n')
    }

    drawBoard(board) {
        PromptPlayer.drawBoard(board)
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    async playGame(game) {

        const firstTurn = game.firstTurn()
        await this.playRoll(firstTurn)

        while (true) {

            var turn = game.nextTurn()

            var action = game.canDouble(turn.color) ? await this.promptAction() : 'roll'

            if (action == 'double') {
                this.log(turn.color, 'doubles')
                turn.setDoubleOffered()
                var accept = await this.promptAcceptDouble(turn)
                if (accept) {
                    game.cubeValue *= 2
                    game.cubeOwner = Opponent[turn.color]
                    this.log(Opponent[turn.color], 'owns the cube at', game.cubeValue)
                } else {
                    turn.setDoubleDeclined()
                    game.checkFinished()
                    break
                }
            }

            turn.roll()

            await this.playRoll(turn)

            if (game.checkFinished()) {
                break
            }
        }

        this.drawBoard(game.board)
    }

    async promptAction(turn) {
        const answers = await this.prompt({
            name    : 'action'
          , type    : 'list'
          , choices : ['roll', 'double']
        })
        return answers.action
    }

    async playRoll(turn) {
        if (turn.isCantMove) {
            this.info(turn.color, 'rolls', turn.dice.join())
            this.info(turn.color, 'cannot move')
            return
        }
        this.drawBoard(turn.board)
        this.info(turn.color, 'rolls', turn.dice.join())
        while (true) {
            var moves = turn.getNextAvailableMoves()
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0)
            if (origin == 'undo') {
                turn.unmove()
                this.drawBoard(turn.board)
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face))
            var move = turn.move(origin, face)
            this.info(this.describeMove(move))
            this.drawBoard(turn.board)
            if (turn.getNextAvailableMoves().length == 0) {
                var finish = await this.promptFinishOrUndo()
                if (finish == 'undo') {
                    turn.unmove()
                    this.drawBoard(turn.board)
                    continue
                } else {
                    turn.finish()
                    break
                }
            }
        }
    }

    describeMove(move) {
        const origin = move.isComeIn ? 'bar' : move.origin
        const dest = move.isBearoff ? 'home' : move.dest
        return sp(move.color, 'moves from', origin, 'to', dest)
    }

    async promptOrigin(origins, canUndo) {
        origins = Util.uniqueInts(origins).sort(Util.sortNumericAsc)
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
        return +answers.origin
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

    async promptFinishOrUndo() {
        const answers = await this.prompt({
            name    : 'finish'
          , type    : 'list'
          , choices : ['finish', 'undo']
        })
        return answers.finish
    }

    async promptAcceptDouble(turn) {
        const answers = await this.prompt({
            name    : 'accept'
          , type    : 'confirm'
          , message : 'Does ' + Opponent[turn.color] + ' accept?'
        })
        return answers.accept
    }
}

if (require.main === module) {
    var player = new PromptPlayer
    player.playGame(new Game)
}

module.exports = PromptPlayer