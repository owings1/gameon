const {Command, flags} = require('@oclif/command')

const Menu = require('../term/menu')
const os = require('os')
const path = require('path')

class MatchCommand extends Command {

    async init() {
        const {flags} = this.parse(this.constructor)
        this.flags = flags
        this.helper = this.helper || new Menu(this.getSettingsFile())
    }

    async run() {
        await this.init()
        await this.helper.mainMenu()
    }

    getSettingsFile() {
        return path.resolve(os.homedir(), '.gameon/settings.json')
    }
}

MatchCommand.description = `Match entrypoint`

MatchCommand.flags = {

}

module.exports = MatchCommand
