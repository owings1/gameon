const {expect} = require('@oclif/test')

const Util = require('../src/lib/util')

const tmp = require('tmp')

const States = require('./states')

const Structures = {
    Initial : [0, 0, 2, 0, 0, 0, 0, -5, 0, -3, 0, 0, 0, 5, -5, 0, 0, 0, 3, 0, 5, 0, 0, 0, 0, -2, 0, 0]
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
        turn.move(move.origin, move.face)
    }
    if (isFinish) {
        turn.finish()
    }
    return turn
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
                            const valid = question.validate(value)
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

module.exports = {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    tmpDir,
    tmpFile,
    noop,
    MockPrompter,
    States,
    Structures
}