/**
 * gameon - Menu screen status tracker helper class
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

class ScreenStatus extends EventEmitter {

    constructor(defaults) {

        super()

        this._defaults = defaults

        this.reset()

        this.on('beforeFirstRender', () => {
            this.trackBottom += this.thisHeight
            this.thisHeight = 0
        })

        this.on('render', ({indent, width, height}) => {
            if (!width) {
                return
            }
            if (!this.width) {
                this.left = indent + 1
            }
            this.right = Math.max(this.right, indent + width + 1)
            this.thisHeight = Math.max(this.thisHeight, height)
        })

        this.on('line', ({indent, width}) => {
            if (!width) {
                return
            }
            if (!this.width) {
                this.left = indent + 1
            }
            this.right = Math.max(this.right, indent + width + 1)
            this.thisHeight += 1
        })
    }

    reset() {
        update(this, this.defaults)
        this.trackBottom = this.top
        this.right = this.left
        return this
    }

    get defaults() {
        return defaults({
            thisHeight  : 0
          , top         : 1
          , left        : 1
        }, this._defaults)
    }

    get width() {
        return this.right - this.left
    }

    get height() {
        return this.bottom - this.top
    }

    get bottom() {
        return this.trackBottom + this.thisHeight
    }
}

module.exports = ScreenStatus