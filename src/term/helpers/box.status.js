/**
 * gameon - Box status tracker helper class
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

const {defaults, update} = Util

const {EventEmitter} = require('events')

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
        return defaults({top: 1, left: 1}, this._defaults)
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

module.exports = BoxStatus