const Core   = require('../lib/core')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const Coordinator   = require('../lib/coordinator')
const Client        = require('../net/client')
const NetPlayer     = require('../net/player')
const TermPlayer    = require('./player')
const Robot         = require('../robot/player')

const {White, Red, Match} = Core

const fs       = require('fs')
const fse      = require('fs-extra')
const inquirer = require('inquirer')
const os       = require('os')
const path     = require('path')
const sp       = Util.joinSpace

const DefaultServerUrl = 'wss://bg.dougowings.net'
const ObsoleteServerUrls = [
    'ws://bg.dougowings.net:8080'
]

class Menu extends Logger {

    constructor(optsFile) {
        super()
        this.optsFile = optsFile
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

        await this.saveOpts()
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
                break
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
        }

        await this.saveOpts()
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
            opts.delay = +opts.delay
        }

        await this.saveOpts()
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
        const coordinator = this.newCoordinator(opts)
        const match = new Match(opts.total, opts)
        const players = {
            White : new TermPlayer(White, opts)
          , Red   : new TermPlayer(Red, opts)
        }
        try {
            await coordinator.runMatch(match, players.White, players.Red)
        } catch (err) {
            if (err.name == 'MatchCanceledError') {
                this.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            await this.destroyAll(players)
        }
    }

    async startOnlineMatch(opts) {
        const coordinator = this.newCoordinator(opts)
        const client = this.newClient(opts.serverUrl)
        await client.connect()
        try {
            const match = await client.startMatch(opts)
            const players = {
                White : new TermPlayer(White, opts)
              , Red   : new NetPlayer(client, Red)
            }
            try {
                await coordinator.runMatch(match, players.White, players.Red)
            } finally {
                await this.destroyAll(players)
            }
        } catch (err) {
            if (err.name == 'MatchCanceledError') {
                this.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            await client.close()
        }
    }

    async joinOnlineMatch(opts) {
        const coordinator = this.newCoordinator(opts)
        const client = this.newClient(opts.serverUrl)
        await client.connect()
        try {
            const match = await client.joinMatch(opts.matchId)
            const players = {
                White : new NetPlayer(client, White)
              , Red   : new TermPlayer(Red, opts)
            }
            try {
                await coordinator.runMatch(match, players.White, players.Red)
            } finally {
                await this.destroyAll(players)
            }
        } catch (err) {
            if (err.name == 'MatchCanceledError') {
                this.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            await client.close()
        }
    }

    async playRobot(opts) {
        const coordinator = this.newCoordinator(opts)
        const match = new Match(opts.total, opts)
        const players = {
            White : new TermPlayer(White, opts)
          , Red   : new TermPlayer.Robot(new Robot.BestRobot(Red), opts)
        }
        try {
            await coordinator.runMatch(match, players.White, players.Red)
        } catch (err) {
            if (err.name == 'MatchCanceledError') {
                this.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            await this.destroyAll(players)
        }
    }

    async playRobots(opts) {
        const coordinator = this.newCoordinator(opts)
        const match = new Match(opts.total, opts)
        const players = {
            White : new TermPlayer.Robot(new Robot.BestRobot(White), opts)
          , Red   : new TermPlayer.Robot(new Robot.BestRobot(Red), opts)
        }
        try {
            await coordinator.runMatch(match, players.White, players.Red)
        } finally {
            await this.destroyAll(players)
        }
    }

    async destroyAll(players) {
        await Promise.all(Object.values(players).map(player => player.destroy()))
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
                value : 'quit'
              , name  : 'Back'
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
                value : 'fastForced'
              , name  : 'Fast Forced Moves'
              , question : {
                    name    : 'fastForced'
                  , message : 'Fast Forced Moves'
                  , type    : 'confirm'
                  , default : () => opts.fastForced
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
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => opts.delay
                  , validate : value => !isNaN(+value) && +value >= 0 || 'Please enter a number >= 0'
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
              , validate : value => !value || value.length == 8 || 'Invalid match ID format'
            }
        ]
    }

    getDefaultOpts() {
        const opts = {}
        if (this.optsFile) {
            fse.ensureDirSync(path.dirname(this.optsFile))
            if (!fs.existsSync(this.optsFile)) {
                fse.writeJsonSync(this.optsFile, {})
            }
            Util.merge(opts, JSON.parse(fs.readFileSync(this.optsFile)))
            if (ObsoleteServerUrls.indexOf(opts.serverUrl) > -1) {
                opts.serverUrl = this.getDefaultServerUrl()
            }
        }
        return Util.merge({
            total      : 1
          , isJacoby   : false
          , isCrawford : true
          , delay      : 0.5
          , serverUrl  : this.getDefaultServerUrl()
          , isRecord   : false
          , recordDir  : this.getDefaultRecordDir()
          , fastForced : false
        }, opts)
    }

    async saveOpts() {
        if (this.optsFile) {
            await fse.ensureDir(path.dirname(this.optsFile))
            await fse.writeJson(this.optsFile, this.opts, {spaces: 2})
        }
    }

    getDefaultServerUrl() {
        return DefaultServerUrl
    }

    getDefaultRecordDir() {
        return path.resolve(os.homedir(), 'gameon')
    }

    newCoordinator(opts) {
        return new Coordinator(opts)
    }

    newClient(serverUrl) {
        return new Client(serverUrl)
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
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

module.exports = Menu
