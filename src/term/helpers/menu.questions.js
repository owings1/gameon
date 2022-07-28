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
import fse from 'fs-extra'
import {stringWidth} from '@quale/core/strings.js'
import {isFunction, isString} from '@quale/core/types.js'
import {resolve} from 'path'
import Dice from '../../lib/dice.js'
import {Board} from '../../lib/core.js'
import {Chars} from '../../lib/constants.js'
import Themes from '../themes.js'
import Messages from './menu.messages.js'
import {RobotDelegator} from '../../robot/player.js'
import {  
    errMessage,
    homeTilde,
    isCredentialsFilled,
    padEnd,
    sp,
    tildeHome,
} from '../../lib/util.js'

function getDiffChalk(a, b, chlk) {
    if (a === b) {
        return sp
    }
    const isLess = isString(a) ? a.localeCompare(b) < 0 : a < b
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

export default class Questions {

    constructor(menu) {
        this.menu = menu
        this.m = new Messages(menu)
    }

    menuq(name, extra) {
        const {menu, settings, m, __} = this
        switch (name) {
            case 'main':
                return {
                    message : __('menu.title.main'),
                    choices : this.mainChoices(extra),
                }
            case 'play':
                return {
                    message : __('menu.title.play'),
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
                    message : __('menu.title.account'),
                    choices : this.accountChoices(extra),
                }
            case 'settings':
                return {
                    message : __('menu.title.settings'),
                    choices  : this.settingsChoices(extra),
                    default  : () => menu.lastMenuChoice,
                    action   : {char: 'tab', name: '#toggle', all: false},
                }
            case 'robots':
                return {
                    message : __('menu.title.robots'),
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
                name   : __('menu.choice.play'),
                select : 'p',
            },
            {
                value  : 'account',
                name   : __('menu.choice.account'),
                select : 'a',
            },
            {
                value  : 'settings',
                name   : __('menu.choice.settings'),
                select : 's',
            },
            {
                value  : 'lab',
                name   : __('menu.choice.lab'),
                select : 'l',
            },
            this.hr(),
            {
                value  : 'quit',
                name   : __('menu.choice.exit'),
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
                name  : __('menu.choice.back'),
                when  : menu.bread.length > 1,
                enter : EnterChars.back,
            },
            {
                value  : 'quit',
                name   : __('menu.choice.exit'),
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
                    name  : __('menu.choice.advancedOptions'),
                    when  : !isOnline,
                },
                this.hr().when(!isOnline),
                {
                    value : 'back',
                    name  : __('menu.choice.back'),
                    when  : menu.bread.length > 1,
                    enter : EnterChars.back,
                },
                {
                    value  : 'quit',
                    name   : __('menu.choice.exit'),
                    select : 'q',
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
                return __('alerts.enterNumberGreaterThanZero')
            }
        }
        return [
            this.br(),
            {
                value    : 'start',
                name     : __('menu.choice.startMatch'),
                select   : 's',
                question : isJoin ? this.matchId() : null,
            },
            this.hr(),
            {
                value : 'total',
                name  : __('menu.choice.matchTotal'),
                select  : 't',
                question : {
                    name     : 'total',
                    message  : __('menu.question.matchTotal'),
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
                name   : __('menu.choice.cubeEnabled'),
                action : ['#toggle'],
                question : {
                    name    : 'cubeEnabled',
                    message : __('menu.question.cubeEnabled'),
                    type    : 'confirm',
                    default : () => mopts.cubeEnabled,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            {
                value  : 'isCrawford',
                name   : __('menu.choice.crawfordRule'),
                when   : () => mopts.cubeEnabled,
                action : ['#toggle'],
                question : {
                    name    : 'isCrawford',
                    message : __('menu.question.crawfordRule'),
                    type    : 'confirm',
                    default : () => mopts.isCrawford,
                    cancel  : CancelChars.bool,
                    toggle  : ToggleChars.bool,
                },
            },
            {
                value  : 'isJacoby',
                name   : __('menu.choice.jacobyRule'),
                action : ['#toggle'],
                question : {
                    name    : 'isJacoby',
                    message : __('menu.question.jacobyRule'),
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
                message  : __('menu.question.initialState'),
                type     : 'input',
                default  : () => aopts.startState,
                validate : validate.state,
                cancel   : CancelChars.input,
            },
            {
                name     : 'rollsFile',
                message  : __('menu.question.rollsFile'),
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
                if (!value || value.length === 8) {
                    return true
                }
                return __('alerts.invalidMatchIdFormat')
            },
        }
        return {
            name     : 'matchId',
            message  : __('menu.question.matchId'),
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
                    name  : __('menu.choice.done'),
                    enter : EnterChars.back,
                },
            ],
            [
                this.hr(),
                {
                    value : 'serverUrl',
                    name  : __('menu.choice.serverUrl'),
                    question : {
                        name    : 'serverUrl',
                        message : __('menu.question.serverUrl'),
                        type    : 'input',
                        default : () => creds.serverUrl,
                        cancel  : CancelChars.input,
                        restore : RestoreChars.input,
                        expand  : ExpandChars.input,
                    },
                },
                {
                    value    : 'username',
                    name     : __('menu.choice.username'),
                    question : this.username(),
                },
                {
                    value    : 'password',
                    name     : __('menu.choice.password'),
                    question : this.password(),
                },
                this.hr(),
            ],
            [
                {
                    value : 'createAccount',
                    name  : __('menu.choice.createAccount'),
                    when  : !isFilled,
                },
                {
                    value : 'forgotPassword',
                    name  : __('menu.choice.forgotPassword'),
                    when  : !isFilled,
                },
                {
                    value : 'confirmAccount',
                    name  : __('menu.choice.confirmAccount'),
                    when  : isFilled && needsConfirm,
                },
                {
                    value : 'newConfirmKey',
                    name  : __('menu.choice.newConfirmKey'),
                    when  : isFilled && needsConfirm,
                },
                this.hr().when(isFilled && needsConfirm),
                {
                    value : 'testCredentials',
                    name  : __('menu.choice.testCredentials'),
                    when  : isFilled && !needsConfirm,
                },
                {
                    value : 'changePassword',
                    name  : __('menu.choice.changePassword'),
                    when  : isFilled && !needsConfirm,
                },
                {
                    value : 'clearCredentials',
                    name  : __('menu.choice.clearCredentials'),
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
            message : __('menu.question.username'),
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
            message : __('menu.question.password'),
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
                if (value === answers[checkKey]) {
                    return true
                }
                return __('alerts.passwordsDoNotMatch')
            },
        }
        return {
            name     : 'passwordConfirm',
            message  : __('menu.question.confirmPassword'),
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
                message : __('menu.question.currentPassword'),
                default : '',
            },
            {
                ...this.password(),
                name    : 'newPassword',
                message : __('menu.question.newPassword'),
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
                message : __('menu.question.resetKey'),
                prefix  : __('alerts.resetKeyRequestedCheckEmail') + '\n',
                cancel  : CancelChars.input,
            },
            {
                ...this.password(),
                message : __('menu.question.newPassword'),
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
            message : __('menu.question.confirmKey'),
            prefix  : [
                __('alerts.mustConfirmYourAccount'),
                __('alerts.checkEmailForConfirmKey'),
                '',
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
                return __('alerts.enterNumberGreaterThanOrEqualToZero')
            },
        }
        return [
            [
                this.br(),
                {
                    value  : 'done',
                    name   : __('menu.choice.done'),
                    enter  : EnterChars.back,
                    select : 'd',
                },
            ],
            [
                this.hr(),
                {
                    value : 'locale',
                    name  : __('menu.choice.locale'),
                    question : {
                        name    : 'locale',
                        message : __('menu.question.locale'),
                        type    : 'list',
                        default : () => settings.locale,
                        choices : () => [this.br()].concat(intl.locales),
                        cancel  : CancelChars.list,
                        prefix  : '',
                    },
                },
                {
                    value : 'theme',
                    name  : __('menu.choice.theme'),
                    question : {
                        name : 'theme',
                        message : __('menu.question.theme'),
                        type    : 'list',
                        default : () => settings.theme,
                        choices : () => [this.br()].concat(Themes.list()),
                        cancel  : CancelChars.list,
                        prefix  : '',
                    },
                },
                {
                    value  : 'isAnsi',
                    name   : __('menu.choice.advancedAnsi'),
                    action : ['#toggle'],
                    question : {
                        name    : 'isAnsi',
                        message : __('menu.question.advancedAnsi'),
                        type    : 'confirm',
                        default : () => settings.isAnsi,
                        cancel  : CancelChars.bool,
                        toggle  : ToggleChars.bool,
                    },
                },
            ],
            [
                this.hr(),
                {
                    value  : 'fastForced',
                    name   : __('menu.choice.fastForcedMoves'),
                    action : ['#toggle'],
                    question : {
                        name    : 'fastForced',
                        message : __('menu.question.fastForcedMoves'),
                        type    : 'confirm',
                        default : () => settings.fastForced,
                        cancel  : CancelChars.bool,
                        toggle  : ToggleChars.bool,
                    },
                },
                {
                    value : 'recordDir',
                    name  : __('menu.choice.recordDir'),
                    question : {
                        name    : 'recordDir',
                        message : __('menu.question.recordDir'),
                        type    : 'input',
                        default : () => homeTilde(settings.recordDir),
                        filter  : value => !value ? null : resolve(tildeHome(value)),
                        cancel  : CancelChars.input,
                        clear   : 'ctrl-delete',
                        restore : RestoreChars.input,
                        expand  : ExpandChars.input,
                    },
                },
                {
                    value  : 'isRecord',
                    name   : __('menu.choice.recordMatches'),
                    action : ['#toggle'],
                    question : {
                        name    : 'isRecord',
                        message : __('menu.question.recordMatches'),
                        type    : 'confirm',
                        default : () => settings.isRecord,
                        cancel  : CancelChars.bool,
                        toggle  : ToggleChars.bool,
                    },
                },
            ],
            [
                this.hr(),
                {
                    value : 'delay',
                    name  : __('menu.choice.robotDelay'),
                    question : {
                        name     : 'delay',
                        message  : __('menu.question.robotDelaySeconds'),
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
                    name   : __('menu.choice.customRobot'),
                    action : ['#toggle'],
                    question : {
                        name    : 'isCustomRobot',
                        message : __('menu.question.customRobot'),
                        type    : 'confirm',
                        default : () => settings.isCustomRobot,
                        cancel  : CancelChars.bool,
                        toggle  : ToggleChars.bool,
                    }
                },
                {
                    value : 'robotConfigs',
                    name  : __('menu.choice.robotSettings'),
                    when  : settings.isCustomRobot,
                },
                this.br(),
            ],
        ].map(group => this.formatChoices(group)).flat()
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
                name   : __('menu.choice.done'),
                enter  : EnterChars.back,
                select : 'd',
            },
            this.hr(),
            {
                value  : 'reset',
                name   : __('menu.choice.resetDefaults'),
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
                            __('menu.table.move') + ':',
                            padEnd(differ('moveWeight'), 4, ' ') + ',',
                            __('menu.table.double') + ':',
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
                name   : __('menu.choice.done'),
                enter  : EnterChars.back,
                select : 'd',
            },
            this.hr(),
            {
                value  : 'reset',
                name   : __('menu.choice.resetDefaults'),
                select : 'r',
            },
            this.hr(),
            {
                value  : 'version',
                name   : __('menu.choice.version'),
                select : 'v',
                question : {
                    ...common.prop('version'),
                    message : __('menu.question.version'),
                    type    : 'list',
                    choices : () => Object.keys(versions),
                    cancel  : CancelChars.list,
                },
            },
            {
                value  : 'moveWeight',
                name   : __('menu.choice.moveWeight'),
                select : 'm',
                question : {
                    ...common.prop('moveWeight'),
                    message  : __('menu.question.moveWeight'),
                    ...common.weight,
                },
            },
            {
                value  : 'doubleWeight',
                name   : __('menu.choice.doubleWeight'),
                select : 'b',
                question : {
                    ...common.prop('doubleWeight'),
                    message  : __('menu.question.doubleWeight'),
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
            if (isFunction(choice.when)) {
                return choice.when()
            }
            return Boolean(choice.when)
        })
        const available = choices.filter(choice => choice.type !== 'separator')
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
            const display = question.display
                ? question.display()
                : question.default()
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
