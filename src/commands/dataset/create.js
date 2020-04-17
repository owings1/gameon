const {Command, flags} = require('@oclif/command')

const Helper = require('../../robot/dataset').Helper

class CreateCommand extends Command {

    async init() {
        const {flags} = this.parse(CreateCommand)
        this.flags = flags
        this.opts = {
            outDir   : this.flags.outdir
          , numGames : +this.flags.games
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.init()
        await this.helper.run()
    }
}

CreateCommand.description = `Create AI dataset`

CreateCommand.flags = {
    'outdir': flags.string({
        char        : 'd'
      , description : 'output directory'
      , required    : true
    }),
    'games': flags.string({
        char        : 'g'
      , description : 'number of games to run'
      , default     : '100'
    })
}

module.exports = CreateCommand
