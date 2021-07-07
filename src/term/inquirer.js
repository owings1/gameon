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

const {Separator} = inquirer

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
    if (e.key.name == 'escape') {
        return e.key.name
    }
    const parts = ['ctrl', 'meta', 'shift'].filter(it => e.key[it])
    if (parts.length) {
        parts.push(e.key.name)
        return parts.join('-')
    }
    if (e.value == null) {
        return e.key.name
    }
    if (e.key.name && e.key.name.length > 1) {
        return e.key.name
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

/**
 * Adapted from inquirer/lib/prompts/password
 *
 * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/password.js
 */
function mask(input, maskChar, limit = Infinity) {
    input = String(input)
    maskChar = typeof maskChar === 'string' ? maskChar : '*'
    if (input.length === 0) {
        return ''
    }
    return new Array(Math.min(input.length + 1, limit)).join(maskChar)
}

const ModifiedStatuses = {
    answered : true
  , canceled : true
  , touched  : true
}

function extend(target, source) {
    Object.entries(source).forEach(([name, method]) => {
        target[name] = method
    })
}

function ensure(target, defaults) {
    Object.entries(defaults).forEach(([name, method]) => {
        if (!(name in target)) {
            target[name] = method
        }
    })
}

const Inits = {

    base: function initBase(...args) {
        extend(this, Methods.base)
        this._charIndex = {}
    }

  , theme: function initTheme(question, ...args) {

        extend(this, Methods.theme)

        this.theme = getTheme(this.opt)
        this.chlk = this.theme.prompt
        this.isPrefixDefault = !('prefix' in question)
    }

  , cancel: function initCancel(...args) {
        extend(this, Methods.cancel)
        // default methods
        if (this.isTextInput) {
            ensure(this, {
                cancel: Methods.textInput.cancel
            })
        }
        // intial state
        this.isCancel = false

        const {opt} = this

        // accept string, or array of chars
        if (typeof opt.cancel == 'string' || Array.isArray(opt.cancel)) {
            opt.cancel = {char: opt.cancel}
        }
        // defaults
        opt.cancel = {
            value    : null
          , eventKey : '_cancelEvent'
          , message  : '[cancel]'
          , ...opt.cancel
        }
        // override validate method
        const validate = opt.validate
        opt.validate = (...args) => this.isCancel || validate(...args)

        const charIndex = keyValuesTrue(castToArray(opt.cancel.char))
        this.addCharIndex('cancel', charIndex)
    }

  , clear: function initClear(...args) {
        extend(this, Methods.clear)
        // default methods
        if (this.isTextInput) {
            ensure(this, {
                clear: Methods.textInput.clear
            })
        }
        const charIndex = keyValuesTrue(castToArray(this.opt.clear))
        this.addCharIndex('clear', charIndex)
    }

  , select: function initSelect(...args) {

        extend(this, Methods.select)

        var index = 0
        const charIndex = {}
        this.opt.choices.forEach(choice => {
            if (choice.type == 'separator') {
                return
            }
            castToArray(choice.char).forEach(chr => {
                charIndex[chr] = {index, isSubmit: false}
            })
            castToArray(choice.enterChar).forEach(chr => {
                charIndex[chr] = {index, isSubmit: true}
            })
            index += 1
        })
        this.addCharIndex('select', charIndex)
    }

  , invalid: function initInvalid(...args) {
        ensure(this.opt, {
            writeInvalid: value => value
        })
    }

  , restoreDefault : function initRestoreDefault(...args) {
        extend(this, Methods.restore)
        // default methods
        if (this.isTextInput) {
            ensure(this, {
                restoreDefault: Methods.textInput.restoreDefault
            })
        }
        const charIndex = keyValuesTrue(castToArray(this.opt.restoreDefault))
        this.addCharIndex('restore', charIndex)
    }

  , expandDefault : function initExpandDefault(...args) {
        extend(this, Methods.expand)
        // default methods
        if (this.isTextInput) {
            ensure(this, {
                expandDefault: Methods.textInput.expandDefault
            })
        }
        const charIndex = keyValuesTrue(castToArray(this.opt.expandDefault))
        this.addCharIndex('expand', charIndex)
    }

  , toggle: function initToggle(...args) {
        extend(this, Methods.toggle)
        const charIndex = {}
        castToArray(this.opt.toggle).forEach(chr => {
            charIndex[chr] = {isSubmit: false}
        })
        castToArray(this.opt.toggleEnter).forEach(chr => {
            charIndex[chr] = {isSubmit: true}
        })
        this.addCharIndex('toggle', charIndex)
    }
}

const Methods = {

    base : {

        addCharIndex: function addCharIndex(type, index) {
            Object.entries(index).forEach(([chr, value]) => {
                if (chr in this._charIndex) {
                    throw new Error('duplicate ' + chr)
                }
                this._charIndex[chr] = {type, value}
            })
        }

      , handleKeypress: function handleKeypress(e, type, cb) {
            const chr = keypressName(e)
            const info = this._charIndex[chr]
            if (!chr.length || !info || info.type != type) {
                return
            }
            cb(info.value)
            return true
        }

      , clearLine: function clearLine(isSubmit) {
            this.rl.line = ''
            this.rl.cursor = 0
            if (isSubmit) {
                this.submitLine()
            }
        }

      , setLine: function setLine(value) {
            this.rl.line = value
            this.rl.cursor = value.length
        }

      , submitLine: function submitLine(line = '') {
            this.rl.emit('line', line)
        }
    }

  , theme : {

        getErrorString: function getErrorString(error) {
            const {chlk} = this
            return chlk.caret.error('>> ') + chlk.message.error(error)
        }

        // Adapted from inquirer/lib/prompts/base
        // See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/base.js
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
            if (opt.default && !ModifiedStatuses[this.status]) {
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
    }

  , cancel : {
        keypressCancel: function keypressCancel(e) {
            return this.handleKeypress(e, 'cancel', () => {
                this.isCancel = true
                if (this.opt.cancel.eventKey) {
                    this.answers[this.opt.cancel.eventKey] = e
                }
                this.cancel(e)
            })
        }
    }

  , clear: {
        keypressClear: function keypressClear(e) {
            return this.handleKeypress(e, 'clear', () => {
                this.clear(e)
            })
        }
    }

  , select: {
        keypressSelect: function keypressSelect(e) {
            return this.handleKeypress(e, 'select', ({index, isSubmit}) => {
                this.selectIndex(index, isSubmit)
            })
        }
    }

  , restore: {
        keypressRestore: function keypressRestore(e) {
            if (!this.opt.default) {
                return
            }
            return this.handleKeypress(e, 'restore', () => {
                this.restoreDefault(e)
            })
        }
    }

  , expand: {
        keypressExpand: function keypressExpand(e) {
            if (!this.opt.default || ModifiedStatuses[this.status]) {
                return
            }
            return this.handleKeypress(e, 'expand', () => {
                this.expandDefault(e)
            })
        }
    }

  , toggle: {
        keypressToggle: function keypressToggle(e) {
            return this.handleKeypress(e, 'toggle', ({isSubmit}) => {
                this.toggleValue(isSubmit)
            })
        }
    }
  , textInput : {

        // Default implementations for text input prompts.

        cancel: function cancelTextInput() {
            this.answer = this.opt.cancel.value
            this.status = 'canceled'
            this.clearLine(true)
        }

      , clear: function clearTextInput() {
            this.answer = null
            this.status = 'touched'
            this.clearLine()
        }

      , restoreDefault: function restoreTextInputDefault() {
            this.answer = this.opt.default
            this.status = 'pending'
            this.clearLine()
        }

      , expandDefault: function expandTextInputDefault() {
            this.answer = this.opt.default
            this.status = 'touched'
            this.setLine(this.answer)
        }
    }
}

class InputPrompt extends Prompter.prompts.input {

    constructor(...args) {
        super(...args)
        this.isTextInput = true
        Inits.base.call(this, ...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.clear.call(this, ...args)
        Inits.invalid.call(this, ...args)
        Inits.restoreDefault.call(this, ...args)
        Inits.expandDefault.call(this, ...args)
    }

    /**
     * @override for cancel, restore, expand, clear, and to fix bug
     */
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        try {
            if (this.keypressRestore(e)) {
                return
            }
            if (this.keypressExpand(e)) {
                return
            }
            if (this.keypressClear(e)) {
                return
            }
            // Fix bug introduced in commit 73b6e658
            // See https://github.com/SBoudrias/Inquirer.js/commit/73b6e658
            // See https://github.com/owings1/Inquirer.js/commit/21ea73a3
            this.status = 'touched'
        } finally {
            this.render()
        }
    }

    /**
     * @override for cancel, and to fix bug
     *
     * Bound to events.line before validation.
     */
    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        // Fix bug introduced in commit 73b6e658
        // See https://github.com/SBoudrias/Inquirer.js/commit/73b6e658
        // See https://github.com/owings1/Inquirer.js/commit/21ea73a3
        if (this.status == 'touched') {
            return input
        }
        return super.filterInput(input)
    }

    /**
     * @override for writeInvalid
     *
     * Bound to validation.error.
     */
    onError({value, isValid}) {
        if (isValid !== true) {
            value = this.opt.writeInvalid(value, this.answers)
            this.setLine(value)
            this.render(isValid)
            return
        }
        super.onError({value, isValid})
    }

   /**
    * @override for theme and cancel
    *
    * Adapted from inquirer/lib/prompts/input
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/input.js
    */
    render(error) {

        const {chlk} = this

        const {transformer} = this.opt
        const {isCancel} = this

        let message = this.getQuestion()
        let bottomContent = ''
        let appendContent = ''
        
        if (isCancel) {
            appendContent = chlk.message.help(' ' + this.opt.cancel.message)
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
        this.isTextInput = true
        Inits.base.call(this, ...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.restoreDefault.call(this, ...args)
    }

    /**
     * @override for cancel, restore, and to avoid clearing default
     */
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        try {
            if (this.keypressRestore(e)) {
                return
            }
            this.status = 'touched'
        } finally {
            this.render()
        }
    }

    /**
     * @override for cancel
     *
     * Bound to events.line before validation.
     */
    filterInput(input) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.filterInput(input)
    }

   /**
    * @override for theme and cancel
    *
    * Adapted from inquirer/lib/prompts/password
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/password.js
    */
    render(error) {

        const {chlk} = this

        let message = this.getQuestion()
        let bottomContent = ''

        if (this.isCancel) {
            message += chlk.message.help(' ' + this.opt.cancel.message)
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
        Inits.base.call(this, ...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        this.pointerChar = this.opt.pointer || Chars.pointer
    }

    /**
     * For cancel. Not bound in parent class, see _run below.
     */
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
    }

    /**
     * @override for cancel
     */
    getCurrentValue() {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        return super.getCurrentValue()
    }

    // Called by keypressCancel
    cancel() {
        this.status = 'canceled'
        this.submitLine()
    }

    /**
     * @override Add keypress listener
     */
    _run(cb) {
        const events = observe(this.rl)
        events.keypress.pipe(
            takeUntil(events.line)
        ).forEach(
            this.onKeypress.bind(this)
        )
        return super._run(cb)
    }

   /**
    * @override for theme and cancel
    *
    * Adapted from inquirer/lib/prompts/list
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    */
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
            message += chlk.message.help(' ' + this.opt.cancel.message)
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

   /**
    * Adapted from inquirer/lib/prompts/list
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    */
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

class RawListPrompt extends Prompter.prompts.rawlist {

    constructor(...args) {
        super(...args)
        Inits.base.call(this, ...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.select.call(this, ...args)
        ensure(this.opt, {
            promptMessage : 'Answer'
          , errorMessage  : 'Please enter a valid index'
        })
    }

    /**
     * @override for cancel and char select
     */
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        if (this.keypressSelect(e)) {
            return
        }
        this.lastWasChar = false
        super.onKeypress()
    }

    /**
     * @override for cancel and char select
     */
    getCurrentValue(index) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        if (this.lastWasChar) {
            // super expects 1-based, not 0-based.
            index = this.selected + 1
        }
        return super.getCurrentValue(index)
    }

    /**
     * @override for configurable message
     */
    onError() {
         this.render(this.opt.errorMessage)
    }

    // Called by keypressSelect
    selectIndex(index, isSubmit) {

        this.lastWasChar = true
        this.selected = index

        const line = (index + 1).toString()

        this.setLine(line)

        this.render()

        if (isSubmit) {
            this.clearLine(true)
        }
    }

    // Called by keypressCancel
    cancel() {
        debug('cancel')
        this.status = 'canceled'
        this.clearLine(true)
    }

    /**
     * @override for theme and cancel
     *
     * Adapted from inquirer/lib/prompts/rawlist
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
     */
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

    /**
     * Adapted from inquirer/lib/prompts/rawlist
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
     */
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

    /**
     * @override for patch
     *
     * Patch submitted, see https://github.com/SBoudrias/Inquirer.js/pull/1026
     *
     * Adapted from inquirer/lib/prompts/rawlist
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
     */
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

class ConfirmPrompt extends Prompter.prompts.confirm {

    constructor(...args) {
        super(...args)
        this.isConfirmPrompt = true
        this.currentValue = this.opt.filter()
        Inits.base.call(this, ...args)
        Inits.theme.call(this, ...args)
        Inits.cancel.call(this, ...args)
        Inits.toggle.call(this, ...args)
    }

    /**
     * @override for cancel and toggle
     */
    onKeypress(e) {
        if (this.keypressCancel(e)) {
            return
        }
        if (this.keypressToggle(e)) {
            return
        }
        super.onKeypress()
    }

    // Called by keypressToggle
    toggleValue(isSubmit) {
        this.currentValue = !this.currentValue
        this.clearLine()
        this.render(this.currentValue)
        if (isSubmit) {
            this.submitLine()
        }
    }

    // Called by keypressCancel
    cancel() {
        this.status = 'canceled'
        this.currentValue = this.opt.cancel.value
        this.clearLine(true)
    }

    /**
     * @override for cancel and toggle
     *
     * Adapted from inquirer/lib/prompts/confirm
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/confirm.js
     */
    onEnd(input) {
        if (input == null || input == '') {
            var answer = this.currentValue
        } else {
            var answer = this.opt.filter(input)
        }
        if (!this.isCancel) {
            this.status = 'answered'
        }
        this.render(answer)
        this.screen.done()
        this.done(answer)
    }

   /**
    * @override for theme and cancel
    *
    * Adapted from inquirer/lib/prompts/confirm
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/confirm.js
    */
    render(answer) {

        const {chlk} = this
        let message = this.getQuestion()

        message += ' '
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else if (typeof answer === 'boolean') {
            const text = answer ? 'Yes' : 'No'
            if (this.status == 'answered') {
                message += chlk.answer(text)
            } else {
                message += text
            }
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