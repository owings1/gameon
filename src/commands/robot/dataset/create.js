/**
 * gameon - robot:dataset:create command
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
import {Flags} from '@oclif/core'
import {AppCommand as Base} from '../../../lib/command.js'
import {Helper} from '../../../robot/dataset.js'

export default class CreateCommand extends Base {

    async init(...args) {
        await super.init(...args)
        this.opts = {
            outDir   : this.flags.outdir
          , numGames : +this.flags.games
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.helper.run()
    }
}

CreateCommand.description = `Create AI dataset`

CreateCommand.flags = {
    outdir: Flags.string({
        char        : 'd',
        description : 'output directory',
        required    : true,
    }),
    games: Flags.string({
        char        : 'g',
        description : 'number of games to run',
        default     : '100',
    })
}

