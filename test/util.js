const chai = require('chai')
const {expect} = chai

// https://www.chaijs.com/guide/helpers/
function assertJsonEqual(b) {
    const exp = JSON.stringify(this._obj)
    const res = JSON.stringify(b)
    this.assert(exp == res, "expected #{act} to equal #{exp}", "expected #{exp} to not equal #{act}", res, exp)
}

chai.Assertion.addMethod('jsonEqual', assertJsonEqual)

const Util = require('../src/lib/util')
const Core = require('../src/lib/core')

const tmp = require('tmp')

const States = require('./states')
const Rolls = require('./rolls')

const States28 = {}
for (var k in States) {
    States28[k] = Core.Board.fromStateString(States[k]).state28()
}
const Structures = {
    Initial : [0, 0, 2, 0, 0, 0, 0, -5, 0, -3, 0, 0, 0, 5, -5, 0, 0, 0, 3, 0, 5, 0, 0, 0, 0, -2, 0, 0]
}

function normState(str) {
    return Core.Board.fromStateString(str).stateString()
}

function requireSrc(p) {
    return require('../src/' + p)
}

function noop() {

}

function getError(cb) {
    try {
        cb()
    } catch (err) {
        return err
    }
}

async function getErrorAsync(cb) {
    try {
        await cb()
    } catch (err) {
        return err
    }
}

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
        var moves = turn.getNextAvailableMoves()
        if (moves.length == 0) {
            break
        }
        var move = randomElement(moves)
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

function MockPrompter(responses, isSkipAssertAsked, isSkipAssertAnswered, isSkipAssertValid) {

    const isAssertAsked = !isSkipAssertAsked
    const isAssertAnswered = !isSkipAssertAnswered
    const isAssertValid = !isSkipAssertValid

    responses = Util.castToArray(responses)
    var seqi = 0
    var prompter = (async questions => {
        questions = Util.castToArray(questions)
        const answers = {}
        const response = responses.shift()
        try {
            if (response) {

                const unasked = {}
                Object.keys(response).forEach(opt => unasked[opt] = true)
                const unanswered = []

                var shouldThrow = false
                const alerts = []

                questions.forEach(question => {
                    if ('when' in question) {
                        if (typeof question.when == 'function') {
                            if (!question.when(answers)) {
                                return
                            }
                        }
                        if (!question.when) {
                            return
                        }
                    }
                    const opt = question.name
                    delete unasked[opt]
                    if (opt in response) {
                        var value
                        if (typeof response[opt] == 'function') {
                            value = response[opt](question)
                        } else {
                            value = response[opt]
                        }
                        if ('validate' in question) {
                            const valid = question.validate(value, answers)
                            if (valid !== true) {
                                alerts.push(
                                    "Validation failed for " + opt + ": " + valid
                                )
                                shouldThrow = shouldThrow || isAssertValid
                            }
                        }
                        if (typeof(question.default) == 'function') {
                            // call for coverage
                            question.default(answers)
                        }
                        answers[opt] = value
                    } else {
                        
                        unanswered.push(opt)
                    }
                })

                if (Object.keys(unasked).length) {
                    alerts.push(
                        "MockPrompter was not asked: " + Object.keys(unasked).join(', ') + " in seqi " + seqi
                    )
                    shouldThrow = shouldThrow || isAssertAsked
                }

                if (unanswered.length) {
                    alerts.push(
                        "MockPrompter did not answer: " + unanswered.join(', ') + " in seqi " + seqi
                    )
                    shouldThrow = shouldThrow || isAssertAnswered
                }

                if (shouldThrow) {
                    throw new Error(alerts.join(' AND '))
                }

                if (alerts.length) {
                    console.error('MockPrompter Alerts!', alerts)
                }
                
            } else {
                throw new Error('MockPrompter did not have a reponse for seqi ' + seqi + ' with questions ' + questions.map(it => it.name).join(', '))
            }
        } finally {
            if (prompter.debug) {
                console.log({questions, answers})
            }
        }
        seqi += 1
        return answers
    })
    return prompter
}

// https://stackoverflow.com/questions/34815845/how-to-send-cookies-with-node-fetch
function parseCookies(response) {
  const raw = response.headers.raw()['set-cookie'];
  return raw.map((entry) => {
    const parts = entry.split(';');
    const cookiePart = parts[0];
    return cookiePart;
  }).join(';');
}

module.exports = {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    parseKey,
    randomElement,
    requireSrc,
    tmpDir,
    tmpFile,
    noop,
    normState,
    parseCookies,
    MockPrompter,
    Rolls,
    States,
    States28,
    Structures
}