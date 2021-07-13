/**
 * gameon - Terminal box helper class
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
const Util = require('../../lib/util')

const BoxStatus = require('./box.status')

class TermBox {

    static defaults() {
        return {
            top       : 1
          , left      : 1
          , minWidth  : 0
          , maxWidth  : 1024
          , minHeight : 0
          , maxHeight : 512
          , vcenter   : false
          , hcenter   : false
        }
    }

    constructor(term, opts) {
        this.opts = Util.defaults(TermBox.defaults(), opts)
        this.term = term
        this.status = new BoxStatus
    }

    getParams() {
        const {term} = this
        
        let {left, top} = this.opts

        if (this.opts.hcenter) {
            const widthSurplus = term.width - this.opts.maxWidth
            left = Math.max(0, Math.floor(widthSurplus / 2)) + 1
        }

        if (this.opts.vcenter) {
            const heightSurplus = term.height - this.opts.maxHeight
            top = Math.max(0, Math.floor(heightSurplus / 2)) + 1
        }

        const maxWidth  = Math.min(term.width - (left - 1), this.opts.maxWidth)
        const maxHeight = Math.min(term.height - (top - 1), this.opts.maxHeight)
        const minWidth  = Math.min(term.width - (left - 1), this.opts.minWidth)
        const minHeight = Math.min(term.height - (top - 1), this.opts.minHeight)

        return {top, left, minWidth, maxWidth, minHeight, maxHeight}
    }

    erase(getLine) {
        let {left, top, minWidth, maxWidth, minHeight, maxHeight} = this.getParams()
        let {width, height} = this.status
        width  = Math.max(width, minWidth)
        height = Math.max(height, minHeight)
        const line = getLine(width)
        this.term.writeArea(left, top, 1, height, line)
        this.status.reset()
    }

    fillHeightMaxWidth(height, getLine) {
        let {left, top, maxHeight, maxWidth} = this.getParams()
        height = Math.min(height, maxHeight)
        this.term.writeArea(left, top, 1, height, getLine(maxWidth))
    }

    fillHeightMinWidth(height, getLine) {
        let {left, top, maxHeight, minWidth} = this.getParams()
        height = Math.min(height, maxHeight)
        this.term.writeArea(left, top, 1, height, getLine(minWidth))
    }
}

module.exports = TermBox