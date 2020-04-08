const Lib    = require('../lib/game')
const Logger = require('../lib/logger')
const Player = require('./play')
const Util   = require('../lib/util')

const {Match} = Lib

const inquirer  = require('inquirer')
const sp        = Util.joinSpace

const DefaultServerUrl = 'ws://localhost:8080'

class Menu extends Logger {

    constructor() {
        super()
        this.serverUrl = this.getDefaultServerUrl()
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
                await this.joinOnlineMatch()
            } else {
                await this.matchMenu(mainChoice == 'newOnline')
            }
        }
    }

    newLocalPlayer() {
        return new Player.LocalPlayer
    }

    newSocketPlayer(serverUrl) {
        return new Player.SocketPlayer(this.serverUrl)
    }

    async matchMenu(isOnline) {

        const {matchOpts} = this

        while (true) {

            var matchChoices = this.getMatchChoices(matchOpts, isOnline)

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
                } else {
                    await this.playLocalMatch(matchOpts)
                }
                continue
            }

            var question = matchChoices.find(choice => choice.value == matchChoice).question

            answers = await this.prompt(question)

            matchOpts[question.name] = answers[question.name]
            matchOpts.total = +matchOpts.total
            if (question.name == 'serverUrl') {
                this.serverUrl = answers[question.name]
            }
        }
    }

    async playLocalMatch(matchOpts) {
        const player = this.newLocalPlayer()
        await player.playMatch(new Match(matchOpts.total, matchOpts))
    }

    async startOnlineMatch(matchOpts) {
        const player = this.newSocketPlayer(matchOpts.serverUrl)
        await player.startMatch(matchOpts)
    }

    async joinOnlineMatch() {
        const questions = this.getJoinQuestions()
        const answers = await this.prompt(questions)
        if (!answers.matchId || !answers.serverUrl) {
            return
        }
        this.serverUrl = answers.serverUrl
        const player = this.newSocketPlayer(this.serverUrl)
        try {
            await player.joinMatch(answers.matchId)
        } catch (err) {
            if (err.name == 'MatchNotFoundError') {
                this.error(err)
            } else {
                throw err
            }
        }
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    getMatchChoices(matchOpts, isOnline) {
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
                  , default : () => this.serverUrl
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
                        return !isNaN(value) && Number.isInteger(value) && value > 0 || 'Please enter a number > 0'
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
                value : 'quit'
              , name  : 'Quit'
            }
        ])
    }

    getJoinQuestions() {
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
              , default : () => this.serverUrl
            }
        ]
    }

    getDefaultMatchOpts() {
        return {
            total      : 1
          , isJacoby   : false
          , isCrawford : true
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

Menu.main = function(menu) {
    menu.mainMenu()
    return menu
}

Menu.doMainIfEquals(require.main, module)

module.exports = Menu
