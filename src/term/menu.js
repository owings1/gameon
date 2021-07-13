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
const Constants = require('../lib/constants')
const Core      = require('../lib/core')
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')

const Coordinator  = require('../lib/coordinator')
const Client       = require('../net/client')
const LabHelper    = require('./lab')
const NetPlayer    = require('../net/player')
const Robot        = require('../robot/player')
const {TermHelper} = require('./draw')
const TermPlayer   = require('./player')
const Themes       = require('./themes')

const {ConfidenceRobot} = Robot
const {RobotDelegator}  = Robot

const {Match, Board, Dice} = Core
const {DependencyHelper}   = Util
const {StringBuilder}      = Util

const chalk      = require('chalk')
const fs         = require('fs')
const fse        = require('fs-extra')
const globby     = require('globby')
const {inquirer} = require('./inquirer')
const os         = require('os')
const path       = require('path')

const {EventEmitter} = require('events')

const Alerts       = require('./helpers/menu.alerts')
const ApiHelper    = require('./helpers/menu.api')
const Questions    = require('./helpers/menu.questions')
const TermBox      = require('./helpers/term.box')

const {
    castToArray
  , destroyAll
  , forceLineReturn
  , isCredentialsFilled
  , isEmptyObject
  , nchars
  , ntimes
  , padEnd
  , stringWidth
  , stripAnsi
  , sumArray
} = Util

const {
    Chars
  , CHash
  , DefaultServerUrl
  , DefaultTermEnabled
  , DefaultThemeName
  , ObsoleteServerUrls
  , Red
  , States
  , White
} = Constants

const {
    MatchCanceledError
  , MenuError
  , RequestError
  , ResetKeyNotEnteredError
  , WaitingAbortedError
} = Errors

const {
    LoginChoiceMap
  , MainChoiceMap
  , PlayChoiceMap
} = Constants.Menu

const ResizeTimoutMs = 100

const InterruptCancelEvent = {
    interrupt: true
  , key: {name: 'c', ctrl: true}
}

const InterruptCancelAnswers = {
    _cancelEvent: InterruptCancelEvent
}

class Menu extends EventEmitter {

    constructor(configDir) {

        super()

        this.configDir = configDir

        this.settings = Menu.settingsDefaults()
        this.credentials = Menu.credentialDefaults()

        this.chash = CHash
        this.bread = []

        this.theme = Themes.getDefaultInstance()
        this.term  = new TermHelper(this.settings.termEnabled)
        this.inquirer = inquirer.createPromptModule()

        this.logger = new Logger('Menu', {named: true})
        this.alerter = new Logger('Alerter', {raw: true})

        this.isCredentialsLoaded = false
        this.isSettingsLoaded = false
        this.isThemesLoaded = false

        this.alerts = new Alerts(this)
        this.api = new ApiHelper(this)
        this.q = new Questions(this)

        this.on('resize', this.handleResize.bind(this))

        this.boxes = {
            menu   : new TermBox({
                top       : 10
              , hcenter   : true
              , maxWidth  : 50
              , minWidth  : 50
              , maxHeight : 20
              //, pad       : 1
              , term      : this.term
              , isBorder  : true
              , borderFormat : chr => this.theme.menu.box.border(chr)
            })
          , alerts : new TermBox({
                top       : 1
              , hcenter   : true
              , maxWidth  : 80
              , minWidth  : 80
              , maxHeight : 5
              , term      : this.term
              , isBorder  : true
          })
        }
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
        this.alerter.loglevel = n
        this.api.loglevel = n
        if (this.thisClient) {
            this.thisClient.loglevel = n
        }
    }

    mainMenu() {

        return this.runMenu('Main', async (choose, loop) => {

            await loop(async () => {

                const {choice} = await choose()

                if (choice == 'quit') {
                    return
                }

                const {method} = MainChoiceMap[choice]
                const isContinue = await this[method]()
                if (choice == 'lab') {
                    await this.eraseScreen()
                }
                return isContinue
            })

            return true
        })
    }

    playMenu() {

        return this.runMenu('Play', async (choose, loop) => {

            let isContinue = true

            await loop(async () => {

                isContinue = true

                const {choice, ask} = await choose()

                if (choice == 'back') {
                    return
                }

                if (choice == 'quit') {
                    isContinue = false
                    return
                }

                if (this.settings.lastPlayChoice != choice) {
                    this.settings.lastPlayChoice = choice
                    await this.saveSettings()
                }

                try {
                    isContinue = await this.matchMenu(choice)
                } catch (err) {
                    this.alerts.error(err)
                    if (err.isAuthError) {
                        this.alerts.warn('Authentication failed. Go to Account to sign up or log in.')
                    }
                }

                return isContinue
            })

            return isContinue
        })
    }

    matchMenu(playChoice) {

        return this.runMenu('Match', async (choose, loop) => {

            const {message, method, isAdvanced, isJoin} = PlayChoiceMap[playChoice]

            let isContinue = true
            let advancedOpts = {}

            await loop(async () => {

                isContinue = true

                const {choice, toggle, ask} = await choose(playChoice)

                if (choice == 'back') {
                    return
                }

                if (choice == 'quit') {
                    isContinue = false
                    return
                }

                if (toggle) {
                    this.settings.matchOpts[choice] = !this.settings.matchOpts[choice]
                    await this.saveSettings()
                    return true
                }

                if (choice == 'advanced') {
                    advancedOpts = await this.promptMatchAdvancedOpts(advancedOpts)
                    return true
                }

                if (choice == 'start') {
                    const args = []
                    if (isJoin) {
                        const join = await ask()
                        if (join.isCancel || !join.answer) {
                            return false
                        }
                        args.push(join.answer)
                    } else {
                        let {matchOpts} = this.settings
                        if (isAdvanced) {
                            matchOpts = await this.getMatchOpts(matchOpts, advancedOpts)
                        }
                        args.push(matchOpts)
                    }
                    await this[method](...args)
                    return true
                }

                let {answer, isCancel, isChange} = await ask()

                if (isCancel || !isChange) {
                    return true
                }

                this.settings.matchOpts[choice] = answer
                await this.saveSettings()

                return true
            })

            return isContinue
        })
    }

    accountMenu() {

        return this.runMenu('Account', async (choose, loop) => {

            await loop(async () => {

                const {choice, ask} = await choose()

                if (choice == 'done') {
                    return
                }

                if (choice == 'clearCredentials') {
                    this.clearCredentials()
                    await this.saveCredentials()
                    return true
                }

                if (LoginChoiceMap[choice]) {
                    try {
                        const {message, method} = LoginChoiceMap[choice]
                        if (method) {
                            if (await this[method].call(this)) {
                                this.alerts.info(message)
                            } else {
                                return true
                            }
                        }
                    } catch (err) {
                        this.alerts.error(err)
                        return true
                    }
                } else {

                    const {answer, isCancel, isChange} = await ask()

                    if (isCancel || !isChange) {
                        return true
                    }

                    this.credentials.isTested = false
                    if (choice == 'password') {
                        this.credentials[choice] = this.encryptPassword(answer)
                    } else {
                        this.credentials[choice] = answer
                    }
                }

                try {
                    if (!isCredentialsFilled(this.credentials, true)) {
                        return true
                    }
                    await this.doLogin()
                } catch (err) {
                    this.alerts.error(err)
                } finally {
                    await this.saveCredentials()
                }

                return true
            })

            return true
        })
    }

    settingsMenu() {

        return this.runMenu('Settings', async (choose, loop) => {

            await loop(async () => {

                const {choice, toggle, ask} = await choose()

                if (choice == 'done') {
                    return
                }

                if (toggle) {
                    this.settings[choice] = !this.settings[choice]
                    await this.saveSettings()
                    return true
                }

                if (choice == 'robotConfigs') {
                    await this.robotsMenu()
                    return true
                }

                const {answer, isCancel, isChange} = await ask()

                if (isCancel || !isChange) {
                    return true
                }

                this.settings[choice] = answer
                await this.saveSettings()

                if (choice == 'isCustomRobot') {
                    // We changed to custom robot, go directly to robots menu.
                    // This excludes toggle above.
                    await this.robotsMenu()
                    return true
                }

                if (choice == 'theme' || choice == 'termEnabled') {
                    // erase the screen because the background may change.
                    await this.eraseScreen()
                }

                return true
            })

            return true
        })
    }

    robotsMenu() {

        return this.runMenu('Robots', async (choose, loop) => {

            if (isEmptyObject(this.settings.robots)) {
                this.logger.info('Loading robot defaults')
                this.settings.robots = this.robotsDefaults()
                await this.saveSettings()
            }

            await loop(async () => {

                const {choice} = await choose()

                if (choice == 'done') {
                    return
                }

                if (choice == 'reset') {
                    this.settings.robots = this.robotsDefaults()
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

        return this.runMenu('Robot', async (choose, loop) => {

            if (isEmptyObject(this.settings.robots[name])) {
                this.settings.robots[name] = this.robotMinimalConfig(name)
            }

            await loop(async () => {

                const {choice, ask} = await choose(name)

                if (choice == 'done') {
                    return
                }

                if (choice == 'reset') {
                    this.settings.robots[name] = this.robotDefaults(name)
                    await this.saveSettings()
                    return
                }

                const {answer, isCancel, isChange} = await ask()

                if (isCancel || !isChange) {
                    return
                }

                this.settings.robots[name][choice] = answer
                await this.saveSettings()

                // always break
            })

            return true
        })
    }

    async promptCreateAccount() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        const answers = await this.prompt(this.q.createAccount())

        if (answers._cancelEvent) {
            return false
        }

        const {passwordEncrypted} = await this.api.signup(
            credentials.serverUrl
          , answers.username
          , answers.password
        )

        credentials.username = answers.username
        credentials.password = this.encryptPassword(passwordEncrypted)

        return true
    }

    async promptForgotPassword() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        const {answer, isCancel} = await this.questionAnswer(this.q.username())

        if (isCancel) {
            return false
        }

        await this.api.forgotPassword(credentials.serverUrl, answer)
        credentials.username = answer

        const answers = await this.prompt(this.q.forgotPassword(), null, {cancelOnInterrupt: true})

        if (answers._cancelEvent || !answers.resetKey) {
            return false
        }

        const {passwordEncrypted} = await this.api.resetPassword(credentials, answers)
        credentials.password = this.encryptPassword(passwordEncrypted)

        return true
    }

    async promptChangePassword() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        const answers = await this.prompt(this.q.changePassword())

        if (answers._cancelEvent) {
            return false
        }

        const {passwordEncrypted} = await this.api.changePassword(credentials, answers)
        credentials.password = this.encryptPassword(passwordEncrypted)

        return true
    }

    async promptConfirmAccount() {

        await this.ensureCredentialsLoaded()

        const {answer, isCancel} = await this.questionAnswer(this.q.confirmKey())

        if (isCancel || !answer.length) {
            return false
        }

        const {credentials} = this
        try {
            await this.api.confirmKey(credentials, answer)
        } catch (err) {
            if (err.isUserConfirmedError) {
                this.alerts.warn('Account already confirmed')
            } else {
                throw err
            }
        }
        
        credentials.needsConfirm = false

        return true
    }

    async promptNewConfirmKey() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        if (!credentials.username) {

            const {answer, isCancel} = await this.questionAnswer(this.q.username())
            if (isCancel || !answer.length) {
                return false
            }
            credentials.username = answer
        }

        await this.api.requestConfirmKey(credentials)

        return true
    }

    async promptMatchAdvancedOpts(defaults) {
        const questions = this.q.matchAdvanced(defaults)
        const answers = await this.prompt(questions, null, {cancelOnInterrupt: true})
        if (answers._cancelEvent) {
            return {...defaults}
        }
        return answers
    }

    async doLogin() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        credentials.isTested = false

        try {

            const password = this.decryptPassword(credentials.password)
            const {passwordEncrypted} = await this.api.authenticate({...credentials, password})

            credentials.password = this.encryptPassword(passwordEncrypted)

        } catch (err) {

            let isSuccess = false

            if (err.isUserNotConfirmedError) {

                credentials.needsConfirm = true

                isSuccess = await this.promptConfirmAccount()            
            }

            if (!isSuccess) {
                this.alerts.warn('Login failed to', credentials.serverUrl)
                throw err
            }
        }

        this.alerts.success('Login success to', credentials.serverUrl)

        credentials.needsConfirm = false
        credentials.isTested = true

        return true
    }

    async startOnlineMatch(matchOpts) {
        await this._runOnlineMatch(matchOpts, true, null)
    }

    async joinOnlineMatch(matchId) {
        await this._runOnlineMatch(null, false, matchId)
    }

    async playRobot(matchOpts) {
        await this.ensureLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer(White, this.settings)
          , Red   : new TermPlayer.Robot(this.newRobot(Red), this.settings)
        }
        await this.runMatch(match, players)
    }

    async playRobots(matchOpts) {
        await this.ensureLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer.Robot(this.newRobot(White), this.settings)
          , Red   : new TermPlayer.Robot(this.newDefaultRobot(Red), this.settings)
        }
        await this.runMatch(match, players)
    }

    async playHumans(matchOpts) {
        await this.ensureLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer(White, this.settings)
          , Red   : new TermPlayer(Red, this.settings)
        }
        await this.runMatch(match, players)
    }

    async _runOnlineMatch(matchOpts, isStart, matchId) {

        await this.ensureLoaded()

        const client = this.newClient(this.credentials, true)

        try {
            const termPlayer = new TermPlayer(isStart ? White : Red, this.settings)
            const netPlayer  = new NetPlayer(client, isStart ? Red : White)
            const players = {
                White : isStart ? termPlayer : netPlayer
              , Red   : isStart ? netPlayer  : termPlayer
            }
            this.captureInterrupt = () => {
                this.logger.warn('Aborting')
                client.cancelWaiting(new WaitingAbortedError('Keyboard interrupt'))
                return true
            }

            await client.connect()
            const promise = isStart ? client.createMatch(matchOpts) : client.joinMatch(matchId)
            this.emit('clientWaitStart', client)
            const match = await promise

            this.captureInterrupt = null
            
            await this.runMatch(match, players)

        } catch (err) {
            if (err.isWaitingAbortedError) {
                this.alerts.warn(err)
                return
            }
            throw err
        } finally {
            this.captureInterrupt = null
            await client.close()
        }
    }

    async runMatch(match, players) {
        try {

            const coordinator = this.newCoordinator()
            this.coordinator = coordinator
            this.players = players

            this.captureInterrupt = () => {
                this.alerts.warn('Canceling match')
                const err = new MatchCanceledError('Keyboard interrupt')
                coordinator.cancelMatch(match, players, err)
                return true
            }

            this.emit('beforeMatchStart', match, players)

            this.eraseScreen()
            await this.consumeAlerts()

            await coordinator.runMatch(match, players)

        } catch (err) {
            if (err.isMatchCanceledError) {
                this.alerts.warn(err)
                return
            }
            throw err
        } finally {

            this.captureInterrupt = null
            this.coordinator = null
            this.players = null

            await destroyAll(players)
            this.clearScreen()
        }
    }

    async runLab(cmds) {
        await this.ensureSettingsLoaded()
        await this.ensureThemesLoaded()
        const config = await this.loadLabConfig()
        if (config) {
            var board = Board.fromStateString(config.lastState)
            var persp = config.persp
            var rollsFile = config.rollsFile
        } else {
            var board = Board.setup()
            var persp = White
            var rollsFile = null
        }
        const {theme, isCustomRobot, robots, recordDir, termEnabled} = this.settings
        const labOpts = {
            board
          , persp
          , theme
          , isCustomRobot
          , robots
          , recordDir
          , rollsFile
          , termEnabled
        }
        const helper = new LabHelper(labOpts)
        this.emit('beforeRunLab', helper)
        if (cmds && cmds.length) {
            cmds = castToArray(cmds)
            for (var i = 0; i < cmds.length; ++i) {
                await helper.runCommand(cmds[i], i == 0)
            }
        } else {
            await helper.interactive()
        }
        await this.saveLabConfig(helper)
        return true
    }

    async getMatchOpts(matchOpts, advancedOpts = {}) {
        matchOpts = {...matchOpts}
        if (advancedOpts.startState) {
            this.logger.info('Setting initial state')
            matchOpts.startState = advancedOpts.startState
        }
        if (advancedOpts.rollsFile) {
            this.logger.info('Using custom rolls file')
            const file = advancedOpts.rollsFile
            const {rolls} = await fse.readJson(file)
            matchOpts.roller = Dice.createRoller(rolls)
        }
        return matchOpts
    }

    newRobot(...args) {
        const {settings} = this
        if (!settings.isCustomRobot) {
            return this.newDefaultRobot(...args)
        }
        return RobotDelegator.forSettings(settings.robots, ...args)
    }

    newDefaultRobot(...args) {
        return RobotDelegator.forDefaults(...args)
    }

    newCoordinator() {
        return new Coordinator(this.settings)
    }

    newClient(credentials) {
        credentials = {
            ...credentials
          , password: this.decryptPassword(credentials.password)
        }
        const client = new Client(credentials)
        this.thisClient = client
        client.loglevel = this.loglevel
        return client
    }

    prompt(questions, answers, opts) {
        opts = this.getPromptOpts(opts)
        return new Promise((resolve, reject) => {
            if (opts.cancelOnInterrupt) {
                this.captureInterrupt = () => {
                    if (this.prompter && this.prompter.ui) {
                        resolve(InterruptCancelAnswers)
                        this.prompter.ui.close()
                        return true
                    }
                }
            }
            this.prompter = this.inquirer.prompt(questions, answers, opts)
            this.prompter.then(answers => {
                this.captureInterrupt = null
                resolve(answers)
                this.prompter = null
            }).catch(err => {
                this.captureInterrupt = null
                reject(err)
                this.prompter = null
            })
        })
    }

    getPromptOpts(opts) {
        const box = this.boxes.menu
        const {maxWidth, left} = box.getParams()
        let indent = left - 1
        if (!this.settings.termEnabled) {
            indent = 0
        }
        return {
            theme         : this.theme
          , emitter       : box.status
          , term          : this.term
          , clearMaxWidth : true
          , maxWidth
          , indent
        }
    }

    handleResize() {
        this.hasMenuBackground = false
        if (this.players) {
            Object.values(this.players).forEach(player => player.emit('resize'))
        }
        if (!this.settings.termEnabled) {
            return
        }
        clearTimeout(this.resizeTimeout)
        this.resizeTime = setTimeout(() => {
            const {prompter} = this
            if (!prompter || !prompter.ui) {
                return
            }
            const {ui} = prompter
            if (typeof ui.onResize != 'function') {
                return
            }
            const opts = this.getPromptOpts()
            this.writeMenuBackground()
            this.renderAlerts(this.currentAlerts)
            this.term.moveTo(1, this.boxes.menu.getParams().top)
            ui.onResize(opts, true)
        }, ResizeTimoutMs)
    }

    async runMenu(title, run) {
        this.bread.push(title)
        try {
            this.ensureClearScreen()
            await this.ensureLoaded(true)
            this.eraseAlerts()
            this.ensureMenuBackground()
            this.lastMenuChoice = null
            this.lastToggleChoice = null
            return await run(
                hint => this.menuChoice(this.q.menu(title, hint))
              , async loop => {
                    let res
                    while (true) {
                        this.ensureMenuBackground()
                        this.currentAlerts = await this.consumeAlerts()
                        this.eraseMenu()
                        res = await loop()
                        if (res !== true) {
                            break
                        }
                    }
                    return res
                }
            )
        } finally {
            this.bread.pop()
        }
    }

    async consumeAlerts(isSkipRender) {
        const alerts = await this.alerts.consume()
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

        const chlk = this.theme.alert
        const box = this.boxes.alerts

        const {maxWidth, minWidth, left} = box.getParams()
        const indent = left - 1
        const levelsLines = alerts.map(({logLevel, error, formatted}) =>
            forceLineReturn(formatted.string, maxWidth).split('\n').flat().map(line =>
                [logLevel, padEnd(line, minWidth, chlk.screen(' '))]
            )
        ).flat()
        
        levelsLines.forEach(([logLevel, line]) => {
            if (indent) {
                this.term.right(indent)
            }
            const param = {indent, width: stringWidth(line)}
            this.alerter[logLevel](line)
            box.status.emit('line', param)
        })
        box.drawBorder()
    }

    async menuChoice(question, opts) {
        question = {
            name     : 'choice'
          , type     : 'rawlist'
          , pageSize : Infinity
          , prefix   : this.getMenuPrefix()
          , ...question
        }
        const {answer, isCancel, toggle, ...result} = await this.questionAnswer(question, opts)
        const choice = answer
        question = (question.choices.find(c => c.value == choice) || {}).question
        const ask = () => this.questionAnswer(question, opts)
        if (!isCancel) {
            this.lastMenuChoice = choice
        }
        this.lastToggleChoice = toggle
        return {answer, isCancel, choice, question, ask, toggle, ...result}
    }

    async questionAnswer(question, opts) {
        opts = {
            cancelOnInterrupt: !!question.cancel && !question.noInterrupt
          , ...opts
        }
        const {name} = question
        const oldValue = typeof question.default == 'function' ? question.default() : question.default
        var answers = {}
        if (question.answer != null) {
            answers[name] = question.answer
        }
        answers = await this.prompt(question, answers, opts)
        const answer = answers[name]
        const isCancel = !!answers._cancelEvent
        const isChange = !isCancel && answer != oldValue
        const toggle = answers['#toggle']
        return {answers, answer, isCancel, oldValue, isChange, toggle}
    }

    getMenuPrefix() {
        if (this.bread.length > 1) {
            return this.bread.slice(0, this.bread.length - 1).join(' > ') + ' >'
        }
        return ''
    }

    handleInterrupt() {
        const handler = this.captureInterrupt
        this.captureInterrupt = null
        if (handler) {
            this.logger.console.log()
            return handler()
        }
        return 1
    }

    clearScreen() {
        this.term.clear()
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
        this.term.moveTo(1, 1).eraseDisplayBelow()
        this.hasMenuBackground = false
        Object.values(this.boxes).forEach(box => box.status.reset())
    }

    writeMenuBackground() {
        Object.values(this.boxes).forEach(box => box.status.reset())
        if (!this.settings.termEnabled) {
            return
        }
        const chlk = this.theme.menu
        const str = chlk.screen(nchars(this.term.width, ' '))
        this.term.writeArea(1, 1, 1, this.term.height, str)
        this.term.moveTo(1, 1)
        this.hasMenuBackground = true
    }

    ensureMenuBackground() {
        if (this.hasMenuBackground) {
            return
        }
        this.writeMenuBackground()
    }

    eraseMenu() {
        const chlk = this.theme.menu
        const box = this.boxes.menu
        box.erase(width => chlk.screen(nchars(width, ' ')))
        this.term.moveTo(1, box.getParams().top)
    }

    eraseAlerts() {
        const chlk = this.theme.menu
        const box = this.boxes.alerts
        box.erase(width => chlk.screen(nchars(width, ' ')))
        this.term.moveTo(1, box.getParams().top)
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

        const settings = await fse.readJson(settingsFile)

        const defaults = Menu.settingsDefaults()
        this.settings = Util.defaults(defaults, this.settings, settings)
        this.settings.matchOpts = Util.defaults(defaults.matchOpts, settings.matchOpts)

        if (this.settings.isCustomRobot && isEmptyObject(this.settings.robots)) {
            // populate for legacy format
            this.settings.robots = Menu.robotsDefaults()
            this.alerts.info('Migrating legacy robot config')
            await this.saveSettings()
        }

        if (this.isThemesLoaded) {
            this.theme = Themes.getInstance(this.settings.theme)
            this.alerter.theme = this.theme
        }

        if (this.term.enabled != this.settings.termEnabled) {
            this.term.enabled = this.settings.termEnabled
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
            const settings = Util.defaults(Menu.settingsDefaults(), this.settings)
            await fse.writeJson(settingsFile, settings, {spaces: 2})
        }
        // Load current theme
        if (this.settings.theme != this.theme.name) {
            this.theme = Themes.getInstance(this.settings.theme)
            this.alerter.theme = this.theme
        }
        // Set term enabled
        if (this.term.enabled != this.settings.termEnabled) {
            this.term.enabled = this.settings.termEnabled
        }
    }

    async loadCredentials() {
        const credentialsFile = this.getCredentialsFile()
        if (!credentialsFile) {
            return
        }
        if (!fs.existsSync(credentialsFile)) {
            await this.saveCredentials()
        }
        const credentials = await fse.readJson(credentialsFile)
        if (ObsoleteServerUrls.indexOf(credentials.serverUrl) > -1) {
            credentials.serverUrl = Menu.getDefaultServerUrl()
        }

        this.credentials = Util.defaults(Menu.credentialDefaults(), credentials)

        this.isCredentialsLoaded = true
    }

    async ensureCredentialsLoaded() {
        if (this.isCredentialsLoaded) {
            return
        }
        await this.loadCredentials()
    }

    async saveCredentials() {
        const credentialsFile = this.getCredentialsFile()
        if (credentialsFile)  {
            await fse.ensureDir(path.dirname(credentialsFile))
            await fse.writeJson(credentialsFile, this.credentials, {spaces: 2})
        }
    }

    clearCredentials() {
        const {credentials} = this
        credentials.username = ''
        credentials.password = ''
        credentials.needsConfirm = null
        credentials.isTested = false
    }

    async loadLabConfig() {
        const configFile = this.getLabConfigFile()
        if (!configFile) {
            return
        }
        if (fs.existsSync(configFile)) {
            try {
                const data = await fse.readJson(configFile)
                return data
            } catch (err) {
                this.logger.debug(err)
                this.logger.error('Failed to load saved lab state:', err.message)
            }
        }
    }

    async saveLabConfig(helper) {
        const configFile = this.getLabConfigFile()
        if (!configFile) {
            return
        }
        const data = {
            lastState : helper.board.state28()
          , persp     : helper.persp
          , rollsFile : helper.opts.rollsFile
        }
        await fse.ensureDir(path.dirname(configFile))
        await fse.writeJson(configFile, data, {spaces: 2})
    }

    async loadCustomThemes(isQuiet) {

        const themesDir = this.getThemesDir()

        if (!themesDir) {
            return
        }

        const {loaded, errors} = await Themes.loadDirectory(themesDir)
        errors.forEach(info => {
            this.alerts.error(info.error, {...info, error: undefined})
        })
        if (!isQuiet && loaded.length) {
            this.alerts.info('Loaded', loaded.length, 'custom themes')
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
        return password ? Util.encrypt1(password, this.chash) : ''
    }

    decryptPassword(password) {
        return password ? Util.decrypt1(password, this.chash) : ''
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

    static settingsDefaults() {
        const matchDefaults = Match.defaults()
        return {
            delay         : 0.5
          , isRecord      : false
          , recordDir     : this.getDefaultRecordDir()
          , fastForced    : false
          , isCustomRobot : false
          , theme         : DefaultThemeName
          , termEnabled   : DefaultTermEnabled
          , matchOpts     : {
                total       : 1
              , isJacoby    : matchDefaults.isJacoby
              , isCrawford  : matchDefaults.isCrawford
              , cubeEnabled : matchDefaults.cubeEnabled
            }
          , robots         : {}
          , lastPlayChoice : undefined
        }
    }

    static credentialDefaults() {
        return {
            serverUrl    : this.getDefaultServerUrl()
          , username     : ''
          , password     : ''
          , needsConfirm : null
          , isTested     : false
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
            ...Menu.robotDefaults(name)
          , moveWeight   : 0
          , doubleWeight : 0
        }
    }

    static getDefaultConfigDir() {
        return path.resolve(os.homedir(), '.gameon')
    }

    static getDefaultServerUrl() {
        return DefaultServerUrl
    }

    static getDefaultRecordDir() {
        return path.resolve(os.homedir(), 'gameon')
    }
}

module.exports = Menu