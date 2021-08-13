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
const {arrays: {append}} = require('utils-h')
const fse = require('fs-extra')

const fs    = require('fs')
const path  = require('path')

const Dice    = require('../../lib/dice.js')
const {Board} = require('../../lib/core.js')
const {Chars} = require('../../lib/constants.js')
const Themes  = require('../themes.js')
const Messages = require('./menu.messages.js')
const {
    errMessage,
    homeTilde,
    isCredentialsFilled,
    padEnd,
    padStart,
    sp,
    StringBuilder,
    stringWidth,
    tildeHome,
} = require('../../lib/util.js')
const {
    ConfidenceRobot,
    RobotDelegator,
} = require('../../robot/player.js')


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

const CancelChars = {
    bool     : ['escape', '<', '`'],
    input    : ['escape'],
    list     : ['escape', '<'],
    password : ['escape'],
}
const EnterChars = {
    back : ['escape', '`', '<'],
    quit : ['escape', '`'],
}
const ExpandChars = {
    input: ['right'],
}
const RestoreChars = {
    input    : ['up'],
    password : ['up'],
}
const ToggleChars = {
    bool: ['up', 'down'],
}

class Questions {

    constructor(menu) {
        this.menu = menu
        this.m = new Messages(menu)
    }

    menuq(name, extra) {
        const {menu, settings, m} = this
        switch (name) {
            case 'main':
                return {
                    message : name,
                    choices : this.mainChoices(extra),
                }
            case 'play':
                return {
                    message : name,
                    choices : this.playChoices(extra),
                    default : () => settings.lastPlayChoice,
                }
            case 'match':
                return {
                    message : m.play(extra),
                    choices : this.matchChoices(extra),
                    default : () => menu.lastToggleChoice,
                    action  : {char: 'tab', name: '#toggle', all: false},
                    // This skips the match menu for joinOnline.
                    answer  : extra === 'joinOnline' ? 'start' : null,
                }
            case 'account':
                return {
                    message : name,
                    choices : this.accountChoices(extra),
                }
            case 'settings':
                return {
                    message  : name,
                    choices  : this.settingsChoices(extra),
                    default  : () => menu.lastMenuChoice,
                    action   : {char: 'tab', name: '#toggle', all: false},
                }
            case 'robots':
                return {
                    message  : name,
                    choices  : this.robotsChoices(extra),
                }
            case 'robot':
                return {
                    message  : extra,
                    choices  : this.robotChoices(extra),
                }
            }
    }

    mainChoices() {

        const {__} = this

        return this.formatChoices([
            this.br(),
            {
                value  : 'play',
                name   : __('Play'),
                select : 'p',
            },
            {
                value  : 'account',
                name   : __('Account'),
                select : 'a',
            },
            {
                value  : 'settings',
                name   : __('Settings'),
                select : 's',
            },
            {
                value  : 'lab',
                name   : __('Lab'),
                select : 'l',
            },
            this.hr(),
            {
                value  : 'quit',
                name   : __('Exit'),
                select : 'q',
                enter  : EnterChars.quit,
            },
            this.br(),
        ].flat())
    }

    playChoices() {

        const {menu, __, m} = this

        return this.formatChoices([
            this.br(),
            {
                value: 'startOnline',
                name: m.play('startOnline'),
            },
            {
                value: 'joinOnline',
                name: m.play('joinOnline'),
            },
            this.hr(),
            {
                value: 'playHumans',
                name: m.play('playHumans'),
            },
            {
                value: 'playRobot',
                name: m.play('playRobot'),
            },
            {
                value: 'playRobots',
                name: m.play('playRobots'),
            },
            this.hr(),
            {
                value : 'back',
                name  : __('Back'),
                when  : menu.bread.length > 1,
                enter : EnterChars.back,
            },
            {
                value  : 'quit',
                name   : __('Exit'),
                select : 'q',
            },
            this.br(),
        ].flat())
    }

    matchChoices(playChoice) {
        const {menu, __} = this
        const isOnline = ['startOnline', 'joinOnline'].includes(playChoice)
        return this.formatChoices(
            this.matchInitialChoices(playChoice).concat([
                // Only show advanced for local matches.
                {
                    value : 'advanced',
                    name  : __('Advanced'),
                    when  : !isOnline,
                },
                this.hr().when(!isOnline),
                {
                    value : 'back'
                  , name  : __('Back')
                  , when  : menu.bread.length > 1
                  , enter : EnterChars.back
                },
                {
                    value  : 'quit'
                  , name   : __('Exit')
                  , select : 'q'
                },
                this.br(),
            ])
        )
    }

    matchInitialChoices(playChoice) {

        const {__} = this
        const mopts = this.settings.matchOpts
        const isJoin = playChoice === 'joinOnline'
        const validate = {
            total: value => {
                if (Number.isInteger(value) && value > 0) {
                    return true
                }
                return __('Please enter a number > 0')
            }
        }

        return [
            this.br(),
            {
                value    : 'start',
                name     : __('Start Match'),
                select   : 's',
                question : isJoin ? this.matchId() : null,
            },
            this.hr(),
            {
                value : 'total',
                name  : __('Match Total'),
                select  : 't',
                question : {
                    name     : 'total',
                    message  : __('Match Total'),
                    type     : 'input',
                    default  : () => mopts.total,
                    validate : validate.total,
                    filter   : value => +value,
                    cancel   : CancelChars.input,
                    restore  : RestoreChars.input,
                    expand   : ExpandChars.input,
                },
            },
            {
                value  : 'cubeEnabled',
                name   : __('Cube Enabled'),
                action : ['#toggle'],
                question : {
                    name    : 'cubeEnabled',
                    message : __('Cube Enabled'),
                    type    : 'confirm',
                    default : () => mopts.cubeEnabled,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            {
                value  : 'isCrawford',
                name   : __('Crawford Rule'),
                when   : () => mopts.cubeEnabled,
                action : ['#toggle'],
                question : {
                    name    : 'isCrawford',
                    message : __('Crawford Rule'),
                    type    : 'confirm',
                    default : () => mopts.isCrawford,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            {
                value  : 'isJacoby',
                name   : __('Jacoby Rule'),
                action : ['#toggle'],
                question : {
                    name    : 'isJacoby',
                    message : __('Jacoby Rule'),
                    type    : 'confirm',
                    default : () => mopts.isJacoby,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            this.hr(),
        ]
    }

    matchAdvanced(aopts) {

        aopts = aopts || {}

        const {__} = this

        const validate = {
            state: value => {
                if (!value.length) {
                    return true
                }
                try {
                    Board.fromStateString(value).analyzer.validateLegalBoard()
                } catch (err) {
                    // TODO: make tranlatable
                    return err.message
                }
                return true
            },
            rollsFile: value => {
                if (!value.length) {
                    return true
                }
                const data = fse.readJsonSync(value)
                // TODO: make tranlatable
                return errMessage(() => Dice.validateRollsData(data))
            },
        }

        return [
            {
                name     : 'startState',
                message  : __('Start State'),
                type     : 'input',
                default  : () => aopts.startState,
                validate : validate.state,
                cancel   : CancelChars.input,
            },
            {
                name     : 'rollsFile',
                message  : __('Rolls File'),
                type     : 'input',
                default  : () => homeTilde(aopts.rollsFile),
                filter   : value => tildeHome(value),
                validate : validate.rollsFile,
                cancel   : CancelChars.input,
                when     : answers => !answers._cancelEvent,
            },
        ]
    }

    matchId() {

        const {__} = this

        const validate = {
            matchId: value => {
                if (!value || value.length == 8) {
                    return true
                }
                return __('Invalid match ID format')
            },
        }

        return {
            name     : 'matchId',
            message  : __('Match ID'),
            type     : 'input',
            validate : validate.matchId,
            cancel   : CancelChars.input,
        }
    }

    accountChoices() {

        const {creds, __} = this

        const {needsConfirm} = creds
        const isFilled = isCredentialsFilled(creds)
        const hasCred = Boolean(creds.username || creds.password)

        return [
            [
                this.br(),
                {
                    value : 'done',
                    name  : __('Done'),
                    enter : EnterChars.back,
                },
            ],
            [
                this.hr(),
                {
                    value : 'serverUrl',
                    name  : __('Server'),
                    question : {
                        name    : 'serverUrl',
                        message : __('Server URL'),
                        type    : 'input',
                        default : () => creds.serverUrl,
                        cancel  : CancelChars.input,
                        restore : RestoreChars.input,
                        expand  : ExpandChars.input,
                    },
                },
                {
                    value    : 'username',
                    name     : __('Username'),
                    question : this.username(),
                },
                {
                    value    : 'password',
                    name     : __('Password'),
                    question : this.password(),
                },
                this.hr(),
            ],
            [
                {
                    value : 'createAccount',
                    name  : __('Create Account'),
                    when  : !isFilled,
                },
                {
                    value : 'forgotPassword',
                    name  : __('Forgot Password'),
                    when  : !isFilled,
                },
                {
                    value : 'confirmAccount',
                    name  : __('Enter confirm key'),
                    when  : isFilled && needsConfirm,
                },
                {
                    value : 'newConfirmKey',
                    name  : __('Get new confirm key'),
                    when  : isFilled && needsConfirm,
                },
                this.hr().when(isFilled && needsConfirm),
                {
                    value : 'testCredentials',
                    name  : __('Test Credentials'),
                    when  : isFilled && !needsConfirm,
                },
                {
                    value : 'changePassword',
                    name  : __('Change Password'),
                    when  : isFilled && !needsConfirm,
                },
                {
                    value : 'clearCredentials',
                    name  : __('Clear Credentials'),
                    when  : hasCred,
                },
                this.br(),
            ],
        ].map(group => this.formatChoices(group)).flat()
    }

    username() {

        const {creds, __} = this

        const checkMark = this.theme.prompt.check.pass(Chars.check)
        const checkSuffix = creds.isTested ? ' ' + checkMark : ''

        return {
            name    : 'username',
            message : __('Username'),
            type    : 'input',
            default : () => creds.username,
            display : () => creds.username + checkSuffix,
            cancel  : CancelChars.input,
            when    : answers => !answers._cancelEvent,
            restore : RestoreChars.input,
            expand  : ExpandChars.input,
        }
    }

    password() {

        const {creds, __} = this

        return {
            name    : 'password',
            message : __('Password'),
            type    : 'password',
            default : () => creds.password,
            display : () => creds.password ? '******' : '',
            mask    : '*',
            cancel  : CancelChars.password,
            when    : answers => !answers._cancelEvent,
            restore : RestoreChars.password,
        }
    }

    passwordConfirm(checkKey = 'password') {

        const {__} = this

        const validate = {
            passwordConfirm: (value, answers) => {
                if (value == answers[checkKey]) {
                    return true
                }
                return __('Passwords do not match')
            },
        }

        return {
            name     : 'passwordConfirm',
            message  : __('Re-enter password'),
            type     : 'password',
            validate : validate.passwordConfirm,
            mask     : '*',
            cancel   : CancelChars.password,
            when     : answers => !answers._cancelEvent,
        }
    }

    changePassword() {

        const {__} = this

        return [
            {
                ...this.password(),
                name    : 'oldPassword',
                message : __('Current password'),
                default : '',
            },
            {
                ...this.password(),
                name    : 'newPassword',
                message : __('New password'),
                default : '',
            },
            this.passwordConfirm('newPassword'),
        ]
    }

    forgotPassword() {

        const {__} = this

        const when = {
            keyEntered: answers => {
                return Boolean(!answers._cancelEvent && answers.resetKey)
            },
        }

        return [
            {
                name    : 'resetKey',
                type    : 'input',
                message : __('Enter reset key'),
                prefix  : __('Reset key requested, check your email.') + '\n',
                cancel  : CancelChars.input,
            },
            {
                ...this.password(),
                message : __('New password'),
                when    : when.keyEntered,
            },
            {
                ...this.passwordConfirm(),
                when: when.keyEntered,
            },
        ]
    }

    createAccount() {
        return [
            this.username(),
            this.password(),
            this.passwordConfirm(),
        ]
    }

    confirmKey() {

        const {__} = this

        return {
            name    : 'key',
            type    : 'input',
            message : __('Enter confirm key'),
            prefix  : [
                __('You must confirm your account.')
              , __('Check your email for a confirmation key.')
              , ''
            ].join('\n'),
            cancel  : CancelChars.input,
        }
    }

    settingsChoices() {

        const {settings, __} = this
        const {intl} = this.menu

        const validate = {
            delay: value => {
                if (!isNaN(value) && value >= 0) {
                    return true
                }
                return __('Please enter a number >= 0')
            },
        }

        return this.formatChoices([
            this.br(),
            {
                value  : 'done',
                name   : __('Done'),
                enter  : EnterChars.back,
                select : 'd',
            },
            this.hr(),
            {
                value : 'locale',
                name  : __('Locale'),
                question : {
                    name    : 'locale',
                    message : __('Choose your locale'),
                    type    : 'list',
                    default : () => settings.locale,
                    choices : () => [this.br()].concat(intl.locales),
                    cancel  : CancelChars.list,
                    prefix  : '',
                },
            },
            {
                value : 'theme',
                name  : __('Theme'),
                question : {
                    name : 'theme',
                    message : __('Choose a theme'),
                    type    : 'list',
                    default : () => settings.theme,
                    choices : () => [this.br()].concat(Themes.list()),
                    cancel  : CancelChars.list,
                    prefix  : '',
                },
            },
            {
                value  : 'isAnsi',
                name   : __('ANSI Cursoring'),
                action : ['#toggle'],
                question : {
                    name    : 'isAnsi',
                    message : __('Enable ANSI cursoring'),
                    type    : 'confirm',
                    default : () => settings.isAnsi,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            this.hr(),
            {
                value  : 'fastForced',
                name   : __('Fast Forced Moves'),
                action : ['#toggle'],
                question : {
                    name    : 'fastForced',
                    message : __('Fast Forced Moves'),
                    type    : 'confirm',
                    default : () => settings.fastForced,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            {
                value : 'recordDir',
                name  : __('Record Dir'),
                question : {
                    name    : 'recordDir',
                    message : __('Record Dir'),
                    type    : 'input',
                    default : () => homeTilde(settings.recordDir),
                    filter  : value => !value ? null : path.resolve(tildeHome(value)),
                    cancel  : CancelChars.input,
                    clear   : 'ctrl-delete',
                    restore : RestoreChars.input,
                    expand  : ExpandChars.input,
                },
            },
            {
                value  : 'isRecord',
                name   : __('Record Matches'),
                action : ['#toggle'],
                question : {
                    name    : 'isRecord',
                    message : __('Record Matches'),
                    type    : 'confirm',
                    default : () => settings.isRecord,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            this.hr(),
            {
                value : 'delay',
                name  : __('Robot Delay'),
                question : {
                    name     : 'delay',
                    message  : __('Robot Delay (seconds)'),
                    type     : 'input',
                    default  : () => settings.delay,
                    filter   : value => +value,
                    validate : validate.delay,
                    cancel   : CancelChars.input,
                    restore  : RestoreChars.input,
                    expand   : ExpandChars.input,
                    writeInvalid : () => '',
                },
            },
            {
                value  : 'isCustomRobot',
                name   : __('Use Custom Robot'),
                action : ['#toggle'],
                question : {
                    name    : 'isCustomRobot',
                    message : __('Use Custom Robot'),
                    type    : 'confirm',
                    default : () => settings.isCustomRobot,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                }
            },
            {
                value : 'robotConfigs',
                name  : __('Robot Configuration'),
                when  : settings.isCustomRobot,
            },
            this.br(),
        ])
    }

    robotsChoices() {

        const {menu, settings, __} = this
        const chlk = this.theme.diff

        const config = (name, prop) => {
            const base = settings.robots[name] || menu.robotMinimalConfig(name)
            return base[prop]
        }

        const entries = Object.entries(menu.robotsDefaults())

        return this.formatChoices([
            this.br(),
            {
                value  : 'done',
                name   : __('Done'),
                enter  : EnterChars.back,
                select : 'd',
            },
            this.hr(),
            {
                value  : 'reset',
                name   : __('Reset defaults'),
                select : 'r',
            },
            this.hr(),
            entries.map(([name, defaults]) => ({
                value : name,
                name  : name,
                // TODO: We shouldn't have to use question key since it is a submenu.
                question : {
                    display : () => {
                        const differ = prop => {
                            const actual = config(name, prop)
                            const expected = defaults[prop]
                            return chalkDiff(actual, expected, chlk)
                        }
                        return [
                            differ('version') + ',',
                            __('move:'),
                            padEnd(differ('moveWeight'), 4, ' ') + ',',
                            __('double:'),
                            differ('doubleWeight'),
                        ].join(' ')
                    },
                },
            })),
            this.br(),
        ].flat())
    }

    robotChoices(name) {

        const {__} = this
        const chlk = this.theme.diff
        const {defaults, versions} = this.menu.robotMeta(name)

        const validate = {
            weight: value => {
                // TODO: make tranlatable
                return errMessage(() =>
                    RobotDelegator.validateWeight(value)
                )
            },
        }

        const config = prop => {
            return this.settings.robots[name][prop]
        }

        const differ = prop => {
            return chalkDiff(config(prop), defaults[prop], chlk)
        }

        const common = {
            prop: name => ({
                name,
                default : () => config(name),
                display : () => differ(name),
            }),
            weight: {
                type     : 'input',
                filter   : value => +value,
                validate : validate.weight,
                cancel   : CancelChars.input,
                restore  : RestoreChars.input,
                expand   : ExpandChars.input,
                writeInvalid : () => '',
            },
        }

        return this.formatChoices([
            this.br(),
            {
                value  : 'done',
                name   : __('Done'),
                enter  : EnterChars.back,
                select : 'd',
            },
            this.hr(),
            {
                value  : 'reset',
                name   : __('Reset defaults'),
                select : 'r',
            },
            this.hr(),
            {
                value  : 'version',
                name   : __('Version'),
                select : 'v',
                question : {
                    ...common.prop('version'),
                    message : __('Version'),
                    type    : 'list',
                    choices : () => Object.keys(versions),
                    cancel  : CancelChars.list,
                },
            },
            {
                value  : 'moveWeight',
                name   : __('Move Weight'),
                select : 'm',
                question : {
                    ...common.prop('moveWeight'),
                    message  : __('Move Weight'),
                    ...common.weight,
                },
            },
            {
                value  : 'doubleWeight',
                name   : __('Double Weight'),
                select : 'b',
                question : {
                    ...common.prop('doubleWeight'),
                    message  : __('Double Weight'),
                    ...common.weight,
                },
            },
            this.br(),
        ])
    }

    br() {
        return new this.menu.inquirer.Separator('')
    }

    hr() {
        return new this.menu.inquirer.Separator()
    }

    formatChoices(choices) {

        const {menu} = this

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
        const total = available.length
        const nameWidth = Math.max(
            ...available.map(choice => stringWidth(choice.name))
        )

        const menuBoxMaxWidth = menu.boxes.menu.params.maxWidth

        available.forEach((choice, i) => {

            const n = i + 1

            const numPad = total.toString().length - n.toString().length

            if ('name' in choice) {
                choice._originalName = choice.name
            }

            if (!('short' in choice)) {
                choice.short = choice.name
            }

            // TODO: Support display key without a question.

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
                choice.name = padEnd(choice.name, nameWidth + numPad, ' ')
                choice.name = sp(choice.name, ':', display)
            }
        })

        return choices
    }

    get __() {
        return this.menu.__
    }

    get credentials() {
        return this.menu.credentials
    }

    get creds() {
        return this.credentials
    }

    get settings() {
        return this.menu.settings
    }

    get theme() {
        return this.menu.theme
    }
}

module.exports = Questions