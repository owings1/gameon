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

const Coordinator = require('../lib/coordinator')
const Client      = require('../net/client')
const LabHelper   = require('./lab')
const NetPlayer   = require('../net/player')
const TermPlayer  = require('./player')
const ThemeHelper = require('./themes')
const Robot       = require('../robot/player')

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
const inquirer = require('inquirer')
const os       = require('os')
const path     = require('path')

const {EventEmitter} = require('events')

const {homeTilde, padStart, sp, tildeHome} = Util

const {
    DefaultServerUrl
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
    return choices.find(choice => choice.value == value).question
}

// static questions
const Questions = {
    join : [
        {
            name     : 'matchId'
          , message  : 'Match ID'
          , type     : 'input'
          , validate : value => !value || value.length == 8 || 'Invalid match ID format'
        }
    ]
}

class Menu extends EventEmitter {

    constructor(configDir) {

        super()

        this.logger = new Logger
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
    }

    async mainMenu() {

        this.bread.push('Main')

        while (true) {

            var choices = this.getMainChoices()

            var answers = await this.prompt({
                name     : 'mainChoice'
              , message  : 'Main Menu'
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            })

            var {mainChoice} = answers

            if (mainChoice == 'quit') {
                break
            }

            var isContinue = true
            if (mainChoice == 'play') {
                isContinue = await this.playMenu()
            } else if (mainChoice == 'account') {
                isContinue = await this.accountMenu()
            } else if (mainChoice == 'settings') {
                isContinue = await this.settingsMenu()
            } else if (mainChoice == 'lab') {
                isContinue = await this.runLab()
            }

            if (!isContinue) {
                break
            }
        }

        this.bread.pop()
    }

    async playMenu() {

        await this.ensureSettingsLoaded()

        this.bread.push('Play')

        while (true) {

            var choices = this.getPlayChoices()

            var isContinue = true

            var answers = await this.prompt({
                name     : 'playChoice'
              , message  : 'Play'
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            })

            var {playChoice} = answers

            if (playChoice == 'back') {
                isContinue = true
                break
            }

            if (playChoice == 'quit') {
                isContinue = false
                break
            }

            try {
                if (playChoice == 'joinOnline') {
                    isContinue = await this.joinMenu()
                } else {
                    var isOnline = playChoice == 'newOnline'
                    var isRobot  = playChoice == 'playRobot'
                    var isRobots = playChoice == 'watchRobots'
                    isContinue = await this.matchMenu(isOnline, isRobot, isRobots)
                }
                if (!isContinue) {
                    break
                }
            } catch (err) {
                this.logger.debug(err)
                /*if (err.name == 'MatchCanceledError') {
                    this.logger.warn('The match was canceled', '-', err.message)
                } else */
                if (err.isAuthError) {
                    this.logger.warn(err)
                    this.logger.error('Authentication error, go to Account to sign up or log in.')   
                } else {
                    this.logger.error(err)
                }
                //throw err
            }
        }

        this.bread.pop()

        return isContinue
    }

    async matchMenu(isOnline, isRobot, isRobots) {

        await this.ensureSettingsLoaded()

        var message
        if (isRobots) {
            message = 'Watch Robots'
        } else if (isRobot) {
            message = 'Human vs Robot'
        } else if (isOnline) {
            message = 'Start Online Match'
        } else {
            message = 'Local Match'
        }

        var advancedOpts

        this.bread.push(message)

        while (true) {

            var isContinue = true

            var choices = this.getMatchChoices(isOnline)

            var answers = await this.prompt({
                name     : 'matchChoice'
              , message
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            })

            var {matchChoice} = answers

            if (matchChoice == 'back') {
                break
            }

            if (matchChoice == 'quit') {
                isContinue = false
                break
            }

            if (matchChoice == 'advanced') {
                advancedOpts = await this.promptMatchAdvancedOpts(advancedOpts)
                continue
            }

            var {settings} = this

            if (matchChoice == 'start') {
                if (isOnline) {
                    await this.startOnlineMatch(settings.matchOpts)
                } else {
                    var matchOpts = await this.getMatchOpts(settings.matchOpts, advancedOpts)
                    if (isRobot) {
                        await this.playRobot(matchOpts)
                    } else if (isRobots) {
                        await this.playRobots(matchOpts)
                    } else {
                        await this.playHumans(matchOpts)
                    }
                }
                continue
            }

            var question = choiceQuestion(choices, matchChoice)

            answers = await this.prompt(question)

            settings.matchOpts[question.name] = answers[question.name]
            settings.matchOpts.total = +settings.matchOpts.total

            await this.saveSettings()
        }

        this.bread.pop()

        return isContinue
    }

    async accountMenu() {

        await this.ensureCredentialsLoaded()

        this.bread.push('Account')

        while (true) {

            var accountChoices = this.getAccountChoices()

            var answers = await this.prompt([{
                name     : 'accountChoice'
              , message  : 'Account Menu'
              , type     : 'rawlist'
              , choices  : accountChoices
              , pageSize : accountChoices.length + 1
            }])

            var {accountChoice} = answers

            if (accountChoice == 'done') {
                break
            }

            var shouldLogin = false

            var isLoginChoice = ['createAccount', 'forgotPassword', 'changePassword'].indexOf(accountChoice) > -1

            var {credentials} = this

            if (isLoginChoice) {
                shouldLogin = true
                try {
                    if (accountChoice == 'createAccount') {
                        await this.promptCreateAccount()
                        this.logger.info('Account created')
                    } else if (accountChoice == 'forgotPassword') {
                        try {
                            await this.promptForgotPassword()
                        } catch (err) {
                            if (err.name == 'ResetKeyNotEnteredError') {
                                continue
                            } else {
                                throw err
                            }
                        }
                        this.logger.info('Password reset')
                    } else {
                        await this.promptChangePassword()
                        this.logger.info('Password changed')
                    }
                } catch (err) {
                    this.logger.error(err)
                    continue
                }
            } else if (accountChoice == 'clearCredentials') {

                credentials.username = ''
                credentials.password = ''

                await this.saveCredentials()

                this.logger.info('Credentials cleared')

                continue

            } else {

                var question = choiceQuestion(accountChoices, accountChoice)

                answers = await this.prompt(question)
                shouldLogin = answers[question.name] != credentials[question.name]
                if (question.name == 'password') {
                    credentials.password = this.encryptPassword(answers.password)
                } else {
                    credentials[question.name] = answers[question.name]
                }
            }

            shouldLogin = credentials.username && credentials.password && credentials.serverUrl && shouldLogin

            if (shouldLogin) {
                try {
                    await this.doLogin()
                } catch (err) {
                    this.logger.error(err)
                    this.logger.warn('Login failed', err)
                }
            }

            await this.saveCredentials()
        }

        this.bread.pop()

        return true
    }

    async settingsMenu() {

        await this.ensureSettingsLoaded()

        this.bread.push('Settings')

        while (true) {

            var choices = this.getSettingsChoices()

            var answers = await this.prompt({
                name     : 'settingChoice'
              , message  : 'Settings Menu'
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            })

            var {settingChoice} = answers

            if (settingChoice == 'done') {
                break
            }

            if (settingChoice == 'robotConfigs') {
                await this.robotConfigsMenu()
                continue
            }

            var question = choiceQuestion(choices, settingChoice)

            answers = await this.prompt(question)

            var {settings} = this

            settings[question.name] = answers[question.name]
            settings.delay = +settings.delay
            if (settings.recordDir) {
                settings.recordDir = path.resolve(tildeHome(settings.recordDir))
            }

            if (question.name == 'isCustomRobot' && settings.isCustomRobot) {
                if (Util.isEmptyObject(settings.robots)) {
                    this.logger.info('Loading robot defaults')
                    settings.robots = Menu.robotDefaults()
                }
                await this.saveSettings()
                await this.robotConfigsMenu()
                continue
            }

            await this.saveSettings()
        }

        this.bread.pop()

        return true
    }

    async configureRobotMenu(name) {

        await this.ensureSettingsLoaded()

        this.bread.push('Robot:' + name)

        const {defaults} = ConfidenceRobot.getClassMeta(name)

        // always break, but put in loop for consistency
        while (true) {

            var {settings} = this

            if (Util.isEmptyObject(settings.robots[name])) {
                settings.robots[name] = {
                    version      : defaults.version
                  , moveWeight   : 0
                  , doubleWeight : 0
                }
            }

            var config = settings.robots[name]
            var choices = this.getConfigureRobotChoices(name)

            var answers = await this.prompt({
                name     : 'robotChoice'
              , message  : 'Configure ' + name
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            })

            var {robotChoice} = answers

            if (robotChoice == 'done') {
                break
            }

            if (robotChoice == 'reset') {
                settings.robots[name] = {...defaults}
                await this.saveSettings()
                break
            }

            var question = choiceQuestion(choices, robotChoice)

            answers = await this.prompt(question)

            config[question.name] = answers[question.name]
            config.moveWeight     = +config.moveWeight
            config.doubleWeight   = +config.doubleWeight

            await this.saveSettings()

            break
        }

        this.bread.pop()

        return true
    }

    async robotConfigsMenu() {

        await this.ensureSettingsLoaded()

        this.bread.push('Robots')

        while (true) {

            var choices = this.getRobotConfigsChoices()

            var answers = await this.prompt({
                name     : 'robotChoice'
              , message  : 'Configure Robots'
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            })

            var {robotChoice} = answers

            if (robotChoice == 'done') {
                break
            }

            if (robotChoice == 'reset') {
                this.settings.robots = Menu.robotDefaults()
                await this.saveSettings()
                continue
            }

            await this.configureRobotMenu(robotChoice)
        }

        this.bread.pop()

        return true
    }

    async joinMenu() {

        this.bread.push('Join')

        // always break
        while (true) {
            var answers = await this.prompt(Questions.join)
            if (answers.matchId) {
                await this.joinOnlineMatch(answers.matchId)
            }
            break
        }

        this.bread.pop()

        return true
    }

    async promptCreateAccount() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        const answers = await this.prompt([
            this.getUsernameQuestion()
          , this.getPasswordQuestion()
          , this.getPasswordConfirmQuestion()
        ])
        const body = await this.sendSignup(
            credentials.serverUrl
          , answers.username
          , answers.password
        )
        credentials.username = answers.username
        credentials.password = this.encryptPassword(body.passwordEncrypted)
    }

    async promptForgotPassword() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        const forgotAnswers = await this.prompt(this.getUsernameQuestion())

        await this.sendForgotPassword(credentials.serverUrl, forgotAnswers.username)
        credentials.username = forgotAnswers.username

        this.logger.info('Reset key sent, check email')

        const resetAnswers = await this.prompt([
            {
                name    : 'resetKey'
              , message : 'Reset Key'
              , type    : 'input'
            }
          , {
                ...this.getPasswordQuestion()
              , when: answers => answers.resetKey
            }
          , {
                ...this.getPasswordConfirmQuestion()
              , when: answers => answers.resetKey
            }
        ])

        if (!resetAnswers.resetKey) {
            throw new ResetKeyNotEnteredError
        }

        const body = await this.sendResetPassword(credentials, resetAnswers)

        credentials.password = this.encryptPassword(body.passwordEncrypted)
    }

    async promptChangePassword() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        credentials.password = ''

        const answers = await this.prompt([
            {
                ...this.getPasswordQuestion()
              , name    : 'oldPassword'
              , message : 'Current password'
            }
          , {
                ...this.getPasswordQuestion()
              , name    : 'newPassword'
              , message : 'New password'
            }
          , this.getPasswordConfirmQuestion('newPassword')
        ])

        try {
            const body = await this.sendChangePassword(credentials, answers)
            credentials.password = this.encryptPassword(body.passwordEncrypted)
        } catch (err) {
            credentials.password = ''
            await this.saveCredentials()
            throw err
        }
    }

    async promptMatchAdvancedOpts(advancedOpts) {
        const questions = this.getMatchAdvancedQuestions(advancedOpts)
        const answers = await this.prompt(questions)
        if (answers.rollsFile) {
            answers.rollsFile = tildeHome(answers.rollsFile)
        }
        return answers
    }

    async doLogin() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        try {

            this.logger.info('Logging into', credentials.serverUrl)

            const body = await this.testCredentials(credentials, true)

            this.logger.info(chalk.bold.green('Login succeeded.'))
            credentials.password = this.encryptPassword(body.passwordEncrypted)

        } catch (err) {

            if (err.name == 'UserNotConfirmedError') {

                this.logger.info('You must confirm your account. Check your email.')

                const answers = await this.prompt({
                    name    : 'key'
                  , type    : 'input'
                  , message : 'Enter confirm key'
                })

                try {
                    await this.sendConfirmKey(credentials, answers.key)
                    this.logger.info(chalk.bold.green('Login succeeded.'))
                } catch (err) {
                    credentials.password = ''
                    throw err
                }

            } else {
                credentials.password = ''
                throw err
            }
        } finally {
            await this.saveCredentials()
        }
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
            await client.connect()
            const promise = isStart ? client.createMatch(matchOpts) : client.joinMatch(matchId)
            this.captureInterrupt = () => {
                this.logger.warn('Aborting')
                client.cancelWaiting(new WaitingAbortedError)
                return true
            }
            const match = await promise
            this.captureInterrupt = null
            const termPlayer = new TermPlayer(isStart ? White : Red, this.settings)
            const netPlayer  = new NetPlayer(client, isStart ? Red : White)
            const players = {
                White : isStart ? termPlayer : netPlayer
              , Red   : isStart ? netPlayer  : termPlayer
            }
            await this.runMatch(match, players)
        } catch (err) {
            if (err.name == 'WaitingAbortedError') {
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
                this.logger.warn('Canceling')
                coordinator.cancelMatch(match, players, new MatchCanceledError('Player quit'))
                return true
            }
            await coordinator.runMatch(match, players.White, players.Red)
        } catch (err) {
            if (err.name == 'MatchCanceledError') {
                this.logger.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            this.captureInterrupt = null
            await Util.destroyAll(players)
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
        if (cmds && cmds.length) {
            cmds = Util.castToArray(cmds)
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
            const {rolls} = await fse.readJson(tildeHome(advancedOpts.rollsFile))
            matchOpts.roller = Dice.createRoller(rolls)
        }
        return matchOpts
    }

    newRobot(...args) {
        const {settings} = this
        if (!settings.isCustomRobot) {
            return this.newDefaultRobot(...args)
        }
        const configs = Object.entries(settings.robots).map(([name, config]) => {
            return {name, ...config}
        })
        return RobotDelegator.forConfigs(configs, ...args)
    }

    newDefaultRobot(...args) {
        return RobotDelegator.forDefaults(...args)
    }

    getMainChoices() {
        return Menu.formatChoices([
            {
                value : 'play'
              , name  : 'Play'
            }
          , {
                value : 'account'
              , name  : 'Account'
            }
          , {
                value : 'settings'
              , name  : 'Settings'
            }
          , {
                value : 'lab'
              , name  : 'Lab'
            }
          , {
                value : 'quit'
              , name  : 'Quit'
            }
        ])
    }

    getPlayChoices() {
        const choices = [
            {
                value : 'newOnline'
              , name  : 'Create Online Match'
            }
          , {
                value : 'joinOnline'
              , name  : 'Join Online Match'
            }
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
        ]
        if (this.bread.length > 1) {
            choices.push({
                value : 'back'
              , name  : 'Back'
            })
        }
        choices.push({
              value : 'quit'
            , name  : 'Quit'
        })
        return Menu.formatChoices(choices)
    }

    getMatchChoices(isOnline) {

        const choices = this.getBasicMatchInitialChoices()
        // only show advanced for local matches
        if (!isOnline) {
            choices.push({
                value : 'advanced'
              , name  : 'Advanced'
            })
        }
        if (this.bread.length > 1) {
            choices.push({
                value : 'back'
              , name  : 'Back'
            })
        }
        choices.push({
            value : 'quit'
          , name  : 'Quit'
        })
        return Menu.formatChoices(choices)
    }

    getBasicMatchInitialChoices() {
        return [
            {
                value : 'start'
              , name  : 'Start Match'
            }
          , {
                value : 'total'
              , name  : 'Match Total'
              , question : {
                    name     : 'total'
                  , message  : 'Match Total'
                  , type     : 'input'
                  , default  : () => '' + this.settings.matchOpts.total
                  , validate : value => {
                        value = +value
                        return !isNaN(+value) && Number.isInteger(+value) && value > 0 || 'Please enter a number > 0'
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
                  , default : () => this.settings.matchOpts.isCrawford
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
                }
            }
        ]
    }

    getMatchAdvancedQuestions(advancedOpts) {
        advancedOpts = advancedOpts || {}
        return [
            {
                name     : 'startState'
              , message  : 'Start State'
              , type     : 'input'
              , default  : () => advancedOpts.startState
              , validate : value => {
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
            }
          , {
                name    : 'rollsFile'
              , message : 'Rolls File'
              , type    : 'input'
              , default  : () => homeTilde(advancedOpts.rollsFile)
              , validate : value => {
                    if (!value.length) {
                        return true
                    }
                    value = tildeHome(value)
                    return Util.errMessage(() => Dice.validateRollsFile(value))
                }
            }
        ]
    }

    getAccountChoices() {
        const choices = [
            {
                value : 'done'
              , name  : 'Done'
            }
          , {
                value : 'serverUrl'
              , name  : 'Server URL'
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => this.credentials.serverUrl
                }
            }
          , {
                value : 'username'
              , name  : 'Username'
              , question : this.getUsernameQuestion()
            }
          , {
                value : 'password'
              , name  : 'Password'
              , question : this.getPasswordQuestion()
            }
        ]
        if (!this.credentials.username || !this.credentials.password) {
            choices.push({
                value : 'createAccount'
              , name  : 'Create Account'
            })
            choices.push({
                value : 'forgotPassword'
              , name  : 'Forgot Password'
            })
        } else {
            choices.push({
                value : 'changePassword'
              , name  : 'Change Password'
            })
        }
        if (this.credentials.username || this.credentials.password) {
            choices.push({
                value : 'clearCredentials'
              , name  : 'Clear Credentials'
            })
        }
        return Menu.formatChoices(choices)
    }

    getUsernameQuestion() {
        return {
            name    : 'username'
          , message : 'Username'
          , type    : 'input'
          , default : () => this.credentials.username
        }
    }

    getPasswordQuestion() {
        return {
            name    : 'password'
          , message : 'Password'
          , type    : 'password'
          , default : () => this.credentials.password
          , display : () => this.credentials.password ? '******' : ''
        }
    }

    getPasswordConfirmQuestion(checkKey = 'password') {
        return {
            name    : 'passwordConfirm'
          , message : 'Confirm password'
          , type    : 'password'
          , validate : (value, answers) => value == answers[checkKey] || 'Passwords do not match'
        }
    }

    getSettingsChoices() {
        return Menu.formatChoices([
            {
                value : 'done'
              , name  : 'Done'
            }
          , {
                value : 'theme'
              , name  : 'Theme'
              , question : {
                    name : 'theme'
                  , message : 'Choose a theme'
                  , type    : 'list'
                  , default : () => this.settings.theme
                  , choices : () => ThemeHelper.list()
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
                }
            }
          , {
                value : 'fastForced'
              , name  : 'Fast Forced Moves'
              , question : {
                    name    : 'fastForced'
                  , message : 'Fast Forced Moves'
                  , type    : 'confirm'
                  , default : () => this.settings.fastForced
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
                }
            }
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => this.settings.delay
                  , validate : value => !isNaN(+value) && +value >= 0 || 'Please enter a number >= 0'
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
                }
            }
          , {
                value : 'robotConfigs'
              , name  : 'Robot Configuration'
              , when  : () => this.settings.isCustomRobot
            }
        ])
    }

    getRobotConfigsChoices() {
        const choices = [
            {
                value : 'done'
              , name  : 'Done'
            }
          , {
                value : 'reset'
              , name  : 'Reset defaults'
            }
        ]
        RobotDelegator.listClassNames().forEach(name => {
            const {defaults} = ConfidenceRobot.getClassMeta(name)
            const choice = {
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
            choices.push(choice)
        })
        return Menu.formatChoices(choices)
    }

    getConfigureRobotChoices(name) {
        const {defaults, versions} = ConfidenceRobot.getClassMeta(name)
        const config = () => this.settings.robots[name]
        const weightValidator = value => Util.errMessage(() => RobotDelegator.validateWeight(+value))
        return Menu.formatChoices([
            {
                value : 'done'
              , name  : 'Done'
            }
          , {
                value : 'reset'
              , name  : 'Reset defaults'
            }
          , {
                value : 'version'
              , name  : 'Version'
              , question : {
                  name     : 'version'
                , message  : 'Version'
                , type     : 'list'
                , default  : () => config().version
                , display  : () => chalkDiff(config().version, defaults.version)
                , choices  : () => Object.keys(versions)
              }
            }
          , {
                value : 'moveWeight'
              , name  : 'Move Weight'
              , question : {
                    name     : 'moveWeight'
                  , message  : 'Move Weight'
                  , type     : 'input'
                  , default  : () => config().moveWeight
                  , display  : () => chalkDiff(config().moveWeight, defaults.moveWeight)
                  , validate : weightValidator
                }
            }
          , {
                value : 'doubleWeight'
              , name  : 'Double Weight'
              , question : {
                    name     : 'doubleWeight'
                  , message  : 'Double Weight'
                  , type     : 'input'
                  , default  : () => config().doubleWeight
                  , display  : () => chalkDiff(config().doubleWeight, defaults.doubleWeight)
                  , validate : value => Util.errMessage(() => RobotDelegator.validateWeight(+value))
                }
            }
        ])
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
            this.logger.warn(body)
            throw RequestError.forResponse(res, body, uri.split('/').pop() + ' failed')
        }
        return body
    }

    newCoordinator() {
        return new Coordinator(this.settings)
    }

    newClient(...args) {
        if (typeof args[0] == 'object') {
            var credentials = args[0]
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

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
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

        if (this.settings.isCustomRobot && Util.isEmptyObject(this.settings.robots)) {
            // populate for legacy format
            this.settings.robots = Menu.robotDefaults()
            this.logger.info('Migrating legacy robot config')
            await this.saveSettings()
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

        const {loaded, errors} = await ThemeHelper.loadDirectory(themesDir)
        errors.forEach(info => {
            this.logger.error(info.error, {...info, error: undefined})
        })
        if (!isQuiet && loaded.length) {
            this.logger.info('Loaded', loaded.length, 'custom themes')
        }

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
        return {
            delay         : 0.5
          , isRecord      : false
          , recordDir     : this.getDefaultRecordDir()
          , fastForced    : false
          , isCustomRobot : false
          , theme         : DefaultThemeName
          , termEnabled   : DefaultTermEnabled
          , matchOpts     : {
                total      : 1
              , isJacoby   : false
              , isCrawford : true
            }
          , robots        : {}
        }
    }

    static credentialDefaults() {
        return {
            username  : ''
          , password  : ''
          , serverUrl : this.getDefaultServerUrl()
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
        const maxLength = Math.max(...choices.map(choice => choice.name.length))
        var p = 1
        choices.forEach((choice, i) => {
            if (i == 9) {
                p = 0
            }
            const {question} = choice
            if (question) {
                const display = question.display ? question.display() : question.default()
                choice.name = sp(choice.name.padEnd(maxLength + p, ' '), ':', display)
            }
        })
        return choices.filter(choice => !('when' in choice) || choice.when())
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