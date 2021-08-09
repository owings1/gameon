/**
 * gameon - MockPrompter test util
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
const {
    objects : {valueHash},
    types   : {castToArray},
} = require('utils-h')

function MockPrompter(responses, isSkipAssertAsked, isSkipAssertAnswered, isSkipAssertValid) {

    const isAssertAsked    = !isSkipAssertAsked
    const isAssertAnswered = !isSkipAssertAnswered
    const isAssertValid    = !isSkipAssertValid

    responses = castToArray(responses)

    let seqi = 0

    const prompter = (async questions => {

        questions = castToArray(questions)

        const answers = {}
        const response = responses.shift()

        try {

            if (!response) {
                const questionStr = questions.map(it => it.name).join(', ')
                throw new MockPrompterError(
                    `MockPrompter did not have a reponse for seqi ${seqi} with questions ${questionStr}`
                )
            }

            const unasked = valueHash(Object.keys(response))
            const unanswered = []
            const alerts = []

            let shouldThrow = false

            for (let question of questions) {

                if ('when' in question) {
                    if (typeof question.when == 'function') {
                        let whenResult = await question.when(answers)
                        if (!whenResult) {
                            continue
                        }
                    }
                    if (!question.when) {
                        continue
                    }
                }

                let opt = question.name

                delete unasked[opt]

                if (!(opt in response)) {
                    unanswered.push(opt)
                    continue
                }

                let value

                if (typeof response[opt] == 'function') {
                    value = await response[opt](question)
                } else {
                    value = response[opt]
                }

                if (typeof question.filter == 'function') {
                    value = await question.filter(value, answers)
                }

                if ('validate' in question) {
                    let valid = await question.validate(value, answers)
                    if (valid !== true) {
                        alerts.push(
                            `Validation failed for ${opt}: ${valid}`
                        )
                        shouldThrow = shouldThrow || isAssertValid
                    }
                }

                if (typeof question.default == 'function') {
                    // call for coverage
                    await question.default(answers)
                }

                answers[opt] = value
            }

            if (Object.keys(unasked).length) {
                let unaskedStr = Object.keys(unasked).join(', ')
                alerts.push(
                    `MockPrompter was not asked: ${unaskedStr} in seqi ${seqi}`
                )
                shouldThrow = shouldThrow || isAssertAsked
            }

            if (unanswered.length) {
                let unansweredStr = unanswered.join(', ')
                alerts.push(
                    `MockPrompter did not answer: ${unansweredStr} in seqi ${seqi}`
                )
                shouldThrow = shouldThrow || isAssertAnswered
            }

            if (shouldThrow) {
                throw new MockPrompterError(alerts.join(' AND '))
            }

            if (alerts.length) {
                console.error('MockPrompter Alerts!', alerts)
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

class MockPrompterError extends Error {

    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

module.exports = MockPrompter