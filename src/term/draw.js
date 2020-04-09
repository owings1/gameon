const {Red, White} = require('../lib/core')

const chalk  = require('chalk')
const Util   = require('../lib/util')
const sp     = Util.joinSpace

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

class Draw {

    static drawBoard(game, match) {

        const {board, cubeOwner, cubeValue} = game
        const {isCrawford} = game.opts

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
                    cubeStr = (Chars.sep + ' ' + (isCrawford ? 'CR' : cubeValue)).padEnd(4, ' ') + Chars.sep
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
            if (match && d == 1) {
                wr(' ' + match.scores.Red + '/' + match.total + 'pts')
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
            if (match && d == 1) {
                wr(' ' + match.scores.White + '/' + match.total + 'pts')
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
}

module.exports = Draw