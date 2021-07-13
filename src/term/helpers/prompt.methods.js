/**
 * gameon - Inquirer custom prompt mix-in classes.
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
const Errors = require('../../lib/errors')
const Util   = require('../../lib/util')

const {DuplicateKeyError} = Errors
const {EventEmitter}      = require('events')

const Features = require('./prompt.features')

const {keypressName, nchars, padEnd, stringWidth} = Util

const NullEmitter = new EventEmitter

function debug(...args) {
    const brs = nchars(15, '\n')
    console.log(brs, ...args, brs)
}

class BaseMethods {

    _constructor(question) {
        this.emitter = (question.opts && question.opts.emitter) || NullEmitter
        this._keypressIndex = {}
        this._keyHandlers = {}
    }

    getMaxWidth() {
        if (this.opt.maxWidth) {
            return this.opt.maxWidth
        }
        if (this.opt.opts && this.opt.opts.maxWidth) {
            return this.opt.opts.maxWidth
        }
        return Infinity
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
        return this
    }

    setLine(value) {
        this.rl.line = value
        this.rl.cursor = value.length
        return this
    }

    submitLine(line = '') {
        this.rl.emit('line', line)
        return this
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
        return this
    }

    clear() {
        this.answer = null
        this.status = 'touched'
        this.clearLine()
        return this
    }

    restoreDefault() {
        this.answer = this.opt.default
        this.status = 'pending'
        this.clearLine()
        return this
    }

    expandDefault() {
        this.answer = this.opt.default
        this.status = 'touched'
        this.setLine(this.answer.toString())
        return this
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
        return this
    }

    getSelectedIndex() {
        return this.selected
    }

    choiceAction(action) {
        this.answers[action.name] = this.getCurrentValue()
        this.submitLine()
        return this
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

        let lineLength = this.choicesLineLength(choices)

        lineLength = Math.min(lineLength, this.getMaxWidth())

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
        }

        if (lineLength >= this.getMaxWidth()) {
            lineLength -= 1
        }

        lineLength -= stringWidth(output)

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

module.exports = {
    debug
  , BaseMethods
  , ListMethods
  , TextMethods
}