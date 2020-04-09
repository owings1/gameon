const Core       = require('../lib/core')
const Logger     = require('../lib/logger')
const MonoPlayer = require('../player/mono-player')
const DualPlayer = require('../player/dual-player')
const Util       = require('../lib/util')

const {Match} = Core

const inquirer  = require('inquirer')
const sp        = Util.joinSpace

const DefaultServerUrl = 'ws://localhost:8080'

class Menu extends Logger {

    constructor() {
        super()
        this.matchOpts = this.getDefaultMatchOpts()
    }

    async mainMenu() {

        while (true) {

            var mainChoices = this.getMainChoices()

            var answers = await this.prompt({
                name    : 'mainChoice'
              , message : 'Select option'
              , type    : 'rawlist'
              , choices : mainChoices
            })

            var {mainChoice} = answers

            if (mainChoice == 'quit') {
                break
            }

            if (mainChoice == 'joinOnline') {
                await this.joinMenu()
            } else {
                await this.matchMenu(mainChoice == 'newOnline', mainChoice == 'playRobot', mainChoice == 'watchRobots')
            }
        }
    }

    async matchMenu(isOnline, isRobot, isRobots) {

        const {matchOpts} = this

        while (true) {

            var matchChoices = this.getMatchChoices(matchOpts, isOnline, isRobot, isRobots)

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
                    await this.startOnlineMatch(matchOpts)
                } else if (isRobot) {
                    await this.playRobot(matchOpts)
                } else if (isRobots) {
                    await this.playRobots(matchOpts)
                } else {
                    await this.playLocalMatch(matchOpts)
                }
                continue
            }

            var question = matchChoices.find(choice => choice.value == matchChoice).question

            answers = await this.prompt(question)

            matchOpts[question.name] = answers[question.name]
            matchOpts.total = +matchOpts.total
            matchOpts.delay = +matchOpts.delay
        }
    }

    async joinMenu() {
        const {matchOpts} = this
        const questions = this.getJoinQuestions(matchOpts)
        const answers = await this.prompt(questions)
        if (!answers.matchId || !answers.serverUrl) {
            return
        }
        matchOpts.serverUrl = answers.serverUrl
        matchOpts.matchId = answers.matchId
        await this.joinOnlineMatch(matchOpts)
    }

    async playLocalMatch(matchOpts) {
        const player = this.newLocalPlayer()
        const match = new Match(matchOpts.total, matchOpts)
        await this.playMatch(player, match)
    }

    async startOnlineMatch(matchOpts) {
        const player = this.newSocketPlayer(matchOpts.serverUrl)
        try {
            var match = await player.startMatch(matchOpts)
        } catch (err) {
            this.error(err)
            return
        }
        await this.playMatch(player, match)
    }

    async playRobot(matchOpts) {
        const player = this.newVsRobotPlayer(matchOpts.delay)
        const match = new Match(matchOpts.total, matchOpts)
        await this.playMatch(player, match)
    }

    async playRobots(matchOpts) {
        const player = this.newRobotsPlayer(matchOpts.delay)
        const match = new Match(matchOpts.total, matchOpts)
        await this.playMatch(player, match)
    }

    async joinOnlineMatch(matchOpts) {
        const player = this.newSocketPlayer(matchOpts.serverUrl)
        try {
            var match = await player.joinMatch(matchOpts.matchId)
        } catch (err) {
            this.error(err)
            return
        }
        await this.playMatch(player, match)
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

    newLocalPlayer() {
        return new MonoPlayer.PromptPlayer
    }

    newSocketPlayer(serverUrl) {
        return new MonoPlayer.SocketPlayer(serverUrl)
    }

    newRobotsPlayer(delay) {
        return new MonoPlayer.RandomPlayer(delay)
    }

    newVsRobotPlayer(delay) {
        return new DualPlayer(this.newLocalPlayer(), this.newRobotsPlayer(delay))
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    getMatchChoices(matchOpts, isOnline, isRobots) {
        return Menu.formatChoices([
            {
                value : 'start'
              , name  : 'Start Match'
            }
          , {
                value : 'serverUrl'
              , name  : 'Server URL'
              , when  : () => isOnline
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => matchOpts.serverUrl
                }
            }
          , {
                value : 'total'
              , name  : 'Match Total'
              , question : {
                    name     : 'total'
                  , message  : 'Match Total'
                  , type     : 'input'
                  , default  : () => '' + matchOpts.total
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
                  , default : () => matchOpts.isCrawford
                }
            }
          , {
                value : 'isJacoby'
              , name  : 'Jacoby Rule'
              , question : {
                    name    : 'isJacoby'
                  , message : 'Jacoby Rule'
                  , type    : 'confirm'
                  , default : () => matchOpts.isJacoby
                }
            }
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , when  : () => isRobots
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => matchOpts.delay
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
                value : 'quit'
              , name  : 'Quit'
            }
        ])
    }

    getJoinQuestions(matchOpts) {
        return [
            {
                name     : 'matchId'
              , message  : 'Match ID'
              , type     : 'input'
              , validate : value => value.length == 8 || 'Invalid match ID format'
            }
          , {
                name    : 'serverUrl'
              , message : 'Server URL'
              , type    : 'input'
              , default : () => matchOpts.serverUrl
            }
        ]
    }

    getDefaultMatchOpts() {
        return {
            total      : 1
          , isJacoby   : false
          , isCrawford : true
          , delay      : 0.5
          , serverUrl  : this.getDefaultServerUrl()
        }
    }

    getDefaultServerUrl() {
        return DefaultServerUrl
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
