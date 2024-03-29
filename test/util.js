/**
 * gameon - test util
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
// import {expect} from 'chai'
import tmp from 'tmp'
import fs from 'fs'
import * as Util from '../src/lib/util.js'
import {randomElement} from '../src/lib/util.js'
// import {stripAnsi} from '@quale/core/strings'
// import {update} from '@quale/core/objects'
// const Util    = require('../src/lib/util')

import {Board} from '../src/lib/core.js'
import {ConfidenceRobot} from '../src/robot/player.js'
// const Robot   = require('../src/robot/player')

import States from './states.js'

import {httpFixture, getUrlParams, parseCookies} from './util/http-util.js'

// import {NullOutput, ReadlineStub} from './util/io.js'


import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const Rolls = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'rolls.json'))
)

class GetErrorError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

export function getError(cb) {
    let ret
    try {
        ret = cb()
    } catch (err) {
        return err
    }
    if (ret instanceof Promise) {
        return new Promise((resolve, reject) => {
            ret.then(res => {
                console.log(res)
                reject(new GetErrorError('No error returned'))
            }).catch(resolve)
        })
    } else {
        console.log(ret)
        throw new GetErrorError('No error returned')
    }
}

export function makeRandomMoves(turn, isFinish) {
    while (true) {
        const moves = turn.getNextAvailableMoves()
        if (moves.length === 0) {
            break
        }
        const move = randomElement(moves)
        turn.move(move.origin, move.face)
    }
    if (isFinish) {
        turn.finish()
    }
    return turn
}

export function parseKey(params) {
    return params.Message.Body.Text.Data.match(/^Key: (.*)$/)[1]
}

export function tmpDir() {
    return tmp.dirSync().name
}

export function tmpFile() {
    return tmp.fileSync().name
}

export function fetchBoard(name) {
    return Board.fromStateString(States[name])
}

export function newRando(...args) {
    return ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
}

export function noop() {}

const TestUtil = {
    // methods
    // ger: getError,
    // getError,
    // makeRandomMoves,
    // fetchBoard,
    // newRando   : (...args) => Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args),
    // noop       : () => {},
    normState  : str => Board.fromStateString(str).stateString(),
    // parseKey,
    // tmpDir,
    // tmpFile    : () => tmp.fileSync().name,
    // transforms
    // States28: Object.fromEntries(Object.entries(States).map(([key, value]) =>
    //     [key, Board.fromStateString(value).state28()]
    // )),
    // passthru requires
    // clientServer : require('./util/client-server'),
    // MockPrompter : require('./util/mock-prompter'),
    Rolls,
    // expect,
    getUrlParams,
    // httpFixture,
    // parseCookies,
    // ReadlineStub,
    // NullOutput,
    // States,
    // Util methods
    // extend,
    // destroyAll        : Util.destroyAll,
    mapValues         : Util.mapValues,
    // randomElement     : Util.randomElement,
    // stripAnsi,
    stripLeadingSlash : Util.stripLeadingSlash,
    // update,
}

// export default TestUtil