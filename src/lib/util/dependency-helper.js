/**
 * gameon - DependencyHelper class
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
import {
    CircularDependencyError,
    DependencyError,
    MissingDependencyError,
    UnresolvedDependencyError,
} from '../errors.js'

export default class DependencyHelper {

    constructor(roots) {
        this.resolved = {}
        this.unresolved = {}
        this.added = {}
        this.order = []
        if (roots) {
            roots.forEach(name => this.resolved[name] = true)
        }
    }

    add(name, dependencies) {

        if (this.added[name]) {
            throw new DependencyError(`Duplicate name: ${name}`)
        }
        this.added[name] = true

        this.unresolved[name] = {}

        if (dependencies) {
            dependencies.forEach(dependency => {
                if (!this.resolved[dependency]) {
                    if (this.unresolved[dependency] && this.unresolved[dependency][name]) {
                        throw new CircularDependencyError(`Circular dependecy: ${name} <-> ${dependency}`)
                    }
                    this.unresolved[name][dependency] = true
                }
            })
        }

        if (!Object.keys(this.unresolved[name]).length) {
            if (!this.resolved[name]) {
                this.resolved[name] = true
                this.order.push(name)
            }
            delete this.unresolved[name]
        }
    }

    resolve() {

        const missing = {}

        for (const name in this.unresolved) {
            for (const dependency in this.unresolved[name]) {
                if (!this.added[dependency]) {
                    missing[dependency] = true
                }
            }
        }
        if (Object.keys(missing).length) {
            throw new MissingDependencyError(`Missing dependencies: ${Object.keys(missing).join(', ')}`)
        }

        let count = 0
        do {
            count = this._resolveLoop()
        } while (count > 0)

        const unresolvedNames = Object.keys(this.unresolved)
        if (unresolvedNames.length) {
            throw new UnresolvedDependencyError(`Unmet dependecies for: ${unresolvedNames.join(', ')}`)
        }

        return this.order
    }

    _resolveLoop() {

        let count = 0

        Object.keys(this.unresolved).forEach(name => {

            Object.keys(this.unresolved[name]).forEach(dependency => {
                if (this.resolved[dependency]) {
                    count += 1
                    delete this.unresolved[name][dependency]
                }
            })

            if (!Object.keys(this.unresolved[name]).length) {
                this.resolved[name] = true
                this.order.push(name)
                delete this.unresolved[name]
            }
        })

        return count
    }
}
