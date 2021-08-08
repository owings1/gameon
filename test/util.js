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
const chai     = require('chai')
const {expect} = chai
const tmp      = require('tmp')
const Util    = require('../src/lib/util')
const {strings: {endsWith}} = require('utils-h')
const {Assertion} = chai

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

Assertion.addMethod('erri', function (type) {
    const obj = this._obj
    // preconditon, whether positive or negative assertion
    new Assertion(obj).to.be.instanceof(Error)

    let name = type
    if (typeof name === 'function') {
        name = type.name
    } else if (name.length - name.lastIndexOf('Error') !== 'Error'.length) {
        // ends with
        name += 'Error'
    }
    const isprop = 'is' + name

    this.assert(
        obj.name === name || obj[isprop] === true,
        "expected #{this} to be a #{exp} but got #{act}",
        "expected #{this} to not be a #{act}",
        name,        // expected,
        obj.name,  // actual,
    )
})

const {Board} = require('../src/lib/core')
const Robot   = require('../src/robot/player')

const States = require('./states')

class GetErrorError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
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

function makeRandomMoves(turn, isFinish) {
    while (true) {
        const moves = turn.getNextAvailableMoves()
        if (moves.length == 0) {
            break
        }
        const move = Util.randomElement(moves)
        turn.move(move.origin, move.face)
    }
    if (isFinish) {
        turn.finish()
    }
    return turn
}

const {httpFixture, getUrlParams, parseCookies} = require('./util/http-util')

const {NullOutput, ReadlineStub} = require('./util/io')

const TestUtil = {
    // methods
    ger: getError,
    getError,
    makeRandomMoves,
    fetchBoard : name => Board.fromStateString(States[name]),
    newRando   : (...args) => Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args),
    noop       : () => {},
    normState  : str => Board.fromStateString(str).stateString(),
    parseKey   : params => params.Message.Body.Text.Data.match(/^Key: (.*)$/)[1],
    requireSrc : p => require('../src/' + p),
    tmpDir     : () => tmp.dirSync().name,
    tmpFile    : () => tmp.fileSync().name,
    // transforms
    States28: Object.fromEntries(Object.entries(States).map(([key, value]) =>
        [key, Board.fromStateString(value).state28()]
    )),
    // passthru requires
    clientServer : require('./util/client-server'),
    MockPrompter : require('./util/mock-prompter'),
    Rolls        : require('./rolls'),
    expect,
    getUrlParams,
    httpFixture,
    parseCookies,
    ReadlineStub,
    NullOutput,
    States,
    // Util methods
    append            : Util.append,
    destroyAll        : Util.destroyAll,
    keyValuesTrue     : Util.keyValuesTrue,
    mapValues         : Util.mapValues,
    randomElement     : Util.randomElement,
    stripAnsi         : Util.stripAnsi,
    stripLeadingSlash : Util.stripLeadingSlash,
    ucfirst           : Util.ucfirst,
    update            : Util.update,
}
module.exports = TestUtil