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

const cliWidth    = require('cli-width')
const inquirer    = require('inquirer')
const observe     = require('inquirer/lib/utils/events')
const readline    = require('readline')
const RlUtil      = require('inquirer/lib/utils/readline')
const ScreenBase  = require('inquirer/lib/utils/screen-manager')
const term        = require('terminal-kit').terminal
const {takeUntil} = require('rxjs/operators')
// for patch
const {map} = require('rxjs/operators')

const {Chars} = Constants
const {EventEmitter} = require('events')

const {AnsiHelper} = require('./draw')

const {
    castToArray
  , ensure
  , extendClass
  , keypressName
  , keyValuesTrue
  , nchars
  , padEnd
  , stringWidth
  , stripAnsi
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

const NullEmitter = new EventEmitter
// Add options parameter, which goes to question.opts
Prompter.prompt = (questions, answers, opts = {}) => {
    questions = castToArray(questions).map(question =>
        ({
            ...question
          , opts: {
                emitter: NullEmitter
              , ...opts
              , ...question.opts
            }
        })
    )
    return Prompter(questions, answers)
}

function debug(...args) {
    const brs = nchars(10, '\n')
    console.log(brs, ...args, brs)
}

class RlHelper {

    constructor(inst) {
        this.inst = inst
    }

    get rl() {
        return this.inst.rl
    }
}

Object.entries(RlUtil).forEach(([name, method]) =>
    RlHelper.prototype[name] = function(...args) {
        method(this.rl, ...args)
        return this
    }
)

class BaseMethods {

    _constructor(question) {
        this.screen = new ScreenManager(this.rl, question.opts)
        this._keypressIndex = {}
        this._keyHandlers = {}
    }

    addKeypressIndex(type, index, handler) {
        Object.entries(index).forEach(([chr, value]) => {
            if (chr in this._keypressIndex) {
                throw new DuplicateKeyError(`Duplicate key char: ${chr}`)
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
        return ['onKeypress', 'filterInput']
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
        this.setLine(this.answer.toString())
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
        return this.opt.default == null ? '' : this.opt.default
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

    getSelectedIndex() {
        return this.selected
    }

    choiceAction(action) {
        this.answers[action.name] = this.getCurrentValue()
        this.submitLine()
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

        message += chlk.message.prompt(' ')
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else if (this.status === 'answered') {
            message += chlk.answer(choices.getChoice(this.selected).short)
        } else {
            if (this.firstRender && this.opt.firstHelp) {
                message += chlk.message.help(this.opt.firstHelp)
            }
            message += '\n'
            message += this._renderPaginated()
            if (this.opt.promptMessage) {
                message += '\n'
                message += chlk.message.prompt('  ' + this.opt.promptMessage + ': ')
                message += chlk.input(this.rl.line)
            }
            //bottomContent += 'You are looking at a list'
        }

        if (error) {
            bottomContent += '\n'
            bottomContent += this.getErrorString(error)
        }

        this.firstRender = false

        this.screen.render(message, bottomContent)
    }

   /**
    * Adapted from inquirer/lib/prompts/list
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/list.js
    */
    _renderPaginated() {
        const {choices} = this.opt
        if (this.selected != null) {
            this.lastRenderedSelected = this.selected
        }
        const choicesStr = this._renderChoices(choices, this.selected)
        const safeIndex = this.selected == null ? this.lastRenderedSelected : this.selected
        const indexPosition = choices.indexOf(choices.getChoice(safeIndex))
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

    /**
     * Adapted from inquirer/lib/prompts/rawlist
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/rawlist.js
     */
    _renderChoices(choices, selected) {

        const {chlk} = this

        let separatorOffset = 0

        const lineLength = this.choicesLineLength(choices)

        return choices.choices.map((choice, i) => {

            const isSeparator = choice.type == 'separator'
            const isDisabled = !!choice.disabled
            const isAvailable = !isSeparator && !isDisabled

            if (!isAvailable) {
                separatorOffset += 1
            }

            const index = i - separatorOffset
            const isSelected = isAvailable && index === selected
            const number = index + 1

            return this._renderChoice(
                choice
              , isSelected
              , isAvailable
              , isSeparator
              , isDisabled
              , lineLength
              , number
            )
        }).join('\n')
    }

    _renderChoice(choice, isSelected, isAvailable, isSeparator, isDisabled, lineLength, number) {

        const {chlk} = this

        let output = ''

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
            lineLength -= numlength
        }

        const text = this._renderChoiceText(choice, isSeparator, isDisabled, lineLength)

        if (isSeparator) {
            output += chlk.separator(text)
        } else if (isDisabled) {
            output += chlk.choice.disabled(text)
        } else if (isSelected) {
            output += chlk.choice.selected(text)
        } else {
            output += chlk.choice(text)
        }

        return output
    }

    _renderChoiceText(choice, isSeparator, isDisabled, lineLength) {
        let nameText = ''
        let padChar = ' '
        if (isSeparator) {
            padChar = choice.char.length ? choice.char : ' '
        } else {
            nameText += choice.name
            if (isDisabled) {
                nameText += this.disabledSuffix(choice.disabled)
            }
        }
        return padEnd(nameText, lineLength, padChar)
    }

    disabledSuffix(disabled) {
        const text = typeof disabled == 'string' ? disabled : 'Disabled'
        return ' (' + text + ')'
    }

    choicesLineLength(choices) {
        choices = choices.filter(it => it.type != 'separator')
        const extra = this.opt.numbers ? choices.length.toString().length + 2 : 0
        return extra + Math.max(...choices.map(it => stringWidth(it.name)))
    }
}

class ThemeFeature {

    static overrides() {
        return ['getQuestion']
    }

    _constructor(question) {
        this.theme = Themes.getSafe(this.opt.theme || this.opt.opts.theme)
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
        let index = 0
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

class ChoiceActionFeature {

    _constructor() {
        const keyIndex = {}
        const revIndex = {}
        const alls = []
        castToArray(this.opt.action).forEach(action => {
            if (typeof action == 'string') {
                action = {char: action}
            }
            action = {
                name : '#action'
              , all  : true
              , ...action
            }
            action.char = castToArray(action.char)
            action.idx = {}

            if (action.name in revIndex) {
                throw new DuplicateKeyError(`Duplicate action name: ${action.name}`)
            }
            revIndex[action.name] = action
            action.char.forEach(chr => {
                if (chr in keyIndex) {
                    throw new DuplicateKeyError(`Duplicate action char: ${chr}`)
                }
                keyIndex[chr] = action
            })
            if (action.all) {
                alls.push(action)
            }
        })
        let index = 0
        this.opt.choices.forEach(choice => {
            if (choice.type == 'separator') {
                return
            }
            alls.forEach(action => action.idx[index] = true)
            castToArray(choice.action).forEach(name => {
                revIndex[name].idx[index] = true
            })
            index += 1
        })
        this.addKeypressIndex('action', keyIndex, action => {
            const selected = this.getSelectedIndex()
            if (selected == null || !action.idx[selected]) {
                return false
            }
            this.choiceAction(action, selected)
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

        let message = this.getQuestion()
        let bottomContent = ''

        message += chlk.message.prompt(' ')
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else {
            const isFinal = this.status == 'answered'
            var value = isFinal ? this.answer : this.rl.line
            if (transformer) {
                value = transformer(value, this.answers, {isFinal})
            }
            if (isFinal) {
                message += chlk.answer(value)
            } else {
                message += chlk.input(value)
            }
        }

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

        message += chlk.message.prompt(' ')
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else if (this.status === 'answered') {
            message += this.opt.mask
                ? chlk.answer(this._mask(this.answer, this.opt.mask, 8))
                : chlk.message.help('[hidden]')
        } else if (this.opt.mask) {
            message += chlk.input(this._mask(this.rl.line || '', this.opt.mask))
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
          , 'action'
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
          , 'action'
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
        if (index == null || index == '') {
            if (this.selected != null) {
                // super expects 1-based, not 0-based.
                return super.getCurrentValue(this.selected + 1)
            }
            return null
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

        //this.lastWasSelect = true
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
        ensure(this.opt, {
            textTrue  : 'Yes'
          , textFalse : 'No'
        })
    }

    valueText(value) {
        return value ? this.opt.textTrue : this.opt.textFalse
    }

    /**
     * @override for cancel and toggle
     */
    onKeypress(e) {
        if (this.handleKeypress(e)) {
            return
        }
        if (this.lastWasToggle && e.key.name == 'backspace') {
            this.currentValue = this.opt.filter()
            this.clearLine()
        }
        this.lastWasToggle = false
        this.render()
    }

    // Called by keypressToggle
    toggleValue(isSubmit) {
        this.lastWasToggle = true
        this.currentValue = !this.currentValue
        const text = this.valueText(this.currentValue)
        this.setLine(text)
        this.render()
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
        if (!this.isCancel) {
            this.status = 'answered'
            if (input != null && input != '') {
                this.currentValue = this.opt.filter(input)
            }
        }
        this.render()
        this.screen.done()
        this.done(this.currentValue)
    }

   /**
    * @override for theme and cancel
    *
    * Adapted from inquirer/lib/prompts/confirm
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/prompts/confirm.js
    */
    render(error) {

        const {chlk} = this
        let message = this.getQuestion()
        let bottomContent = ''

        message += chlk.message.prompt(' ')
        if (this.isCancel) {
            message += chlk.message.help(this.opt.cancel.message)
        } else if (this.status == 'answered') {
            const text = this.valueText(this.currentValue)
            message += chlk.answer(text)
        } else {
            message += chlk.input(this.rl.line)
        }

        if (error) {
            bottomContent += this.getErrorString(error)
        }

        this.screen.render(message, bottomContent)

        return this
    }
}

class Separator extends inquirer.Separator {
    constructor(chr, size) {
        if (chr == null) {
            chr = Chars.hr
        }
        // default line
        const line = chr.length ? nchars(15, chr) : ''
        super(line)
        this.char = chr
        this._when = null
    }
    when(when) {
        if (typeof when == 'undefined') {
            if (this._when == null) {
                return true
            }
            if (typeof this._when == 'function') {
                return this._when()
            }
            return this._when
        }
        this._when = when
        return this
    }
    text(line) {
        this.line = line
        
    }
}

class ScreenManager extends ScreenBase {

    constructor(rl, opts) {
        super(rl)
        opts = {
            indent       : 0
          //, top          : 1
          , maxWidth     : Infinity
          , defaultWidth : 80
          , emitter      : NullEmitter
          , ...opts
        }
        //opts.indent = 15
        //opts.maxWidth = 70//99
        this.opts = opts
        this.cur = new AnsiHelper(this)
        this.isFirstRender = true
        this.width = 0
        this.height = 0
        this.widthMax = 0
        this.heightMax = 0
    }

   /**
    * @override For indent and custom width
    *
    * Copied from inquirer/lib/utils/screen-manager, with minor modifications.
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/utils/screen-manager.js
    */
    render(content, bottomContent, spinning = false) {

        //debug({height: this.height, widht: this.width})
        const {opts} = this
        const {emitter} = opts

        if (this.spinnerId && !spinning) {
            clearInterval(this.spinnerId)
        }

        this.rl.output.unmute()

        /**
         * Write message to screen and setPrompt to control backspace
         */

        const maxWidth = Math.min(this.normalizedCliWidth() - opts.indent, opts.maxWidth)
        const lessWidth = Math.max(0, this.normalizedCliWidth() - maxWidth)

        const promptLine = content.split('\n').pop()
        const rawPromptLine = stripAnsi(promptLine)
        const isEndOfLine = rawPromptLine.length % maxWidth === 0

        // How many additional lines (> 1) for the prompt.
        const extraPromptLineCount = Math.floor(rawPromptLine.length / maxWidth)

        // debug
        //bottomContent = JSON.stringify({
        //    norm: this.normalizedCliWidth()
        //  , maxWidth
        //  , isEndOfLine
        //  , lessWidth
        //  , 'rawPromptLine.length' : rawPromptLine.length
        //})
        if (bottomContent) {
            bottomContent += '\n'
        }
        bottomContent += 'butterfly knife'

        content = this.forceLineReturn(content, maxWidth)
        if (bottomContent) {
            bottomContent = this.forceLineReturn(bottomContent, maxWidth)
        }

        const bottomLineCount = bottomContent ? bottomContent.split('\n').length : 0

        const fullContent = content + (bottomContent ? '\n' + bottomContent : '')
        const fullLines = fullContent.split('\n')
        const lastFullLine = fullLines[fullLines.length - 1]
        const minWidth = Math.max(...fullLines.map(stringWidth))

        if (this.isFirstRender) {
            emitter.emit('screenStart', opts)
        }
        // Correct for input longer than width when width is less than available
        const addPromptLen = extraPromptLineCount * lessWidth

        // Remove the rl.line from our prompt. We can't rely on the content of
        // rl.line (mainly because of the password prompt), so just rely on it's
        // length.
        let prompt = rawPromptLine
        if (this.rl.line.length) {
            prompt = prompt.slice(0, -this.rl.line.length)
        }
        if (addPromptLen) {
            // We can pad the end of the prompt, since only the length matters.
            prompt += nchars(addPromptLen, ' ')
        }

        // SetPrompt will change cursor position, now we can get correct value
        this.rl.setPrompt(prompt)
        const cursorPos = this.rl._getCursorPos()

        // We need to consider parts of the prompt under the cursor as part of the bottom
        // content in order to correctly cleanup and re-render.
        const promptLineUpDiff = extraPromptLineCount - cursorPos.rows
        const bottomHeight = promptLineUpDiff + bottomLineCount

        this.clean()

        this.cur.column(0)
        // Write content lines
        fullLines.forEach((line, i) => {
            if (i > 0) {
                this.rl.output.write('\n')
            }
            if (opts.indent) {
                this.cur.right(opts.indent)
            }
            if (this.isFirstRender || i >= this.height) {
                term.erase(minWidth)
            }
            this.rl.output.write(line)
        })

        /**
         * Re-adjust the cursor at the correct position.
         */
        if (bottomHeight > 0) {
            this.cur.up(bottomHeight)
        }

        // Reset cursor at the beginning of the line
        this.cur.left(stringWidth(lastFullLine))

        // Adjust cursor on the right
        if (cursorPos.cols > 0) {
            this.cur.right(cursorPos.cols)
        }
        // Special case: adjust one over to the right
        if (isEndOfLine && opts.indent && !bottomLineCount) {
            this.cur.right(1)
        }

        /**
         * Set up state for next re-rendering
         */
        this.extraLinesUnderPrompt = bottomHeight
        this.width = Math.max(this.width, minWidth)
        this.height = fullLines.length
        this.maxHeight = Math.max(this.heightMax, this.height)

        this.rl.output.mute()

        const result = {
            width         : this.width
          , height        : this.height
          , indent        : opts.indent
          , isFirstRender : this.isFirstRender
        }

        emitter.emit('screenRender', result)

        this.isFirstRender = false
    }

    /**
     * @override
     */
    clean() {
        if (this.isFirstRender || !this.width || !this.height) {
            return
        }

        const {opts} = this

        const extraLines = this.extraLinesUnderPrompt
        const next = ['down', 'up'][+this.isFirstRender]
        const prev = ['up', 'down'][+this.isFirstRender]    

        for (var i = 0; i < extraLines; ++i) {
            this.cur.down(1)
            this.cur.column(opts.indent)
            term.erase(this.width)
        }

        this.cur.up(this.height)

        for (var i = 0; i < this.height; ++i) {
            this.cur.down(1)
            this.cur.column(opts.indent)
            term.erase(this.width)
        }
        
        if (!this.isFirstRender) {
            this.cur.up(this.height - 1)
        }
    }

    /**
     * @override for defaultWidth option.
     */
    normalizedCliWidth() {
        return cliWidth({
            defaultWidth : this.opts.defaultWidth
          , output       : this.rl.output
        })
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
  , action  : ChoiceActionFeature
}

Object.entries(Prompts).forEach(([name, PromptClass]) => {
    const features = PromptClass.features ? PromptClass.features() : []
    const inherits = PromptClass.inherits ? PromptClass.inherits() : []
    const sources = features.map(name => Features[name]).concat(inherits)
    extendClass(PromptClass, BaseMethods)
    sources.forEach(SourceClass => {
        const overrides = SourceClass.overrides ? SourceClass.overrides() : null
        const optionals = SourceClass.optionals ? SourceClass.optionals() : null
        extendClass(PromptClass, SourceClass, {overrides, optionals})
    })
    Prompter.registerPrompt(name, PromptClass)
})

const AddClasses = {
    ScreenManager
  , Separator
}

Object.entries(AddClasses).forEach(([name, AddClass]) => {
    Prompter[name] = AddClass
})

module.exports = {
    inquirer : Prompter
 ,  ...AddClasses
}