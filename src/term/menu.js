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

        const hash = crypto.createHash('md5')
        hash.update('main-menu')
        this.chash = hash.digest('hex')

        this.bread = []
        this.alerts = []

        this.theme = Themes.getDefaultInstance()
        this.term  = new TermHelper(this.settings.termEnabled)

        this.inquirer = inquirer
        this.q = new QuestionHelper(this)
    }

    async mainMenu() {

        return this.crumb('Main', async () => {

            while (true) {

                await this.clearAndConsume()

                var {choice} = await this.menuChoice({
                    name     : 'mainChoice'
                  , message  : 'Main Menu'
                  , choices  : this.q.mainChoices()
                })

                if (choice == 'quit') {
                    break
                }

                var {method} = MainChoiceMap[choice]
                var isContinue = await this[method]()

                if (!isContinue) {
                    break
                }
            }

            return true
        })
    }

    async playMenu() {

        return this.crumb('Play', async () => {

            await this.ensureSettingsLoaded()

            var isContinue

            while (true) {

                await this.clearAndConsume()

                isContinue = true

                var {choice} = await this.menuChoice({
                    name     : 'playChoice'
                  , message  : 'Play'
                  , choices  : this.q.playChoices()
                  , default  : () => this.settings.lastPlayChoice
                })

                if (choice == 'back') {
                    break
                }

                if (choice == 'quit') {
                    isContinue = false
                    break
                }

                if (this.settings.lastPlayChoice != choice) {
                    this.settings.lastPlayChoice = choice
                    await this.saveSettings()
                }

                try {
                    if (choice == 'joinOnline') {
                        isContinue = await this.joinMenu()
                    } else {
                        isContinue = await this.matchMenu(choice)
                    }
                    if (!isContinue) {
                        break
                    }
                } catch (err) {
                    this.alerts.push(['error', err])
                    if (err.isAuthError) {
                        this.alerts.push(['warn', 'Authentication failed. Go to Account to sign up or log in.'])
                    }
                }
            }

            return isContinue
        })      
    }

    async matchMenu(playChoice) {

        const {message, method, isAdvanced} = PlayChoiceMap[playChoice]

        return this.crumb(message, async () => {

            await this.ensureSettingsLoaded()

            var isContinue = true
            var advancedOpts = {}

            while (true) {

                await this.clearAndConsume()

                isContinue = true

                var {choice, question} = await this.menuChoice({
                    name    : 'matchChoice'
                  , choices : this.q.matchChoices(playChoice)
                  , message
                })

                if (choice == 'back') {
                    break
                }

                if (choice == 'quit') {
                    isContinue = false
                    break
                }

                if (choice == 'advanced') {
                    advancedOpts = await this.promptMatchAdvancedOpts(advancedOpts)
                    continue
                }

                if (choice == 'start') {
                    var {matchOpts} = this.settings
                    if (isAdvanced) {
                        matchOpts = await this.getMatchOpts(matchOpts, advancedOpts)
                    }
                    await this[method](matchOpts)
                    continue
                }

                var {answer, isCancel} = await this.questionAnswer(question)

                if (isCancel) {
                    continue
                }

                this.settings.matchOpts[choice] = answer
                await this.saveSettings()
            }

            return isContinue
        })
    }

    async accountMenu() {

        return this.crumb('Account', async () => {

            await this.ensureCredentialsLoaded()

            while (true) {

                await this.clearAndConsume()

                var {choice, question, isCancel} = await this.menuChoice({
                    name     : 'accountChoice'
                  , message  : 'Account'
                  , choices  : this.q.accountChoices()
                })

                if (choice == 'done') {
                    break
                }

                if (choice == 'clearCredentials') {
                    this.clearCredentials()
                    await this.saveCredentials()
                    continue
                }

                if (LoginChoiceMap[choice]) {
                    var {message, method} = LoginChoiceMap[choice]
                    try {
                        this.logger.log(message)
                        if (method) {
                            var isAction = await this[method]()
                            if (!isAction) {
                                continue
                            }
                        }
                    } catch (err) {
                        this.alerts.push(['error', err])
                        continue
                    }
                } else {

                    var {answer, isCancel} = await this.questionAnswer(question)
                    var oldValue = this.credentials[choice]

                    if (isCancel) {
                        continue
                    }

                    if (answer == oldValue) {
                        continue
                    }

                    if (choice == 'password') {
                        answer = this.encryptPassword(answer)
                    }

                    this.credentials.isTested = false
                    this.credentials[choice] = answer
                }

                try {
                    if (!isCredentialsFilled(this.credentials, true)) {
                        continue
                    }
                    await this.doLogin()
                } catch (err) {
                    this.alerts.push(['error', err])
                } finally {
                    await this.saveCredentials()
                }
            }

            return true
        })
    }

    async settingsMenu() {

        return this.crumb('Settings', async () => {

            await this.ensureSettingsLoaded()

            while (true) {

                await this.clearAndConsume()

                var {choice, question} = await this.menuChoice({
                    name     : 'settingChoice'
                  , message  : 'Settings'
                  , choices  : this.q.settingsChoices()
                })

                if (choice == 'done') {
                    break
                }

                if (choice == 'robotConfigs') {
                    await this.robotConfigsMenu()
                    continue
                }

                var {answer, isCancel} = await this.questionAnswer(question)
                var isChange = this.settings[choice] != answer

                if (isCancel) {
                    continue
                }

                this.settings[choice] = answer
                await this.saveSettings()

                if (choice == 'isCustomRobot' && isChange) {
                    // We changed to custom robot, go directly to robots menu
                    if (isEmptyObject(this.settings.robots)) {
                        this.logger.info('Loading robot defaults')
                        this.settings.robots = Menu.robotDefaults()
                        await this.saveSettings()
                    }
                    await this.robotConfigsMenu()
                    continue
                }

                if (choice == 'theme') {
                    // Load current theme
                    this.theme = Themes.getInstance(this.settings.theme)
                    this.alerter.theme = this.theme
                } else if (choice == 'termEnabled') {
                    // Set term enabled
                    this.term.enabled = this.settings.termEnabled
                }
            }

            return true
        })
    }

    async robotConfigsMenu() {

        return this.crumb('Robots', async () => {

            await this.ensureSettingsLoaded()

            while (true) {

                await this.clearAndConsume()

                var {choice} = await this.menuChoice({
                    name     : 'robotChoice'
                  , message  : 'Configure Robots'
                  , choices  : this.q.robotConfigsChoices()
                })

                if (choice == 'done') {
                    break
                }

                if (choice == 'reset') {
                    this.settings.robots = Menu.robotDefaults()
                    await this.saveSettings()
                    continue
                }

                await this.configureRobotMenu(choice)
            }

            return true
        })
    }

    async configureRobotMenu(name) {

        return this.crumb('Robot:' + name, async () => {

            await this.ensureSettingsLoaded()
            const {defaults} = ConfidenceRobot.getClassMeta(name)

            if (isEmptyObject(this.settings.robots[name])) {
                this.settings.robots[name] = {
                    version      : defaults.version
                  , moveWeight   : 0
                  , doubleWeight : 0
                }
            }

            // always break
            while (true) {

                await this.clearAndConsume()

                var {choice, question} = await this.menuChoice({
                    name     : 'robotChoice'
                  , message  : 'Configure ' + name
                  , choices  : this.q.configureRobotChoices(name)
                })

                if (choice == 'done') {
                    break
                }

                if (choice == 'reset') {
                    this.settings.robots[name] = {...defaults}
                    await this.saveSettings()
                    break
                }

                var {answer, isCancel} = await this.questionAnswer(question)

                if (isCancel) {
                    break
                }

                this.settings.robots[name][choice] = answer
                await this.saveSettings()

                break
            }

            return true
        })
    }

    async joinMenu() {

        return this.crumb('Join', async () => {
            // always break
            while (true) {
                var {answer, isCancel} = await this.questionAnswer(this.q.join())
                if (!isCancel && answer) {
                    await this.joinOnlineMatch(answer)
                }
                break
            }

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

        this.alerts.push(['info', 'Reset key sent, check email'])

        const answers = await this.prompt(this.q.forgotPassword())

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

                this.logger.info('You must confirm your account. Check your email for a confirmation key.')

                credentials.needsConfirm = true

                isSuccess = await this.promptConfirmAccount()            
            }

            if (!isSuccess) {
                this.alerts.push(['warn', 'Login failed to', credentials.serverUrl])
                throw err
            }
        }

        const chlk = this.theme.alert
        this.alerts.push(['info', chlk.success.message('Login success'), 'to', credentials.serverUrl])

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

        await this.ensureSettingsLoaded()
        await this.ensureThemesLoaded()
        await this.ensureCredentialsLoaded()

        const client = this.newClient(this.credentials, true)

        try {
            const termPlayer = new TermPlayer(isStart ? White : Red, this.settings)
            const netPlayer  = new NetPlayer(client, isStart ? Red : White)
            const players = {
                White : isStart ? termPlayer : netPlayer
              , Red   : isStart ? netPlayer  : termPlayer
            }
            this.captureInterrupt = () => {
                this.logger.console.log()
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
                this.logger.console.log()
                this.logger.warn('Canceling match')
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
            await this.term.clear()
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

    getMenuPrefix() {
        if (this.bread.length > 1) {
            return this.bread.slice(0, this.bread.length - 1).join(' > ') + ' >'
        }
        return ''
    }

    handleInterrupt() {
        const handler = this.captureInterrupt
        this.captureInterrupt = null
        return handler ? handler() : 1
    }

    async clearAndConsume() {
        await this.clearMenu()
        await this.consumeAlerts()
    }

    async clearMenu() {
        await this.term.moveTo(0, 0).eraseDisplayBelow()
    }

    consumeAlerts() {
        const alerts = this.alerts.splice(0)
        const chlk = this.theme.alert
        alerts.forEach(alert => {
            try {
                var [level, ...args] = castToArray(alert)
                if (level == 'success') {
                    args = args.map(msg => chlk.success.message(msg))
                    level = 'info'
                }
                if (!this.alerter[level]) {
                    args.unshift(level)
                    level = 'warn'
                }
                this.alerter[level](...args)
            } catch (err) {
                this.logger.error(err)
            }
        })
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
        opts = {theme: this.theme, ...opts}
        this._prompt = this.inquirer.prompt(questions, answers, opts)
        return this._prompt
    }

    async crumb(message, cb) {
        this.bread.push(message)
        try {
            return await cb()
        } finally {
            this.bread.pop()
        }
    }

    async menuChoice(question) {
        question = {
            name     : 'choice'
          , type     : 'rawlist'
          , pageSize : Infinity
          , prefix   : this.getMenuPrefix()
          , ...question
        }
        const {answers, answer, isCancel} = await this.questionAnswer(question)
        question = choiceQuestion(question.choices, answer)
        const choice = answer
        return {answers, answer, isCancel, choice, question}
    }

    async questionAnswer(question) {
        const {name} = question
        const answers = await this.prompt(question)
        const answer = answers[name]
        const isCancel = !!answers._cancelEvent
        return {answers, answer, isCancel}
    }

    encryptPassword(password) {
        return password ? Util.encrypt1(password, this.chash) : ''
    }

    decryptPassword(password) {
        return password ? Util.decrypt1(password, this.chash) : ''
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
            this.settings.robots = Menu.robotDefaults()
            this.logger.info('Migrating legacy robot config')
            await this.saveSettings()
        }

        if (this.isThemesLoaded) {
            this.theme = Themes.getInstance(this.settings.theme)
            this.alerter.theme = this.theme
        }

        this.term.enabled = this.settings.termEnabled

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

    async ensureThemesLoaded() {
        if (this.isThemesLoaded) {
            return
        }
        await this.loadCustomThemes()
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

    static robotDefaults() {
        const defaults = {}
        RobotDelegator.listClassNames().forEach(name => {
            const meta = ConfidenceRobot.getClassMeta(name)
            defaults[name] = {...meta.defaults}
        })
        return defaults
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