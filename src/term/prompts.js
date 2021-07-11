/**
 * gameon - Custom Inquirer Prompt classes
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
const Util      = require('../lib/util')

const Inquirer    = require('inquirer')
const observe     = require('inquirer/lib/utils/events')
const {takeUntil} = require('rxjs/operators')

// For Rawlist patch
const {map} = require('rxjs/operators')

const {Chars}  = Constants
const {ensure, extendClass} = Util

const Features = require('./helpers/prompt.features')
const Methods  = require('./helpers/prompt.methods')

const {BaseMethods, ListMethods, TextMethods} = Methods

class InputPrompt extends Inquirer.prompt.prompts.input {

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

class PasswordPrompt extends Inquirer.prompt.prompts.password {

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

class ListPrompt extends Inquirer.prompt.prompts.list {

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

class RawListPrompt extends Inquirer.prompt.prompts.rawlist {

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

class ConfirmPrompt extends Inquirer.prompt.prompts.confirm {

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

/**
 * Extend prompt classes according to static features and inherits methods.
 */

const Prompts = {
    confirm  : ConfirmPrompt
  , input    : InputPrompt
  , list     : ListPrompt
  , password : PasswordPrompt
  , rawlist  : RawListPrompt
}

Object.entries(Prompts).forEach(([name, TargetClass]) => {

    const features = TargetClass.features ? TargetClass.features() : []
    const inherits = TargetClass.inherits ? TargetClass.inherits() : []

    const sources = [BaseMethods, ...features.map(name => Features[name]), ...inherits]

    sources.forEach(SourceClass => {
        const overrides = SourceClass.overrides ? SourceClass.overrides() : null
        const optionals = SourceClass.optionals ? SourceClass.optionals() : null
        extendClass(TargetClass, SourceClass, {overrides, optionals})
    })
})

module.exports = Prompts