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

const {EventEmitter} = require('events')

const {Chars, DefaultTermEnabled} = Constants
const {nchars, update} = Util

const DefaultTerm = new TermHelper(DefaultTermEnabled)

class TermBox {

    static defaults() {
        return {
            top         : 1
          , left        : 1
          , minWidth    : 0
          , maxWidth    : 1024
          , minHeight   : 0
          , maxHeight   : 512
          , pad         : 0
          , vcenter     : false
          , hcenter     : false
          , term        : DefaultTerm
          , isBorder    : false
          , borderStyle : 'solid'
          , format : {
                border : str => str
              , pad    : str => str
              , erase  : str => str
            }
        }
    }

    constructor(opts) {
        const defaults = TermBox.defaults()
        this.opts = Util.defaults(defaults, opts)
        this.opts.format = Util.defaults(defaults.format, this.opts.format)
        this.status = new BoxStatus
        this.status.on('render', () => this.drawBorder())
    }

    get term() {
        return this.opts.term
    }

    set term(term) {
        this.opts.term = term
    }

    get params() {

        const {term, opts} = this
        const {isBorder, pad} = opts
        const pad2 = pad * 2
        const b2 = +isBorder * 2

        let {top, left} = opts

        if (opts.vcenter) {
            const heightSurplus = term.height - opts.maxHeight
            top = Math.max(0, Math.floor(heightSurplus / 2)) + 1
        }

        if (opts.hcenter) {
            const widthSurplus = term.width - opts.maxWidth
            left = Math.max(0, Math.floor(widthSurplus / 2)) + 1
        }

        top  += isBorder + pad
        left += isBorder + pad

        const termHeightAdj = term.height - b2 - pad2 - (top - 1)
        const termWidthAdj = term.width - b2 - pad2 - (left - 1)

        const minHeight = Math.min(termHeightAdj, opts.minHeight)
        const maxHeight = Math.min(termHeightAdj, opts.maxHeight)

        const minWidth  = Math.min(termWidthAdj, opts.minWidth)
        const maxWidth  = Math.min(termWidthAdj, opts.maxWidth)

        return {top, left, minWidth, maxWidth, minHeight, maxHeight}
    }

    erase() {

        const {pad, isBorder} = this.opts
        const pad2 = pad * 2
        const b2 = +isBorder * 2

        const {left, top, minWidth, minHeight} = this.params
        const width = Math.max(this.status.width, minWidth)
        const height = Math.max(this.status.height, minHeight)

        const outerLeft = left - isBorder - pad
        const outerTop = top - isBorder - pad
        const outerWidth = width + b2 + pad2
        const outerHeight = height + b2 + pad2

        const {format} = this.opts
        const line = format.erase(nchars(outerWidth, ' '))

        this.term.writeArea(outerLeft, outerTop, 1, outerHeight, line)
        this.term.moveTo(left, top)
        this.status.reset()
    }

    drawBorder() {

        const {term} = this
        const {pad, isBorder} = this.opts
        const pad2 = pad * 2
        //??const b2 = +isBorder * 2

        const {left, top, minWidth, minHeight} = this.params
        const width = Math.max(this.status.width, minWidth)
        const height = Math.max(this.status.height, minHeight)

        const outerLeft = left - isBorder - pad
        const outerTop = top - isBorder - pad
        const outerHeight = height + isBorder + pad2

        const borders = this.getBorders(width)
        const pads = this.getPadStrings(width)

        if (isBorder) {
            term.moveTo(outerLeft, outerTop).write(borders.top)
        }
        for (let i = 0; i < outerHeight; ++i) {
            term.moveTo(outerLeft, outerTop + i + isBorder)
            if (isBorder) {
                term.write(borders.side)
            }
            let isFullPad = pad && (i < pad || outerHeight - i - 1 <= pad)
            if (pad) {
                if (isFullPad) {
                    term.write(pads.full)
                } else {
                    term.write(pads.side).right(width)
                }
            } else {
                term.right(width)
            }
            if (pad && !isFullPad) {
                term.write(pads.side)
            }
            if (isBorder) {
                term.write(borders.side)
            }
        }
        if (isBorder) {
            term.moveTo(outerLeft, outerTop + outerHeight).write(borders.foot)
        }
        term.moveTo(left, top)
    }

    getBorders(width) {
        const pad2 = this.opts.pad * 2
        const {format, borderStyle} = this.opts
        const chars = this.getBorderChars(borderStyle)
        const dashes = nchars(width + pad2, chars.dash)
        return {
            top  : format.border(chars.top.left + dashes + chars.top.right)
          , foot : format.border(chars.foot.left + dashes + chars.foot.right)
          , side : format.border(chars.pipe)
        }
    }

    getPadStrings(width) {
        const {pad} = this.opts
        const pad2 = pad * 2
        const {format} = this.opts
        return {
            full : format.pad(nchars(width + pad2, ' '))
          , side : format.pad(nchars(pad, ' '))
        }
    }

    getBorderChars(style) {
        const chars = {
            top  : {...Chars.table.top}
          , foot : {...Chars.table.foot}
          , pipe : Chars.table.pipe
          , dash : Chars.table.dash
        }
        const dot = Chars.table.dot

        switch (style) {

            case 'dashed':
                update(chars, {dash : ' -', pipe : Chars.table.vdash})
                break

            case 'dotted':
                update(chars.top, {left: dot, right: dot})
                update(chars.foot, {left: dot, right: dot})
                update(chars, {pipe: dot, dash:' ' + dot})
                break

            case 'solid':
            default:
                break
        }

        return chars
    }
}

/**
 * Box status tracker helper class
 */
class BoxStatus extends EventEmitter {

    constructor(defaults) {

        super()

        this._defaults = defaults

        this.reset()

        this.on('render', ({indent, width, height}) => {
            this.thisHeight = Math.max(this.thisHeight, height)
            this.maxHeight = Math.max(this.height, this.maxHeight)
            if (!width) {
                return
            }
            if (!this.width) {
                this.left = indent + 1
            }
            this.right = Math.max(this.right, indent + width + 1)
        })

        this.on('line', ({indent, width}) => {
            this.lineHeight += 1
            this.maxHeight = Math.max(this.height, this.maxHeight)
            if (!width) {
                return
            }
            if (!this.width) {
                this.left = indent + 1
            }
            this.right = Math.max(this.right, indent + width + 1)
        })

        this.on('answered', ({height}) => {
            if (!height) {
                return
            }
            this.lastHeight = this.thisHeight + this.lineHeight
            this.lineHeight += height
            this.thisHeight = 0
            this.maxHeight = Math.max(this.height, this.maxHeight)
        })
    }

    reset() {
        update(this, this.defaults)
        update(this, {
            right      : this.left
          , maxHeight  : 0
          , thisHeight : 0
          , lastHeight : 0
          , lineHeight : 0
        })
        return this
    }

    get defaults() {
        return Util.defaults({top: 1, left: 1}, this._defaults)
    }

    get info() {
        return Object.fromEntries(
            [
                'left'
              , 'right'
              , 'bottom'
              , 'top'
              , 'height'
              , 'maxHeight'
              , 'thisHeight'
              , 'lastHeight'
              , 'lineHeight'
            ].map(key =>
                [key, this[key]]
            )
        )
    }

    get width() {
        return this.right - this.left
    }

    get height() {
        return Math.max(this.thisHeight + this.lineHeight, this.lastHeight, this.maxHeight)
    }

    get bottom() {
        return this.top + this.height
    }
}

module.exports = update(TermBox, {BoxStatus})