/**
 * gameon - StringBuilder class
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

/**
 * String builder.
 */
export default class StringBuilder {

    constructor(...args) {
        this.arr = []
        this.add(...args)
    }

    add(...args) {
        for (let i = 0, ilen = args.length; i < ilen; ++i) {
            let arg = args[i]
            if (arg instanceof StringBuilder) {
                this.arr.push(arg.toString())
            } else {
                this.arr.push(arg)
            }
        }
        return this
    }

    sp(...args) {
        return this.add(args.join(' '))
    }

    replace(...args) {
        const b = new StringBuilder(...args)
        this.arr = b.arr
        return this
    }

    length() {
        return this.toString().length
    }

    join(sep) {
        return this.arr.join(sep)
    }

    toString() {
        return this.arr.join('')
    }
}
