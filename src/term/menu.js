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

const {homeTilde, padStart, sp, tildeHome} = Util

const {
    DefaultServerUrl
  , ObsoleteServerUrls
  , Red
  , States
  , White
} = Constants

const {
    MenuError
  , RequestError
  , ResetKeyNotEnteredError
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

class Menu {

    constructor(configDir) {
        this.logger = new Logger
        this.configDir = configDir
        this.opts = Menu.defaults()
        this.credentials = Menu.credentialDefaults()
        this.isCredentialsLoaded = false
        this.isSettingsLoaded = false
        this.isThemesLoaded = false
        const hash = crypto.createHash('md5')
        hash.update('main-menu')
        this.chash = hash.digest('hex')
    }

    async mainMenu() {

        await this.loadSettings()
        await this.loadCredentials()
        await this.loadCustomThemes()

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
    }

    async playMenu() {

        while (true) {

            var isContinue = true
            var playChoices = this.getPlayChoices()

            var answers = await this.prompt({
                name     : 'playChoice'
              , message  : 'Play'
              , type     : 'rawlist'
              , choices  : playChoices
              , pageSize : playChoices.length + 1
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
                if (err.name == 'MatchCanceledError') {
                    this.logger.warn('The match was canceled', '-', err.message)
                } else if (err.isAuthError) {
                    this.logger.warn(err)
                    this.logger.error('Authentication error, go to Account to sign up or log in.')   
                } else {
                    this.logger.error(err)
                }
            }
        }

        return isContinue
    }

    async matchMenu(isOnline, isRobot, isRobots) {

        const {opts} = this

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

        while (true) {

            var isContinue = true

            var matchChoices = this.getMatchChoices(opts.matchOpts, isOnline)

            var answers = await this.prompt({
                name     : 'matchChoice'
              , message  : message
              , type     : 'rawlist'
              , choices  : matchChoices
              , pageSize : matchChoices.length + 1
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

            if (matchChoice == 'start') {
                if (isOnline) {
                    await this.startOnlineMatch(opts)
                } else if (isRobot) {
                    await this.playRobot(opts, advancedOpts)
                } else if (isRobots) {
                    await this.playRobots(opts, advancedOpts)
                } else {
                    await this.playLocalMatch(opts, advancedOpts)
                }
                continue
            }

            var question = matchChoices.find(choice => choice.value == matchChoice).question

            answers = await this.prompt(question)

            opts.matchOpts[question.name] = answers[question.name]
            opts.matchOpts.total = +opts.matchOpts.total

            await this.saveSettings()
        }

        return isContinue
    }

    async promptMatchAdvancedOpts(advancedOpts) {
        const questions = this.getMatchAdvancedQuestions(advancedOpts)
        const answers = await this.prompt(questions)
        if (answers.rollsFile) {
            answers.rollsFile = tildeHome(answers.rollsFile)
        }
        return answers
    }

    async accountMenu() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        while (true) {

            var accountChoices = this.getAccountChoices(credentials)

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

                var question = accountChoices.find(choice => choice.value == accountChoice).question

                answers = await this.prompt(question)
                shouldLogin = answers[question.name] != credentials[question.name]
                if (question.name == 'password') {
                    credentials[question.name] = this.encryptPassword(answers[question.name])
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

        return true
    }

    async promptCreateAccount() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        const answers = await this.prompt([
            this.getUsernameQuestion(credentials)
          , this.getPasswordQuestion(credentials)
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

        const forgotAnswers = await this.prompt(this.getUsernameQuestion(credentials))

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
                ...this.getPasswordQuestion(credentials)
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

        const body = await this.sendResetPassword(
            credentials.serverUrl
          , credentials.username
          , resetAnswers.password
          , resetAnswers.resetKey
        )

        credentials.password = this.encryptPassword(body.passwordEncrypted)
    }

    async promptChangePassword() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        credentials.password = ''

        const answers = await this.prompt([
            {
                ...this.getPasswordQuestion(credentials)
              , name    : 'oldPassword'
              , message : 'Current password'
            }
          , {
                ...this.getPasswordQuestion(credentials)
              , message : 'New password'
            }
          , this.getPasswordConfirmQuestion()
        ])

        try {
            const body = await this.sendChangePassword(
                credentials.serverUrl
              , credentials.username
              , answers.oldPassword
              , answers.password
            )
            credentials.password = this.encryptPassword(body.passwordEncrypted)
        } catch (err) {
            credentials.password = ''
            await this.saveCredentials()
            throw err
        }
    }

    async doLogin() {

        await this.ensureCredentialsLoaded()

        const {credentials} = this

        try {

            this.logger.info('Logging into', credentials.serverUrl)

            const body = await this.testCredentials(
                credentials.serverUrl
              , credentials.username
              , this.decryptPassword(credentials.password)
            )

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
                    await this.sendConfirmKey(credentials.serverUrl, credentials.username, answers.key)
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

    async settingsMenu() {

        const {opts} = this

        while (true) {

            var choices = this.getSettingsChoices(opts)
            var answers = await this.prompt([{
                name     : 'settingChoice'
              , message  : 'Settings Menu'
              , type     : 'rawlist'
              , choices
              , pageSize : choices.length + 1
            }])

            var {settingChoice} = answers

            if (settingChoice == 'done') {
                break
            }

            if (settingChoice == 'robotConfigs') {
                await this.robotConfigsMenu()
                continue
            }

            var question = choices.find(choice => choice.value == settingChoice).question

            answers = await this.prompt(question)

            opts[question.name] = answers[question.name]
            opts.delay = +opts.delay
            if (opts.recordDir) {
                opts.recordDir = path.resolve(tildeHome(opts.recordDir))
            }

            if (question.name == 'isCustomRobot' && opts.isCustomRobot) {
                if (Util.isEmptyObject(opts.robots)) {
                    this.logger.info('Loading robot defaults')
                    opts.robots = Menu.robotDefaults()
                }
                await this.saveSettings()
                await this.robotConfigsMenu()
                continue
            }

            await this.saveSettings()
        }

        return true
    }

    async robotConfigsMenu() {

        while (true) {

            var configs = this.opts.robots

            var choices = this.getRobotConfigsChoices(configs)
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
                this.opts.robots = Menu.robotDefaults()
                await this.saveSettings()
                continue
            }

            await this.configureRobotMenu(robotChoice)
        }
    }

    async configureRobotMenu(name) {

        const defaults = ConfidenceRobot.getClassMeta(name).defaults

        if (Util.isEmptyObject(this.opts.robots[name])) {
            this.opts.robots[name] = {
                version      : defaults.version
              , moveWeight   : 0
              , doubleWeight : 0
            }
        }

        const config = this.opts.robots[name]
        const choices = this.getConfigureRobotChoices(name, config, defaults)

        var answers = await this.prompt({
            name     : 'robotChoice'
          , message  : 'Configure ' + name
          , type     : 'rawlist'
          , choices
          , pageSize : choices.length + 1
        })

        const {robotChoice} = answers

        if (robotChoice == 'done') {
            return
        }

        if (robotChoice == 'reset') {
            this.opts.robots[name] = {...defaults}
            await this.saveSettings()
            return
        }

        const question = choices.find(choice => choice.value == robotChoice).question

        answers = await this.prompt(question)

        config[question.name] = answers[question.name]
        config.moveWeight     = +config.moveWeight
        config.doubleWeight   = +config.doubleWeight

        await this.saveSettings()
    }

    async joinMenu() {
        const {opts} = this
        const questions = this.getJoinQuestions()
        const answers = await this.prompt(questions)
        if (!answers.matchId) {
            return true
        }
        opts.matchId = answers.matchId
        await this.joinOnlineMatch(opts)
        return true
    }

    async playLocalMatch(opts, advancedOpts) {
        const matchOpts = await this.getMatchOpts(opts.matchOpts, advancedOpts)
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer(White, opts)
          , Red   : new TermPlayer(Red, opts)
        }
        await this.runMatch(match, players, opts)
    }

    async startOnlineMatch(opts) {
        await this.runOnlineMatch(opts, true)
    }

    async joinOnlineMatch(opts) {
        await this.runOnlineMatch(opts, false)
    }

    async playRobot(opts, advancedOpts) {
        const matchOpts = await this.getMatchOpts(opts.matchOpts, advancedOpts)
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer(White, opts)
          , Red   : new TermPlayer.Robot(this.newRobot(Red), opts)
        }
        await this.runMatch(match, players, opts)
    }

    async playRobots(opts, advancedOpts) {
        const matchOpts = await this.getMatchOpts(opts.matchOpts, advancedOpts)
        const match = new Match(matchOpts.total, matchOpts)
        const players = {
            White : new TermPlayer.Robot(this.newRobot(White), opts)
          , Red   : new TermPlayer.Robot(this.newDefaultRobot(Red), opts)
        }
        await this.runMatch(match, players, opts)
    }

    async runOnlineMatch(opts, isStart) {
        const matchOpts = await this.getMatchOpts(opts.matchOpts)
        const {credentials} = this
        const client = this.newClient(credentials.serverUrl, credentials.username, this.decryptPassword(credentials.password))
        try {
            await client.connect()
            const promise = isStart ? client.createMatch(matchOpts) : client.joinMatch(opts.matchId)
            const match = await promise
            const termPlayer = new TermPlayer(isStart ? White : Red, opts)
            const netPlayer  = new NetPlayer(client, isStart ? Red : White)
            const players = {
                White : isStart ? termPlayer : netPlayer
              , Red   : isStart ? netPlayer  : termPlayer
            }
            await this.runMatch(match, players, opts)
        } finally {
            await client.close()
        }
    }

    async runMatch(match, players, opts) {
        try {
            const coordinator = this.newCoordinator(opts)
            await coordinator.runMatch(match, players.White, players.Red)
        } catch (err) {
            if (err.name == 'MatchCanceledError') {
                this.logger.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            await Util.destroyAll(players)
        }
    }

    async runLab() {
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
        const {theme, isCustomRobot, robots, recordDir} = this.opts
        const labOpts = {
            board
          , persp
          , theme
          , isCustomRobot
          , robots
          , recordDir
          , rollsFile
        }
        const helper = new LabHelper(labOpts)
        await helper.interactive()
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
            var rollIndex = 0
            var maxIndex = rolls.length - 1
            matchOpts.roller = () => {
                if (rollIndex > maxIndex) {
                    rollIndex = 0
                }
                return rolls[rollIndex++]
            }
        }
        return matchOpts
    }

    newRobot(...args) {
        const {opts} = this
        if (!opts.isCustomRobot) {
            return this.newDefaultRobot(...args)
        }
        const configs = Object.entries(opts.robots).map(([name, config]) => {
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
        return Menu.formatChoices([
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
          , {
                value : 'back'
              , name  : 'Back'
            }
          , {
                value : 'quit'
              , name  : 'Quit'
            }
        ])
    }

    getMatchChoices(matchOpts, isOnline) {
        const choices = this.getBasicMatchInitialChoices(matchOpts)
        // only show advanced for local matches
        if (!isOnline) {
            choices.push({
                value : 'advanced'
              , name  : 'Advanced'
            })
        }
        choices.push({
            value : 'back'
          , name  : 'Back'
        })
        choices.push({
            value : 'quit'
          , name  : 'Quit'
        })
        return Menu.formatChoices(choices)
    }

    getBasicMatchInitialChoices(matchOpts) {
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
                  , default  : () => '' + matchOpts.total
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
                  , default : () => matchOpts.isCrawford
                }
            }
          , {
                value : 'isJacoby'
              , name  : 'Jacoby Rule'
              , question : {
                    name    : 'isJacoby'
                  , message : 'Jacoby Rule'
                  , type    : 'confirm'
                  , default : () => matchOpts.isJacoby
                }
            }
        ]
    }

    getJoinQuestions() {
        return [
            {
                name     : 'matchId'
              , message  : 'Match ID'
              , type     : 'input'
              , validate : value => !value || value.length == 8 || 'Invalid match ID format'
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
                    return Dice.rollsFileError(value)
                }
            }
        ]
    }

    getAccountChoices(credentials) {
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
                  , default : () => credentials.serverUrl
                }
            }
          , {
                value : 'username'
              , name  : 'Username'
              , question : this.getUsernameQuestion(credentials)
            }
          , {
                value : 'password'
              , name  : 'Password'
              , question : this.getPasswordQuestion(credentials)
            }
        ]
        if (!credentials.username || !credentials.password) {
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
        if (credentials.username || credentials.password) {
            choices.push({
                value : 'clearCredentials'
              , name  : 'Clear Credentials'
            })
        }
        return Menu.formatChoices(choices)
    }

    getUsernameQuestion(credentials) {
        return {
            name    : 'username'
          , message : 'Username'
          , type    : 'input'
          , default : () => credentials.username
        }
    }

    getPasswordQuestion(credentials) {
        return {
            name    : 'password'
          , message : 'Password'
          , type    : 'password'
          , default : () => credentials.password
          , display : () => credentials.password ? '******' : ''
        }
    }

    getPasswordConfirmQuestion() {
        return {
            name    : 'passwordConfirm'
          , message : 'Confirm password'
          , type    : 'password'
          , validate : (value, answers) => value == answers.password || 'Passwords do not match'
        }
    }

    getSettingsChoices(opts) {
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
                  , default : () => opts.theme
                  , choices : () => ThemeHelper.list()
                }
            }
          , {
                value : 'fastForced'
              , name  : 'Fast Forced Moves'
              , question : {
                    name    : 'fastForced'
                  , message : 'Fast Forced Moves'
                  , type    : 'confirm'
                  , default : () => opts.fastForced
                }
            }
          , {
                value    : 'isRecord'
              , name     : 'Record Matches'
              , question : {
                    name    : 'isRecord'
                  , message : 'Record Matches'
                  , type    : 'confirm'
                  , default : () => opts.isRecord
                }
            }
          , {
                value    : 'recordDir'
              , name     : 'Record Dir'
              , when     : () => opts.isRecord
              , question : {
                    name    : 'recordDir'
                  , message : 'Record Dir'
                  , type    : 'input'
                  , default : () => homeTilde(opts.recordDir)
                }
            }
          , {
                value : 'delay'
              , name  : 'Robot Delay'
              , question : {
                    name     : 'delay'
                  , message  : 'Robot Delay (seconds)'
                  , type     : 'input'
                  , default  : () => opts.delay
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
                  , default : () => opts.isCustomRobot
                }
            }
          , {
                value : 'robotConfigs'
              , name  : 'Robot Configuration'
              , when  : () => opts.isCustomRobot
            }
        ])
    }

    getRobotConfigsChoices(configs) {
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
            const config = configs[name] || {
                version      : defaults.version
              , moveWeight   : 0
              , doubleWeight : 0
            }
            const choice = {
                value    : name
              , name     : name
              , question : {
                    display : () => {
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

    getConfigureRobotChoices(name, config, defaults) {
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
                , default  : () => config.version
                , display  : () => chalkDiff(config.version, defaults.version)
                , choices  : () => Object.keys(ConfidenceRobot.getClassMeta(name).versions)
              }
            }
          , {
                value : 'moveWeight'
              , name  : 'Move Weight'
              , question : {
                    name     : 'moveWeight'
                  , message  : 'Move Weight'
                  , type     : 'input'
                  , default  : () => config.moveWeight
                  , display  : () => chalkDiff(config.moveWeight, defaults.moveWeight)
                  , validate : value => Util.errMessage(() => RobotDelegator.validateWeight(+value))
                }
            }
          , {
                value : 'doubleWeight'
              , name  : 'Double Weight'
              , question : {
                    name     : 'doubleWeight'
                  , message  : 'Double Weight'
                  , type     : 'input'
                  , default  : () => config.doubleWeight
                  , display  : () => chalkDiff(config.doubleWeight, defaults.doubleWeight)
                  , validate : value => Util.errMessage(() => RobotDelegator.validateWeight(+value))
                }
            }
        ])
    }

    getDefaultOpts() {
        return Menu.defaults()
    }

    async testCredentials(serverUrl, username, password) {
        const client = this.newClient(serverUrl, username, password)
        try {
            return await client.connect()
        } finally {
            client.close()
        }
    }

    async sendSignup(serverUrl, username, password) {
        const client = this.newClient(serverUrl)
        const data = {username, password}
        return await this.handleRequest(client, '/api/v1/signup', data)
    }

    async sendConfirmKey(serverUrl, username, confirmKey) {
        const client = this.newClient(serverUrl)
        const data = {username, confirmKey}
        return await this.handleRequest(client, '/api/v1/confirm-account', data)
    }

    async sendForgotPassword(serverUrl, username) {
        const client = this.newClient(serverUrl)
        const data = {username}
        return await this.handleRequest(client, '/api/v1/forgot-password', data)
    }

    async sendResetPassword(serverUrl, username, password, resetKey) {
        const client = this.newClient(serverUrl)
        const data = {username, password, resetKey}
        return await this.handleRequest(client, '/api/v1/reset-password', data)
    }

    async sendChangePassword(serverUrl, username, oldPassword, newPassword) {
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

    newCoordinator(opts) {
        return new Coordinator(opts)
    }

    newClient(serverUrl, username, password) {
        const client = new Client(serverUrl, username, password)
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

        const defaults = Menu.defaults()
        this.opts = Util.defaults(defaults, this.opts, settings)
        this.opts.matchOpts = Util.defaults(defaults.matchOpts, settings.matchOpts)

        if (this.opts.isCustomRobot && Util.isEmptyObject(this.opts.robots)) {
            // populate for legacy format
            this.opts.robots = Menu.robotDefaults()
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
            const settings = Util.defaults(Menu.defaults(), this.opts)
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

    async loadCustomThemes() {

        const themesDir = this.getThemesDir()

        if (!themesDir) {
            return
        }

        const configs = {}
        const files = await globby(path.join(themesDir, '*.json'))
        const helper = new DependencyHelper(ThemeHelper.list())

        for (var file of files) {
            try {
                var config = await fse.readJson(file)
                var name = Util.filenameWithoutExtension(file)
                configs[name] = config
                helper.add(name, config.extends)
            } catch (err) {
                this.logger.error('Failed to load custom theme file: ' + file, err.message)
            }
        }

        try {
            var order = helper.resolve()
        } catch (err) {
            if (!err.isDependencyError) {
                throw err
            }
            this.logger.error(err.name, err.message)
            // load what we can
            var order = helper.order
        }

        const loaded = []

        for (var name of order) {
            try {
                ThemeHelper.update(name, configs[name])
                loaded.push(name)
            } catch (err) {
                this.logger.error('Failed to load theme ' + name, err.message)
            }
        }

        if (loaded.length) {
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

    static defaults() {
        const opts = {
            delay         : 0.5
          , isRecord      : false
          , recordDir     : this.getDefaultRecordDir()
          , fastForced    : false
          , isCustomRobot : false
          , theme         : 'Default'
          , matchOpts     : {
                total      : 1
              , isJacoby   : false
              , isCrawford : true
            }
          , robots        : {}
        }
        return opts
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