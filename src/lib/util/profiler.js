/**
 * gameon - Profiler class
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
const Counter = require('./counter')
const Timer   = require('./timer')

class Profiler {

    static getDefaultInstance() {
        return DefaultProfiler
    }

    static createEnabled() {
        return new Profiler
    }

    static createDisabled() {
        const profiler = new Profiler
        profiler.enabled = false
        return profiler
    }

    constructor() {
        this.timers = {}
        this.counters = {}
        this.enabled = true
    }

    start(name) {
        if (!this.enabled) {
            return
        }
        if (!this.timers[name]) {
            this.timers[name] = new Timer(name)
        }
        this.timers[name].start()
        return this
    }

    stop(name) {
        if (!this.enabled) {
            return
        }
        this.timers[name].stop()
        return this
    }

    reset(name) {
        if (!this.enabled) {
            return
        }
        this.timers[name].reset()
        return this
    }

    resetAll() {
        if (!this.enabled) {
            return
        }
        for (const name in this.timers) {
            this.reset(name)
        }
        for (const name in this.counters) {
            this.zero(name)
        }
        return this
    }

    inc(name, amount) {
        if (!this.enabled) {
            return
        }
        if (!this.counters[name]) {
            this.counters[name] = new Counter(name)
        }
        this.counters[name].inc(amount)
        return this
    }

    zero(name) {
        if (!this.enabled) {
            return
        }
        this.counters[name].zero()
        return this
    }
}

const DefaultProfiler = Profiler.createDisabled()

module.exports = Profiler