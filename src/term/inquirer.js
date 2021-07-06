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
 *
 * -----------------------------------------------------------------
 *
 * Portions adapted from inquirer.js https://github.com/SBoudrias
 *
 * Copyright (c) 2012 Simon Boudrias
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */
const Constants = require('../lib/constants')
const Themes    = require('./themes')
const Util      = require('../lib/util')

const inquirer = require('inquirer')

const {Separator}    = inquirer

const observe     = require('inquirer/lib/utils/events')
const {takeUntil} = require('rxjs/operators')

//const runAsync = require('run-async')
//const cliCursor = require('cli-cursor')
//const {flatMap, take} = require('rxjs/operators')

const {
    Chars
} = Constants

const {
    castToArray
  , keyValuesTrue
  , nchars
  , padEnd
  , stripAnsi
  , strlen
} = Util

const Prompter = inquirer.createPromptModule()

// Add options parameter, which goes to question.settings
Prompter.prompt = (questions, answers, opts = {}) => {
    questions = castToArray(questions).map(question =>
        ({...question, settings: {...opts, ...question.settings}})
    )
    return Prompter(questions, answers)
}

// for patch
const {map} = require('rxjs/operators')

function debug(...args) {
    const brs = nchars(10, '\n')
    console.log(brs, ...args, brs)
}

function maxChoicesLength(choices) {
    choices = choices.filter(it => it.type != 'separator')
    return Math.max(...choices.map(it => strlen(it.name)))
}

function keypressName(e) {
    if (e.key.meta) {
        return e.key.name
    }
    if (e.value == null) {
        return e.key.name
    }
    if (e.key.name && e.key.name.length > 1) {
        return e.key.name
    }
    if (e.key.ctrl) {
        return 'ctrl-' + e.key.name
    }
    return e.value || ''
}

function getTheme(opt) {
    const name = opt.theme || opt.settings.theme
    if (name) {
        return Themes.getInstance(name)
    }
    return Themes.getDefaultInstance()
}

// Copied from inquirer/lib/prompts/password
// https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/password.js
function mask(input, maskChar, limit = Infinity) {
    input = String(input)
    maskChar = typeof maskChar === 'string' ? maskChar : '*'
    if (input.length === 0) {
        return ''
    }

    return new Array(Math.min(input.length + 1, limit)).join(maskChar)
}

const Inits = {

    theme: function initTheme(question, ...args) {

        this.theme = getTheme(this.opt)
        this.chlk = this.theme.prompt
        this.isPrefixDefault = !('prefix' in question)

        this.getErrorString = Methods.getErrorString
        this.getQuestion    = Methods.getQuestion
    }

  , cancel: function initCancel(...args) {

        this.isCancel = false
        this.keypressCancel = Methods.keypressCancel

        const {opt} = this

        if (!opt.cancel) {
            return
        }

        if (typeof opt.cancel == 'string' || Array.isArray(opt.cancel)) {
            opt.cancel = {char: opt.cancel}
        }
        opt.cancel = {
            value    : null
          , eventKey : '_cancelEvent'
          , ...opt.cancel
        }
        opt.cancel.char = castToArray(opt.cancel.char)

        const validate = opt.validate
        opt.validate = (...args) => this.isCancel || validate(...args)
        this._cancelChars = keyValuesTrue(opt.cancel.char)
    }

  , charSelect: function initCharSelect(...args) {

        this.keypressCharSelect = Methods.keypressCharSelect

        this._charIndex = {}
        var index = 0
        this.opt.choices.forEach(choice => {
            if (choice.type == 'separator') {
                return
            }
            castToArray(choice.char).forEach(chr => {
                this._charIndex[chr] = {index, enters: false}
            })
            castToArray(choice.enterChar).forEach(chr => {
                this._charIndex[chr] = {index, enters: true}
            })
            index += 1
        })
    }

  , invalid : function initInvalid(...args) {

        if (!this.opt.writeInvalid) {
            this.opt.writeInvalid = value => value
        }
    }

  , restoreDefault : function initRestoreDefault(...args) {
        this.keypressRestore = Methods.keypressRestore
        this._restoreChars = keyValuesTrue(castToArray(this.opt.restoreDefault))
    }
}

const Methods = {

    getErrorString: function getErrorString(error) {
        const {chlk} = this
        return chlk.caret.error('>> ') + chlk.message.error(error)
    }

    // Adapted from inquirer/lib/prompts/base:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/base.js
  , getQuestion: function getQuestion() {

        const {chlk, opt} = this

        const heads = []

        if (opt.prefix) {
            if (this.isPrefixDefault) {
                var prefix = chlk.message.prefix.default(stripAnsi(opt.prefix))
            } else {
                var prefix = chlk.message.prefix(opt.prefix)
            }
            heads.push(prefix)
        }
        if (opt.message) {
            heads.push(chlk.message.question(opt.message))
        }
        if (opt.suffix) {
            heads.push(chlk.message.suffix(opt.suffix))
        }

        let message = heads.join(chlk.message.question(' '))

        // Append the default if available, and if question isn't touched/answered
        if (opt.default && this.status != 'touched' && this.status != 'answered' && this.status != 'canceled') {
            message += chlk.message.prompt(' ')
            // If default password is supplied, hide it
            if (opt.type === 'password') {
                message += chlk.message.help('[hidden]')
            } else {
                message += chlk.message.help('(' + opt.default + ')')
            }
        }

        return message
    }

  , keypressCancel: function keypressCancel(e) {

        // check for cancel char
        if (!this._cancelChars) {
            return
        }

        const chr = keypressName(e)

        if (!chr.length || !this._cancelChars[chr]) {
            return
        }

        this.isCancel = true
        if (this.opt.cancel.eventKey) {
            this.answers[this.opt.cancel.eventKey] = e
        }
        this.cancel(this.opt.cancel, e)

        return true
    }

  , keypressCharSelect: function keypressCharSelect(e) {

        // check for shortcut char
        if (!this._charIndex) {
            return
        }

        const chr = keypressName(e)

        if (!chr.length || !this._charIndex[chr]) {
            return
        }

        const {index, enters} = this._charIndex[chr]

        this.selectIndex(index, enters)

        return true
    }

  , keypressRestore: function keypressRestore(e) {

        if (!this._restoreChars) {
            return
        }

        if (this.opt.default == null) {
            return
        }

        const chr = keypressName(e)

        if (!chr.length || !this._restoreChars[chr]) {
            return
        }

        this.restoreDefault(e)

        return true
    }
}

class RawListPrompt extends Prompter.prompts.rawlist {

    constructor(...args) {
        super(...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.charSelect.call(this, ...args)
        if (!this.opt.promptMessage) {
            this.opt.promptMessage = 'Answer'
        }
        if (!this.opt.errorMessage) {
            this.opt.errorMessage = 'Please enter a valid index'
        }
    }

    // Override
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        if (this.keypressCharSelect(e)) {
            return
        } else {
            this.lastWasChar = false
        }
        super.onKeypress(e)
    }

    // Override
    getCurrentValue(index) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        if (this.lastWasChar) {
            return super.getCurrentValue('')
        }
        return super.getCurrentValue(index)
    }

    // Called by keypressCharSelect
    selectIndex(index, isSubmit) {

        this.lastWasChar = true
        this.selected = index

        const line = (index + 1).toString()

        this.rl.line = line
        this.rl.cursor = line.length
        
        this.render()

        if (isSubmit) {
            this.rl.emit('line', '')
        }
    }

    // Called by keypressCancel
    cancel() {
        this.rl.line = ''
        this.rl.cursor = 0
        this.rl.emit('line', '')
    }

    // Override
    onError() {
         this.render(this.opt.errorMessage)
    }

    // Override for theme
    // Adapted from inquirer/lib/prompts/rawlist:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
    render(error) {

        const {chlk} = this

        // Render question
        let message = this.getQuestion()
        let bottomContent = ''

        if (this.status === 'answered') {
            message += chlk.answer(' ' + this.opt.choices.getChoice(this.selected).short)
        } else {
            const choicesStr = this._renderChoices(this.opt.choices, this.selected)
            message += '\n'
            message += this.paginator.paginate(choicesStr, this.selected, this.opt.pageSize)
            message += '\n'
            message += chlk.message.prompt('  ' + this.opt.promptMessage + ': ')
        }
        message += this.rl.line

        if (error) {
            bottomContent += '\n'
            bottomContent += this.getErrorString(error)
        }

        this.screen.render(message, bottomContent)
    }

    // Adapted from inquirer/lib/prompts/rawlist:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
    _renderChoices(choices, pointer) {

        const {chlk} = this

        let output = ''
        let separatorOffset = 0

        const maxLen = maxChoicesLength(choices)

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

    // Patch for https://github.com/SBoudrias/Inquirer.js/pull/1026
    // Adapted from inquirer/lib/prompts/rawlist:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
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

class InputPrompt extends Prompter.prompts.input {

    constructor(...args) {
        super(...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.invalid.call(this, ...args)
        Inits.restoreDefault.call(this, ...args)
    }

    // Bound by parent to keypress until validation.success
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        if (this.keypressRestore(e)) {
            return
        }
        // fix bug introduced in
        // https://github.com/SBoudrias/Inquirer.js/commit/73b6e658
        // see https://github.com/owings1/Inquirer.js/commit/21ea73a3
        this.status = 'touched'
        super.onKeypress(e)
    }

    // Called by keypressCancel
    cancel() {
        this.answer = this.opt.cancel.value
        this.status = 'canceled'
        this.rl.line = ''
        this.rl.cursor = 0
        this.rl.emit('line', '')
    }

    // Called by keypressRestore
    restoreDefault() {
        this.answer = this.opt.default
        this.status = 'pending'
        this.rl.line = ''
        this.rl.cursor = 0
        this.render()
    }

    // Bound by parent class to rl.line
    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        // fix bug introduced in
        // https://github.com/SBoudrias/Inquirer.js/commit/73b6e658
        // see https://github.com/owings1/Inquirer.js/commit/21ea73a3
        if (this.status == 'touched') {
            return input
        }
        return super.filterInput(input)
    }

    // Bound by parent class to validation.error
    onError({value, isValid}) {
        if (isValid !== true) {
            value = this.opt.writeInvalid(value, this.answers)
            this.rl.line = value
            this.rl.cursor = value.length
            this.render(isValid)
            return
        }
        super.onError({value, isValid})
    }

    // Override for theme, cancel
    // Adapted from inquirer/lib/prompts/input:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/input.js
    render(error) {

        const {chlk} = this

        const {transformer} = this.opt
        const {isCancel} = this

        let message = this.getQuestion()
        let bottomContent = ''
        let appendContent = ''
        
        if (isCancel) {
            appendContent = chlk.message.help(' [cancel]')
        } else {
            const isFinal = this.status == 'answered'
            var value = isFinal ? this.answer : this.rl.line
            if (transformer) {
                value = transformer(value, this.answers, {isFinal})
            }
            if (isFinal) {
                appendContent = chlk.answer(' ' + value)
            } else {
                appendContent = ' ' + value
            }
        }
        message += appendContent

        if (error) {
            bottomContent += this.getErrorString(error)
        }

        this.screen.render(message, bottomContent)
    }
}

class PasswordPrompt extends Prompter.prompts.password {

    constructor(...args) {
        super(...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.restoreDefault.call(this, ...args)
    }

    // Bound by parent to keypress until validation.success
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        super.onKeypress(e)
    }

    // Bound by parent class to rl.line
    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.filterInput(input)
    }

    // Called by keypressCancel
    cancel() {
        this.answer = this.opt.cancel.value
        this.status = 'canceled'
        this.rl.line = ''
        this.rl.cursor = 0
        this.rl.emit('line', '')
    }

    // Called by keypressRestore
    restoreDefault() {
        this.answer = this.opt.default
        this.status = 'pending'
        this.rl.line = ''
        this.rl.cursor = 0
        this.render()
    }

    // Override for theme
    // Adapted from inquirer/lib/prompts/password:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/password.js
    render(error) {

        const {chlk} = this

        let message = this.getQuestion()
        let bottomContent = ''

        if (this.isCancel) {
            message += chlk.message.help(' [cancel]')
        } else if (this.status === 'answered') {
            message += this.opt.mask
                ? chlk.answer(' ' + mask(this.answer, this.opt.mask, 8))
                : chlk.message.help(' [hidden]')
        } else if (this.opt.mask) {
            message += ' ' + mask(this.rl.line || '', this.opt.mask)
        } else {
            message += chlk.message.help(' [input is hidden] ')
        }

        if (error) {
            bottomContent += '\n'
            bottomContent += this.getErrorString(error)
        }

        this.screen.render(message, bottomContent)
    }
}

class ListPrompt extends Prompter.prompts.list {

    constructor(...args) {
        super(...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        this.pointerChar = this.opt.pointer || Chars.pointer
    }

    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
    }

    // Override
    getCurrentValue() {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.getCurrentValue()
    }

    // Called by keypressCancel
    cancel() {
        this.status = 'canceled'
        this.rl.emit('line', '')
    }

    // Override - Add keypress listener
    _run(cb) {
        const events = observe(this.rl)
        events.keypress.pipe(
            takeUntil(events.line)
        ).forEach(
            this.onKeypress.bind(this)
        )
        return super._run(cb)
    }

    // Override for theme
    // Adapted from inquirer/lib/prompts/list:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    render() {

        const {chlk} = this
        const {choices} = this.opt

        // Render question
        let message = this.getQuestion()

        if (this.firstRender) {
            message += chlk.message.help(' (Use arrow keys)')
        }

        // Render choices or answer depending on the state
        if (this.isCancel) {
            message += chlk.message.help(' [cancel]')
        } else if (this.status == 'answered') {
            message += chlk.answer(choices.getChoice(this.selected).short)
        } else {
            const choicesStr = this._listRender(choices, this.selected)
            const indexPosition = choices.indexOf(
                choices.getChoice(this.selected)
            )
            const realIndexPosition = choices.reduce((acc, value, i) => {

                // Dont count lines past the choice we are looking at
                if (i > indexPosition) {
                    return acc
                }

                // Add line if it's a separator
                if (value.type === 'separator') {
                    return acc + 1
                }

                // Non-strings take up one line
                if (typeof value.name !== 'string') {
                    return acc + 1
                }
        
                // Calculate lines taken up by string
                return acc + value.name.split('\n').length

            }, 0) - 1

            message += '\n'
            message += this.paginator.paginate(choicesStr, realIndexPosition, this.opt.pageSize)
        }

        this.firstRender = false

        this.screen.render(message)
    }

    // Adapted from inquirer/lib/prompts/list:
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    _listRender(choices, pointer) {

        const {chlk} = this
        const maxLen = maxChoicesLength(choices) + 2

        let separatorOffset = 0

        const getLine = (choice, i) => {

            if (choice.type === 'separator') {
                separatorOffset += 1
                if (choice.br) {
                    return ''
                }
                return chlk.separator(''.padEnd(maxLen + 3, Chars.hr))                
            }

            if (choice.disabled) {
                separatorOffset += 1
                const dtxt = typeof choice.disabled == 'string' ? choice.disabled : 'Disabled'
                const dstr = '  - ' + choice.name + ' (' + dtxt + ')'
                return chlk.choice.disabled(dstr)
            }

            const isSelected = i - separatorOffset === pointer
            const text = (isSelected ? this.pointerChar + ' ' : '  ') + choice.name
            const line = padEnd(text, maxLen, ' ')

            if (isSelected) {
                return chlk.choice.selected(line)
            }
            return chlk.choice(line)
        }

        return choices.choices.map(getLine).join('\n')
    }
}

class ConfirmPrompt extends Prompter.prompts.confirm {

    constructor(...args) {
        super(...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
    }

    // Override
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        super.onKeypress(e)
    }

    // Override
    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.filterInput(input)
    }

    // Called by keypressCancel
    cancel() {
        this.status = 'canceled'
        this.rl.line = ''
        this.rl.cursor = 0
        this.rl.emit('line', '')
    }

    // Override for theme
    // Adapted from inquirer/lib/prompts/confirm
    // https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/confirm.js
    render(answer) {

        const {chlk} = this
        let message = this.getQuestion()

        if (typeof answer === 'boolean') {
            message += chlk.answer(answer ? 'Yes' : 'No')
        } else {
            message += this.rl.line
        }

        this.screen.render(message)

        return this
    }
}

class BrSeparator extends Separator {

    constructor(...args) {
        super(...args)
        this.br = true
        this.line = ''
    }
}

const Prompts = {
    confirm  : ConfirmPrompt
  , input    : InputPrompt
  , list     : ListPrompt
  , password : PasswordPrompt
  , rawlist  : RawListPrompt
}
const AddClasses = {
    BrSeparator
  , Separator
}
Object.entries(Prompts).forEach(([name, PromptClass]) => {
    Prompter.registerPrompt(name, PromptClass)
})
Object.entries(AddClasses).forEach(([name, AddClass]) => {
    Prompter[name] = AddClass
})

module.exports = {
    inquirer : Prompter
 ,  ...AddClasses
}