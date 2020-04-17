const {Command, flags} = require('@oclif/command')

const Helper = require('../../robot/dataset').Helper

class CreateCommand extends Command {

    async run() {
        const {flags} = this.parse(CreateCommand)
        const opts = {
            outDir   : flags.outdir
          , numGames : +flags.games
        }
        const helper = new Helper(opts)
        await helper.run()
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
