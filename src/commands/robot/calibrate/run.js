const {Command, flags} = require('@oclif/command')

const Helper = require('../../../robot/calibrate').Helper

class CalibrateRunCommand extends Command {

    async init() {
        const {flags} = this.parse(CalibrateRunCommand)
        const {env} = process
        this.flags = flags
        this.opts = {
            action    : Helper.E_Action.Run
          , outDir    : this.flags.outdir || env.CAL_OUTDIR
          , chunkFile : this.flags.file   || env.CAL_FILE
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.init()
        await this.helper.run()
    }
}

CalibrateRunCommand.description = `Run config case chunk for calibrating robot`

CalibrateRunCommand.flags = {
    outdir: flags.string({
        char        : 'd'
      , description : '(required) output directory, will try env CAL_OUTDIR'
    })
  , file: flags.string({
        char        : 'f'
      , description : '(required) input chunk file, will try env CAL_FILE'
    })
}

module.exports = CalibrateRunCommand
