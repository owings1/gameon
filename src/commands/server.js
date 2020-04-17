const {Command, flags} = require('@oclif/command')

const Server = require('../net/server')

class ServerCommand extends Command {

    async init() {
        this.env = process.env
        const {flags} = this.parse(this.constructor)
        this.flags = flags
        this.helper = this.helper || new Server
    }

    async run() {
        await this.init()
        this.helper.listen(this.getHttpPort())
    }

    getHttpPort() {
        return this.flags.port || this.env.HTTP_PORT || 8080
    }
}

ServerCommand.description = `Server entrypoint`

ServerCommand.flags = {
    port : flags.string({
        char        : 'p'
      , description : 'the port to listen on. default is env HTTP_PORT or 8080'
    })
}

module.exports = ServerCommand
