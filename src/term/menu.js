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

const chalk    = require('chalk')
const crypto   = require('crypto')
const fs       = require('fs')
const fse      = require('fs-extra')
const globby   = require('globby')
const os       = require('os')
const path     = require('path')

const {EventEmitter} = require('events')

const QuestionHelper = require('./helpers/menu.questions')
const {inquirer} = require('./inquirer')

const {
    castToArray
  , isEmptyObject
  , stringWidth
  , stripAnsi
  , sumArray
} = Util

const {
    Chars
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

function isCredentialsFilled(credentials, isServer) {
    const keys = ['username', 'password']
    if (isServer) {
        keys.push('serverUrl')
    }
    return !keys.find(key => !credentials[key])
}

function choiceQuestion(choices, value) {
    const choice = choices.find(choice => choice.value == value)
    if (choice) {
        return choice.question
    }
}

const InterruptCancelEvent = {
    interrupt: true
  , key: {name: 'c', ctrl: true}
}

const CHash = (() => {
    const hash = crypto.createHash('md5')
    hash.update('main-menu')
    return hash.digest('hex')
}).call()

class Menu extends EventEmitter {

    constructor(configDir) {

        super()

        this.logger = new Logger('Menu', {named: true})
        this.alerter = new Logger('Alerter', {alerter: true})
        this.configDir = configDir

        this.settings = Menu.settingsDefaults()
        this.credentials = Menu.credentialDefaults()

        this.isCredentialsLoaded = false
        this.isSettingsLoaded = false
        this.isThemesLoaded = false

        this.chash = CHash
        this.bread = []
        this.alerts = []

        this.theme = Themes.getDefaultInstance()
        this.term  = new TermHelper(this.settings.termEnabled)
        this.top = 10
        this.indent = 10//10//2//1//0//20
        this.maxWidth = Infinity//60
        this.linesToClear = 0

        this.inquirer = inquirer
        this.q = new QuestionHelper(this)
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

            var isContinue = true

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
                    this.alerts.push(['error', err])
                    if (err.isAuthError) {
                        this.alerts.push(['warn', 'Authentication failed. Go to Account to sign up or log in.'])
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

            var isContinue
            var advancedOpts = {}

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
                        var {matchOpts} = this.settings
                        if (isAdvanced) {
                            matchOpts = await this.getMatchOpts(matchOpts, advancedOpts)
                        }
                        args.push(matchOpts)
                    }
                    await this[method](...args)
                    return true
                }

                const {answer, isCancel, isChange} = await ask()

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
                                this.alerts.push(['info', message])
                            } else {
                                return true
                            }
                        }
                    } catch (err) {
                        this.alerts.push(['error', err])
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
                    this.alerts.push(['error', err])
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
                //return true
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

        const {passwordEncrypted} = await this.sendSignup(
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

        await this.sendForgotPassword(credentials.serverUrl, answer)
        credentials.username = answer

        this.alerts.push(['info', 'Reset key requested, check your email.'])
        await this.consumeAlerts()

        const answers = await this.prompt(this.q.forgotPassword(), null, {cancelOnInterrupt: true})

        if (answers._cancelEvent || !answers.resetKey) {
            return false
        }

        const {passwordEncrypted} = await this.sendResetPassword(credentials, answers)
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

        const {passwordEncrypted} = await this.sendChangePassword(credentials, answers)
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
            await this.sendConfirmKey(credentials, answer)
        } catch (err) {
            if (err.isUserConfirmedError) {
                this.alerts.push(['warn', 'Account already confirmed'])
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

        await this.sendRequestConfirmKey(credentials)

        return true
    }

    async promptMatchAdvancedOpts(defaults) {
        const questions = this.q.matchAdvanced(defaults)
        const answers = await this.prompt(questions)
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

            const {passwordEncrypted} = await this.testCredentials(credentials, true)

            credentials.password = this.encryptPassword(passwordEncrypted)

        } catch (err) {

            var isSuccess = false

            if (err.isUserNotConfirmedError) {

                this.alerts.push(['info', 'You must confirm your account. Check your email for a confirmation key.'])
                await this.consumeAlerts()

                credentials.needsConfirm = true

                isSuccess = await this.promptConfirmAccount()            
            }

            if (!isSuccess) {
                this.alerts.push(['warn', 'Login failed to', credentials.serverUrl])
                throw err
            }
        }

        const chlk = this.theme.alert
        this.alerts.push(['info', chlk.success.message('Login success'), 'to', credentials.serverUrl, Util.nchars(200, '-')])

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
        await this.ensureSettingsLoaded()
        await this.ensureThemesLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer(White, this.settings)
          , Red   : new TermPlayer.Robot(this.newRobot(Red), this.settings)
        }
        await this.runMatch(match, players)
    }

    async playRobots(matchOpts) {
        await this.ensureSettingsLoaded()
        await this.ensureThemesLoaded()
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer.Robot(this.newRobot(White), this.settings)
          , Red   : new TermPlayer.Robot(this.newDefaultRobot(Red), this.settings)
        }
        await this.runMatch(match, players)
    }

    async playHumans(matchOpts) {
        await this.ensureSettingsLoaded()
        await this.ensureThemesLoaded()
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
                this.alerts.push(['warn', err])
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
            this.captureInterrupt = () => {
                this.alerts.push(['warn', 'Canceling match'])
                coordinator.cancelMatch(match, players, new MatchCanceledError('Keyboard interrupt'))
                return true
            }
            this.emit('beforeMatchStart', match, players)
            await this.clearAndConsume()
            await coordinator.runMatch(match, players)
        } catch (err) {
            if (err.isMatchCanceledError) {
                this.alerts.push(['warn', err])
                return
            }
            throw err
        } finally {
            this.captureInterrupt = null
            await Util.destroyAll(players)
            await this.clearScreen()
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

    async testCredentials(credentials, isDecrypt) {
        const client = this.newClient(credentials, isDecrypt)
        try {
            return await client.connect()
        } finally {
            await client.close()
        }
    }

    async sendSignup(serverUrl, username, password) {
        const client = this.newClient(serverUrl)
        const data = {username, password}
        return await this.handleRequest(client, '/api/v1/signup', data)
    }

    async sendConfirmKey({serverUrl, username}, confirmKey) {
        const client = this.newClient(serverUrl)
        const data = {username, confirmKey}
        return await this.handleRequest(client, '/api/v1/confirm-account', data)
    }

    async sendRequestConfirmKey({serverUrl, username}) {
        const client = this.newClient(serverUrl)
        const data = {username}
        return await this.handleRequest(client, '/api/v1/send-confirm-email', data)
    }

    async sendForgotPassword(serverUrl, username) {
        const client = this.newClient(serverUrl)
        const data = {username}
        return await this.handleRequest(client, '/api/v1/forgot-password', data)
    }

    async sendResetPassword({serverUrl, username}, {password, resetKey}) {
        const client = this.newClient(serverUrl)
        const data = {username, password, resetKey}
        return await this.handleRequest(client, '/api/v1/reset-password', data)
    }

    async sendChangePassword({serverUrl, username}, {oldPassword, newPassword}) {
        const client = this.newClient(serverUrl)
        const data = {username, oldPassword, newPassword}
        return await this.handleRequest(client, '/api/v1/change-password', data)
    }

    async handleRequest(client, uri, data) {
        const res = await client.postJson(uri, data)
        const body = await res.json()
        if (!res.ok) {
            this.logger.debug(body)
            throw RequestError.forResponse(res, body, uri.split('/').pop() + ' failed')
        }
        return body
    }

    newCoordinator() {
        return new Coordinator(this.settings)
    }

    newClient(...args) {
        if (typeof args[0] == 'object') {
            var credentials = {...args[0]}
            const isDecrypt = !!args[1]
            if (isDecrypt) {
                credentials.password = this.decryptPassword(credentials.password)
            }
        } else {
            var [serverUrl, username, password] = args
            var credentials = {serverUrl, username, password}
        }
        const client = new Client(credentials)
        client.logger.loglevel = this.logger.loglevel
        return client
    }

    prompt(questions, answers, opts) {
        const indent = this.settings.termEnabled ? this.indent : 0
        const maxWidth = this.settings.termEnabled ? this.maxWidth : Infinity
        opts = {indent, maxWidth, theme: this.theme, ...opts}
        return new Promise((resolve, reject) => {
            if (opts.cancelOnInterrupt) {
                this.captureInterrupt = () => {
                    if (this._prompt && this._prompt.ui) {
                        resolve({_cancelEvent: InterruptCancelEvent})
                        this._prompt.ui.close()
                        return true
                    }
                }
            }
            this._prompt = this.inquirer.prompt(questions, answers, opts)
            this._prompt.ui.process.subscribe(
                () => this.linesToClear += 1
            )
            this._prompt.then(answers => {
                this.captureInterrupt = null
                resolve(answers)
            }).catch(err => {
                this.captureInterrupt = null
                reject(err)
            })
        })
    }

    async runMenu(title, run) {
        this.bread.push(title)
        try {
            await this.ensureClearScreen()
            await this.ensureLoaded(true)
            this.lastMenuChoice = null
            this.lastToggleChoice = null
            return await run(
                hint => this.menuChoice(this.q.menu(title, hint))
              , async loop => {
                    var res
                    while (true) {
                        await this.clearAndConsume()
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

    async menuChoice(question, opts) {
        question = {
            name     : 'choice'
          , type     : 'rawlist'
          , pageSize : Infinity
          , prefix   : this.getMenuPrefix()
          , ...question
        }
        const {answer, isCancel, toggle, ...result} = await this.questionAnswer(question, opts)
        question = choiceQuestion(question.choices, answer)
        const ask = () => this.questionAnswer(question, opts)
        const choice = answer
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

    async clearAndConsume() {
        await this.clearMenu()
        await this.consumeAlerts()
    }

    async clearMenu() {
        const width = this.term.width - this.indent
        const height = 2 + this.linesToClear
        this.term.eraseArea(this.indent, this.top, width, height).moveTo(1, this.top)
        this.linesToClear = 0
    }

    async clearScreen() {
        this.term.clear()
        this.linesToClear = 0
    }

    async eraseScreen() {
        this.term.moveTo(1, 1).eraseDisplayBelow()
        this.linesToClear = 0
    }

    async ensureClearScreen() {
        if (!this.hasClearedScreen) {
            await this.clearScreen()
            this.hasClearedScreen = true
        }
    }

    async consumeAlerts() {
        const alerts = this.alerts.splice(0)
        if (!alerts.length) {
            return
        }
        const chlk = this.theme.alert
        const levelsMap = {
            success : true
          , info   : true
          , warn   : true
          , error  : true
        }
        const makeMsg = arg => arg instanceof Error
            ? [arg.name || arg.constructor.name, arg.message].join(': ')
            : arg
        const strsWidth = args => sumArray(args.map(stringWidth)) + args.length - 1
        const maxWidth = this.settings.termEnabled ? this.term.width - this.indent : Infinity


        for (var alert of alerts) {

            var args = castToArray(alert).map(makeMsg)
            var level = levelsMap[args[0]] ? args.shift() : 'warn'
            var alevel = level == 'success' ? 'info' : level

            if (chlk[level].level) {
                args.unshift(`[${level.toUpperCase()}]`)
            }

            // truncate
            // TODO: don't truncate, split lines
            var lines = []
            for (var len = strsWidth(args); len > maxWidth; len = strsWidth(args)) {
                var surplus = len - maxWidth
                var str = stripAnsi(args.pop())
                if (str.length > surplus) {
                    args.push(str.substring(0, str.length - surplus))
                }
            }
            var msgs = args.map((msg, i) =>
                i == 0 && chlk[level].level
                    ? chlk[level].level(msg)
                    : chlk[level].message(msg)
            )

            lines.push(msgs.join(chlk[level].message(' ')))

            for (var line of lines) {
                await this.term.right(this.indent)
                this.alerter[alevel](line)
                this.linesToClear += 1
            }
        }
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
            this.alerts.push(['info', 'Migrating legacy robot config'])
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
        this.theme = Themes.getInstance(this.settings.theme)
        this.alerter.theme = this.theme
        // Set term enabled
        if (this.term.enabled != this.settings.termEnabled) {
            this.term.enabled = this.settings.termEnabled
            if (this.settings.termEnabled) {
                if (this.hasClearedScreen) {
                    await this.eraseScreen()
                } else {
                    await this.clearScreen()
                }
            } else {
                this.hasClearedScreen = false
            }
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
            this.logger.error(info.error, {...info, error: undefined})
        })
        if (!isQuiet && loaded.length) {
            this.logger.info('Loaded', loaded.length, 'custom themes')
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