const {expect} = require('@oclif/test')

const Util = require('../src/lib/util')

const tmp = require('tmp')

const States = {
    Initial           : '0|0|2:White|0:|0:|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'
 ,  Blank             : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0'
 ,  WhiteBackgammon1  : '0|0|14:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:Red|15|0'
 ,  WhiteBackgammon2  : '0|1|14:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|0'
 ,  WhiteGammon1      : '0|0|15:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|0'
 ,  RedGammon1        : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15:White|0|15'
 ,  WhiteNoGammon1    : '0|1|12:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:Red|15|1'
 ,  WhiteRunner2Pips  : '0|0|1:White|0:|1:White|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'
    // with 2,4 white has to come in on the 4
 ,  WhiteCornerCase24 : '1|0|0:|0:|2:Red|0:|0:|2:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|0|0'
    // with 2,6 white has to move its rearmost piece(i:14) 2 then 6. it cannot move its middle piece(i:17) 2 first
 ,  WhiteCornerCase26 : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|1:White|0:|0:|2:Red|0:|0:|2:Red|0|0'
    // with 1,6 white must take the 6, even though the 6 point is un-occupied
 ,  WhiteCornerCase16 : '0|0|1:White|2:Red|0:|0:|0:|0:|2:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|0:|0:|0:|0:|0|0'
    // should hit on come-in roll 3
 ,  RedHitComeIn3     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:White|1:Red|2:Red|1:White|0:|2:White|0|0'
    // should allow bearoff with the 5
 ,  RedBearoff51      : '0|0|0:|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|14'
    // should allow bearoff with the 5
 ,  RedBearoff51easy  : '0|0|0:|1:Red|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|14'
 ,  EitherOneMoveWin  : '0|0|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|14|14'
 ,  Either65Win       : '0|0|0:|0:|0:|0:|1:Red|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|0:|0:|0:|0:|13|13'
 ,  RedWinWith66      : '0|0|2:White|0:|0:|0:|0:|4:Red|0:|0:|0:|0:|0:|5:White|0:|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|0:|0|11'
 ,  WhiteTakes61      : '0|0|2:White|0:|0:|0:|0:|5:Red|0:|3:Red|0:|0:|0:|4:White|5:Red|0:|0:|0:|2:White|2:White|5:White|0:|0:|0:|0:|2:Red|0|0'
 ,  WhiteWin          : '0|0|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|14'
 ,  RedWin            : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|14|15'
}

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