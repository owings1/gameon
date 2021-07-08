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
const Errors    = require('../lib/errors')
const Themes    = require('./themes')
const Util      = require('../lib/util')

const inquirer    = require('inquirer')
const observe     = require('inquirer/lib/utils/events')
const {takeUntil} = require('rxjs/operators')
// for patch
const {map} = require('rxjs/operators')

const {Separator} = inquirer

const {Chars} = Constants

const {
    castToArray
  , ensure
  , extendClass
  , keypressName
  , keyValuesTrue
  , nchars
  , padEnd
  , stripAnsi
  , strlen
} = Util

const {
    DuplicateKeyError
} = Errors

const ModifiedStatuses = {
    answered : true
  , canceled : true
  , touched  : true
}

const Prompter = inquirer.createPromptModule()

// Add options parameter, which goes to question.settings
Prompter.prompt = (questions, answers, opts = {}) => {
    questions = castToArray(questions).map(question =>
        ({...question, settings: {...opts, ...question.settings}})
    )
    return Prompter(questions, answers)
}

function debug(...args) {
    const brs = nchars(10, '\n')
    console.log(brs, ...args, brs)
}

class BaseMethods {

    _constructor() {
        this._keypressIndex = {}
        this._keyHandlers = {}
    }

    addKeypressIndex(type, index, handler) {
        Object.entries(index).forEach(([chr, value]) => {
            if (chr in this._keypressIndex) {
                throw new DuplicateKeyError('Duplicate key char: ' + chr)
            }
            this._keypressIndex[chr] = {type, value}
            if (handler) {
                this._keyHandlers[type] = handler
            }
        })
    }

    handleKeypress(e, type, cb) {
        const chr = keypressName(e)
        const info = this._keypressIndex[chr]
        if (!chr.length || !info) {
            return
        }
        if (type == null) {
            type = info.type
        }
        if (info.type != type) {
            return
        }
        cb = cb || this._keyHandlers[type]
        const result = cb(info.value, e)
        if (result === false) {
            return
        }
        return type
    }

    clearLine(isSubmit) {
        this.rl.line = ''
        this.rl.cursor = 0
        if (isSubmit) {
            this.submitLine()
        }
    }

    setLine(value) {
        this.rl.line = value
        this.rl.cursor = value.length
    }

    submitLine(line = '') {
        this.rl.emit('line', line)
    }

    initializer(...args) {
        BaseMethods.prototype._constructor.call(this, ...args)
        this.constructor.features().forEach(name => {
            Features[name].prototype._constructor.call(this, ...args)
        })
    }
}

class TextMethods {

    // Generic methods for input/password prompts.

    static optionals() {
        return ['*']
    }

    static overrides() {
        return ['onKeypress']
    }

    cancel() {
        this.answer = this.opt.cancel.value
        this.status = 'canceled'
        this.clearLine(true)
    }

    clear() {
        this.answer = null
        this.status = 'touched'
        this.clearLine()
    }

    restoreDefault() {
        this.answer = this.opt.default
        this.status = 'pending'
        this.clearLine()
    }

    expandDefault() {
        this.answer = this.opt.default
        this.status = 'touched'
        this.setLine(this.answer)
    }

    /**
     * @override for cancel, restore, expand, clear, and to fix bug
     */
    onKeypress(e) {
        const type = this.handleKeypress(e)
        if (type == 'cancel') {
            return
        }
        if (!type) {
            // Fix bug introduced in commit 73b6e658
            // See https://github.com/SBoudrias/Inquirer.js/commit/73b6e658
            // See https://github.com/owings1/Inquirer.js/commit/21ea73a3
            this.status = 'touched'
        }
        this.render()
    }
}

class ListMethods {

    static overrides() {
        return ['render']
    }

    // Called by keypressCancel
    cancel() {
        this.status = 'canceled'
        this.clearLine(true)
    }

   /**
    * @override for theme and cancel
    *
    * Adapted from inquirer/lib/prompts/list and rawlist
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
    */
    render(error) {

        const {chlk} = this
        const {choices} = this.opt

        // Render question
        let message = this.getQuestion()
        let bottomContent = ''

        if (this.firstRender && this.opt.firstHelp) {
            message += chlk.message.help(' ' + this.opt.firstHelp)
        }

        message += ' '
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else if (this.status === 'answered') {
            message += chlk.answer(choices.getChoice(this.selected).short)
        } else {
            message += '\n'
            message += this.renderPaginated()
            if (this.opt.promptMessage) {
                message += '\n'
                message += chlk.message.prompt('  ' + this.opt.promptMessage + ': ')
                message += this.rl.line
            }
        }

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
    renderChoices(choices, selected) {

        const {chlk} = this

        let separatorOffset = 0

        const maxLen = this.choicesLineLength(choices)

        const getLine = (choice, i) => {

            if (choice.type == 'separator' || choice.disabled) {
                separatorOffset += 1
            }

            const index = i - separatorOffset
            const isSelected = index === selected && !choice.disabled
            return this.renderChoice(choice, isSelected, maxLen, index + 1)
        }

        return choices.choices.map(getLine).join('\n')
    }

    renderChoice(choice, isSelected, length, number) {

        const {chlk} = this

        const isDisabled = !!choice.disabled
        const isSeparator = choice.type == 'separator'
        const isAvailable = !isDisabled && !isSeparator

        isSelected = isSelected && isAvailable

        var output = ''

        if (this.opt.pointer) {
            if (isSelected) {
                output += chlk.choice.selected(this.opt.pointer + ' ')
            } else {
                output += chlk.choice('  ')
            }
        }

        if (this.opt.numbers && number != null) {
            const numstr = number.toString()
            const parenstr =  ') '
            const numlength = numstr.length + parenstr.length
            if (!isAvailable) {
                output += chlk.choice(''.padEnd(numlength, ' '))
            } else if (isSelected) {
                output += chlk.choice.number.selected(numstr)
                output += chlk.choice.paren.selected(parenstr)
            } else {
                output += chlk.choice.number(numstr)
                output += chlk.choice.paren(parenstr)
            }
            length -= numlength
        }

        if (isSeparator) {
            output += this.renderSeparator(choice, length)
        } else {
            var nameText = choice.name
            if (isDisabled) {
                nameText += ' ' + this.disabledSuffix(choice.disabled)
            }
            const text = padEnd(nameText, length, ' ')
            if (isDisabled) {
                output += chlk.choice.disabled(text)
            } else if (isSelected) {
                output += chlk.choice.selected(text)
            } else {
                output += chlk.choice(text)
            }
        }

        return output
    }

    renderSeparator(choice, length) {
        const {chlk} = this
        var str = ''
        if (choice.br) {
            str += ' '
        } else {
            str += chlk.separator(''.padEnd(length, Chars.hr))
        }
        return str
    }

    disabledSuffix(disabled) {
        const text = typeof disabled == 'string' ? disabled : 'Disabled'
        return '(' + text + ')'
    }

    choicesLineLength(choices) {
        choices = choices.filter(it => it.type != 'separator')
        const extra = this.opt.numbers ? choices.length.toString().length + 2 : 0
        return extra + Math.max(...choices.map(it => strlen(it.name)))
    }

   /**
    * Adapted from inquirer/lib/prompts/list
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    */
    renderPaginated() {
        const {choices} = this.opt
        const choicesStr = this.renderChoices(choices, this.selected)
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

        return this.paginator.paginate(choicesStr, realIndexPosition, this.opt.pageSize)
    }
}

class ThemeFeature {

    static overrides() {
        return ['getQuestion']
    }

    _constructor(question) {
        this.theme = Themes.getSafe(this.opt.theme || this.opt.settings.theme)
        this.chlk = this.theme.prompt
        this.isPrefixDefault = !('prefix' in question)
    }

    getErrorString(error) {
        const {chlk} = this
        return chlk.caret.error('>> ') + chlk.message.error(error)
    }

   /**
    * @override
    *
    * Adapted from inquirer/lib/prompts/base
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/base.js
    */
    getQuestion() {

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

class CancelFeature {

    _constructor() {
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

        const keyIndex = keyValuesTrue(castToArray(opt.cancel.char))
        this.addKeypressIndex('cancel', keyIndex, (value, e) => {
            this.isCancel = true
            if (this.opt.cancel.eventKey) {
                this.answers[this.opt.cancel.eventKey] = e
            }
            this.cancel(e)
        })
    }
}

class ClearFeature {

    _constructor(...args) {
        const keyIndex = keyValuesTrue(castToArray(this.opt.clear))
        this.addKeypressIndex('clear', keyIndex, this.clear.bind(this))
    }
}

class SelectFeature {

    _constructor() {
        var index = 0
        const keyIndex = {}
        this.opt.choices.forEach(choice => {
            if (choice.type == 'separator') {
                return
            }
            castToArray(choice.select).forEach(chr => {
                keyIndex[chr] = {index, isSubmit: false}
            })
            castToArray(choice.enter).forEach(chr => {
                keyIndex[chr] = {index, isSubmit: true}
            })
            index += 1
        })
        this.addKeypressIndex('select', keyIndex, ({index, isSubmit}) => {
            this.selectIndex(index, isSubmit)
        })
    }
}

class RestoreFeature {

    _constructor() {
        const keyIndex = keyValuesTrue(castToArray(this.opt.restore))
        this.addKeypressIndex('restore', keyIndex, () => {
            if (!this.opt.default) {
                return false
            }
            this.restoreDefault()
        })
    }
}

class ExpandFeature {

    _constructor() {
        const keyIndex = keyValuesTrue(castToArray(this.opt.expand))
        this.addKeypressIndex('expand', keyIndex, () => {
            if (!this.opt.default || ModifiedStatuses[this.status]) {
                return false
            }
            this.expandDefault()
        })
    }
}

class ToggleFeature {

    _constructor() {
        const keyIndex = {}
        castToArray(this.opt.toggle).forEach(chr => {
            keyIndex[chr] = {isSubmit: false}
        })
        castToArray(this.opt.toggleEnter).forEach(chr => {
            keyIndex[chr] = {isSubmit: true}
        })
        this.addKeypressIndex('toggle', keyIndex, ({isSubmit}) => {
            this.toggleValue(isSubmit)
        })
    }
}

class InputPrompt extends Prompter.prompts.input {

    static features() {
        return [
            'theme'
          , 'cancel'
          , 'clear'
          , 'restore'
          , 'expand'
        ]
    }

    static inherits() {
        return [TextMethods]
    }

    constructor(...args) {
        super(...args)
        this.initializer(...args)
        ensure(this.opt, {
            writeInvalid: value => value
        })
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

    static features() {
        return [
            'theme'
          , 'cancel'
          , 'restore'
        ]
    }

    static inherits() {
        return [TextMethods]
    }

    constructor(...args) {
        super(...args)
        this.initializer(...args)
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

        message += ' '
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else if (this.status === 'answered') {
            message += this.opt.mask
                ? chlk.answer(this._mask(this.answer, this.opt.mask, 8))
                : chlk.message.help('[hidden]')
        } else if (this.opt.mask) {
            message += this._mask(this.rl.line || '', this.opt.mask)
        } else {
            message += chlk.message.help('[input is hidden] ')
        }

        if (error) {
            bottomContent += '\n'
            bottomContent += this.getErrorString(error)
        }

        this.screen.render(message, bottomContent)
    }

   /**
    * Adapted from inquirer/lib/prompts/password
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/password.js
    */
    _mask(input, maskChar, limit = Infinity) {
       input = String(input)
       maskChar = typeof maskChar === 'string' ? maskChar : '*'
       if (input.length === 0) {
           return ''
       }
       return new Array(Math.min(input.length + 1, limit)).join(maskChar)
   }
}

class ListPrompt extends Prompter.prompts.list {

    static features() {
        return [
            'theme'
          , 'cancel'
        ]
    }

    static inherits() {
        return [ListMethods]
    }

    constructor(...args) {
        super(...args)
        this.initializer(...args)
        ensure(this.opt, {
            numbers   : false
          , pointer   : Chars.pointer
          , firstHelp : '(Use arrow keys)'
        })
    }

    /**
     * For cancel. Not bound in parent class, see _run below.
     */
    onKeypress(e) {
        if (this.handleKeypress(e)) {
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
}

class RawListPrompt extends Prompter.prompts.rawlist {

    static features() {
        return [
            'theme'
          , 'cancel'
          , 'select'
        ]
    }

    static inherits() {
        return [ListMethods]
    }

    constructor(...args) {
        super(...args)
        this.initializer(...args)
        ensure(this.opt, {
            pointer       : Chars.pointer
          , numbers       : true
          , promptMessage : 'Answer'
          , errorMessage  : 'Please enter a valid index'
        })
    }

    /**
     * @override for cancel and char select
     */
    onKeypress(e) {
        this.lastWasSelect = false
        if (this.handleKeypress(e)) {
            return
        }
        super.onKeypress()
    }

    /**
     * @override for cancel and char select
     */
    getCurrentValue(index) {
        if (this.isCancel) {
            return this.opt.cancel.value
        }
        if (this.lastWasSelect) {
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

        this.lastWasSelect = true
        this.selected = index

        const line = (index + 1).toString()

        this.setLine(line)

        this.render()

        if (isSubmit) {
            this.clearLine(true)
        }
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

    static features() {
        return [
            'theme'
          , 'cancel'
          , 'toggle'
        ]
    }

    constructor(...args) {
        super(...args)
        this.currentValue = this.opt.filter()
        this.initializer(...args)
    }

    /**
     * @override for cancel and toggle
     */
    onKeypress(e) {
        if (this.handleKeypress(e)) {
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

const Features = {
    theme   : ThemeFeature
  , cancel  : CancelFeature
  , clear   : ClearFeature
  , select  : SelectFeature
  , expand  : ExpandFeature
  , restore : RestoreFeature
  , toggle  : ToggleFeature
}

const AddClasses = {
    BrSeparator
  , Separator
}

Object.entries(Prompts).forEach(([name, PromptClass]) => {
    extendClass(PromptClass, BaseMethods)
    const features = PromptClass.features ? PromptClass.features() : []
    features.forEach(name => {
        const FeatureClass = Features[name]
        const overrides = FeatureClass.overrides ? FeatureClass.overrides() : null
        const optionals = FeatureClass.optionals ? FeatureClass.optionals() : null
        extendClass(PromptClass, FeatureClass, {overrides, optionals})
    })
    const inherits = PromptClass.inherits ? PromptClass.inherits() : []
    inherits.forEach(SourceClass => {
        const overrides = SourceClass.overrides ? SourceClass.overrides() : null
        const optionals = SourceClass.optionals ? SourceClass.optionals() : null
        extendClass(PromptClass, SourceClass, {overrides, optionals})
    })
    Prompter.registerPrompt(name, PromptClass)
})

Object.entries(AddClasses).forEach(([name, AddClass]) => {
    Prompter[name] = AddClass
})

module.exports = {
    inquirer : Prompter
 ,  ...AddClasses
}