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
const Constants    = require('../../lib/constants')
const {TermHelper} = require('../draw')
const Util         = require('../../lib/util')

const {Chars, DefaultTermEnabled} = Constants
const {nchars} = Util

const BoxStatus = require('./box.status')

const DefaultTerm = new TermHelper(DefaultTermEnabled)

class TermBox {

    static defaults() {
        return {
            top       : 1
          , left      : 1
          , minWidth  : 0
          , maxWidth  : 1024
          , minHeight : 0
          , maxHeight : 512
          , pad       : 0
          , vcenter   : false
          , hcenter   : false
          , term      : DefaultTerm
          , isBorder  : false
          , borderFormat : chr => chr
          , padFormat    : chr => chr
        }
    }

    constructor(opts) {
        this.opts = Util.defaults(TermBox.defaults(), opts)
        this.status = new BoxStatus
        this.status.on('render', () => this.drawBorder())
    }

    get term() {
        return this.opts.term
    }

    set term(term) {
        this.opts.term = term
    }

    getParams() {

        const {term} = this
        
        let {left, top, isBorder, pad} = this.opts

        let bw = +isBorder * 2
        let bh = +isBorder * 2
        let p = pad * 2

        if (this.opts.hcenter) {
            const widthSurplus = term.width - this.opts.maxWidth - bw - pad
            left = Math.max(0, Math.floor(widthSurplus / 2)) + 1
            bw = 0
        }

        left += isBorder
        top += isBorder

        if (this.opts.vcenter) {
            const heightSurplus = term.height - this.opts.maxHeight - bh - pad
            top = Math.max(0, Math.floor(heightSurplus / 2)) + 1
            bh = 0
        }

        const maxWidth  = Math.min(term.width - bw - p - (left - 1), this.opts.maxWidth)
        const maxHeight = Math.min(term.height - bh - p - (top - 1), this.opts.maxHeight)
        const minWidth  = Math.min(term.width - bw - p -(left - 1), this.opts.minWidth)
        const minHeight = Math.min(term.height - bh - p -(top - 1), this.opts.minHeight)

        return {top, left, minWidth, maxWidth, minHeight, maxHeight}
    }

    erase(getLine) {
        const {left, top, minWidth, maxWidth, minHeight, maxHeight} = this.getParams()
        let {width, height} = this.status
        const {isBorder, pad} = this.opts
        const bw = +isBorder * 2
        const bh = +isBorder * 2
        const p = pad * 2
        width  = Math.max(width, minWidth) + bw + p
        height = Math.max(height, minHeight) + bh + p
        const line = getLine(width)
        this.term.writeArea(left - isBorder - pad, top - isBorder - pad, 1, height, line)
        this.status.reset()
    }

    fillHeightMaxWidth(height, getLine) {
        const {left, top, maxHeight, maxWidth} = this.getParams()
        const {isBorder, pad} = this.opts
        const bw = +isBorder * 2
        const bh = +isBorder * 2
        const p = pad * 2
        height = Math.min(height, maxHeight) + bh + p
        this.term.writeArea(left - isBorder - pad, top - isBorder - pad, 1, height, getLine(maxWidth + bw + p))
    }

    fillHeightMinWidth(height, getLine) {
        const {left, top, maxHeight, minWidth} = this.getParams()
        const {isBorder, pad} = this.opts
        const bw = +isBorder * 2
        const bh = +isBorder * 2
        const p = pad * 2
        height = Math.min(height, maxHeight) + bh + p
        this.term.writeArea(left - isBorder - pad, top - isBorder - pad, 1, height, getLine(minWidth + bw + p))
    }

    drawBorder() {
        if (!this.opts.isBorder) {
            return
        }
        const {term} = this
        const {pad} = this.opts
        const chars = Chars.table
        const fmt = this.opts.borderFormat
        const pfmt = this.opts.padFormat
        let {left, top, minWidth, minHeight} = this.getParams()
        let {width, height} = this.status
        const p = pad * 2
        left -= 1
        top -= 1
        left -= pad
        top -= pad
        width = Math.max(width, minWidth)
        height = Math.max(height, minHeight) + 1 + p
        const borders = {
            top: fmt(chars.top.left + nchars(width + p, chars.dash) + chars.top.right)
          , bottom: fmt(chars.foot.left + nchars(width + p, chars.dash) + chars.foot.right)
          , pipe: fmt(chars.pipe)
        }
        term.moveTo(left, top).write(borders.top)
        for (var i = 0; i < height; ++i) {
            term.moveTo(left, top + i + 1).write(borders.pipe)
            let isFullPad = pad && (i < pad || height - i - 1 <= pad)
            if (pad) {
                if (isFullPad) {
                    term.write(pfmt(nchars(width + p, ' ')))
                } else {
                    term.write(pfmt(nchars(pad, ' '))).right(width)
                }
            } else {
                term.right(width)
            }
            if (pad && !isFullPad) {
                term.write(pfmt(nchars(pad, ' ')))
            }
            term.write(borders.pipe)
        }
        term.moveTo(left, top + height).write(borders.bottom)
        term.moveTo(left + 1 + pad, top + 1 + pad)
    }
}

module.exports = TermBox