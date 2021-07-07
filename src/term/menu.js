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
const {TermHelper} = require('./draw')
const TermPlayer   = require('./player')
const Themes       = require('./themes')
const Robot        = require('../robot/player')

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

const {inquirer} = require('./inquirer')

const {
    append
  , castToArray
  , errMessage
  , homeTilde
  , isEmptyObject
  , padStart
  , sp
  , tildeHome
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

// static questions
const Questions = {
    confirmKey: {
        name    : 'key'
      , type    : 'input'
      , message : 'Enter confirm key'
      , cancel  : CancelChars.input
    }
  , join : {
        name     : 'matchId'
      , message  : 'Match ID'
      , type     : 'input'
      , validate : value => !value || value.length == 8 || 'Invalid match ID format'
      , cancel   : CancelChars.input
    }
  , resetKey: {
        name    : 'resetKey'
      , message : 'Reset Key'
      , type    : 'input'
      , cancel  : CancelChars.input
    }
}

const LoginChoiceMap = {
    changePassword  : {
        message : 'Password changed'
      , method  : 'promptChangePassword'
    }
  , confirmAccount  : {
        message : 'Account confirmed'
      , method  : 'promptConfirmAccount'
    }
  , createAccount   : {
        message : 'Account created'
      , method  : 'promptCreateAccount'
    }
  , forgotPassword  : {
        message : 'Password reset'
      , method  : 'promptForgotPassword'
    }
  , newConfirmKey   : {
        message : 'New confirmation key requested. Check your email.'
      , method  : 'promptNewConfirmKey'
    }
  , testCredentials : {
        message : 'Testing credentials'
      , method  : null
    }
}

const PlayChoiceMap = {
    newOnline   : {
        message    : 'Start Online Match'
      , method     : 'startOnlineMatch'
      , isAdvanced : false
      , isOnline   : true
    }
  , playRobot   : {
        message    : 'Human vs Robot'
      , method     : 'playRobot'
      , isAdvanced : true
      , isOnline   : false
    }
  , watchRobots : {
        message    : 'Watch Robots'
      , method     : 'playRobots'
      , isAdvanced : true
      , isOnline   : false
    }
  , newLocal : {
        message    : 'Local Match'
      , method     : 'playHumans'
      , isAdvanced : true
      , isOnline   : false
    }
}

const MainChoiceMap = {
    account : {
        method: 'accountMenu'
    }
  , lab : {
        method: 'runLab'
    }
  , play : {
        method: 'playMenu'
    }
  , settings : {
        method: 'settingsMenu'
    }
}
function isCredentialsFilled(credentials) {
    return !['username', 'password', 'serverUrl'].find(key => !credentials[key])
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
    }

    async mainMenu() {

        return this.crumb('Main', async () => {

            while (true) {

                await this.clearAndConsume()

                var {choice} = await this.menuChoice({
                    name     : 'mainChoice'
                  , message  : 'Main Menu'
                  , choices  : this.getMainChoices()
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
                  , choices  : this.getPlayChoices()
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
                  , choices : this.getMatchChoices(playChoice)
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

                var {choice, question} = await this.menuChoice({
                    name     : 'accountChoice'
                  , message  : 'Account'
                  , choices  : this.getAccountChoices()
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
                    if (!isCredentialsFilled(this.credentials)) {
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
                  , choices  : this.getSettingsChoices()
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
                  , choices  : this.getRobotConfigsChoices()
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
                  , choices  : this.getConfigureRobotChoices(name)
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
                var {answer, isCancel} = await this.questionAnswer(Questions.join)
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

        const answers = await this.prompt([
            this.getUsernameQuestion()
          , this.getPasswordQuestion()
          , this.getPasswordConfirmQuestion()
        ])

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

        const {answer, isCancel} = await this.questionAnswer(this.getUsernameQuestion())

        if (isCancel) {
            return false
        }

        await this.sendForgotPassword(credentials.serverUrl, answer)
        credentials.username = answer

        this.alerts.push(['info', 'Reset key sent, check email'])

        const answers = await this.prompt([
            Questions.resetKey
          , {
                ...this.getPasswordQuestion()
              , when: answers => !answers._cancelEvent && answers.resetKey
            }
          , {
                ...this.getPasswordConfirmQuestion()
              , when: answers => !answers._cancelEvent && answers.resetKey
            }
        ])

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

        const answers = await this.prompt([
            {
                ...this.getPasswordQuestion()
              , name    : 'oldPassword'
              , message : 'Current password'
              , default : ''
            }
          , {
                ...this.getPasswordQuestion()
              , name    : 'newPassword'
              , message : 'New password'
              , default : ''
            }
          , this.getPasswordConfirmQuestion('newPassword')
        ])

        if (answers._cancelEvent) {
            return false
        }

        const {passwordEncrypted} = await this.sendChangePassword(credentials, answers)
        credentials.password = this.encryptPassword(passwordEncrypted)

        return true
    }

    async promptConfirmAccount() {

        await this.ensureCredentialsLoaded()

        const {answer, isCancel} = await this.questionAnswer(Questions.confirmKey)

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

            const {answer, isCancel} = await this.questionAnswer(this.getUsernameQuestion())
            if (isCancel || !answer.length) {
                return false
            }
            credentials.username = answer
        }

        await this.sendRequestConfirmKey(credentials)

        return true
    }

    async promptMatchAdvancedOpts(defaults) {
        const questions = this.getMatchAdvancedQuestions(defaults)
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

            const body = await this.testCredentials(credentials, true)

            credentials.password = this.encryptPassword(body.passwordEncrypted)

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

    getMainChoices() {
        return Menu.formatChoices([
            new this.inquirer.BrSeparator()
          , {
                value : 'play'
              , name  : 'Play'
              , char  : 'p'
            }
          , {
                value : 'account'
              , name  : 'Account'
              , char  : 'a'
            }
          , {
                value : 'settings'
              , name  : 'Settings'
              , char  : 's'
            }
          , {
                value : 'lab'
              , name  : 'Lab'
              , char  : 'l'
            }
          , new this.inquirer.Separator()
          , {
                value     : 'quit'
              , name      : 'Quit'
              , char      : 'q'
              , enterChar : EnterChars.quit
            }
          , new this.inquirer.BrSeparator()
        ])
    }

    getPlayChoices() {
        const choices = [
            new this.inquirer.BrSeparator()
          , {
                value : 'newOnline'
              , name  : 'Create Online Match'
            }
          , {
                value : 'joinOnline'
              , name  : 'Join Online Match'
            }
          , new this.inquirer.Separator()
          , {
                value : 'newLocal'
              , name  : 'Human vs Human'
            }
          , {
                value : 'playRobot'
              , name  : 'Human vs Robot'
            }
          , {
                value : 'watchRobots'
              , name  : 'Robot vs Robot'
            }
          , new this.inquirer.Separator()
        ]
        if (this.bread.length > 1) {
            choices.push({
                value     : 'back'
              , name      : 'Back'
              , enterChar : EnterChars.back
            })
        }
        append(choices, [
            {
                  value : 'quit'
                , name  : 'Quit'
                , char  : 'q'
            }
          , new this.inquirer.BrSeparator()
        ])
        return Menu.formatChoices(choices)
    }

    getMatchChoices(playChoice) {
        const {isOnline} = PlayChoiceMap[playChoice]
        const choices = this.getBasicMatchInitialChoices()
        // only show advanced for local matches
        if (!isOnline) {
            append(choices, [
                {
                    value : 'advanced'
                  , name  : 'Advanced'
                }
              , new this.inquirer.Separator()
            ])
        }
        if (this.bread.length > 1) {
            choices.push({
                value     : 'back'
              , name      : 'Back'
              , enterChar : EnterChars.back
            })
        }
        append(choices, [
            {
                value : 'quit'
              , name  : 'Quit'
              , char  : 'q'
            }
          , new this.inquirer.BrSeparator()
        ])
        return Menu.formatChoices(choices)
    }

    getBasicMatchInitialChoices() {
        return [
            new this.inquirer.BrSeparator()
          , {
                value : 'start'
              , name  : 'Start Match'
              , char  : 's'
            }
          , new this.inquirer.Separator()
          , {
                value : 'total'
              , name  : 'Match Total'
              , char  : 't'
              , question : {
                    name     : 'total'
                  , message  : 'Match Total'
                  , type     : 'input'
                  , default  : () => this.settings.matchOpts.total
                  , validate : value => Number.isInteger(value) && value > 0 || 'Please enter a number > 0'
                  , filter   : value => +value
                  , cancel   : CancelChars.input
                  , restoreDefault : RestoreChars.input
                  , expandDefault  : ExpandChars.input
                }
            }
          , {
                value : 'cubeEnabled'
              , name  : 'Cube Enabled'
              , question : {
                    name    : 'cubeEnabled'
                  , message : 'Cube Enabled'
                  , type    : 'confirm'
                  , default : () => this.settings.matchOpts.cubeEnabled
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value : 'isCrawford'
              , name  : 'Crawford Rule'
              , when  : () => this.settings.matchOpts.cubeEnabled
              , question : {
                    name    : 'isCrawford'
                  , message : 'Crawford Rule'
                  , type    : 'confirm'
                  , default : () => this.settings.matchOpts.isCrawford
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value : 'isJacoby'
              , name  : 'Jacoby Rule'
              , question : {
                    name    : 'isJacoby'
                  , message : 'Jacoby Rule'
                  , type    : 'confirm'
                  , default : () => this.settings.matchOpts.isJacoby
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , new this.inquirer.Separator()
        ]
    }

    getMatchAdvancedQuestions(advancedOpts) {
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

    getAccountChoices() {
        const choices = [
            new this.inquirer.BrSeparator()
          , {
                value     : 'done'
              , name      : 'Done'
              , enterChar : EnterChars.back
            }
          , new this.inquirer.Separator()
          , {
                value : 'serverUrl'
              , name  : 'Server'
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => this.credentials.serverUrl
                  , cancel  : CancelChars.input
                  , restoreDefault : RestoreChars.input
                  , expandDefault  : ExpandChars.input
                }
            }
          , {
                value    : 'username'
              , name     : 'Username'
              , question : this.getUsernameQuestion()
            }
          , {
                value    : 'password'
              , name     : 'Password'
              , question : this.getPasswordQuestion()
            }
        ]
        choices.push(new this.inquirer.Separator())
        if (!this.credentials.username || !this.credentials.password) {
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
            if (this.credentials.needsConfirm) {
                append(choices, [
                    {
                        value : 'confirmAccount'
                      , name  : 'Enter confirm key'
                    }
                  , {
                        value : 'newConfirmKey'
                      , name  : 'Get new confirm key'
                    }
                  , new this.inquirer.Separator()
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
        if (this.credentials.username || this.credentials.password) {
            choices.push({
                value : 'clearCredentials'
              , name  : 'Clear Credentials'
            })
        }
        choices.push(new this.inquirer.BrSeparator())
        return Menu.formatChoices(choices)
    }

    getUsernameQuestion() {
        return {
            name     : 'username'
          , message  : 'Username'
          , type     : 'input'
          , default  : () => this.credentials.username
          , display  : () => this.credentials.username + (this.credentials.isTested ? (' ' + this.theme.prompt.check.pass(Chars.check)) : '')
          , cancel   : CancelChars.input
          , when     : answers => !answers._cancelEvent
          , restoreDefault : RestoreChars.input
          , expandDefault  : ExpandChars.input
        }
    }

    getPasswordQuestion() {
        return {
            name     : 'password'
          , message  : 'Password'
          , type     : 'password'
          , default  : () => this.credentials.password
          , display  : () => this.credentials.password ? '******' : ''
          , mask     : '*'
          , cancel   : CancelChars.password
          , when     : answers => !answers._cancelEvent
          , restoreDefault : RestoreChars.password
        }
    }

    getPasswordConfirmQuestion(checkKey = 'password') {
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

    getSettingsChoices() {
        return Menu.formatChoices([
            new this.inquirer.BrSeparator()
          , {
                value     : 'done'
              , name      : 'Done'
              , enterChar : EnterChars.back
              , char      : 'd'
            }
          , new this.inquirer.Separator()
          , {
                value : 'theme'
              , name  : 'Theme'
              , question : {
                    name : 'theme'
                  , message : 'Choose a theme'
                  , type    : 'list'
                  , default : () => this.settings.theme
                  , choices : () => Themes.list()
                  , cancel  : CancelChars.list
                  , prefix  : ''
                }
            }
          , {
                value  : 'termEnabled'
              , name   : 'Term Cursoring'
              , question : {
                    name    : 'termEnabled'
                  , message : 'Enable term cursoring'
                  , type    : 'confirm'
                  , default : () => this.settings.termEnabled
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , new this.inquirer.Separator()
          , {
                value : 'fastForced'
              , name  : 'Fast Forced Moves'
              , question : {
                    name    : 'fastForced'
                  , message : 'Fast Forced Moves'
                  , type    : 'confirm'
                  , default : () => this.settings.fastForced
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value    : 'recordDir'
              , name     : 'Record Dir'
              , when     : () => this.settings.isRecord
              , question : {
                    name    : 'recordDir'
                  , message : 'Record Dir'
                  , type    : 'input'
                  , default : () => homeTilde(this.settings.recordDir)
                  , filter  : value => value == null ? null : path.resolve(tildeHome(value))
                  , cancel  : CancelChars.input
                  , clear   : 'ctrl-delete'
                  , restoreDefault : RestoreChars.input
                  , expandDefault  : ExpandChars.input
                }
            }
          , {
                value    : 'isRecord'
              , name     : 'Record Matches'
              , question : {
                    name    : 'isRecord'
                  , message : 'Record Matches'
                  , type    : 'confirm'
                  , default : () => this.settings.isRecord
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , new this.inquirer.Separator()
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => this.settings.delay
                  , filter   : value => +value
                  , validate : value => !isNaN(value) && value >= 0 || 'Please enter a number >= 0'
                  , cancel   : CancelChars.input
                  , writeInvalid   : () => ''
                  , restoreDefault : RestoreChars.input
                  , expandDefault  : ExpandChars.input
                }
            }
          , {
                value    : 'isCustomRobot'
              , name     : 'Use Custom Robot'
              , question : {
                    name    : 'isCustomRobot'
                  , message : 'Use Custom Robot'
                  , type    : 'confirm'
                  , default : () => this.settings.isCustomRobot
                  , cancel  : CancelChars.bool
                  , toggle  : ToggleChars.bool
                }
            }
          , {
                value : 'robotConfigs'
              , name  : 'Robot Configuration'
              , when  : () => this.settings.isCustomRobot
            }
          , new this.inquirer.BrSeparator()
        ])
    }

    getRobotConfigsChoices() {
        return Menu.formatChoices([
            {
                value     : 'done'
              , name      : 'Done'
              , enterChar : EnterChars.back
              , char      : 'd'
            }
          , {
                value : 'reset'
              , name  : 'Reset defaults'
              , char  : 'r'
            }
          , ...RobotDelegator.listClassNames().map(name => {
                const {defaults} = ConfidenceRobot.getClassMeta(name)
                return {
                    value    : name
                  , name     : name
                  , question : {
                        display : () => {
                            const config = this.settings.robots[name] || {
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

    getConfigureRobotChoices(name) {
        const {defaults, versions} = ConfidenceRobot.getClassMeta(name)
        const config = () => this.settings.robots[name]
        const weightValidator = value => errMessage(() =>
            RobotDelegator.validateWeight(value)
        )
        return Menu.formatChoices([
            {
                value     : 'done'
              , name      : 'Done'
              , enterChar : EnterChars.back
              , char      : 'd'
            }
          , {
                value : 'reset'
              , name  : 'Reset defaults'
              , char  : 'r'
            }
          , {
                value : 'version'
              , name  : 'Version'
              , char  : 'v'
              , question : {
                    name     : 'version'
                  , message  : 'Version'
                  , type     : 'list'
                  , default  : () => config().version
                  , display  : () => chalkDiff(config().version, defaults.version)
                  , choices  : () => Object.keys(versions)
                  , cancel   : CancelChars.list
                }
            }
          , {
                value : 'moveWeight'
              , name  : 'Move Weight'
              , char  : 'm'
              , question : {
                    name     : 'moveWeight'
                  , message  : 'Move Weight'
                  , type     : 'input'
                  , default  : () => config().moveWeight
                  , display  : () => chalkDiff(config().moveWeight, defaults.moveWeight)
                  , filter   : value => +value
                  , validate : weightValidator
                  , cancel   : CancelChars.input
                  , writeInvalid   : () => ''
                  , restoreDefault : RestoreChars.input
                  , expandDefault  : ExpandChars.input
                }
            }
          , {
                value : 'doubleWeight'
              , name  : 'Double Weight'
              , char  : 'b'
              , question : {
                    name     : 'doubleWeight'
                  , message  : 'Double Weight'
                  , type     : 'input'
                  , default  : () => config().doubleWeight
                  , display  : () => chalkDiff(config().doubleWeight, defaults.doubleWeight)
                  , filter   : value => +value
                  , validate : weightValidator
                  , cancel   : CancelChars.input
                  , writeInvalid   : () => ''
                  , restoreDefault : RestoreChars.input
                  , expandDefault  : ExpandChars.input
                }
            }
        ])
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