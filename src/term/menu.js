const Core       = require('../lib/core')
const Logger     = require('../lib/logger')
const Util       = require('../lib/util')

const Coordinator   = require('../lib/coordinator')
const Client        = require('../net/client')
const NetPlayer     = require('../net/player')
const TermPlayer    = require('./player')
const {RandomRobot} = require('../robot/player')

const {White, Red, Match} = Core

const inquirer  = require('inquirer')
const os        = require('os')
const {resolve} = require('path')
const sp        = Util.joinSpace

const DefaultServerUrl = 'ws://bg.dougowings.net:8080'

class Menu extends Logger {

    constructor() {
        super()
        this.opts = this.getDefaultOpts()
    }

    async mainMenu() {

        while (true) {

            var mainChoices = this.getMainChoices()

            var answers = await this.prompt({
                name    : 'mainChoice'
              , message : 'Select option'
              , type    : 'rawlist'
              , choices : mainChoices
              , pageSize : 10
            })

            var {mainChoice} = answers

            if (mainChoice == 'quit') {
                break
            }

            if (mainChoice == 'settings') {
                await this.settingsMenu()
            } else if (mainChoice == 'joinOnline') {
                await this.joinMenu()
            } else {
                await this.matchMenu(mainChoice == 'newOnline', mainChoice == 'playRobot', mainChoice == 'watchRobots')
            }
        }
    }

    async matchMenu(isOnline, isRobot, isRobots) {

        const {opts} = this

        while (true) {

            var matchChoices = this.getMatchChoices(opts, isOnline, isRobot, isRobots)

            var answers = await this.prompt({
                name    : 'matchChoice'
              , message : 'Select option'
              , type    : 'rawlist'
              , choices : matchChoices
            })

            var {matchChoice} = answers

            if (matchChoice == 'quit') {
                return
            }

            if (matchChoice == 'start') {
                if (isOnline) {
                    await this.startOnlineMatch(opts)
                } else if (isRobot) {
                    await this.playRobot(opts)
                } else if (isRobots) {
                    await this.playRobots(opts)
                } else {
                    await this.playLocalMatch(opts)
                }
                continue
            }

            var question = matchChoices.find(choice => choice.value == matchChoice).question

            answers = await this.prompt(question)

            opts[question.name] = answers[question.name]
            opts.total = +opts.total
            opts.delay = +opts.delay
        }
    }

    async settingsMenu() {

        const {opts} = this

        while (true) {

            var settingsChoices = this.getSettingsChoices(opts)
            var answers = await this.prompt([{
                name    : 'settingChoice'
              , message : 'Select Option'
              , type    : 'rawlist'
              , choices : settingsChoices
            }])

            var {settingChoice} = answers

            if (settingChoice == 'done') {
                break
            }

            var question = settingsChoices.find(choice => choice.value == settingChoice).question

            answers = await this.prompt(question)

            opts[question.name] = answers[question.name]
        }
    }

    async joinMenu() {
        const {opts} = this
        const questions = this.getJoinQuestions(opts)
        const answers = await this.prompt(questions)
        if (!answers.matchId) {
            return
        }
        opts.matchId = answers.matchId
        await this.joinOnlineMatch(opts)
    }

    async playLocalMatch(opts) {
        const coordinator = new Coordinator(opts)
        const match = new Match(opts.total, opts)
        await coordinator.runMatch(match, new TermPlayer(White), new TermPlayer(Red))
    }

    async startOnlineMatch(opts) {
        const coordinator = new Coordinator(opts)
        const client = new Client(opts.serverUrl)
        await client.connect()
        try {
            const match = await client.startMatch(opts)
            await coordinator.runMatch(match, new TermPlayer(White), new NetPlayer(client, Red))
        } finally {
            await client.close()
        }
    }

    async playRobot(opts) {
        const coordinator = new Coordinator(opts)
        const match = new Match(opts.total, opts)
        const robot = new TermPlayer.Robot(new RandomRobot(Red), opts)
        await coordinator.runMatch(match, new TermPlayer(White), robot)
    }

    async playRobots(opts) {
        const coordinator = new Coordinator(opts)
        const match = new Match(opts.total, opts)
        const white = new TermPlayer.Robot(new RandomRobot(White), opts)
        const red = new TermPlayer.Robot(new RandomRobot(Red), opts)
        await coordinator.runMatch(match, white, red)
    }

    async joinOnlineMatch(opts) {
        const coordinator = new Coordinator(opts)
        const client = new Client(opts.serverUrl)
        await client.connect()
        try {
            const match = await client.joinMatch(opts.matchId)
            await coordinator.runMatch(match, new NetPlayer(client, White), new TermPlayer(Red))
        } finally {
            await client.close()
        }
        
    }

    async playMatch(player, match) {
        try {
            await player.playMatch(match)
        } catch (err) {
            this.error(err)
            this.warn('An error occurred, the match is canceled')
            await player.abortMatch()
        }
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    getMatchChoices(opts, isOnline, isRobot, isRobots) {
        return Menu.formatChoices([
            {
                value : 'start'
              , name  : 'Start Match'
            }
          , {
                value : 'total'
              , name  : 'Match Total'
              , question : {
                    name     : 'total'
                  , message  : 'Match Total'
                  , type     : 'input'
                  , default  : () => '' + opts.total
                  , validate : value => {
                        value = +value
                        return !isNaN(+value) && Number.isInteger(+value) && value > 0 || 'Please enter a number > 0'
                    }
                }
            }
          , {
                value : 'isCrawford'
              , name  : 'Crawford Rule'
              , question : {
                    name    : 'isCrawford'
                  , message : 'Crawford Rule'
                  , type    : 'confirm'
                  , default : () => opts.isCrawford
                }
            }
          , {
                value : 'isJacoby'
              , name  : 'Jacoby Rule'
              , question : {
                    name    : 'isJacoby'
                  , message : 'Jacoby Rule'
                  , type    : 'confirm'
                  , default : () => opts.isJacoby
                }
            }
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , when  : () => isRobot || isRobots
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => opts.delay
                  , validate : value => !isNaN(+value) && +value >= 0 || 'Please enter a number >= 0'
                }
            }
          , {
                value : 'quit'
              , name  : 'Cancel'
            }
        ])
    }

    getMainChoices() {
        return Menu.formatChoices([
            {
                value : 'newLocal'
              , name  : 'New Local Match'
            }
          , {
                value : 'newOnline'
              , name  : 'New Online Match'
            }
          , {
                value : 'joinOnline'
              , name  : 'Join Online Match'
            }
          , {
                value : 'playRobot'
              , name  : 'Play a Robot'
            }
          , {
                value : 'watchRobots'
              , name  : 'Watch Robots Play'
            }
          , {
                value : 'settings'
              , name  : 'Settings'
            }
          , {
                value : 'quit'
              , name  : 'Quit'
            }
        ])
    }

    getSettingsChoices(opts) {
        return Menu.formatChoices([
            {
                value : 'done'
              , name  : 'Done'
            }
          , {
                value : 'serverUrl'
              , name  : 'Server URL'
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => opts.serverUrl
                }
            }
          , {
                value    : 'isRecord'
              , name     : 'Record Matches'
              , question : {
                    name    : 'isRecord'
                  , message : 'Record Matches'
                  , type    : 'confirm'
                  , default : () => opts.isRecord
                }
            }
          , {
                value    : 'recordDir'
              , name     : 'Record Dir'
              , when     : () => opts.isRecord
              , question : {
                    name    : 'recordDir'
                  , message : 'Record Dir'
                  , type    : 'input'
                  , default : () => opts.recordDir
                }
            }
        ])
    }

    getJoinQuestions(opts) {
        return [
            {
                name     : 'matchId'
              , message  : 'Match ID'
              , type     : 'input'
              , validate : value => value.length == 8 || 'Invalid match ID format'
            }
        ]
    }

    getDefaultOpts() {
        return {
            total      : 1
          , isJacoby   : false
          , isCrawford : true
          , delay      : 0.5
          , serverUrl  : this.getDefaultServerUrl()
          , isRecord   : false
          , recordDir  : this.getDefaultRecordDir()
        }
    }

    getDefaultServerUrl() {
        return DefaultServerUrl
    }

    getDefaultRecordDir() {
        return resolve(os.homedir(), 'gameon')
    }

    static doMainIfEquals(lhs, rhs) {
        if (lhs === rhs) {
            Menu.main(new Menu)
        }
    }

    static formatChoices(choices) {
        const maxLength = Math.max(...choices.map(choice => choice.name.length))
        choices.forEach(choice => {
            if (choice.question) {
                choice.name = sp(choice.name.padEnd(maxLength + 1, ' '), ':', choice.question.default())
            }
        })
        return choices.filter(choice => !('when' in choice) || choice.when())
    }
}

Menu.main = menu => {
    menu.mainMenu()
    return menu
}

Menu.doMainIfEquals(require.main, module)

module.exports = Menu
