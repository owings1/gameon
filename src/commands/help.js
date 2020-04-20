const Base = require('@oclif/plugin-help/lib/commands/help').default
class HelpCommand extends Base {}
HelpCommand.description = 'display help for gameon'
module.exports = HelpCommand