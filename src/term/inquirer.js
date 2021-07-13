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
const Util      = require('../lib/util')

const {defer, from} = require('rxjs')
const Inquirer      = require('inquirer')
const ScreenBase    = require('inquirer/lib/utils/screen-manager')

const {AnsiHelper, TermHelper} = require('./draw')
const {EventEmitter}           = require('events')

const Prompts = require('./prompts')
const {debug} = require('./helpers/prompt.methods')

const {Chars, DefaultTermEnabled} = Constants

const {
    castToArray
  , cliWidth
  , ensure
  , forceLineReturn
  , nchars
  , ntimes
  , stringWidth
  , stripAnsi
  , update
} = Util

const NullEmitter = new EventEmitter
const DefaultTerm = new TermHelper(DefaultTermEnabled)

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

        opts = {emitter: NullEmitter, ...opts}
        opts.readline = {...opt, ...opts.readline}

        questions = castToArray(questions).map(question => (
            {...question, opts: {...opts, ...question.opts}}
        ))

        /**
         * Copied and adapted from inquirer/lib/inquirer.js
         */
        let ui
        try {
            ui = new self.ui.Prompt(self.prompts, opts.readline, self)
        } catch (error) {
            return Promise.reject(error)
        }
        const promise = ui.run(questions, answers)

        // Monkey patch the UI and opts on the promise object so
        // that it remains publicly accessible.
        return update(promise, {ui, opts})
    }

    ensure(self, {

        createPromptModule

      , ScreenManager
      , Separator

      , prompt  : self
      , prompts : {}

      , ui : {...Inquirer.ui, Prompt}

      , registerPrompt : (name, prompt) => {
            self.prompts[name] = prompt
            return self
        }

      , restoreDefaultPrompts: () => {
            const boudrias = Inquirer.createPromptModule().prompts
            self.prompts = {...boudrias, ...Prompts}
            return self
        }
    })

    return self.restoreDefaultPrompts()
}

class ScreenManager extends ScreenBase {

    constructor(rl, opts) {
        super(rl)
        this.cur = new AnsiHelper(this)
        this.opts = {
            indent       : 0
          , maxWidth     : Infinity
          , defaultWidth : 80
          , emitter      : NullEmitter
            , clearMaxWidth: false
          , term         : DefaultTerm
          , ...opts
        }
        update(this, {
            width     : 0
          , height    : 0
          , heightMax : 0
        })
        this.isFirstRender = true
    }

   /**
    * @override For sparse erasing, events, and other options.
    *
    * Adapted from inquirer/lib/utils/screen-manager.
    *
    * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/utils/screen-manager.js
    */
    render(body, foot, spinning = false) {

        this._lastRender = [body, foot, spinning]

        const {opts, cur, rl} = this
        const {emitter, term, indent} = opts

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

        const clearWidth = this.opts.clearMaxWidth ? this.opts.maxWidth : thisWidth
        // Write content lines.
        cur.column(0)
        lines.forEach((line, i) => {
            if (i > 0) {
                rl.output.write('\n')
            }
            if (indent) {
                cur.right(indent)
            }
            if (this.isFirstRender || i >= this.height) {
                term.erase(clearWidth)
            }
            rl.output.write(line)
        })

        // Re-adjust the cursor to the correct position.
        if (footHeight > 0) {
            cur.up(footHeight)
        }

        // Reset cursor at the beginning of the line.
        cur.left(stringWidth(lastLine))

        // Adjust cursor on the right.
        if (cols > 0) {
            cur.right(cols)
        }

        // Special case: adjust one over to the right.
        if (isEndOfLine && indent && !foot) {
            cur.right(1)
        }

        rl.output.mute()

        // Set state for next rendering.
        //this.height = lines.length
        this.heightMax = Math.max(this.height, this.heightMax)
        this.footHeight = footHeight

        //emitter.emit('render', {indent, width: this.width, height: this.height})

        this.isFirstRender = false
    }

    /**
     * @override
     */
    clean() {

        const {height, footHeight} = this
        const {term, indent, clearMaxWidth, maxWidth} = this.opts

        if (!term.enabled) {
            return super.clean(footHeight)
        }

        const width = clearMaxWidth ? maxWidth : this.width

        if (this.isFirstRender || !width || !height) {
            return
        }

        const down = () => term.down(1).column(indent + 1)

        ntimes(footHeight, () => down().erase(width))

        term.up(height)

        ntimes(height, () => down().erase(width))

        ntimes(height > 1, () => term.up(height - 1))
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
     * @override Emit answered event, and clear lastRender
     */
    done() {
        this.opts.emitter.emit('answered', {height: this.height})
        this._lastRender = null
        super.done()
    }

    onResize(opts, isResetFirstRender) {
        this.opts = {...this.opts, ...opts}
        if (isResetFirstRender) {
            this.isFirstRender = true
        }
        if (this._lastRender) {
            this.render(...this._lastRender)
        }
    }
}

class Prompt extends Inquirer.ui.Prompt {

    constructor(prompts, opt, prompter) {
        super(prompts, opt)
        this.prompter = prompter
        this.ScreenClass = (prompter && prompter.ScreenManager) || ScreenManager
    }

    newScreenManager(...args) {
        const ScreenClass = (this.prompter && this.prompter.ScreenManager) || ScreenManager
        return new ScreenClass(...args)
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
     * @override To store reference to UI and Prompt module in Prompt instances.
     *
     * Copied and adapted from inquirer/lib/ui/prompt
     *
     * See https://github.com/SBoudrias/Inquirer.js/blob/master/packages/inquirer/lib/ui/prompt.js
     */
    fetchAnswer(question) {

        const PromptClass = this.prompts[question.type]
        const ScreenClass = this.ScreenClass

        this.activePrompt = new PromptClass(question, this.rl, this.answers)

        update(this.activePrompt, {
            screen: new ScreenClass(this.rl, question.opts)
        })

        ensure(this.activePrompt, {
            ui       : this.ui
          , prompter : this.prompter
        })

        return defer(() =>
            from(
                this.activePrompt.run().then((answer) => {
                    return { name: question.name, answer }
                })
            )
        )
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
        return this        
    }
}

/**
 * Instantiate prompter module
 */
module.exports = {
    inquirer : createPromptModule().restoreDefaultPrompts()
}