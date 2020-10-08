const {Command, flags} = require('@oclif/command')

const Auth = require('../../net/auth')
const Logger = require('../../lib/logger')
const Util = require('../../lib/util')
const inquirer = require('inquirer')

// TODO: option to read password from stdin

class AuthCreateCommand extends Command {

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
        if (!flags.password) {
            flags.password = await this.promptPassword()
        }
        const user = await this.helper.createUser(flags.username, flags.password, flags.confirmed)
        if (!flags.confirmed && flags.email) {
            await this.helper.sendConfirmEmail(flags.username)
        }
        if (flags.token) {
            this.logger.info('Token:', user.passwordEncrypted)
        } else {
            this.logger.info('Created user', flags.username)
        }
    }

    async promptPassword() {
        const question = {
            name    : 'password'
          , message : 'Enter password'
          , type    : 'password'
          , validate : value => Util.errMessage(() => this.helper.validatePassword(value))
        }
        const answers = await this.prompt(question)
        return answers.password
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }
}

AuthCreateCommand.description = `Create user`

AuthCreateCommand.flags = {
    username : flags.string({
        char: 'u'
      , description: 'username'
      , required: true
    })
  , password : flags.string({
        char: 'p'
      , description: 'password, default is to prompt'
    })
  , confirmed : flags.boolean({
        char: 'c'
      , description: 'create the user as confirmed'
    })
  , email : flags.boolean({
       char: 'e'
     , description: 'send the confirmation email'
    })
  , token : flags.boolean({
       char: 't'
     , description: 'output enrypted token only'
    })
}

module.exports = AuthCreateCommand
