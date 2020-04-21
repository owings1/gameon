const {Red, White, Opponent} = require('../lib/core')

const chalk  = require('chalk')
const Util   = require('../lib/util')
const sa     = Util.stripAnsi
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
const RightFixed = 10

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
    var cubeStr = ''
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

function sideLog(logs, n) {
    return logs[n] || ''
}

function borderTop() {
    return Chars.topLeft.padEnd(12 * PadFixed + 2 + 4, Chars.dash) + Chars.topRight
}

function borderBottom() {
    return Chars.botLeft.padEnd(12 * PadFixed + 2 + 4, Chars.dash) + Chars.botRight
}

class Draw {

    static drawBoard(game, match, persp, logs) {

        const logsRev = (logs || []).slice(0).reverse()
        persp = persp || White
        const opersp = Opponent[persp]

        const {board, cubeOwner, cubeValue} = game
        const pipCounts = board.analyzer.pipCounts()
        const {isCrawford} = game.opts

        const builder = []
        const wr = (...args) => {
            builder.push(sp(...args))
        }

        var li = 18

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
        wr(borderTop())
        wr(''.padEnd(RightFixed, ' '))
        wr(sideLog(logsRev, li--))
        wr('\n')

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
            var pad = RightFixed
            // Top home
            if (d == 0) {
                var homeStr = home(board.homes[opersp])
                pad = RightFixed - sa(homeStr).length
                wr(homeStr)
            }
            // pip count
            else if (d == 1) {
                var pipStr = pipCount(pipCounts[opersp])
                pad = RightFixed - sa(pipStr).length
                wr(pipStr)
            }
            // score
            else if (match && d == 2) {
                var scoreStr = ' ' + match.scores[opersp] + '/' + match.total + 'pts'
                pad = RightFixed - sa(scoreStr).length
                wr(scoreStr)
            }
            // cube part
            else if (cubeValue && cubeOwner == opersp) {
                var cubeStr = ' ' + cubePart(d - 3, cubeValue, isCrawford)
                pad = RightFixed - sa(cubeStr).length
                wr(cubeStr)
            }
            wr(''.padEnd(pad, ' '))
            wr(sideLog(logsRev, li--))
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
        wr(''.padEnd(RightFixed, ' '))
        wr(sideLog(logsRev, li--))
        wr('\n')

        wr(barRow(board.bars[persp]))
        var pad = RightFixed
        if (cubeValue && !cubeOwner) {
            var cubeStr = ' ' + cubePart(0, cubeValue, isCrawford)
            pad = RightFixed - sa(cubeStr).length
            wr(cubeStr)
        }
        wr(''.padEnd(pad, ' '))
        wr(sideLog(logsRev, li--))
        wr('\n')

        // between bars blank row
        wr(Chars.sep.padEnd(6 * PadFixed + 1, ' '))
        wr(chalk.grey('  ' + Chars.dblSep))
        wr(''.padEnd(6 * PadFixed + 1, ' ') + Chars.sep)
        var pad = RightFixed
        if (cubeValue && !cubeOwner) {
            var cubeStr = ' ' + cubePart(1, cubeValue, isCrawford)
            pad = RightFixed - sa(cubeStr).length
            wr(cubeStr)
        }
        wr(''.padEnd(pad, ' '))
        wr(sideLog(logsRev, li--))
        wr('\n')

        wr(barRow(board.bars[opersp]))
        var pad = RightFixed
        if (cubeValue && !cubeOwner) {
            var cubeStr = ' ' + cubePart(2, cubeValue, isCrawford)
            pad = RightFixed - sa(cubeStr).length
            wr(cubeStr)
        }
        wr(''.padEnd(pad, ' '))
        wr(sideLog(logsRev, li--))
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
        wr(' ' + Chars.sep)
        wr(''.padEnd(RightFixed, ' '))
        wr(sideLog(logsRev, li--))
        wr('\n')

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
            var pad = RightFixed
            // Bottom home
            if (d == 0) {
                var homeStr = home(board.homes[persp])
                pad = RightFixed - sa(homeStr).length
                wr(homeStr)
            }
            // pip count
            else if (d == 1) {
                var pipStr = pipCount(pipCounts[persp])
                pad = RightFixed - sa(pipStr).length
                wr(pipStr)
            }
            // score
            else if (match && d == 2) {
                var scoreStr = ' ' + match.scores[persp] + '/' + match.total + 'pts'
                pad = RightFixed - sa(scoreStr).length
                wr(scoreStr)
            }
            // cube part
            else if (cubeValue && cubeOwner == persp) {
                var cubeStr = ' ' + cubePart(5 - d, cubeValue, isCrawford)
                pad = RightFixed - sa(cubeStr).length
                wr(cubeStr)
            }
            wr(''.padEnd(pad, ' '))
            wr(sideLog(logsRev, li--))
            wr('\n')
        }

        wr(borderBottom())
        wr(''.padEnd(RightFixed, ' '))
        wr(sideLog(logsRev, li--))
        wr('\n')

        // Bottom numbers
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