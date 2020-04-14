const {Command, flags} = require('@oclif/command')

const Server = require('../net/server')

class ServerCommand extends Command {

    async run() {
        const {flags} = this.parse(ServerCommand)
        const port = flags.port || process.env.HTTP_PORT || 8080
        const server = new Server
        server.listen(port)
    }
}

ServerCommand.description = `Server entrypoint`

ServerCommand.flags = {
    port : flags.string({
        char        : 'p'
      , description : 'the port to listen on. defauls is env HTTP_PORT or 8080'
    })
}

module.exports = ServerCommand
