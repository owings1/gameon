/**
 * gameon - Inquirer feature mix-in classes
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
const Themes = require('../themes')
const Util   = require('../../lib/util')

const {DuplicateKeyError} = Errors

const {
    castToArray
  , keyValuesTrue
  , stripAnsi
} = Util

const ModifiedStatuses = {
    answered : true
  , canceled : true
  , touched  : true
}

function debug(...args) {
    const brs = nchars(15, '\n')
    console.log(brs, ...args, brs)
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
            if (this.answers && this.opt.cancel.eventKey) {
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

module.exports = {
    theme   : ThemeFeature
  , cancel  : CancelFeature
  , clear   : ClearFeature
  , select  : SelectFeature
  , expand  : ExpandFeature
  , restore : RestoreFeature
  , toggle  : ToggleFeature
  , action  : ChoiceActionFeature
}