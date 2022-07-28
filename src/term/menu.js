/**
 * gameon - Terminal Menu
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

import {extend} from '@quale/core/arrays.js'
import {lget, lset, update, isNonEmpty} from '@quale/core/objects.js'
import {stringWidth} from '@quale/core/strings.js'
import {castToArray, isFunction} from '@quale/core/types.js'
import Screen from '@quale/core/screen.js'
import {merge} from '@quale/term/merging.js'
import fs from 'fs'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import {EventEmitter} from 'events'

import Dice from '../lib/dice.js'
import Client from '../net/client.js'
import Themes from './themes.js'
import Alerts from './helpers/alerts.js'
import ApiHelper from './helpers/menu.api.js'
import Questions from './helpers/menu.questions.js'
import TermBox from './helpers/term.box.js'
import NetPlayer from '../net/player.js'
import inquirer from './inquirer.js'
import Lab from './lab.js'
import IntlHelper from '../lib/util/intl.js'
import TermPlayer from './player.js'
import Coordinator from '../lib/coordinator.js'
import {Board, Match} from '../lib/core.js'
import {
    ConfidenceRobot,
    RobotDelegator,
} from '../robot/player.js'
import {
    createLogger,
    decrypt2,
    defaults,
    destroyAll,
    encrypt2,
    forceLineReturn,
    getOrCall,
    isCredentialsFilled,
    padEnd,
    rejectDuplicatePrompter,
} from '../lib/util.js'
import {
    Chars,
    CHash,
    DefaultAnsiEnabled,
    DefaultLocale,
    DefaultServerUrl,
    DefaultThemeName,
    ObsoleteServerUrls,
    Red,
    White,
} from '../lib/constants.js'
import {
    MatchCanceledError,
    WaitingAbortedError,
} from '../lib/errors.js'

const ResizeTimoutMs = 300
const InterruptCancelEvent = {
    interrupt: true,
    key: {name: 'c', ctrl: true},
}
const InterruptCancelAnswers = {
    _cancelEvent: InterruptCancelEvent,
}

export default class Menu extends EventEmitter {

    constructor(configDir) {
        super()
        this.configDir = configDir
        Object.defineProperties(this, {
            settings    : {value: Menu.settingsDefaults()},
            credentials : {value: Menu.credentialDefaults()},
        })
        this.intl = IntlHelper.newInstance()
        this.chash = CHash
        this.bread = []
        this.theme = Themes.getDefaultInstance()
        this.screen = new Screen({isAnsi: this.settings.isAnsi})
        this.inquirer = inquirer.createPromptModule({escapeCodeTimeout: 100})
        this.logger = createLogger(this, {type: 'named', oneout: true})
        this.alerter = createLogger('Alerter', {type: 'raw', oneout: true})
        this.alerts = new Alerts
        this.api = new ApiHelper(this.screen)
        this.isCredentialsLoaded = false
        this.isSettingsLoaded = false
        this.isThemesLoaded = false
        this.q = new Questions(this)
        this.m = this.q.m
        this.handleResize = this.handleResize.bind(this)
        this.on('resize', this.handleResize)
        this.boxes = {
            menu   : new TermBox({
                top         : 10,
                hcenter     : true,
                maxWidth    : 60,
                minWidth    : 60,
                maxHeight   : 20,
                pad         : 1,
                screen      : this.screen,
                isBorder    : true,
                borderStyle : 'solid',
                format : {
                    border : str => this.theme.menu.box.border(str),
                    pad    : str => this.theme.menu.box(str),
                    erase  : str => this.theme.menu.screen(str),
                },
            }),
            alerts : new TermBox({
                top         : 2,
                hcenter     : true,
                maxWidth    : 79,
                minWidth    : 79,
                maxHeight   : 5,
                screen      : this.screen,
                isBorder    : true,
                borderStyle : 'solid',
                pad         : 0,
                format : {
                    border : str => this.theme.alert.box.border(str),
                    pad    : str => this.theme.alert.box(str),
                    erase  : str => this.theme.alert.screen(str),
                },
            }),
            screen: new TermBox({
                top         : 1,
                screen      : this.screen,
                isBorder    : true,
                borderStyle : 'solid',
                format : {
                    border: str => this.theme.menu.screen.border(str),
                },
            }),
        }
    }

    get output() {
        return this.screen.output
    }

    set output(strm) {
        this.screen.output = strm
        this.inquirer.opt.output = strm
        this.logger.stdout = strm
        this.alerter.stdout = strm
        if (this.client) {
            this.client.logger.stdout = strm
        }
        if (this.coordinator) {
            this.coordinator.logger.stdout = strm
        }
        if (this.players) {
            Object.values(this.players).forEach(player => {
                player.logger.stdout = strm
            })
        }
    }

    get logLevel() {
        return this.logger.logLevel
    }

    set logLevel(n) {
        this.logger.logLevel = n
        this.alerter.logLevel = n
        this.api.logLevel = n
        if (this.client) {
            this.client.logLevel = n
        }
        if (this.coordinator) {
            this.coordinator.logLevel = n
        }
        if (this.players) {
            Object.values(this.players).forEach(player => {
                player.logLevel = n
            })
        }
    }

    get creds() {
        return this.credentials
    }

    get __() {
        return this.intl.__
    }

    mainMenu() {
        const methods = {
            play     : 'playMenu',
            account  : 'accountMenu',
            settings : 'settingsMenu',
            lab      : 'runLab',
        }
        /* i18n-extract menu.title.main */
        return this.runMenu('main', async (choose, loop) => {
            await loop(async () => {
                const {choice} = await choose()
                if (choice === 'quit') {
                    return
                }
                const isContinue = await this[methods[choice]]()
                if (choice === 'lab') {
                    await this.eraseScreen()
                }
                return isContinue
            })
            return true
        })
    }

    playMenu() {
        const {alerts, settings, __} = this
        /* i18n-extract menu.title.play */
        return this.runMenu('play', async (choose, loop) => {
            let isContinue = true
            await loop(async () => {
                isContinue = true
                const {choice, ask} = await choose()
                if (choice === 'back') {
                    return
                }
                if (choice === 'quit') {
                    isContinue = false
                    return
                }
                if (settings.lastPlayChoice !== choice) {
                    settings.lastPlayChoice = choice
                    await this.saveSettings()
                }
                try {
                    isContinue = await this.matchMenu(choice)
                } catch (err) {
                    alerts.error(err)
                    if (err.isAuthError || err.isValidateError) {
                        alerts.warn(
                            __('alerts.authenticationFailedGoToAccountToLogin')
                        )
                    }
                }
                return isContinue
            })
            return isContinue
        })
    }

    matchMenu(playChoice) {
        const methods = {
            startOnline : 'startOnlineMatch',
            joinOnline  : 'joinOnlineMatch',
            playHumans  : 'playHumans',
            playRobot   : 'playRobot',
            playRobots  : 'playRobots',
        }
        const isJoin = playChoice === 'joinOnline'
        const isAdvanced = ['playHumans', 'playRobot', 'playRobots'].includes(playChoice)
        const method = methods[playChoice]
        const {settings} = this
        /* i18n-extract menu.title.match */
        return this.runMenu('match', async (choose, loop) => {
            let isContinue = true
            let advancedOpts = {}
            await loop(async () => {
                isContinue = true
                const {choice, toggle, ask} = await choose(playChoice)
                if (choice === 'back') {
                    return
                }
                if (choice === 'quit') {
                    isContinue = false
                    return
                }
                if (toggle) {
                    settings.matchOpts[choice] = !settings.matchOpts[choice]
                    await this.saveSettings()
                    return true
                }
                if (choice === 'advanced') {
                    advancedOpts = await this.promptMatchAdvancedOpts(advancedOpts)
                    return true
                }
                if (choice === 'start') {
                    const args = []
                    if (isJoin) {
                        const join = await ask()
                        if (join.isCancel || !join.answer) {
                            return false
                        }
                        args.push(join.answer)
                    } else {
                        let {matchOpts} = settings
                        if (isAdvanced) {
                            matchOpts = await this.getMatchOpts(matchOpts, advancedOpts)
                        }
                        args.push(matchOpts)
                    }
                    await this[method](...args)
                    return !isJoin
                }
                const {answer, isCancel, isChange} = await ask()
                if (isCancel || !isChange) {
                    return true
                }
                settings.matchOpts[choice] = answer
                await this.saveSettings()
                return true
            })
            return isContinue
        })
    }

    accountMenu() {
        const methods = {
            changePassword : 'promptChangePassword',
            confirmAccount : 'promptConfirmAccount',
            createAccount  : 'promptCreateAccount',
            forgotPassword : 'promptForgotPassword',
            newConfirmKey  : 'promptNewConfirmKey',
        }
        const {alerts, creds} = this
        /* i18n-extract menu.title.account */
        return this.runMenu('account', async (choose, loop) => {
            await loop(async () => {
                const {choice, ask} = await choose()
                if (choice === 'done') {
                    return
                }
                if (choice === 'clearCredentials') {
                    this.clearCredentials()
                    await this.saveCredentials()
                    return true
                }
                const method = methods[choice]
                if (method) {
                    try {
                        if (await this[method].call(this)) {
                            alerts.info(this.m.login(choice))
                        } else {
                            return true
                        }
                    } catch (err) {
                        alerts.error(err)
                        return true
                    }
                } else if (choice !== 'testCredentials') {
                    const {answer, isCancel, isChange} = await ask()
                    if (isCancel || !isChange) {
                        return true
                    }
                    creds.isTested = false
                    if (choice === 'password') {
                        creds[choice] = this.encryptPassword(answer)
                    } else {
                        creds[choice] = answer
                    }
                }
                try {
                    if (!isCredentialsFilled(creds, true)) {
                        return true
                    }
                    await this.doLogin()
                } catch (err) {
                    alerts.error(err)
                } finally {
                    await this.saveCredentials()
                }
                return true
            })
            return true
        })
    }

    settingsMenu() {
        const {settings} = this
        /* i18n-extract menu.title.settings */
        return this.runMenu('settings', async (choose, loop) => {
            await loop(async () => {
                const {choice, toggle, ask} = await choose()
                if (choice === 'done') {
                    return
                }
                if (toggle) {
                    settings[choice] = !settings[choice]
                    await this.saveSettings()
                    if (choice === 'isAnsi' && settings[choice]) {
                        // We have to repeat the logic below since we continue.
                        this.eraseScreen()
                    }
                    return true
                }
                if (choice === 'robotConfigs') {
                    await this.robotsMenu()
                    return true
                }
                const {answer, isCancel, isChange} = await ask()
                if (isCancel || !isChange) {
                    return true
                }
                settings[choice] = answer
                await this.saveSettings()
                if (choice === 'isCustomRobot') {
                    // We changed to custom robot, go directly to robots menu.
                    // This excludes toggle above.
                    await this.robotsMenu()
                    return true
                }
                if (choice === 'locale') {
                    // Set the new locale.
                    this.intl.locale = answer
                } else if (choice === 'theme' || choice === 'isAnsi') {
                    // Erase the screen because the background may change.
                    this.eraseScreen()
                }
                return true
            })
            return true
        })
    }

    robotsMenu() {
        const {alerts, settings, __} = this
        /* i18n-extract menu.title.robots */
        return this.runMenu('robots', async (choose, loop) => {
            if (!isNonEmpty(this.settings.robots)) {
                alerts.info(__('alerts.loadingRobotDefaults'))
                settings.robots = this.robotsDefaults()
                await this.saveSettings()
            }
            await loop(async () => {
                const {choice} = await choose()
                if (choice === 'done') {
                    return
                }
                if (choice === 'reset') {
                    settings.robots = this.robotsDefaults()
                    await this.saveSettings()
                    return true
                }
                await this.robotMenu(choice)
                return true
            })
            return true
        })
    }

    robotMenu(name) {
        /* i18n-extract menu.title.robot */
        return this.runMenu('robot', async (choose, loop) => {
            const {settings} = this
            if (!isNonEmpty(settings.robots[name])) {
                settings.robots[name] = this.robotMinimalConfig(name)
            }
            await loop(async () => {
                const {choice, ask} = await choose(name)
                if (choice === 'done') {
                    return
                }
                if (choice === 'reset') {
                    settings.robots[name] = this.robotDefaults(name)
                    await this.saveSettings()
                    return
                }
                const {answer, isCancel, isChange} = await ask()
                if (isCancel || !isChange) {
                    return
                }
                settings.robots[name][choice] = answer
                await this.saveSettings()
                // Always break.
            })
            return true
        })
    }

    async promptCreateAccount() {
        await this.ensureCredentialsLoaded()
        const {creds} = this
        const answers = await this.prompt(this.q.createAccount())
        if (answers._cancelEvent) {
            return false
        }
        try {
            this.screen.hideCursor()
            const {passwordEncrypted} = await this.api.signup(
                creds.serverUrl,
                answers.username,
                answers.password,
            )
            creds.username = answers.username
            creds.password = this.encryptPassword(passwordEncrypted)
        } finally {
            this.screen.showCursor()
        }
        return true
    }

    async promptForgotPassword() {
        await this.ensureCredentialsLoaded()
        const {creds} = this
        const {answer, isCancel} = await this.questionAnswer(this.q.username())
        if (isCancel) {
            return false
        }
        await this.api.forgotPassword(creds.serverUrl, answer)
        creds.username = answer
        const answers = await this.prompt(this.q.forgotPassword(), null, {
            cancelOnInterrupt: true,
        })
        if (answers._cancelEvent || !answers.resetKey) {
            return false
        }
        const {passwordEncrypted} = await this.api.resetPassword(creds, answers)
        creds.password = this.encryptPassword(passwordEncrypted)
        return true
    }

    async promptChangePassword() {
        await this.ensureCredentialsLoaded()
        const {creds} = this
        const answers = await this.prompt(this.q.changePassword(), null, {
            cancelOnInterrupt: true,
        })
        if (answers._cancelEvent) {
            return false
        }
        const {passwordEncrypted} = await this.api.changePassword(creds, answers)
        creds.password = this.encryptPassword(passwordEncrypted)
        return true
    }

    async promptConfirmAccount() {
        await this.ensureCredentialsLoaded()
        const {answer, isCancel} = await this.questionAnswer(this.q.confirmKey())
        if (isCancel || !answer.length) {
            return false
        }
        const {creds, __} = this
        try {
            await this.api.confirmKey(creds, answer)
        } catch (err) {
            if (err.isUserConfirmedError) {
                this.alerts.warn(__('alerts.accountAlreadyConfirmed'))
                return
            }
            throw err
        }
        creds.needsConfirm = false
        return true
    }

    async promptNewConfirmKey() {
        await this.ensureCredentialsLoaded()
        const {creds} = this
        if (!creds.username) {
            const {answer, isCancel} = await this.questionAnswer(this.q.username())
            if (isCancel || !answer.length) {
                return false
            }
            creds.username = answer
        }
        await this.api.requestConfirmKey(creds)
        return true
    }

    async promptMatchAdvancedOpts(defaults) {
        const answers = await this.prompt(this.q.matchAdvanced(defaults), null, {
            cancelOnInterrupt: true,
        })
        if (answers._cancelEvent) {
            return {...defaults}
        }
        return answers
    }

    async doLogin() {
        await this.ensureCredentialsLoaded()
        const {alerts, creds, __} = this
        const url = creds.serverUrl
        creds.isTested = false
        try {
            const password = this.decryptPassword(creds.password)
            const {passwordEncrypted} = await this.api.authenticate({...creds, password})
            creds.password = this.encryptPassword(passwordEncrypted)
        } catch (err) {
            let isSuccess = false
            if (err.isUserNotConfirmedError) {
                creds.needsConfirm = true
                isSuccess = await this.promptConfirmAccount()            
            }
            if (!isSuccess) {
                alerts.warn(__('alerts.loginFailed{url}', {url}))
                throw err
            }
        }
        alerts.info(__('alerts.loginSuccess{url}', {url}))
        creds.needsConfirm = false
        creds.isTested = true
        return true
    }

    startOnlineMatch(matchOpts) {
        return this._runOnlineMatch(matchOpts, true, null)
    }

    joinOnlineMatch(matchId) {
        return this._runOnlineMatch(null, false, matchId)
    }

    async playRobot(matchOpts) {
        await this.ensureLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const playerOpts = {screen: this.screen, ...this.settings}
        const players = {
            White : new TermPlayer(White, playerOpts),
            Red   : new TermPlayer.Robot(this.newRobot(Red), playerOpts),
        }
        return this.runMatch(match, players)
    }

    async playRobots(matchOpts) {
        await this.ensureLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const playerOpts = {screen: this.screen, ...this.settings}
        const players = {
            White : new TermPlayer.Robot(this.newRobot(White), playerOpts),
            Red   : new TermPlayer.Robot(this.newDefaultRobot(Red), playerOpts),
        }
        return this.runMatch(match, players)
    }

    async playHumans(matchOpts) {
        await this.ensureLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const playerOpts = {screen: this.screen, ...this.settings}
        const players = {
            White : new TermPlayer(White, playerOpts),
            Red   : new TermPlayer(Red, playerOpts),
        }
        return this.runMatch(match, players)
    }

    async _runOnlineMatch(matchOpts, isStart, matchId) {
        await this.ensureLoaded()
        const {__, alerts} = this
        const client = this.newClient()
        try {
            const termPlayer = new TermPlayer(isStart ? White : Red, {
                screen: this.screen,
                ...this.settings,
            })
            const netPlayer  = new NetPlayer(client, isStart ? Red : White)
            netPlayer.logger.stdout = this.output
            netPlayer.logger.opts.oneout = true
            const players = {
                White : isStart ? termPlayer : netPlayer,
                Red   : isStart ? netPlayer  : termPlayer,
            }
            this.captureInterrupt = () => {
                alerts.warn(__('alerts.abortingWaiting'))
                client.cancelWaiting(new WaitingAbortedError('Keyboard interrupt'))
                return true
            }
            this.eraseScreen()
            this.emit('beforeClientConnect', client)
            await client.connect()
            const promise = isStart
                ? client.createMatch(matchOpts)
                : client.joinMatch(matchId)
            this.emit('clientWaitStart', client)
            let match
            try {
                match = await promise
            } catch (err) {
                // A WaitingAbortedError is typically user-initiated.
                if (err.isWaitingAbortedError) {
                    alerts.warn(err)
                    return
                }
                // A MatchCanceledError can happen when the server shuts down.
                if (err.isMatchCanceledError) {
                    alerts.error(err)
                    return
                }
                throw err
            }
            this.captureInterrupt = null
            await this.runMatch(match, players)
        } catch (err) {
            if (err.isWaitingAbortedError) {
                alerts.warn(err)
                return
            }
            throw err
        } finally {
            this.captureInterrupt = null
            try {
                // This could throw
                client.close()
            } finally {
                this.client = null
            }
        }
    }

    async runMatch(match, players) {
        const {alerts, __} = this
        try {
            this.players = players
            Object.entries(players).forEach(([color, player]) => {
                player.logLevel = this.logLevel
                update(player.logger, {
                    name   : [this.logger.name, player.name, color].join('.'),
                    stdout : this.output,
                })
                player.logger.opts.oneout = true
            })
            const coord = this.newCoordinator()
            this.captureInterrupt = () => {
                alerts.warn(__('alerts.cancelingMatch'))
                const err = new MatchCanceledError('Keyboard interrupt')
                coord.cancelMatch(match, players, err)
                return true
            }
            this.emit('beforeMatchStart', match, players, coord)
            this.eraseScreen()
            this.consumeAlerts()
            players.White.on('matchEnd', match => {
                const winner = match.getWinner()
                const loser = match.getLoser()
                const {scores} = match
                const params = {
                    // i18n-extract play.color.Red
                    // i18n-extract play.color.White
                    winner       : __(['play.color', winner].join('.')), // i18n-ignore-line
                    winningScore : scores[winner],
                    losingScore  : scores[loser],
                }
                alerts.info(
                    __('alerts.matchResult{winner,winningScore,losingScore}', params)
                )
            })
            await coord.runMatch(match, players)
        } catch (err) {
            if (err.isMatchCanceledError) {
                alerts.error(err)
                return
            }
            throw err
        } finally {
            destroyAll(players)
            this.captureInterrupt = null
            this.coordinator = null
            this.players = null
            this.clearScreen()
        }
    }

    async runLab(cmds) {
        await this.ensureSettingsLoaded()
        await this.ensureThemesLoaded()
        const config = await this.loadLabConfig()
        let board, persp, rollsFile
        if (config) {
            board = Board.fromStateString(config.lastState)
            persp = config.persp
            rollsFile = config.rollsFile
        } else {
            board = Board.setup()
            persp = White
            rollsFile = null
        }
        const {theme, isCustomRobot, robots, recordDir} = this.settings
        const {screen} = this
        const labOpts = {
            board,
            persp,
            theme,
            isCustomRobot,
            robots,
            recordDir,
            rollsFile,
            screen,
        }
        const helper = new Lab(labOpts)
        this.emit('beforeRunLab', helper)
        if (cmds && cmds.length) {
            cmds = castToArray(cmds)
            for (let i = 0; i < cmds.length; ++i) {
                await helper.runCommand(cmds[i], i === 0)
            }
        } else {
            await helper.interactive()
        }
        await this.saveLabConfig(helper)
        return true
    }

    async getMatchOpts(matchOpts, advancedOpts = {}) {
        matchOpts = {...matchOpts}
        const {logger, __} = this
        if (advancedOpts.startState) {
            logger.info(__('alerts.settingInitialState'))
            matchOpts.startState = advancedOpts.startState
        }
        if (advancedOpts.rollsFile) {
            logger.info(__('alerts.usingCustomRollsFile'))
            const file = advancedOpts.rollsFile
            const {rolls} = await fse.readJson(file)
            matchOpts.roller = Dice.createRoller(rolls)
        }
        return matchOpts
    }

    newRobot(...args) {
        const {settings} = this
        if (settings.isCustomRobot) {
            return RobotDelegator.forSettings(settings.robots, ...args)
        }
        return this.newDefaultRobot(...args)
    }

    newDefaultRobot(...args) {
        return RobotDelegator.forDefaults(...args)
    }

    newCoordinator() {
        const coord = this.coordinator = new Coordinator(this.settings)
        coord.logLevel = this.logLevel
        coord.logger.opts.oneout = true
        update(coord.logger, {
            name   : [this.logger.name, coord.name].join('.'),
            stdout : this.output,
        })
        return coord
    }

    newClient() {
        if (this.client) {
            this.client.close()
            this.client.removeAllListeners()
        }
        const client = this.client = new Client(merge(this.creds, {
            password: this.decryptPassword(this.creds.password)
        }))
        client.logLevel = this.logLevel
        client.logger.opts.oneout = true
        update(client.logger, {
            name   : [this.logger.name, client.name].join('.'),
            stdout : this.output,
        })
        return client
    }

    prompt(questions, answers, opts) {
        return new Promise((resolve, reject) => {
            if (rejectDuplicatePrompter(this.prompter, reject)) {
                return
            }
            opts = this.getPromptOpts(opts)
            const box = this.boxes.menu
            // Ensure that prompt event is emitted after first render.
            const onRender = () => this.emit('prompt', {questions, answers, opts})
            box.status.once('render', onRender)
            const cleanup = () => {
                this.captureInterrupt = null
                this.prompter = null
                // Clean the listener in case it was not called.
                box.status.removeListener('render', onRender)
            }
            if (opts.cancelOnInterrupt) {
                this.captureInterrupt = () => {
                    try {
                        const {prompter: {ui} = {}} = this
                        if (ui) {
                            ui.close()
                            resolve(InterruptCancelAnswers)
                            return true
                        }
                    } finally {
                        cleanup()
                    }
                }
            }
            this.prompter = this.inquirer.prompt(questions, answers, opts)
            this.prompter.then(answers => {
                cleanup()
                resolve(answers)
            }).catch(err => {
                cleanup()
                reject(err)
            })
        })
    }

    getPromptOpts(opts) {
        const box = this.boxes.menu
        const {maxWidth, left} = box.params
        const indent = (left - 1) * Boolean(this.settings.isAnsi)
        return {
            theme         : this.theme,
            emitter       : box.status,
            screen        : this.screen,
            clearMaxWidth : true,
            maxWidth,
            indent,
        }
    }

    handleResize() {
        this.hasMenuBackground = false
        if (this.players) {
            Object.values(this.players).forEach(player => player.emit('resize'))
        }
        if (!this.settings.isAnsi) {
            return
        }
        if (this.resizeTimeoutId) {
            clearTimeout(this.resizeTimeoutId)
        } else if (this.prompter) {
            this.eraseScreen()
        }
        this.resizeTimeoutId = setTimeout(() => {
            this.resizeTimeoutId = null
            const {prompter} = this
            if (!prompter || !prompter.ui) {
                return
            }
            const {ui} = prompter
            if (!isFunction(ui.onResize)) {
                return
            }
            const box = this.boxes.menu
            const opts = this.getPromptOpts()
            this.writeMenuBackground()
            this.renderAlerts(this.currentAlerts)
            // We don't know exactly where the cursor will end up after boxes
            // resize so we have to render the current prompt only.
            this.screen.moveTo(1, box.params.top)
            ui.onResize(opts, true)
        }, ResizeTimoutMs)
    }

    async runMenu(name, run) {
        const box = this.boxes.menu
        this.lastMenuChoice = null
        this.lastToggleChoice = null
        this.bread.push(name)
        try {
            this.ensureClearScreen()
            await this.ensureLoaded(true)
            this.eraseAlerts()
            this.ensureMenuBackground()
            this.screen.moveTo(1, box.params.top)
            return await run(
                (...hints) => this.menuChoice(this.q.menuq(name, ...hints)),
                async loop => {
                    let ret
                    while (true) {
                        this.ensureMenuBackground()
                        // Save alerts to re-render on resize.
                        this.currentAlerts = this.consumeAlerts()
                        this.eraseMenu()
                        this.screen.moveTo(1, box.params.top)
                        ret = await loop()
                        if (ret !== true) {
                            break
                        }
                    }
                    return ret
                }
            )
        } finally {
            this.bread.pop()
        }
    }

    consumeAlerts(isSkipRender) {
        const alerts = this.alerts.consume()
        if (!isSkipRender) {
            this.renderAlerts(alerts)
        }
        return alerts
    }

    renderAlerts(alerts) {
        this.eraseAlerts()
        if (!alerts || !alerts.length) {
            return
        }
        const box = this.boxes.alerts
        const {format} = box.opts
        const {maxWidth, minWidth, left, top} = box.params
        const indent = left - 1
        const errors = []
        const levelsLines = alerts.map(alert => {
            extend(errors, alert.errors)
            const formatted = this.alerts.getFormatted(alert, this.theme.alert)
            return forceLineReturn(formatted.string, maxWidth).split('\n').flat().map(line =>
                [alert.level, padEnd(line, minWidth, format.pad(' '))]
            )
        }).flat()
        // Debug errors if ansi not enabled.
        if (this.logLevel > 3 && !this.settings.isAnsi) {
            errors.forEach(error => this.logger.error(error))
        }
        this.screen.saveCursor()
        levelsLines.forEach(([logLevel, line], i) => {
            this.screen.moveTo(left, top + i)
            const param = {indent, width: stringWidth(line)}
            this.alerter[logLevel](line)
            box.status.emit('line', param)
        })
        this.screen.restoreCursor()
        box.drawBorder()
    }

    async menuChoice(question, opts) {
        const box = this.boxes.menu
        question = {
            name     : 'choice',
            type     : 'rawlist',
            pageSize : box.opts.maxHeight - 4,
            prefix   : this.getMenuPrefix(),
            ...question,
        }
        const promise = this.questionAnswer(question, opts)
        // Ensure that prompt.menu event is emitted after first render.
        const onRender = () => this.emit('prompt.menu', {question, opts})
        box.status.once('render', onRender)
        let res
        try {
            res = await promise
        } finally {
            // Clean the listener in case it was not called.
            box.status.removeListener('render', onRender)
        }
        const {answer, isCancel, toggle, ...result} = res
        const choice = answer
        question = (question.choices.find(c => c.value === choice) || {}).question
        const ask = () => this.questionAnswer(question, opts)
        if (!isCancel) {
            this.lastMenuChoice = choice
        }
        this.lastToggleChoice = toggle
        return {answer, isCancel, choice, question, ask, toggle, ...result}
    }

    async questionAnswer(question, opts) {
        const box = this.boxes.menu
        opts = {
            cancelOnInterrupt: Boolean(question.cancel && !question.noInterrupt),
            ...opts,
        }
        const {name} = question
        const oldValue = getOrCall(question.default)
        let answers = {}
        if (question.answer != null) {
            lset(answers, name, question.answer)
        }
        const promise = this.prompt(question, answers, opts)
        // Ensure that prompt.question event is emitted after first render.
        const onRender = () => this.emit('prompt.question', {name, question, opts})
        box.status.once('render', onRender)
        try {
            answers = await promise
        } finally {
            // Clean the listener in case it was not called.
            box.status.removeListener('render', onRender)
        }
        const answer = lget(answers, name)
        const isCancel = Boolean(answers._cancelEvent)
        const isChange = isCancel === false && answer !== oldValue
        const toggle = answers['#toggle']
        return {answers, answer, isCancel, oldValue, isChange, toggle}
    }

    getMenuPrefix() {
        const {bread, __} = this
        const {pointer} = Chars
        if (bread.length < 2) {
            return ''
        }
        return bread.slice(0, bread.length - 1)
            .map(name => __(`menu.title.${name}`)) // i18n-ignore-line
            .join(` ${pointer} `) + ` ${pointer}`
    }

    handleInterrupt() {
        if (!this.captureInterrupt) {
            return 1
        }
        const handler = this.captureInterrupt
        this.captureInterrupt = null
        this.output.write('\n')
        return handler()
    }

    clearScreen() {
        this.screen.clear()
        this.hasClearedScreen = true
        this.hasMenuBackground = false
    }

    ensureClearScreen() {
        if (this.hasClearedScreen) {
            return
        }
        this.clearScreen()
    }

    eraseScreen() {
        this.screen.moveTo(1, 1).eraseDisplayBelow()
        this.hasMenuBackground = false
        this.resetBoxes()
    }

    resetBoxes() {
        Object.values(this.boxes).forEach(box => box.status.reset())
    }

    writeMenuBackground() {
        const box = this.boxes.screen
        const {screen} = this
        const {width, height} = screen
        const line = this.theme.menu.screen(screen.str.erase(width))
        this.resetBoxes()
        screen.saveCursor()
            .writeRows(1, 1, height, line)
            .restoreCursor()
        update(box.opts, {
            minWidth  : width,
            maxWidth  : width,
            minHeight : height,
            maxHeight : height,
        })
        box.drawBorder()
        this.hasMenuBackground = true
    }

    ensureMenuBackground() {
        if (this.hasMenuBackground) {
            return
        }
        this.writeMenuBackground()
    }

    eraseMenu() {
        this.boxes.menu.erase()
    }

    eraseAlerts() {
        this.boxes.alerts.erase()
    }

    async ensureLoaded(isQuiet) {
        await this.ensureThemesLoaded(isQuiet)
        await this.ensureSettingsLoaded()
        await this.ensureCredentialsLoaded()
    }

    async loadSettings() {
        const settingsFile = this.getSettingsFile()
        if (!settingsFile) {
            return
        }
        if (!fs.existsSync(settingsFile)) {
            await this.saveSettings()
        }
        const {__, settings, intl} = this
        const loaded = await fse.readJson(settingsFile)
        const defs = Menu.settingsDefaults()
        update(settings, defaults(defs, settings, loaded))
        update(settings.matchOpts, defaults(defs.matchOpts, loaded.matchOpts))
        if (intl.locale !== settings.locale) {
            intl.locale = settings.locale
        }
        if (settings.isCustomRobot && !isNonEmpty(settings.robots)) {
            // Populate for legacy format.
            update(settings.robots,  Menu.robotsDefaults())
            this.alerts.info(__('alerts.migratingLegacyRobotConfig'))
            await this.saveSettings()
        }
        if (this.isThemesLoaded) {
            this.theme = Themes.getInstance(settings.theme)
            this.alerter.theme = this.theme
        }
        if (this.screen.isAnsi !== settings.isAnsi) {
            this.screen.isAnsi = settings.isAnsi
        }
        this.isSettingsLoaded = true
    }

    async ensureSettingsLoaded() {
        if (this.isSettingsLoaded) {
            return
        }
        await this.loadSettings()
    }

    async saveSettings() {
        const settingsFile = this.getSettingsFile()
        if (settingsFile) {
            await fse.ensureDir(path.dirname(settingsFile))
            const settings = defaults(Menu.settingsDefaults(), this.settings)
            await fse.writeJson(settingsFile, settings, {spaces: 2})
        }
        // Load current theme.
        if (this.settings.theme !== this.theme.name) {
            this.theme = Themes.getInstance(this.settings.theme)
            this.alerter.theme = this.theme
        }
        // Set ansi enabled.
        if (this.screen.isAnsi !== this.settings.isAnsi) {
            this.screen.isAnsi = this.settings.isAnsi
        }
    }

    async loadCredentials() {
        const file = this.getCredentialsFile()
        if (!file) {
            return
        }
        if (!fs.existsSync(file)) {
            await this.saveCredentials()
        }
        const creds = await fse.readJson(file)
        if (ObsoleteServerUrls.includes(creds.serverUrl)) {
            creds.serverUrl = DefaultServerUrl
        }
        update(this.creds, defaults(Menu.credentialDefaults(), creds))
        this.isCredentialsLoaded = true
    }

    async ensureCredentialsLoaded() {
        if (this.isCredentialsLoaded) {
            return
        }
        await this.loadCredentials()
    }

    async saveCredentials() {
        const file = this.getCredentialsFile()
        if (file)  {
            await fse.ensureDir(path.dirname(file))
            await fse.writeJson(file, this.creds, {spaces: 2})
        }
    }

    clearCredentials() {
        update(this.creds, {
            username     : '',
            password     : '',
            needsConfirm : false,
            isTested     : false,
        })
    }

    async loadLabConfig() {
        const file = this.getLabConfigFile()
        if (!file) {
            return
        }
        if (fs.existsSync(file)) {
            try {
                return await fse.readJson(file)
            } catch (err) {
                this.logger.debug(err)
                this.logger.error('Failed to load saved lab state:', err.message)
            }
        }
    }

    async saveLabConfig(helper) {
        const file = this.getLabConfigFile()
        if (!file) {
            return
        }
        const data = {
            lastState : helper.board.state28(),
            persp     : helper.persp,
            rollsFile : helper.opts.rollsFile,
        }
        await fse.ensureDir(path.dirname(file))
        await fse.writeJson(file, data, {spaces: 2})
    }

    async loadCustomThemes(isQuiet) {
        const themesDir = this.getThemesDir()
        if (!themesDir) {
            return
        }
        const {__} = this
        const {loaded, errors} = await Themes.loadDirectory(themesDir)
        errors.forEach(info => {
            // TODO: __
            this.alerts.error(info.error, {...info, error: undefined})
        })
        if (!isQuiet && loaded.length) {
            const count = loaded.length
            this.alerts.info(__('alerts.loadedCustomThemes{count}', {count}))
        }
        this.theme = Themes.getInstance(this.settings.theme)
        this.alerter.theme = this.theme
        this.isThemesLoaded = true
        return loaded
    }

    async ensureThemesLoaded(isQuiet) {
        if (this.isThemesLoaded) {
            return
        }
        await this.loadCustomThemes(isQuiet)
    }

    getSettingsFile() {
        if (this.configDir) {
            return path.resolve(this.configDir, 'settings.json')
        }
    }

    getCredentialsFile() {
        if (this.configDir) {
            return path.resolve(this.configDir, 'credentials.json')
        }
    }

    getLabConfigFile() {
        if (this.configDir) {
            return path.resolve(this.configDir, 'lab.json')
        }
    }

    getThemesDir() {
        if (this.configDir) {
            return path.resolve(this.configDir, 'themes')
        }
    }

    encryptPassword(password) {
        return password ? encrypt2(password, this.chash) : ''
    }

    decryptPassword(password) {
        return password ? decrypt2(password, this.chash) : ''
    }

    robotsDefaults() {
        return Menu.robotsDefaults()
    }

    robotMeta(name) {
        return Menu.robotMeta(name)
    }

    robotDefaults(name) {
        return Menu.robotDefaults(name)
    }

    robotMinimalConfig(name) {
        return Menu.robotMinimalConfig(name)
    }

    destroy() {
        if (this.prompter && this.prompter.ui) {
            try {
                this.prompter.ui.close()
            } catch (err) {
                this.logger.warn(err)
            }
            this.prompter = null
        }
        destroyAll(this.boxes)
        if (this.players) {
            destroyAll(this.players)
            this.players = null
        }
        this.alerts.destroy()
        if (this.client) {
            try {
                this.client.close()
            } catch (err) {
                this.logger.warn(err)
            }
            this.client = null
        }
        this.coordinator = null
        this.removeListener('resize', this.handleResize)
    }

    static settingsDefaults() {
        const matchDefaults = Match.defaults()
        return {
            delay         : 0.5,
            isRecord      : false,
            recordDir     : this.getDefaultRecordDir(),
            fastForced    : false,
            isCustomRobot : false,
            theme         : DefaultThemeName,
            isAnsi        : DefaultAnsiEnabled,
            matchOpts     : {
                total       : 1,
                isJacoby    : matchDefaults.isJacoby,
                isCrawford  : matchDefaults.isCrawford,
                cubeEnabled : matchDefaults.cubeEnabled,
            },
            robots         : {},
            lastPlayChoice : undefined,
            locale         : DefaultLocale,
        }
    }

    static credentialDefaults() {
        return {
            serverUrl    : DefaultServerUrl,
            username     : '',
            password     : '',
            needsConfirm : false,
            isTested     : false,
        }
    }

    static robotsDefaults() {
        const defaults = {}
        RobotDelegator.listClassNames().forEach(name => {
            defaults[name] = Menu.robotDefaults(name)
        })
        return defaults
    }

    static robotMeta(name) {
        const {defaults, versions} = ConfidenceRobot.getClassMeta(name)
        return {defaults, versions}
    }

    static robotDefaults(name) {
        return Menu.robotMeta(name).defaults
    }

    static robotMinimalConfig(name) {
        return {
            ...Menu.robotDefaults(name),
            moveWeight   : 0,
            doubleWeight : 0,
        }
    }

    static getDefaultConfigDir() {
        return path.resolve(os.homedir(), '.gameon')
    }

    static getDefaultRecordDir() {
        return path.resolve(os.homedir(), 'gameon')
    }
}
