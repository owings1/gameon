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
const {flags} = require('@oclif/command')
const Base    = require('../../lib/command').UserCommand
const Helper  = require('../../robot/profile')

const defaults = Helper.defaults()

class RobotProfileCommand extends Base {

    async init(...args) {
        await super.init(...args)
        const {flags} = this.parse(RobotProfileCommand)
        this.flags = flags
        this.opts = {
            outDir       : this.flags.outdir
          , matchTotal   : +this.flags.matchtotal
          , numMatches   : +this.flags.nummatches
          , sortBy       : this.flags.sortby.toLowerCase()
          , breadthTrees : this.flags.breadth
          , rollsFile    : this.flags.rollsfile
          , gaugeRegex   : this.flags.filter
          , innerBorders : this.flags.inner
          , theme        : this.Settings.theme
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

    breadth: flags.boolean({
        char        : 'b'
      , description : 'generate breadthFirst trees'
    })
  , outdir: flags.string({
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
  , rollsfile: flags.string({
        char        : 'r'
      , description : 'fixed rolls file to use'
    })
  , sortby: flags.string({
        char        : 's'
      , description : 'sort by a column (' + Helper.sortableColumns().join(', ') + ')'
      , default     : defaults.sortBy
    })
  , filter: flags.string({
        description : 'apply a regex filter to gauge names, e.g. /tree/i'
    })
  , inner: flags.boolean({
        char        : 'i'
      , description : 'add inner borders'
    })
}

module.exports = RobotProfileCommand
