/**
 * gameon - Menu Questions Helper
 *
 * Copyright (C) 2020-2021 Doug Owings
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const Constants = require('../../lib/constants')
const Core      = require('../../lib/core')
const Util      = require('../../lib/util')

const Themes = require('../themes')
const Robot  = require('../../robot/player')

const {ConfidenceRobot} = Robot
const {RobotDelegator}  = Robot

const {Board, Dice} = Core
const {StringBuilder} = Util

const chalk = require('chalk')
const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {
    append
  , errMessage
  , homeTilde
  , padStart
  , sp
  , tildeHome
} = Util


const {Chars} = Constants
const {PlayChoiceMap} = Constants.Menu

function isCredentialsFilled(credentials, isServer) {
    const keys = ['username', 'password']
    if (isServer) {
        keys.push('serverUrl')
    }
    return !keys.find(key => !credentials[key])
}

function getDiffChalk(a, b) {
    if (a == b) {
        return sp
    }
    const isLess = typeof a == 'string' ? a.localeCompare(b) < 0 : a < b
    return isLess ? chalk.bold.red : chalk.bold.green
}

function chalkDiff(value, defaultValue) {
    return getDiffChalk(value, defaultValue)(value.toString())
}

const CancelChars = {
    bool     : ['escape', '<', '`']
  , input    : ['escape']
  , list     : ['escape', '<']
  , password : ['escape']
}
const EnterChars = {
    back : ['escape', '`', '<']
  , quit : ['escape', '`']
}
const ExpandChars = {
    input: ['right']
}
const RestoreChars = {
    input    : ['up']
  , password : ['up']
}
const ToggleChars = {
    bool: ['up', 'down']
}

class Questions {

    constructor(menu) {
        this.menu = menu
    }

    mainChoices() {
        const {menu} = this
        return Questions.formatChoices([
            this.br()
          , {
                value  : 'play'
              , name   : 'Play'
              , select : 'p'
            }
          , {
                value  : 'account'
              , name   : 'Account'
              , select : 'a'
            }
          , {
                value  : 'settings'
              , name   : 'Settings'
              , select : 's'
            }
          , {
                value  : 'lab'
              , name   : 'Lab'
              , select : 'l'
            }
          , this.hr()
          , {
                value  : 'quit'
              , name   : 'Quit'
              , select : 'q'
              , enter  : EnterChars.quit
            }
          , this.br()
        ])
    }

    playChoices() {
        const {menu} = this
        const choices = [
            this.br()
          , {
                value : 'startOnline'
              , name  : 'Create Online Match'
            }
          , {
                value : 'joinOnline'
              , name  : 'Join Online Match'
            }
          , this.hr()
          , {
                value : 'playHumans'
              , name  : 'Human vs Human'
            }
          , {
                value : 'playRobot'
              , name  : 'Human vs Robot'
            }
          , {
                value : 'playRobots'
              , name  : 'Robot vs Robot'
            }
          , this.hr()
        ]
        if (menu.bread.length > 1) {
            choices.push({
                value : 'back'
              , name  : 'Back'
              , enter : EnterChars.back
            })
        }
        append(choices, [
            {
                  value  : 'quit'
                , name   : 'Quit'
                , select : 'q'
            }
          , this.br()
        ])
        return Questions.formatChoices(choices)
    }

    matchChoices(playChoice) {
        const {menu} = this
        const {isOnline} = PlayChoiceMap[playChoice]
        const choices = this.matchInitialChoices()
        // only show advanced for local matches
        if (!isOnline) {
            append(choices, [
                {
                    value : 'advanced'
                  , name  : 'Advanced'
                }
              , this.hr()
            ])
        }
        if (menu.bread.length > 1) {
            choices.push({
                value : 'back'
              , name  : 'Back'
              , enter : EnterChars.back
            })
        }
        append(choices, [
            {
                value  : 'quit'
              , name   : 'Quit'
              , select : 'q'
            }
          , this.br()
        ])
        return Questions.formatChoices(choices)
    }

    matchInitialChoices() {
        const {menu} = this
        return [
            this.br()
          , {
                value  : 'start'
              , name   : 'Start Match'
              , select : 's'
            }
          , this.hr()
          , {
                value : 'total'
              , name  : 'Match Total'
              , select  : 't'
              , question : {
                    name     : 'total'
                  , message  : 'Match Total'
                  , type     : 'input'
                  , default  : () => menu.settings.matchOpts.total
                  , validate : value => Number.isInteger(value) && value > 0 || 'Please enter a number > 0'
                  , filter   : value => +value
                  , cancel   : CancelChars.input
                  , restore  : RestoreChars.input
                  , expand   : ExpandChars.input
                }
            }
          , {
                value  : 'cubeEnabled'
              , name   : 'Cube Enabled'
              , action : ['#toggle']
              , question : {
                    name    : 'cubeEnabled'
                  , message : 'Cube Enabled'
                  , type    : 'confirm'
                  , default : () => menu.settings.matchOpts.cubeEnabled
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value  : 'isCrawford'
              , name   : 'Crawford Rule'
              , when   : () => menu.settings.matchOpts.cubeEnabled
              , action : ['#toggle']
              , question : {
                    name    : 'isCrawford'
                  , message : 'Crawford Rule'
                  , type    : 'confirm'
                  , default : () => menu.settings.matchOpts.isCrawford
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value  : 'isJacoby'
              , name   : 'Jacoby Rule'
              , action : ['#toggle']
              , question : {
                    name    : 'isJacoby'
                  , message : 'Jacoby Rule'
                  , type    : 'confirm'
                  , default : () => menu.settings.matchOpts.isJacoby
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , this.hr()
        ]
    }

    matchAdvanced(advancedOpts) {
        advancedOpts = advancedOpts || {}
        const stateValidator = value => {
            if (!value.length) {
                return true
            }
            try {
                Board.fromStateString(value).analyzer.validateLegalBoard()
            } catch (err) {
                return err.message
            }
            return true
        }
        const rollsFileValidator = value => {
            if (!value.length) {
                return true
            }
            const data = fse.readJsonSync(value)
            return errMessage(() => Dice.validateRollsData(data))
        }
        return [
            {
                name     : 'startState'
              , message  : 'Start State'
              , type     : 'input'
              , default  : () => advancedOpts.startState
              , validate : stateValidator
              , cancel   : CancelChars.input
            }
          , {
                name     : 'rollsFile'
              , message  : 'Rolls File'
              , type     : 'input'
              , default  : () => homeTilde(advancedOpts.rollsFile)
              , filter   : value => tildeHome(value)
              , validate : rollsFileValidator
              , cancel   : CancelChars.input
              , when     : answers => !answers._cancelEvent
            }
        ]
    }

    join() {
        return {
            name     : 'matchId'
          , message  : 'Match ID'
          , type     : 'input'
          , validate : value => !value || value.length == 8 || 'Invalid match ID format'
          , cancel   : CancelChars.input
        }
    }

    accountChoices() {
        const {menu} = this
        const choices = [
            this.br()
          , {
                value : 'done'
              , name  : 'Done'
              , enter : EnterChars.back
            }
          , this.hr()
          , {
                value : 'serverUrl'
              , name  : 'Server'
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => menu.credentials.serverUrl
                  , cancel  : CancelChars.input
                  , restore : RestoreChars.input
                  , expand  : ExpandChars.input
                }
            }
          , {
                value    : 'username'
              , name     : 'Username'
              , question : this.username()
            }
          , {
                value    : 'password'
              , name     : 'Password'
              , question : this.password()
            }
          , this.hr()
        ]
        if (!isCredentialsFilled(menu.credentials)) {
            append(choices, [
                {
                    value : 'createAccount'
                  , name  : 'Create Account'
                }
              , {
                    value : 'forgotPassword'
                  , name  : 'Forgot Password'
                }
            ])
        } else {
            if (menu.credentials.needsConfirm) {
                append(choices, [
                    {
                        value : 'confirmAccount'
                      , name  : 'Enter confirm key'
                    }
                  , {
                        value : 'newConfirmKey'
                      , name  : 'Get new confirm key'
                    }
                  , this.hr()
                ])
            }
            append(choices, [
                {
                    value : 'testCredentials'
                  , name  : 'Test Credentials'
                }
              , {
                    value : 'changePassword'
                  , name  : 'Change Password'
                }
            ])
        }
        if (menu.credentials.username || menu.credentials.password) {
            choices.push({
                value : 'clearCredentials'
              , name  : 'Clear Credentials'
            })
        }
        choices.push(this.br())
        return Questions.formatChoices(choices)
    }

    username() {
        const {menu} = this
        const checkMark = menu.theme.prompt.check.pass(Chars.check)
        return {
            name    : 'username'
          , message : 'Username'
          , type    : 'input'
          , default : () => menu.credentials.username
          , display : () => menu.credentials.username + (menu.credentials.isTested ? ' ' + checkMark : '')
          , cancel  : CancelChars.input
          , when    : answers => !answers._cancelEvent
          , restore : RestoreChars.input
          , expand  : ExpandChars.input
        }
    }

    password() {
        const {menu} = this
        return {
            name    : 'password'
          , message : 'Password'
          , type    : 'password'
          , default : () => menu.credentials.password
          , display : () => menu.credentials.password ? '******' : ''
          , mask    : '*'
          , cancel  : CancelChars.password
          , when    : answers => !answers._cancelEvent
          , restore : RestoreChars.password
        }
    }

    passwordConfirm(checkKey = 'password') {
        return {
            name     : 'passwordConfirm'
          , message  : 'Confirm password'
          , type     : 'password'
          , validate : (value, answers) => value == answers[checkKey] || 'Passwords do not match'
          , mask     : '*'
          , cancel   : CancelChars.password
          , when     : answers => !answers._cancelEvent
        }
    }

    changePassword() {
        return [
            {
                ...this.password()
              , name    : 'oldPassword'
              , message : 'Current password'
              , default : ''
            }
          , {
                ...this.password()
              , name    : 'newPassword'
              , message : 'New password'
              , default : ''
            }
          , this.passwordConfirm('newPassword')
        ]
    }

    forgotPassword() {
        return [
            this.resetKey()
          , {
                ...this.password()
              , when: answers => !answers._cancelEvent && answers.resetKey
            }
          , {
                ...this.passwordConfirm()
              , when: answers => !answers._cancelEvent && answers.resetKey
            }
        ]
    }

    createAccount() {
        return [
            this.username()
          , this.password()
          , this.passwordConfirm()
        ]
    }

    confirmKey() {
        return {
            name    : 'key'
          , type    : 'input'
          , message : 'Enter confirm key'
          , cancel  : CancelChars.input
        }
    }

    resetKey() {
        return {
            name    : 'resetKey'
          , message : 'Reset Key'
          , type    : 'input'
          , cancel  : CancelChars.input
        }
    }

    settingsChoices() {
        const {menu} = this
        return Questions.formatChoices([
            this.br()
          , {
                value  : 'done'
              , name   : 'Done'
              , enter  : EnterChars.back
              , select : 'd'
            }
          , this.hr()
          , {
                value : 'theme'
              , name  : 'Theme'
              , question : {
                    name : 'theme'
                  , message : 'Choose a theme'
                  , type    : 'list'
                  , default : () => menu.settings.theme
                  , choices : () => [this.br()].concat(Themes.list())
                  , cancel  : CancelChars.list
                  , prefix  : ''
                }
            }
          , {
                value  : 'termEnabled'
              , name   : 'Term Cursoring'
              , action : ['#toggle']
              , question : {
                    name    : 'termEnabled'
                  , message : 'Enable term cursoring'
                  , type    : 'confirm'
                  , default : () => menu.settings.termEnabled
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , this.hr()
          , {
                value  : 'fastForced'
              , name   : 'Fast Forced Moves'
              , action : ['#toggle']
              , question : {
                    name    : 'fastForced'
                  , message : 'Fast Forced Moves'
                  , type    : 'confirm'
                  , default : () => menu.settings.fastForced
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value    : 'recordDir'
              , name     : 'Record Dir'
              , question : {
                    name    : 'recordDir'
                  , message : 'Record Dir'
                  , type    : 'input'
                  , default : () => homeTilde(menu.settings.recordDir)
                  , filter  : value => value == null ? null : path.resolve(tildeHome(value))
                  , cancel  : CancelChars.input
                  , clear   : 'ctrl-delete'
                  , restore : RestoreChars.input
                  , expand  : ExpandChars.input
                }
            }
          , {
                value    : 'isRecord'
              , name     : 'Record Matches'
              , action   : ['#toggle']
              , question : {
                    name    : 'isRecord'
                  , message : 'Record Matches'
                  , type    : 'confirm'
                  , default : () => menu.settings.isRecord
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , this.hr()
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => menu.settings.delay
                  , filter   : value => +value
                  , validate : value => !isNaN(value) && value >= 0 || 'Please enter a number >= 0'
                  , cancel   : CancelChars.input
                  , restore  : RestoreChars.input
                  , expand   : ExpandChars.input
                  , writeInvalid : () => ''
                }
            }
          , {
                value    : 'isCustomRobot'
              , name     : 'Use Custom Robot'
              , action   : ['#toggle']
              , question : {
                    name    : 'isCustomRobot'
                  , message : 'Use Custom Robot'
                  , type    : 'confirm'
                  , default : () => menu.settings.isCustomRobot
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value : 'robotConfigs'
              , name  : 'Robot Configuration'
              , when  : () => menu.settings.isCustomRobot
            }
          , this.br()
        ])
    }

    robotConfigsChoices() {
        const {menu} = this
        return Questions.formatChoices([
            {
                value  : 'done'
              , name   : 'Done'
              , enter  : EnterChars.back
              , select : 'd'
            }
          , {
                value  : 'reset'
              , name   : 'Reset defaults'
              , select : 'r'
            }
          , ...RobotDelegator.listClassNames().map(name => {
                const {defaults} = ConfidenceRobot.getClassMeta(name)
                return {
                    value    : name
                  , name     : name
                  , question : {
                        display : () => {
                            const config = menu.settings.robots[name] || {
                                version      : defaults.version
                              , moveWeight   : 0
                              , doubleWeight : 0
                            }
                            const b = new StringBuilder
                            b.sp(
                                'version:'
                              , chalkDiff(config.version, defaults.version) + ','
                              , 'moveWeight:'
                              , padStart(chalkDiff(config.moveWeight, defaults.moveWeight), 4, ' ') + ','
                              , 'doubleWeight:'
                              , chalkDiff(config.doubleWeight, defaults.doubleWeight)
                            )
                            return b.toString()
                        }
                    }
                }
            })
        ])
    }

    configureRobotChoices(name) {
        const {menu} = this
        const {defaults, versions} = ConfidenceRobot.getClassMeta(name)
        const config = () => menu.settings.robots[name]
        const weightValidator = value => errMessage(() =>
            RobotDelegator.validateWeight(value)
        )
        return Questions.formatChoices([
            {
                value  : 'done'
              , name   : 'Done'
              , enter  : EnterChars.back
              , select : 'd'
            }
          , {
                value  : 'reset'
              , name   : 'Reset defaults'
              , select : 'r'
            }
          , {
                value : 'version'
              , name  : 'Version'
              , select  : 'v'
              , question : {
                    name    : 'version'
                  , message : 'Version'
                  , type    : 'list'
                  , default : () => config().version
                  , display : () => chalkDiff(config().version, defaults.version)
                  , choices : () => Object.keys(versions)
                  , cancel  : CancelChars.list
                }
            }
          , {
                value : 'moveWeight'
              , name  : 'Move Weight'
              , select  : 'm'
              , question : {
                    name     : 'moveWeight'
                  , message  : 'Move Weight'
                  , type     : 'input'
                  , default  : () => config().moveWeight
                  , display  : () => chalkDiff(config().moveWeight, defaults.moveWeight)
                  , filter   : value => +value
                  , validate : weightValidator
                  , cancel   : CancelChars.input
                  , restore  : RestoreChars.input
                  , expand   : ExpandChars.input
                  , writeInvalid : () => ''
                }
            }
          , {
                value : 'doubleWeight'
              , name  : 'Double Weight'
              , select  : 'b'
              , question : {
                    name     : 'doubleWeight'
                  , message  : 'Double Weight'
                  , type     : 'input'
                  , default  : () => config().doubleWeight
                  , display  : () => chalkDiff(config().doubleWeight, defaults.doubleWeight)
                  , filter   : value => +value
                  , validate : weightValidator
                  , cancel   : CancelChars.input
                  , restore  : RestoreChars.input
                  , expand   : ExpandChars.input
                  , writeInvalid : () => ''
                }
            }
        ])
    }

    br() {
        return new this.menu.inquirer.BrSeparator()
    }

    hr() {
        return new this.menu.inquirer.Separator()
    }

    static formatChoices(choices) {
        choices = choices.filter(choice => !('when' in choice) || choice.when())
        const maxLength = Math.max(...choices.map(choice => choice.name ? choice.name.length : 0))
        var p = 1
        var i = 0
        choices.forEach(choice => {
            if (choice.type == 'separator') {
                return
            }
            if (i == 9) {
                p = 0
            }
            const {question} = choice
            if (question) {
                if (!('short' in choice)) {
                    choice.short = choice.name
                }
                const display = question.display ? question.display() : question.default()
                choice.name = sp(choice.name.padEnd(maxLength + p, ' '), ':', display)
            }
            i += 1
        })
        return choices
    }
}

module.exports = Questions