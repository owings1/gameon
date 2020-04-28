const {Command, flags} = require('@oclif/command')

const Helper = require('../../../robot/calibrate').Helper

class CalibrateRunCommand extends Command {

    async init() {
        const {flags} = this.parse(CalibrateRunCommand)
        this.flags = flags
        this.opts = {
            action    : Helper.E_Action.Run
          , outDir    : this.flags.outdir
          , chunkFile : this.flags.file
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
      , description : 'output directory'
      , required    : true
    })
  , file: flags.string({
        char        : 'f'
      , description : 'input chunk file'
      , required    : true
    })
}

module.exports = CalibrateRunCommand
