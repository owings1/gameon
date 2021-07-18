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
const chai = require('chai')
const {expect} = chai

// See https://www.chaijs.com/guide/helpers/
chai.Assertion.addMethod('jsonEqual', function assertJsonEqual(b) {
    const exp = JSON.stringify(this._obj)
    const res = JSON.stringify(b)
    this.assert(
        exp == res
      , "expected #{act} to equal #{exp}"
      , "expected #{exp} to not equal #{act}"
      , res
      , exp
    )
})

function requireSrc(p) {
    return require('../src/' + p)
}

const Util = requireSrc('lib/util')
const Core = requireSrc('lib/core')

const fs = require('fs')
const globby = require('globby')
const path = require('path')
const stream = require('stream')
const tmp = require('tmp')
const {EventEmitter} = require('events')

const States = require('./states')
const Rolls = require('./rolls')

const {Board} = Core

const States28 = {}
for (var k in States) {
    States28[k] = Board.fromStateString(States[k]).state28()
}

function suites(dir, glob) {
    dir = dir || path.resolve(__dirname, 'suites')
    glob = dir + '/' + Util.stripLeadingSlash(glob || '*.test.js')
    return Object.fromEntries(
        globby.sync(glob)
            .sort((a, b) =>
                path.basename(a).toLowerCase().localeCompare(
                    path.basename(b).toLowerCase()
                )
            )
            .map(file => [
                file
              , path.basename(file)
                    .split('.').slice(0, -2)
                    .join('')
                    .split('-')
                    .map(Util.ucfirst)
                    .join('')
            ])
    )
}

//const Structures = {
//    Initial : [0, 0, 2, 0, 0, 0, 0, -5, 0, -3, 0, 0, 0, 5, -5, 0, 0, 0, 3, 0, 5, 0, 0, 0, 0, -2, 0, 0]
//}

function normState(str) {
    return Board.fromStateString(str).stateString()
}

function fetchBoard(name) {
    return Board.fromStateString(States[name])
}

function noop() {

}

function getError(cb) {
    let ret
    try {
        ret = cb()
    } catch (err) {
        return err
    }
    if (ret instanceof Promise) {
        return new Promise((resolve, reject) => {
            ret.then(() => {
                reject(new Error('No error returned'))
            }).catch(resolve)
        })
    } else {
        throw new Error('No error returned')
    }
}


//async function getErrorAsync(cb) {
//    try {
//        await cb()
//    } catch (err) {
//        return err
//    }
//}

function tmpFile() {
    return tmp.fileSync().name
}

function tmpDir() {
    return tmp.dirSync().name
}

function randomElement(arr) {
    const i = Math.floor(Math.random() * arr.length)
    return arr[i]
}

function makeRandomMoves(turn, isFinish) {
    while (true) {
        let moves = turn.getNextAvailableMoves()
        if (moves.length == 0) {
            break
        }
        let move = randomElement(moves)
        //console.log(move)
        turn.move(move.origin, move.face)
    }
    if (isFinish) {
        turn.finish()
    }
    return turn
}

// parse key from email
function parseKey(params) {
    return params.Message.Body.Text.Data.match(/^Key: (.*)$/)[1]
}

const {URLSearchParams} = require('url')

function getUrlParams(obj) {
    obj = obj || {}
    const params = new URLSearchParams
    for (let k in obj) {
        params.append(k, obj[k])
    }
    return params
}

// https://stackoverflow.com/questions/34815845/how-to-send-cookies-with-node-fetch
function parseCookies(response) {
    const raw = response.headers.raw()['set-cookie']
    return raw.map(entry => {
        const parts = entry.split(';')
        const cookiePart = parts[0]
        return cookiePart
    }).join(';')
}

class NullOutput extends stream.Writable {

    constructor(...args) {
        super(...args)
        this.raw = ''
    }

    _write(chunk, encoding, done) {
        this.raw += chunk
        done()
    }

    get lines() {
        return this.raw.split('\n')
    }
}

module.exports = {
    expect
  , fetchBoard
  , getError
  , getErrorAsync : getError
  , getUrlParams
  , makeRandomMoves
  , MockPrompter: require('./util/mock-prompter')
  , noop
  , normState
  , NullOutput
  , parseCookies
  , parseKey
  , randomElement
  , requireSrc
  , Rolls
  , States
  , States28
  //, Structures
  , suites
  , tmpDir
  , tmpFile
}