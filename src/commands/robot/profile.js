/**
 * gameon - robot:profile command
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
import {UserCommand as Base} from '../../lib/command.js'
import Helper from '../../robot/profile.js'

const defaults = Helper.defaults()

export default class RobotProfileCommand extends Base {

    async init(...args) {
        await super.init(...args)
        this.opts = {
            outDir       : this.flags.outdir,
            matchTotal   : +this.flags.matchtotal,
            numMatches   : +this.flags.nummatches,
            sortBy       : this.flags.sortby.toLowerCase(),
            breadthTrees : this.flags.breadth,
            rollsFile    : this.flags.rollsfile,
            filterRegex  : this.flags.filter,
            innerBorders : this.flags.inner,
            theme        : this.Settings.theme,
            interactive  : this.flags.interactive,
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.helper.run()
    }
}

RobotProfileCommand.aliases = ['profile']

RobotProfileCommand.description = `Run performance profiling`

RobotProfileCommand.flags = {

    breadth: Flags.boolean({
        char        : 'b',
        description : 'generate breadthFirst trees',
    }),
    outdir: Flags.string({
        char        : 'd',
        description : 'output directory, if desired',
    }),
    matchtotal: Flags.string({
        char        : 't',
        description : 'match total',
        default     : defaults.matchTotal.toString(),
    }),
    nummatches: Flags.string({
        char        : 'n',
        description : 'number of matches to run',
        default     : defaults.numMatches.toString(),
    }),
    rollsfile: Flags.string({
        char        : 'r',
        description : 'fixed rolls file to use',
    }),
    sortby: Flags.string({
        char        : 's',
        description : 'sort by a column (' + Helper.sortableColumns().join(', ') + ')',
        default     : defaults.sortBy,
    }),
    filter: Flags.string({
        char        : 'f',
        description : 'apply a regex filter to gauge names, e.g. /tree/i',
    }),
    inner: Flags.boolean({
        char        : 'i',
        description : 'add inner borders',
    }),
    interactive: Flags.boolean({
        char        : 'e',
        description : 'interactive mode',
    }),
}

