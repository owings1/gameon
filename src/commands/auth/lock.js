const {Command, flags} = require('@oclif/command')

const Auth = require('../../net/auth')
const Logger = require('../../lib/logger')
const Util = require('../../lib/util')

class AuthLockCommand extends Command {

    async init() {
        this.env = process.env
        const {flags} = this.parse(this.constructor)
        this.flags = flags
        this.logger = this.logger || new Logger
        this.helper = this.helper || new Auth(this.env.AUTH_TYPE)
    }

    async run() {
        const {flags} = this
        this.helper.validateUsername(flags.username)
        await this.helper.lockUser(flags.username)
        this.logger.info('User locked', flags.username)
    }
}

AuthLockCommand.description = `Lock user`

AuthLockCommand.flags = {
    username : flags.string({
        char: 'u'
      , description: 'username'
      , required: true
    })
}

module.exports = AuthLockCommand
