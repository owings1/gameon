/**
 * gameon - board:draw command
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
const {Command, flags} = require('@oclif/command')
const {Board}  = require('../../lib/core')
const {Colors, BoardStrings} = require('../../lib/constants')
const {InvalidColorError} = require('../../lib/errors')
const Helper = require('../../term/draw')

class BoardDrawCommand extends Command {

    async init() {
        const {flags} = this.parse(BoardDrawCommand)
        this.flags = flags
        const stateString = this.flags.board || BoardStrings.Initial
        const board = Board.fromStateString(stateString)
        board.analyzer.validateLegalBoard()
        const persp = this.flags.persp
        if (!Colors[persp]) {
            throw new InvalidColorError('Invalid color: ' + persp)
        }
        this.opts = {
            board
          , persp
          , interactive: !!this.flags.interactive
        }
        this.helper = new Helper(this.opts)
    }

    async run() {
        await this.init()
        if (this.opts.interactive) {
            await this.helper.interactive()
        } else {
            this.helper.draw(true)
        }
    }
}

BoardDrawCommand.description = `Run performance profiling`

BoardDrawCommand.flags = {
    board: flags.string({
        char        : 'b'
      , description : 'board state string'
    })
  , persp: flags.string({
        char        : 'p'
      , description : 'perspective'
      , default     : Colors.White
    })
  , interactive: flags.boolean({
        char        : 'i'
      , description : 'interactive mode'
    })
}

module.exports = BoardDrawCommand
