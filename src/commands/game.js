const {Command, flags} = require('@oclif/command')

const chalk     = require('chalk')
const fs        = require('fs')
const merge     = require('merge')
const {resolve} = require('path')

class GameCommand extends Command {

    async run() {
        const {flags} = this.parse(GameCommand)
    }
}

GameCommand.description = `Game entrypoint`

GameCommand.flags = {

}

module.exports = GameCommand
