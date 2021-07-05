/**
 * gameon - Custom Inquirer classes
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
const Constants   = require('../lib/constants')
const ThemeHelper = require('./themes')
const Util        = require('../lib/util')

const chalk    = require('chalk')
const inquirer = require('inquirer')

const {Separator}    = inquirer
const InputPrompt    = require('inquirer/lib/prompts/input')
const PasswordPrompt = require('inquirer/lib/prompts/password')
const RawListPrompt  = require('inquirer/lib/prompts/rawlist')

const {
    Chars
} = Constants

const {
    castToArray
  , padEnd
  , strlen
} = Util

// for bugfix
const { map, takeUntil } = require('rxjs/operators')
const observe = require('inquirer/lib/utils/events')

const BRS = '\n\n\n\n\n\n\n\n\n\n'

class RawListPlusPrompt extends RawListPrompt {

    constructor(question, rl, answers) {
        super(question, rl, answers)
        this.promptMessage = this.opt.promptMessage || 'Answer'
        this.errorMessage = this.opt.errorMessage || 'Please enter a valid index'
        this.theme = this.opt.theme || ThemeHelper.getDefaultInstance()
        this.chlk = this.theme.prompt
        this.charIndex = {}
        var realIndex = 0
        this.opt.choices.forEach(choice => {
            if (choice.type == 'separator') {
                return
            }
            castToArray(choice.char).forEach(chr => {
                this.charIndex[chr] = {index: realIndex, enters: false}
            })
            castToArray(choice.enterChar).forEach(chr => {
                this.charIndex[chr] = {index: realIndex, enters: true}
            })
            realIndex += 1
        })
        this.lastWasChar = false
    }

    onKeypress(e) {
        // check for shortcut char
        if (e.key.meta) {
            var chr = e.key.name
        } else {
            var chr = this.rl.line.trim()
        }
        if (chr.length && this.charIndex[chr]) {
            this.selected = this.charIndex[chr].index
            this.lastWasChar = true
            if (this.charIndex[chr].enters) {
                this.rl.line = ''
                this.rl.emit('line', '')
            } else {
                this.render()
            }
            return
        } else {
            this.lastWasChar = false
        }
        super.onKeypress(e)
    }

    getCurrentValue(index) {
        if (this.lastWasChar) {
            return super.getCurrentValue('')
        }
        return super.getCurrentValue(index)
    }

    // override
    onError() {
         this.render(this.errorMessage)
    }

    // override for theme
    render(error) {

        const {chlk} = this

        // Render question
        let message = this.getQuestion()
        let bottomContent = ''

        if (this.status === 'answered') {
            message += chlk.answer(this.opt.choices.getChoice(this.selected).short)
        } else {
            const choicesStr = this._renderChoices(this.opt.choices, this.selected)
            message +=
              '\n' + this.paginator.paginate(choicesStr, this.selected, this.opt.pageSize)
            message += '\n' + chlk.message.prompt('  ' + this.promptMessage + ': ')
        }
        message += this.rl.line

        if (error) {
            bottomContent = '\n' + chlk.caret.error('>> ') + chlk.message.error(error)
        }

        this.screen.render(message, bottomContent)
    }

    // override for theme
    _renderChoices(choices, pointer) {

        const {chlk} = this

        let output = ''
        let separatorOffset = 0

        const maxLen = Math.max(...choices.filter(it => it.type != 'separator').map(it => strlen(it.name)))

        choices.forEach((choice, i) => {
            output += '\n  '

            if (choice.type === 'separator') {
                separatorOffset++
                if (!choice.br) {
                    output += chlk.separator(''.padEnd(maxLen + 3, Chars.hr))
                }
                return
            }

            const index = i - separatorOffset
            const numstr = (index + 1).toString()
            const parenstr =  ') '
            var display = ''
            if (index === pointer) {
                display += chlk.choice.number.selected(numstr)
                display += chlk.choice.paren.selected(parenstr)
                display += chlk.choice.selected(padEnd(choice.name, maxLen, ' '))
            } else {
                display += chlk.choice.number(numstr)
                display += chlk.choice.paren(parenstr)
                display += chlk.choice(padEnd(choice.name, maxLen, ' '))
            }

            output += display
        })

        return output
    }

    // patch for https://github.com/SBoudrias/Inquirer.js/pull/1026
    _run(cb) {
        this.done = cb

        // Once user confirm (enter key)
        const events = observe(this.rl)
        const submit = events.line.pipe(map(this.getCurrentValue.bind(this)))

        const validation = this.handleSubmitEvents(submit)
        validation.success.forEach(this.onEnd.bind(this))
        validation.error.forEach(this.onError.bind(this))

        events.normalizedUpKey
            .pipe(takeUntil(validation.success))
            .forEach(this.onUpKey.bind(this))
        events.normalizedDownKey
            .pipe(takeUntil(validation.success))
            .forEach(this.onDownKey.bind(this))
        events.keypress
            .pipe(takeUntil(validation.success))
            .forEach(this.onKeypress.bind(this))
        // Init the prompt
        this.render()

        return this
    }
}

function initOptCancel() {
    this.cancelChars = {}
    if (this.opt.cancel) {
        if (!('value' in this.opt.cancel)) {
            this.opt.cancel.value = null
        }
        if (!('eventKey' in this.opt.cancel)) {
            this.opt.cancel.eventKey = '_cancelEvent'
        }
        const validate = this.opt.validate
        this.opt.validate = (...args) => {
            if (this.isCancel) {
                return true
            }
            return validate(...args)
        }
        castToArray(this.opt.cancel.char).forEach(chr => {
            this.cancelChars[chr] = true
        })
    }
}

function handleKeypressCancel(e) {
    // check for cancel char
    if (e.key.meta) {
        var chr = e.key.name
    } else {
        var chr = this.rl.line.trim()
    }
    //console.log(BRS, {chr, e},this.opt, BRS)
    if (chr.length && this.cancelChars[chr]) {
        //console.log('CANCEL')
        this.isCancel = true
        if (this.opt.cancel.eventKey) {
            this.answers[this.opt.cancel.eventKey] = e
        }
        this.rl.line = ''
        this.rl.emit('line', '')
        if (this.opt.onCancel) {
            this.opt.onCancel()
        }
        return true
    }
}

class InputPlusPrompt extends InputPrompt {

    constructor(question, rl, answers) {
        super(question, rl, answers)
        initOptCancel.call(this)
    }

    onKeypress(e) {
        if (handleKeypressCancel.call(this, e)) {
            return
        }
        super.onKeypress(e)
    }

    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.filterInput(input)
    }
}

class PasswordPlusPrompt extends PasswordPrompt {

    constructor(question, rl, answers) {
        super(question, rl, answers)
        initOptCancel.call(this)
    }

    onKeypress(e) {
        if (handleKeypressCancel.call(this, e)) {
            return
        }
        super.onKeypress(e)
    }

    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.filterInput(input)
    }
}

class BrSeparator extends Separator {

    constructor(...args) {
        super(...args)
        this.br = true
        this.line = ''
    }
}

const prompter = inquirer.createPromptModule()

prompter.registerPrompt('input', InputPlusPrompt)
prompter.registerPrompt('rawlist', RawListPlusPrompt)
prompter.registerPrompt('password', PasswordPlusPrompt)

prompter.prompt = (questions, answers, opts = {}) => {
    const theme = opts.theme || ThemeHelper.getDefaultInstance()
    questions.forEach(question => {
        question.theme = theme
    })
    return prompter(questions, answers)
}
prompter.Separator = Separator
prompter.BrSeparator = BrSeparator

module.exports = {
    inquirer : prompter
 ,  Separator
 ,  BrSeparator
}