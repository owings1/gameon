/**
 * gameon - robot:calibrate:generate command
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

const Helper = require('../../robot/profile')

const defaults = Helper.defaults()

class RobotProfileCommand extends Command {

    async init() {
        const {flags} = this.parse(RobotProfileCommand)
        this.flags = flags
        this.opts = {
            outDir      : this.flags.outdir
          , matchTotal  : +this.flags.matchtotal
          , numMatches  : +this.flags.nummatches
          , sortBy      : this.flags.sortby.toLowerCase()
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.init()
        await this.helper.run()
    }
}

RobotProfileCommand.description = `Run performance profiling`

RobotProfileCommand.flags = {
    outdir: flags.string({
        char        : 'd'
      , description : 'output directory, if desired'
    })
  , matchtotal: flags.string({
        char        : 't'
      , description : 'match total'
      , default     : defaults.matchTotal.toString()
    })
  , nummatches: flags.string({
        char        : 'n'
      , description : 'number of matches to run'
      , default     : defaults.numMatches.toString()
    })
  , sortby: flags.string({
        char        : 's'
      , description : 'sort by a column (' + Helper.sortableColumns().join(', ') + ')'
      , default     : defaults.sortBy
    })
}

module.exports = RobotProfileCommand
