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
import {update} from '@quale/core/objects.js'
import {stripAnsi} from '@quale/core/strings.js'
import {castToArray} from '@quale/core/types.js'
import Screen from '@quale/core/screen.js'
import {defer, from} from 'rxjs'
import Inquirer from 'inquirer'
import ScreenBase from 'inquirer/lib/utils/screen-manager.js'

import {EventEmitter} from 'events'

import Prompts from './prompts.js'
import {
    Chars,
    DefaultAnsiEnabled,
} from '../lib/constants.js'
import {
    cliWidth,
    ensure,
    forceLineReturn,
    nchars,
    ntimes,
    stringWidth,
} from '../lib/util.js'

const NullEmitter = new EventEmitter
const DefaultScreen = new Screen({isAnsi: DefaultAnsiEnabled})

/**
 * Create prompter module.
 *
 * Use a custom `prompt` method, which adds a third `opts` parameter, which
 * gets populated on all the questions. This allows the individual prompt
 * class constructors to pass options to other internal classes, for example,
 * the ScreenManager.
 */
function createPromptModule(opt) {

    const self = (questions, answers, opts) => {

        questions = castToArray(questions).map(question => (
            {...question, opts: {...opts, ...question.opts}}
        ))

        /**
         * Copied and adapted from inquirer/lib/inquirer.js
         */
        let ui
        try {
            ui = new self.ui.Prompt(self.prompts, self.opt, self)
        } catch (error) {
            return Promise.reject(error)
        }

        const promise = ui.run(questions, answers)

        // Monkey patch the UI on the promise object so
        // that it remains publicly accessible.
        return update(promise, {ui})
    }

    opt = opt || {}

    ensure(self, {

        createPromptModule,
        opt,

        ScreenManager,
        Separator,

        prompt  : self,
        prompts : {},

        ui : {...Inquirer.ui, Prompt},

        registerPrompt : (name, prompt) => {
            self.prompts[name] = prompt
            return self
        },

        restoreDefaultPrompts: () => {
            const boudrias = Inquirer.createPromptModule().prompts
            self.prompts = {...boudrias, ...Prompts}
            return self
        },
    })

    return self.restoreDefaultPrompts()
}

class Prompt extends Inquirer.ui.Prompt {

    constructor(prompts, opt, prompter) {
        opt = {...opt}
        let rl
        if (opt.rl) {
            rl = opt.rl
            delete opt.rl
            opt.input = rl.input
            opt.output = rl.output
        }
        super(prompts, opt)
        this.ScreenManager = ScreenManager
        if (rl) {
            this.rl.removeListener('SIGINT', this.onForceClose)
            this.rl = rl
            this.rl.on('SIGINT', this.onForceClose)
        }
        if (prompter) {
            if (prompter.ScreenManager) {
                this.ScreenManager = prompter.ScreenManager
            }
        }
    }

    onResize(...args) {
        if (this.activePrompt && this.activePrompt.screen) {
            const {screen} = this.activePrompt
            if (typeof screen.onResize == 'function') {
                screen.onResize(...args)
            }
        }
    }

    /**
     * @override To instantiate screen class.
     *
     * Copied and adapted from inquirer/lib/ui/prompt
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/ui/prompt.js
     */
    fetchAnswer(question) {

        const PromptClass = this.prompts[question.type]
        const {ScreenManager} = this

        this.activePrompt = new PromptClass(question, this.rl, this.answers)

        update(this.activePrompt, {
            screen: new ScreenManager(this.rl, question.opts)
        })

        return defer(() =>
            from(
                this.activePrompt.run().then((answer) => (
                    {name: question.name, answer}
                ))
            )
        )
    }

    close() {
        super.close()
        if (this.activePrompt && this.activePrompt.screen) {
            const {screen} = this.activePrompt
            if (typeof screen.done == 'function') {
                screen.done()
            }
            clearInterval(screen.spinnerId)
        }
        this.activePrompt = null
    }
}

class ScreenManager extends ScreenBase {

    constructor(rl, opts) {
        super(rl)
        this.opts = {
            indent       : 0,
            maxWidth     : Infinity,
            defaultWidth : 80,
            emitter      : NullEmitter,
            clearMaxWidth: false,
            screen       : DefaultScreen,
            ...opts,
        }

        //this.opts.emitter = NullEmitter
        //this.opts.indent = this.opts.indent || 0
        //this.opts.maxWidth = this.opts.maxWidth || 0
        //this.opts.defaultWidth = this.opts.defaultWidth || 0

        update(this, {
            width     : 0,
            height    : 0,
            heightMax : 0,
        })
        this.isFirstRender = true
        this.isDone = false
    }

    /**
     * @override For sparse erasing, events, and other options.
     *
     * Adapted from inquirer/lib/utils/screen-manager.
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/utils/screen-manager.js
     *
     * @param {string} The main body content
     * @param {string} (optional) The footer content
     * @param {boolean} (optional) Whether we are rendering the spinner
     *
     * @return self
     */
    render(body, foot, spinning = false) {

        foot = foot || ''

        this._lastRender = [body, foot, spinning]

        const {opts, rl} = this
        const {emitter, screen, indent} = opts

        if (this.spinnerId && !spinning) {
            clearInterval(this.spinnerId)
        }

        rl.output.unmute()

        /**
         * Write message to screen and setPrompt to control backspace.
         */

        // Limit maxWidth to cli width.
        const cliWidth = this.normalizedCliWidth()
        const maxWidth = Math.min(cliWidth - indent, opts.maxWidth)
        // The remaining unused cli width, if any.
        const freeWidth = Math.max(0, cliWidth - maxWidth)

        // The last line of regular body content is where the prompt is.
        const promptLine = body.split('\n').pop()
        const promptClean = stripAnsi(promptLine)

        // Whether we are at the end of a line.
        const isEndOfLine = promptClean.length % maxWidth === 0

        // How many additional lines (> 1) for the prompt.
        const promptBreaks = Math.floor(promptClean.length / maxWidth)

        // Ensure non-empty contents end with line break.
        body = forceLineReturn(body, maxWidth)
        foot = forceLineReturn(foot, maxWidth)

        const content  = body + (foot ? '\n' + foot : '')
        const lines    = content.split('\n')
        const lastLine = lines[lines.length - 1]

        // The width required for this render, i.e. the longest line.
        const thisWidth = Math.max(...lines.map(stringWidth))

        // Set the width before we clean, so it will clear a box.
        this.width = Math.max(this.width, thisWidth)

        // Clean previous render.
        this.clean(this.footHeight)

        this.height = lines.length
        emitter.emit('render', {indent, width: this.width, height: this.height})

        // Correct for input longer than width when width is less than available.
        const promptPad = nchars(promptBreaks * freeWidth, ' ')

        // Remove the rl.line from our prompt. We can't rely on the content of
        // rl.line (mainly because of the password prompt), so just rely on its
        // length. Finally, pad the prompt with spaces if necessary, to get the
        // correct length.
        const prompt = promptClean.slice(0, - rl.line.length || undefined) + promptPad

        // setPrompt will change cursor position, now we can get correct value.
        rl.setPrompt(prompt)
        const {cols, rows} = rl._getCursorPos()

        // We need to consider parts of the prompt under the cursor as part of
        // the bottom content in order to correctly cleanup and re-render.
        const footLineCount = foot ? foot.split('\n').length : 0
        const footHeight = promptBreaks - rows + footLineCount

        const clearWidth = opts.clearMaxWidth ? opts.maxWidth : thisWidth
        // Write content lines.
        screen.column(1)
        lines.forEach((line, i) => {
            if (i > 0) {
                rl.output.write('\n')
            }
            if (indent) {
                screen.right(indent)
            }
            if (this.isFirstRender || i >= this.height) {
                screen.erase(clearWidth)
            }
            rl.output.write(line)
        })

        // Re-adjust the cursor to the correct position.
        if (footHeight > 0) {
            screen.up(footHeight)
        }

        // Reset cursor at the beginning of the line.
        screen.left(stringWidth(lastLine))

        // Adjust cursor on the right.
        if (cols > 0) {
            screen.right(cols)
        }

        // Special case: adjust one over to the right.
        if (isEndOfLine && indent && !foot) {
            screen.right(1)
        }

        rl.output.mute()

        // Set state for next rendering.
        this.heightMax = Math.max(this.height, this.heightMax)
        this.footHeight = footHeight

        this.isFirstRender = false

        emitter.emit('afterRender')

        return this
    }

    /**
     * @override
     */
    clean(footHeight) {

        if (typeof footHeight === 'undefined') {
            footHeight = this.footHeight
        }

        const {height} = this
        const {screen, indent, clearMaxWidth, maxWidth} = this.opts

        if (!screen.isAnsi) {
            return super.clean(footHeight)
        }

        const width = clearMaxWidth ? maxWidth : this.width

        if (this.isFirstRender || !width || !height) {
            return
        }
        const down = () => screen.down(1).column(indent + 1)

        ntimes(footHeight, () => down().erase(width))

        screen.up(height)

        ntimes(height, () => down().erase(width))

        ntimes(height > 1, () => screen.up(height - 1))

        return this
    }

    /**
     * @override Support defaultWidth option.
     */
    normalizedCliWidth() {
        const {defaultWidth} = this.opts
        const {output} = this.rl
        return cliWidth({defaultWidth, output})
    }

    /**
     * @override Emit answered event, clear lastRender, clear spinnerId.
     */
    done() {
        // prevent double call when closing on error
        if (this.isDone) {
            return
        }
        this.opts.emitter.emit('answered', {height: this.height})
        super.done()
        this._lastRender = null
        clearInterval(this.spinnerId)
        this.isDone = true
        return this
    }

    onResize(opts, isResetFirstRender) {
        this.opts = {...this.opts, ...opts}
        if (isResetFirstRender) {
            this.isFirstRender = true
        }
        if (this._lastRender) {
            this.render(...this._lastRender)
        }
        return this
    }
}

class Separator extends Inquirer.Separator {

    constructor(chr, size) {
        if (chr == null) {
            chr = Chars.hr
        }
        // default line
        const line = chr.length ? nchars(15, chr) : ''
        super(line)
        if (!chr.length) {
            this.line = ''
        }
        this.char = chr
        this._when = true
    }

    /**
     * Set or evaluate the `when` condition. If no argument is passed, the
     * condition is evaluated. If an argument is passed, it sets the condition.
     *
     * @param {boolean|function} (optional) The condition to set.
     * @return {boolean|self}
     */
    when(when = undefined) {
        if (arguments.length) {
            this._when = when
            return this
        }
        const res = typeof this._when == 'function' ? this._when() : this._when
        return Boolean(res)
    }

    text(line) {
        this.line = line
        return this        
    }
}

/**
 * Instantiate prompter module
 */
const inq = createPromptModule().restoreDefaultPrompts()
export {inq as inquirer}