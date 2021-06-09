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

const Helper = require('../../../robot/calibrate').Helper

const defaults = Helper.defaults()

class CalibrateGenerateCommand extends Command {

    async init() {
        const {flags} = this.parse(CalibrateGenerateCommand)
        this.flags = flags
        this.opts = {
            action      : Helper.E_Action.Generate
          , outDir      : this.flags.outdir
          , matchTotal  : +this.flags.matchtotal
          , startWeight : +this.flags.startweight
          , endWeight   : +this.flags.endweight
          , increment   : +this.flags.increment
          , chunkSize   : +this.flags.chunksize
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.helper.run()
    }
}

CalibrateGenerateCommand.description = `Generate config case chunk files for calibrating robot`

CalibrateGenerateCommand.flags = {
    outdir: flags.string({
        char        : 'd'
      , description : 'output directory'
      , required    : true
    })
  , matchtotal: flags.string({
        char        : 't'
      , description : 'match total'
      , default     : defaults.matchTotal.toString()
    })
  , startweight: flags.string({
        char        : 's'
      , description : 'start weight'
      , default     : defaults.startWeight.toString()
    })
  , endweight: flags.string({
        char        : 'e'
      , description : 'end weight'
      , default     : defaults.endWeight.toString()
    })
  , increment: flags.string({
        char        : 'i'
      , description : 'increment'
      , default     : defaults.increment.toString()
    })
  , chunksize: flags.string({
        char        : 'c'
      , description : 'chunk size'
      , default     : defaults.chunkSize.toString()
    })
}

module.exports = CalibrateGenerateCommand
