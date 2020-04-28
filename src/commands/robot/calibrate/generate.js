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
        await this.init()
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
