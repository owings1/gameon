/**
 * gameon - Timer class
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
import Counter from './counter.js'
import {IllegalStateError} from '../errors.js'

const TimerCounter = new Counter('TimerCounter')

export default class Timer {

    // For more resolution, see https://stackoverflow.com/a/18197438/794513

    constructor(name) {
        this.isTimer = true
        this.name = name || 'Timer' + TimerCounter.inc().value
        this.startTime = null
        this.isRunning = false
        this.elapsed = 0
        this.startCount = 0
        this.average = null
    }

    start() {
        if (this.isRunning) {
            throw new IllegalStateError('Timer already started')
        }
        this.startTime = +new Date
        this.isRunning = true
        this.startCount += 1
        return this
    }

    stop() {
        if (!this.isRunning) {
            throw new IllegalStateError('Timer not started')
        }
        this.elapsed += +new Date - this.startTime
        this.average = this.elapsed / this.startCount
        this.isRunning = false
        return this
    }

    reset() {
        this.elapsed = 0
        this.startCount = 0
        this.average = null
        return this
    }

    // for parallel api with counter
    getCount() {
        return this.startCount
    }
}

module.exports = Timer