const {Red, White, Opponent} = require('../lib/core')

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

const PadFixed = 4
const MidFixed = 1

function slotRow(slot, d) {
    var c = slot[d] ? slot[d].c : ''
    var str = c.padStart(PadFixed, ' ')
    if (c == 'R') {
        str = chalk.bold.red(str)
    } else if (c == 'W') {
        str = chalk.bold.white(str)
    }
    return str
}

function barRow(bar) {
    var color = bar[0] && bar[0].color
    var str = Chars.sep.padEnd(6 * PadFixed + 1, ' ')
    if (color) {
        str += sp(' ', Shorts[color], chalk.grey(bar.length))
    } else {
        str += chalk.grey('  ' + Chars.dblSep + ' ')
    }
    str += ''.padEnd(6 * PadFixed, ' ') + Chars.sep
    return str
}

function home(h) {
    var str = '  '
    if (h.length) {
        var color = h[0].color
        str += sp(Shorts[color], chalk.grey(h.length))
    }
    return str
}

function cubePart(n, cubeValue, isCrawford) {
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
    if (cubeStr && isCrawford) {
        cubeStr = chalk.grey(cubeStr)
    }
    return cubeStr
}

function pipCount(count) {
    return ' ' + chalk.bold.grey(count) + ' ' + chalk.grey('PIP')
}

class Draw {

    static drawBoard(game, match, persp) {

        persp = persp || White
        const opersp = Opponent[persp]

        const {board, cubeOwner, cubeValue} = game
        const pipCounts = board.analyzer.pipCounts()
        const {isCrawford} = game.opts

        const builder = []
        const wr = (...args) => {
            builder.push(sp(...args))
        }

        wr('\n')

        // Top numbers
        wr(' ')
        for (var i = 13; i <= 24; i++) {
            wr(i.toString().padStart(PadFixed, ' '))
            if (i == 18) {
                wr('    ')
            }
        }
        wr('\n')
        wr(Chars.topLeft.padEnd(12 * PadFixed + 2 + 4, Chars.dash) + Chars.topRight + '\n')

        // Top piece rows
        for (var d = 0; d < 6; d++) {
            wr(Chars.sep)
            for (var p = 13; p <= 24; p++) {
                var slot = board.slots[board.pointOrigin(persp, p)]
                wr(slotRow(slot, d))
                if (p == 18) {
                    wr(chalk.grey('  ' + Chars.dblSep))
                }
            }
            wr(' ' + Chars.sep)
            // Top home
            if (d == 0) {
                wr(home(board.homes[opersp]))
            }
            if (d == 1) {
                wr(pipCount(pipCounts[opersp]))
            }
            if (match && d == 2) {
                wr(' ' + match.scores[opersp] + '/' + match.total + 'pts')
            }
            if (cubeValue && cubeOwner == opersp) {
                wr(' ')
                wr(cubePart(d - 3, cubeValue, isCrawford))
            }
            wr('\n')
        }

        // Top piece overflow numbers row
        wr(Chars.sep)
        for (var p = 13; p <= 24; p++) {
            var slot = board.slots[board.pointOrigin(persp, p)]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(PadFixed, ' ')))
            if (p == 18) {
                wr(chalk.grey('  ' + Chars.dblSep))
            }
        }
        wr(' ' + Chars.sep)
        wr('\n')

        wr(barRow(board.bars[persp]))
        if (cubeValue && !cubeOwner) {
            wr(' ')
            wr(cubePart(0, cubeValue, isCrawford))
        }
        wr('\n')

        // between bars blank row
        wr(Chars.sep.padEnd(6 * PadFixed + 1, ' '))
        wr(chalk.grey('  ' + Chars.dblSep))
        wr(''.padEnd(6 * PadFixed + 1, ' ') + Chars.sep)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            wr(cubePart(1, cubeValue, isCrawford))
        }
        wr('\n')

        wr(barRow(board.bars[opersp]))
        if (cubeValue && !cubeOwner) {
            wr(' ')
            wr(cubePart(2, cubeValue, isCrawford))
        }
        wr('\n')

        // Bottom piece overflow numbers row
        wr(Chars.sep)
        for (var p = 12; p >= 1; p--) {
            var slot = board.slots[board.pointOrigin(persp, p)]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(PadFixed, ' ')))
            if (p == 7) {
                wr(chalk.grey('  ' + Chars.dblSep))
            }
        }
        wr(' ' + Chars.sep + '\n')

        // Bottom piece rows
        for (var d = 5; d >= 0; d--) {
            wr(Chars.sep)
            for (var p = 12; p >= 1; p--) {
                var slot = board.slots[board.pointOrigin(persp, p)]
                wr(slotRow(slot, d))
                if (p == 7) {
                    wr(chalk.grey('  ' + Chars.dblSep))
                }
            }
            wr(' ' + Chars.sep)
            // Bottom home
            if (d == 0) {
                wr(home(board.homes[persp]))
            }
            if (d == 1) {
                wr(pipCount(pipCounts[persp]))
            }
            if (match && d == 2) {
                wr(' ' + match.scores[persp] + '/' + match.total + 'pts')
            }
            if (cubeValue && cubeOwner == persp) {
                wr(' ')
                wr(cubePart(5 - d - 2, cubeValue, isCrawford))
            }
            wr('\n')
        }

        // Bottom numbers
        wr(Chars.botLeft.padEnd(12 * PadFixed + 2 + 4, Chars.dash) + Chars.botRight + '\n')
        wr(' ')
        for (var i = 12; i >= 1; i--) {
            wr(('' + i).padStart(PadFixed, ' '))
            if (i == 7) {
                wr('    ')
            }
        }
        wr('\n')

        wr('\n')

        return builder.join('')
    }
}

module.exports = Draw