const {Command, flags} = require('@oclif/command')

const Menu = require('../term/menu')

class MatchCommand extends Command {

    async run() {
        const {flags} = this.parse(MatchCommand)
        await Menu.main(new Menu)
    }
}

MatchCommand.description = `Match entrypoint`

MatchCommand.flags = {

}

module.exports = MatchCommand
