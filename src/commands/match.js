const {Command, flags} = require('@oclif/command')

const Menu = require('../term/menu')
const os = require('os')
const path = require('path')

class MatchCommand extends Command {

    async run() {
        const {flags} = this.parse(MatchCommand)
        await Menu.main(new Menu(path.resolve(os.homedir(), '.gameon/settings.json')))
    }
}

MatchCommand.description = `Match entrypoint`

MatchCommand.flags = {

}

module.exports = MatchCommand
