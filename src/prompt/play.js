const {Game, Opponent, Red, White} = require('../lib/game')
const Util = require('../lib/util')
const Logger = require('../lib/logger')

const chalk = require('chalk')
const inquirer = require('inquirer')
const sp = Util.joinSpace


const Shorts = {
    Red   : chalk.bold.red('R')
  , White : chalk.bold.white('W')
  , R     : chalk.bold.red('R')
  , W     : chalk.bold.white('W')
}

const Chars = {
    topLeft      : '\u250f'
  , topMid       : '\u2533'
  , topRight     : '\u2513'
  , midLeft      : ''  // TODO
  , sep          : '\u2503'
  , dblSep       : '\u2503\u2503'
  , midRight     : ''  // TODO
  , botLeft      : '\u2517'
  , botMiddle    : '\u253b'
  , botRight     : '\u251b'
  , dash         : '\u2501'
  , die          :  {
        1  : '\u2680'
      , 2  : '\u2681'
      , 3  : '\u2682'
      , 4  : '\u2683'
      , 5  : '\u2684'
      , 6  : '\u2685'
    }
}
class PromptPlayer extends Logger {

    constructor() {
        super()
    }

    static drawBoard(game) {

        const {board, cubeOwner, cubeValue, isCrawford} = game

        const topHalf = board.slots.slice(0, 12)
        const botHalf = board.slots.slice(12, 24)
        const p = 4
        const m = 1

        const builder = []
        const wr = (...args) => {
            builder.push(sp(...args))
        }

        const writeSlotRow = (slot, d) => {
            var c = slot[d] ? slot[d].c : ''
            var str = c.padStart(p, ' ')
            if (c == 'R') {
                str = chalk.bold.red(str)
            } else if (c == 'W') {
                str = chalk.bold.white(str)
            }
            wr(str)
        }

        const writeHome = color => {
            wr('  ')
            if (board.homes[color].length > 0) {
                wr(sp(Shorts[color], chalk.grey(board.homes[color].length)))
            }
        }

        const writeBarRow = color => {
            wr(Chars.sep.padEnd(6 * p + 1, ' '))
            if (board.bars[color].length > 0) {
                wr(sp(' ', Shorts[color], chalk.grey(board.bars[color].length)))
            } else {
                wr(chalk.grey('  ' + Chars.dblSep + ' '))
            }
            wr(''.padEnd(6 * p, ' ') + Chars.sep)
        }

        const writeCubePart = n => {
            var cubeStr
            switch (n) {
                case 0:
                    cubeStr = Chars.topLeft + ''.padEnd(3, Chars.dash) + Chars.topRight
                    break
                case 1:
                    cubeStr = (Chars.sep + ' ' + cubeValue).padEnd(4, ' ') + Chars.sep
                    break
                case 2:
                    cubeStr = Chars.botLeft + ''.padEnd(3, Chars.dash) + Chars.botRight
                    break
            }
            if (cubeStr) {
                if (isCrawford) {
                    cubeStr = chalk.grey(cubeStr)
                }
                wr(cubeStr)
            }
        }

        wr('\n')

        // Top numbers
        wr(' ')
        for (var i = 12; i >= 1; i--) {
            wr(i.toString().padStart(p, ' '))
            if (i == 7) {
                wr('    ')
            }
        }
        wr('\n')
        wr(Chars.topLeft.padEnd(12 * p + 2 + 4, Chars.dash) + Chars.topRight + '\n')

        // Top piece rows
        for (var d = 0; d < 6; d++) {
            wr(Chars.sep)
            for (var i = topHalf.length - 1; i >= 0; i--) {
                writeSlotRow(topHalf[i], d)
                if (i == 6) {
                    wr(chalk.grey('  ' + Chars.dblSep))
                }
            }
            wr(' ' + Chars.sep)
            // Top home
            if (d == 0) {
                writeHome(Red)
            }
            if (cubeValue && cubeOwner == Red) {
                wr(' ')
                writeCubePart(d - 2)
            }
            wr('\n')
        }

        // Top piece overflow numbers row
        wr(Chars.sep)
        for (var i = topHalf.length - 1; i >= 0; i--) {
            var slot = topHalf[i]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(p, ' ')))
            if (i == 6) {
                wr(chalk.grey('  ' + Chars.dblSep))
            }
        }
        wr(' ' + Chars.sep)
        wr('\n')

        writeBarRow(White)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            writeCubePart(0)
        }
        wr('\n')

        // between bars blank row
        wr(Chars.sep.padEnd(6 * p + 1, ' '))
        wr(chalk.grey('  ' + Chars.dblSep))
        wr(''.padEnd(6 * p + 1, ' ') + Chars.sep)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            writeCubePart(1)
        }
        wr('\n')

        writeBarRow(Red)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            writeCubePart(2)
        }
        wr('\n')

        // Bottom piece overflow numbers row
        wr(Chars.sep)
        for (var i = 0; i < botHalf.length; i++) {
            var slot = botHalf[i]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(p, ' ')))
            if (i == 5) {
                wr(chalk.grey('  ' + Chars.dblSep))
            }
        }
        wr(' ' + Chars.sep + '\n')

        // Bottom piece rows
        for (var d = 5; d >= 0; d--) {
            wr(Chars.sep)
            for (var i = 0; i < botHalf.length; i++) {
                writeSlotRow(botHalf[i], d)
                if (i == 5) {
                    wr(chalk.grey('  ' + Chars.dblSep))
                }
            }
            wr(' ' + Chars.sep)
            // Bottom home
            if (d == 0) {
                writeHome(White)
            }
            if (cubeValue && cubeOwner == White) {
                wr(' ')
                writeCubePart(5 - d - 1)
            }
            wr('\n')
        }

        // Bottom numbers
        wr(Chars.botLeft.padEnd(12 * p + 2 + 4, Chars.dash) + Chars.botRight + '\n')
        wr(' ')
        for (var i = 13; i < 25; i++) {
            wr(('' + i).padStart(p, ' '))
            if (i == 18) {
                wr('    ')
            }
        }
        wr('\n')

        wr('\n')

        return builder.join('')
    }

    drawBoard(...args) {
        return PromptPlayer.drawBoard(...args)
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    async playGame(game) {

        this.info('Starting game')
        const firstTurn = game.firstTurn()
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())
        await this.playRoll(firstTurn, game)

        while (true) {

            var turn = game.nextTurn()
            this.info(turn.color + "'s turn")

            var action = game.canDouble(turn.color) ? await this.promptAction() : 'roll'

            if (action == 'double') {
                this.info(turn.color, 'doubles')
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

            await this.playRoll(turn, game)

            if (game.checkFinished()) {
                break
            }
        }

        this.writeStdout(this.drawBoard(game))
        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async promptAction(turn) {
        const answers = await this.prompt({
            name    : 'action'
          , type    : 'rawlist'
          , choices : ['roll', 'double']
        })
        return answers.action
    }

    async playRoll(turn, game) {
        if (turn.isCantMove) {
            this.info(turn.color, 'rolls', turn.dice.join())
            this.info(turn.color, 'cannot move')
            return
        }
        const drawBoard = () => this.writeStdout(this.drawBoard(game))
        drawBoard()
        while (true) {
            this.info(turn.color, 'rolled', turn.dice.join(), 'with', turn.remainingFaces.join(), 'remaining')
            var moves = turn.getNextAvailableMoves()
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0)
            if (origin == 'undo') {
                turn.unmove()
                drawBoard()
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face))
            var move = turn.move(origin, face)
            this.info(this.describeMove(move))
            drawBoard()
            if (turn.getNextAvailableMoves().length == 0) {
                var finish = await this.promptFinishOrUndo()
                if (finish == 'undo') {
                    turn.unmove()
                    drawBoard()
                    continue
                } else {
                    turn.finish()
                    break
                }
            }
        }
    }

    describeMove(move) {
        const origin = move.isComeIn ? 'bar' : move.origin + 1
        const dest = move.isBearoff ? 'home' : move.dest + 1
        return sp(move.color, 'moves from', origin, 'to', dest)
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

    async promptFinishOrUndo() {
        const answers = await this.prompt({
            name    : 'finish'
          , type    : 'rawlist'
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

    static doMainIfEquals(lhs, rhs) {
        if (lhs === rhs) {
            PromptPlayer.main(new PromptPlayer)
        }
    }
}

PromptPlayer.main = function(player) {
    player.playGame(new Game)
    return player
}

PromptPlayer.doMainIfEquals(require.main, module)

module.exports = PromptPlayer