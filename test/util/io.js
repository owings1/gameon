/**
 * gameon - I/O test util
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
import {stripAnsi} from '@quale/core/strings.js'
import stream from 'stream'
import {EventEmitter} from 'events'

export class NullOutput extends stream.Writable {

    constructor(opts = {}) {
        super()
        this.raw = ''
        this.opts = {...opts}
    }

    write(chunk) {
        this.raw += chunk
        if (this.debug) {
            process.stderr.write(chunk)
        }
    }

    get debug() {
        return Boolean(this.opts.debug)
    }

    set debug(v) {
        this.opts.debug = Boolean(v)
    }

    get lines() {
        return this.raw.split('\n')
    }

    get plain() { return stripAnsi(this.raw) }

    end() {}

    mute() {}

    unmute() {}
}

class NullInput extends EventEmitter {

    constructor(...args) {
        super(...args)
    }

    write() {
        return this
    }

    moveCursor() {
        return this
    }

    setPrompt() {
        return this
    }

    close() {
        return this
    }

    pause () {
        return this
    }

    resume() {
        return this
    }
}

export class ReadlineStub extends EventEmitter {

    constructor(opts = {}) {
        super()
        this.line = ''
        this.input = new NullInput
        this.output = new NullOutput(opts)
        this.input.on('keypress', value => {
           if (value) {
               this.line += value
           }
        })
    }

    write(chunk) {
        this.output.write(chunk)
        return this
    }

    moveCursor() {
        return this
    }

    setPrompt() {
        return this
    }

    close() {
        return this
    }

    pause () {
        return this
    }

    resume() {
        return this
    }

    _getCursorPos () {
        return {cols: 0, rows: 0}
    }    
}
