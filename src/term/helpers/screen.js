const {
    types: {
        isBoolean,
        isWriteableStream,
    },
} = require('utils-h')

const isApple = process.env.TERM_PROGRAM === 'Apple_Terminal'

class Screen {

    constructor(opts) {
        if (isWriteableStream(opts)) {
            opts = {output: opts}
        } else if (isBoolean(opts)) {
            opts = {isAnsi: opts}
        }
        this.opts = {isAnsi: true, output: process.stdout, ...opts}
        this.str = {...ansi}
    }

    write(str) {
        this.output.write(str)
        return this
    }

    get isAnsi() {
        return Boolean(this.opts.isAnsi)
    }

    set isAnsi(value) {
        this.opts.isAnsi = Boolean(value)
    }

    get output() {
        return this.opts.output
    }

    set output(strm) {
        if (!isWriteableStream(strm)) {
            throw new TypeError(`Output is not a writeable stream`)
        }
        this.opts.output = strm
    }

    get height() {
        return this.output.rows ?? 64
    }

    get width() {
        return this.output.columns ?? 256
    }

    noCursor(cb) {
        let isAsync = false
        let ret
        try {
            this.hideCursor()
            ret = cb()
            isAsync = ret instanceof Promise
            if (isAsync) {
                return ret.finally(() => this.showCursor())
            }
        } finally {
            if (!isAsync) {
                this.showCursor()
            }
        }
    }
}
    
const ansi = {

    up: n => {
        n = safen(n)
        return n ? `\x1B[${n}A` : ''
    },

    down: n => {
        n = safen(n)
        return n ? `\x1B[${n}B` : ''
    },

    right: n => {
        n = safen(n)
        return n ? `\x1B[${n}C` : ''
    },

    left: n => {
        n = safen(n)
        return n ? `\x1B[${n}D` : ''
    },

    column: n => {
        n = safen(n)
        return n ? `\x1B[${n}G` : ''
    },

    clear: () => '\x1B[H\x1B[2J',

    erase: n => {
        n = safen(n)
        return n ? `\x1B[${n}X` : ''
    },

    eraseDisplayBelow: () => '\x1B[0J',

    eraseLine: () => '\x1B[2K',

    eraseLines: n => {
        n = safen(n)
        if (!n) {
            return ''
        }
        let str = ''
        for (let i = 0; i < n; ++i) {
            str += ansi.eraseLine()
            if (i < n - 1) {
                str += '\x1B[1A'
            }
        }
        str += '\x1B[G'
        return str
    },

    moveTo: (x, y) => {
        x = safen(x) || 1
        y = safen(y) || 1
        return `\x1B[${y};${x}H`
    },

    writeRows: (left, top, height, line) => {
        let str = ''
        for (let i = 0; i < height; ++i) {
            str += ansi.moveTo(left, top + i)
            str += line
        }
        return str
    },

    saveCursor: () => isApple ? '\x1B7' : '\x1B[s',

    restoreCursor: () => isApple ? '\x1B8' : '\x1B[u',

    hideCursor: () => '\x1B[?25l',

    showCursor: () => '\x1B[?25h',
}


const Ansi = {}

Object.entries(ansi).forEach(([method, func]) => {
    Screen.prototype[method] = function (...args) {
        if (this.isAnsi) {
            this.write(ansi[method](...args))
        }
        return this
    }
    Object.defineProperty(Ansi, method, {
        enumerable : true,
        writable   : false,
        writeable  : false,
        value      : func,
    })
})

module.exports = {Ansi, Screen}

function safen(n) {
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
        return n
    }
    return 0
}