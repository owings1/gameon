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
const Dice      = require('../../lib/dice')
const Util      = require('../../lib/util')

const Themes = require('../themes')
const Robot  = require('../../robot/player')

const {ConfidenceRobot} = Robot
const {RobotDelegator}  = Robot

const {Board} = Core
const {StringBuilder} = Util

const fs    = require('fs')
const fse   = require('fs-extra')
const path  = require('path')

const {
    append,
    errMessage,
    homeTilde,
    isCredentialsFilled,
    padEnd,
    padStart,
    sp,
    stringWidth,
    tildeHome,
} = Util


const {Chars} = Constants
const {
    MainChoiceMap
  , PlayChoiceMap
} = Constants.Menu

function getDiffChalk(a, b, chlk) {
    if (a == b) {
        return sp
    }
    const isLess = typeof a == 'string' ? a.localeCompare(b) < 0 : a < b
    return isLess ? chlk.minus : chlk.plus
}

function chalkDiff(value, defaultValue, chlk) {
    return getDiffChalk(value, defaultValue, chlk)(value.toString())
}

function weightValidator(value) {
    return errMessage(() =>
        RobotDelegator.validateWeight(value)
    )
}

function stateValidator(value) {
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

function rollsFileValidator(value) {
    if (!value.length) {
        return true
    }
    const data = fse.readJsonSync(value)
    return errMessage(() => Dice.validateRollsData(data))
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
        this._menu = menu
    }

    menu(title, extra) {
        const menu = this._menu
        const {settings} = menu
        const name = title.toLowerCase()
        switch (name) {
            case 'main':
                return {
                    message : title
                  , choices : this.mainChoices(extra)
                }
            case 'play':
                return {
                    message : title
                  , choices : this.playChoices(extra)
                  , default : () => settings.lastPlayChoice
                }
            case 'match':
                return {
                    message : PlayChoiceMap[extra].message
                  , choices : this.matchChoices(extra)
                  , default : () => menu.lastToggleChoice
                  , action  : {char: 'tab', name: '#toggle', all: false}
                    // this skips the match menu for joinOnline
                  , answer  : PlayChoiceMap[extra].matchAnswer
                }
            case 'account':
                return {
                    message : title
                  , choices : this.accountChoices(extra)
                }
            case 'settings':
                return {
                    message  : title
                  , choices  : this.settingsChoices(extra)
                  , default  : () => menu.lastMenuChoice
                  , action   : {char: 'tab', name: '#toggle', all: false}
                }
            case 'robots':
                return {
                    message  : title
                  , choices  : this.robotsChoices(extra)
                }
            case 'robot':
                return {
                    message  : extra
                  , choices  : this.robotChoices(extra)
                }
            }
    }

    mainChoices() {
        const menu = this._menu
        const entries = Object.entries(MainChoiceMap)
        const entryChoice = ([value, {name, select}]) => ({name, value, select})
        return this.formatChoices([
            this.br()
          , ...entries.map(entryChoice)
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
        const menu = this._menu
        const entries = Object.entries(PlayChoiceMap)
        const entryChoice = ([name, {message}]) => ({value: name, name: message})
        return this.formatChoices([
            this.br()
          , ...entries.filter(([name, {isOnline}]) => isOnline).map(entryChoice)
          , this.hr()
          , ...entries.filter(([name, {isOnline}]) => !isOnline).map(entryChoice)
          , this.hr()
          , {
                value : 'back'
              , name  : 'Back'
              , when  : menu.bread.length > 1
              , enter : EnterChars.back
            }
          , {
                value  : 'quit'
              , name   : 'Quit'
              , select : 'q'
            }
          , this.br()
        ])
    }

    matchChoices(playChoice) {
        const menu = this._menu
        const {isOnline, isJoin} = PlayChoiceMap[playChoice]
        return this.formatChoices(
            this.matchInitialChoices(playChoice).concat([
                // only show advanced for local matches
                {
                    value : 'advanced'
                  , name  : 'Advanced'
                  , when  : !isOnline
                }
              , this.hr().when(!isOnline)
              , {
                    value : 'back'
                  , name  : 'Back'
                  , when  : menu.bread.length > 1
                  , enter : EnterChars.back
                }
              , {
                    value  : 'quit'
                  , name   : 'Quit'
                  , select : 'q'
                }
              , this.br()
            ])
        )
    }

    matchInitialChoices(playChoice) {
        const menu = this._menu
        const {matchOpts} = menu.settings
        
        return [
            this.br()
          , {
                value    : 'start'
              , name     : 'Start Match'
              , select   : 's'
              , question : PlayChoiceMap[playChoice].isJoin ? this.matchId() : null
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
                  , default  : () => matchOpts.total
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
                  , default : () => matchOpts.cubeEnabled
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value  : 'isCrawford'
              , name   : 'Crawford Rule'
              , when   : () => matchOpts.cubeEnabled
              , action : ['#toggle']
              , question : {
                    name    : 'isCrawford'
                  , message : 'Crawford Rule'
                  , type    : 'confirm'
                  , default : () => matchOpts.isCrawford
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
                  , default : () => matchOpts.isJacoby
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , this.hr()
        ]
    }

    matchAdvanced(advancedOpts) {
        advancedOpts = advancedOpts || {}
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

    matchId() {
        return {
            name     : 'matchId'
          , message  : 'Match ID'
          , type     : 'input'
          , validate : value => !value || value.length == 8 || 'Invalid match ID format'
          , cancel   : CancelChars.input
        }
    }

    accountChoices() {
        const menu = this._menu
        const {credentials} = menu
        const isFilled = isCredentialsFilled(credentials)
        const {needsConfirm} = credentials
        const hasCredential = credentials.username || credentials.password
        return this.formatChoices([
            this.br()
          , {
                value : 'done'
              , name  : 'Done'
              , enter : EnterChars.back
            }
        ]).concat(this.formatChoices([
            this.hr()
          , {
                value : 'serverUrl'
              , name  : 'Server'
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => credentials.serverUrl
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
        ])).concat(this.formatChoices([
            {
                value : 'createAccount'
              , name  : 'Create Account'
              , when  : !isFilled
            }
          , {
                value : 'forgotPassword'
              , name  : 'Forgot Password'
              , when  : !isFilled
            }
          , {
                value : 'confirmAccount'
              , name  : 'Enter confirm key'
              , when  : isFilled && needsConfirm
            }
          , {
                value : 'newConfirmKey'
              , name  : 'Get new confirm key'
              , when  : isFilled && needsConfirm
            }
          , this.hr().when(isFilled && needsConfirm)
          , {
                value : 'testCredentials'
              , name  : 'Test Credentials'
              , when  : isFilled && !needsConfirm
            }
          , {
                value : 'changePassword'
              , name  : 'Change Password'
              , when  : isFilled && !needsConfirm
            }
          , {
                value : 'clearCredentials'
              , name  : 'Clear Credentials'
              , when  : hasCredential
            }
          , this.br()
        ]))
    }

    username() {
        const menu = this._menu
        const {credentials} = menu
        const checkMark = menu.theme.prompt.check.pass(Chars.check)
        const checkSuffix = credentials.isTested ? ' ' + checkMark : ''
        return {
            name    : 'username'
          , message : 'Username'
          , type    : 'input'
          , default : () => credentials.username
          , display : () => credentials.username + checkSuffix
          , cancel  : CancelChars.input
          , when    : answers => !answers._cancelEvent
          , restore : RestoreChars.input
          , expand  : ExpandChars.input
        }
    }

    password() {
        const {credentials} = this._menu
        return {
            name    : 'password'
          , message : 'Password'
          , type    : 'password'
          , default : () => credentials.password
          , display : () => credentials.password ? '******' : ''
          , mask    : '*'
          , cancel  : CancelChars.password
          , when    : answers => !answers._cancelEvent
          , restore : RestoreChars.password
        }
    }

    passwordConfirm(checkKey = 'password') {
        const validator = (value, answers) => {
            return value == answers[checkKey] || 'Passwords do not match'
        }
        return {
            name     : 'passwordConfirm'
          , message  : 'Confirm password'
          , type     : 'password'
          , validate : validator
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
            {
                name    : 'resetKey'
              , type    : 'input'
              , message : 'Enter reset key'
              , prefix  : 'Reset key requested, check your email.\n'
              , cancel  : CancelChars.input
            }
          , {
                ...this.password()
              , message : 'New password'
              , when    : answers => !answers._cancelEvent && answers.resetKey
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
          , prefix  : [
                'You must confirm your account.'
              , 'Check your email for a confirmation key.'
              , ''
            ].join('\n')
          , cancel  : CancelChars.input
        }
    }

    settingsChoices() {
        const menu = this._menu
        const {settings} = menu
        const delayValidator = value => {
            return !isNaN(value) && value >= 0 || 'Please enter a number >= 0'
        }
        return this.formatChoices([
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
                  , default : () => settings.theme
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
                  , default : () => settings.termEnabled
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
                  , default : () => settings.fastForced
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
                  , default : () => homeTilde(settings.recordDir)
                  , filter  : value => !value ? null : path.resolve(tildeHome(value))
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
                  , default : () => settings.isRecord
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
                  , default  : () => settings.delay
                  , filter   : value => +value
                  , validate : delayValidator
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
                  , default : () => settings.isCustomRobot
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value : 'robotConfigs'
              , name  : 'Robot Configuration'
              , when  : settings.isCustomRobot
            }
          , this.br()
        ])
    }

    robotsChoices() {
        const menu = this._menu
        const {settings} = menu
        const chlk = menu.theme.diff
        const entries = Object.entries(menu.robotsDefaults())
        return this.formatChoices([
            this.br()
          , {
                value  : 'done'
              , name   : 'Done'
              , enter  : EnterChars.back
              , select : 'd'
            }
          , this.hr()
          , {
                value  : 'reset'
              , name   : 'Reset defaults'
              , select : 'r'
            }
          , this.hr()
          , ...entries.map(([name, defaults]) => (
                {
                    value    : name
                  , name     : name
                  , question : {
                        display : () => {
                            const config = settings.robots[name] || menu.robotMinimalConfig(name)
                            const b = new StringBuilder
                            b.sp(
                                chalkDiff(config.version, defaults.version, chlk) + ','
                              , 'move:'
                              , padEnd(chalkDiff(config.moveWeight, defaults.moveWeight, chlk), 4, ' ') + ','
                              , 'double:'
                              , chalkDiff(config.doubleWeight, defaults.doubleWeight, chlk)
                            )
                            return b.toString()
                        }
                    }
                }
            ))
          , this.br()
        ])
    }

    robotChoices(name) {
        const menu = this._menu
        const {defaults, versions} = menu.robotMeta(name)
        const chlk = menu.theme.diff
        const config = () => menu.settings.robots[name]
        return this.formatChoices([
            this.br()
          , {
                value  : 'done'
              , name   : 'Done'
              , enter  : EnterChars.back
              , select : 'd'
            }
          , this.hr()
          , {
                value  : 'reset'
              , name   : 'Reset defaults'
              , select : 'r'
            }
          , this.hr()
          , {
                value : 'version'
              , name  : 'Version'
              , select  : 'v'
              , question : {
                    name    : 'version'
                  , message : 'Version'
                  , type    : 'list'
                  , default : () => config().version
                  , display : () => chalkDiff(config().version, defaults.version, chlk)
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
                  , display  : () => chalkDiff(config().moveWeight, defaults.moveWeight, chlk)
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
                  , display  : () => chalkDiff(config().doubleWeight, defaults.doubleWeight, chlk)
                  , filter   : value => +value
                  , validate : weightValidator
                  , cancel   : CancelChars.input
                  , restore  : RestoreChars.input
                  , expand   : ExpandChars.input
                  , writeInvalid : () => ''
                }
            }
          , this.br()
        ])
    }

    br() {
        return new this._menu.inquirer.Separator('')
    }

    hr() {
        return new this._menu.inquirer.Separator()
    }

    formatChoices(choices) {

        const menu = this._menu

        choices = choices.filter(choice => {
            if (!('when' in choice)) {
                return true
            }
            if (typeof choice.when == 'function') {
                return choice.when()
            }
            return !!choice.when
        })

        const available = choices.filter(choice => choice.type != 'separator')
        const maxNameLength = Math.max(...available.map(choice => stringWidth(choice.name)))

        const menuBoxMaxWidth = menu.boxes.menu.params.maxWidth

        available.forEach((choice, i) => {

            const n = i + 1

            const numPad = available.length.toString().length - n.toString().length

            if ('name' in choice) {
                choice._originalName = choice.name
            }

            if (!('short' in choice)) {
                choice.short = choice.name
            }

            const {question} = choice

            if (!question) {
                return
            }

            if (!question.display && !question.default) {
                return
            }

            // The thisMaxWidth is just to avoid extra spaces by padding.
            // It doesn't break lines or truncate.

            // subtract pointer, paren, 2 spaces, and number string.
            const thisMaxWidth = menuBoxMaxWidth - 4 - n.toString().length

            const display = question.display ? question.display() : question.default()

            const bareText = sp(choice.name, ':', display)

            if (stringWidth(bareText) >= thisMaxWidth) {
                choice.name = bareText
            } else {
                choice.name = padEnd(choice.name, maxNameLength + numPad, ' ')
                choice.name = sp(choice.name, ':', display)
            }
        })

        return choices
    }
}

module.exports = Questions