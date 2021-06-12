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
const Constants  = require('../lib/constants')
const Core       = require('../lib/core')
const Errors     = require('../lib/errors')
const Logger     = require('../lib/logger')
const Util       = require('../lib/util')

const Coordinator = require('../lib/coordinator')
const Client      = require('../net/client')
const LabHelper   = require('./lab')
const NetPlayer   = require('../net/player')
const TermPlayer  = require('./player')
const ThemeHelper = require('./themes')
const Robot       = require('../robot/player')

const {ConfidenceRobot} = Robot
const {RobotDelegator}  = Robot

const {White, Red, States} = Constants
const {Match, Board, Dice} = Core

const assert   = require('assert')
const chalk    = require('chalk')
const crypto   = require('crypto')
const fs       = require('fs')
const fse      = require('fs-extra')
const inquirer = require('inquirer')
const {merge}  = Util
const os       = require('os')
const path     = require('path')
const sp       = Util.joinSpace

const DefaultServerUrl = 'https://bg.dougowings.net'
const ObsoleteServerUrls = [
    'ws://bg.dougowings.net:8080'
  , 'wss://bg.dougowings.net'
]

class Menu extends Logger {

    constructor(configDir) {
        super()
        this.configDir = configDir
        this.opts = this.getDefaultOpts()
        const hash = crypto.createHash('md5')
        hash.update('main-menu')
        this.chash = hash.digest('hex')
    }

    async mainMenu() {

        while (true) {

            var mainChoices = this.getMainChoices()

            var answers = await this.prompt({
                name    : 'mainChoice'
              , message : 'Main Menu'
              , type    : 'rawlist'
              , choices : mainChoices
              , pageSize : mainChoices.length + 1
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
                    isContinue = await this.matchMenu(playChoice == 'newOnline', playChoice == 'playRobot', playChoice == 'watchRobots')
                }
                if (!isContinue) {
                    break
                }
            } catch (err) {
                this.debug(err)
                if (err.name == 'MatchCanceledError') {
                    this.warn('The match was canceled', '-', err.message)
                } else if (err.isAuthError) {
                    this.warn(err)
                    this.error('Authentication error, go to Account to sign up or log in.')   
                } else {
                    this.error(err)
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

            var isContinue = false

            var matchChoices = this.getMatchChoices(opts, isOnline)

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
                advancedOpts = await this.getMatchAdvancedOpts(advancedOpts)
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

            opts[question.name] = answers[question.name]
            opts.total = +opts.total

            await this.saveOpts()
        }

        return isContinue
    }

    async getMatchAdvancedOpts(advancedOpts) {
        const questions = this.getMatchAdvancedQuestions(advancedOpts)
        const answers = await this.prompt(questions)
        return answers
    }

    async accountMenu() {

        const {opts} = this

        while (true) {

            var accountChoices = this.getAccountChoices(opts)

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
                        this.info('Account created')
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
                        this.info('Password reset')
                    } else {
                        assert(accountChoice == 'changePassword')
                        await this.promptChangePassword()
                        this.info('Password changed')
                    }
                } catch (err) {
                    this.error(err)
                    continue
                }
            } else if (accountChoice == 'clearCredentials') {
                opts.username = ''
                opts.password = ''
                await this.saveOpts()
                this.info('Credentials cleared')
                continue
            } else {
                var question = accountChoices.find(choice => choice.value == accountChoice).question

                answers = await this.prompt(question)
                shouldLogin = answers[question.name] != opts[question.name]
                if (question.name == 'password') {
                    opts[question.name] = this.encryptPassword(answers[question.name])
                } else {
                    opts[question.name] = answers[question.name]
                }
            }

            shouldLogin = opts.username && opts.password && opts.serverUrl && shouldLogin

            if (shouldLogin) {
                try {
                    await this.doLogin()
                } catch (err) {
                    this.error(err)
                    this.warn('Login failed', err)
                }
            }

            await this.saveOpts()
        }

        return true
    }

    async promptCreateAccount() {

        const {opts} = this

        const createAnswers = await this.prompt([
            this.getUsernameQuestion()
          , this.getPasswordQuestion()
          , this.getPasswordConfirmQuestion()
        ])
        const body = await this.sendSignup(opts.serverUrl, createAnswers.username, createAnswers.password)
        opts.username = createAnswers.username
        opts.password = this.encryptPassword(body.passwordEncrypted)
    }

    async promptForgotPassword() {

        const {opts} = this

        const forgotAnswers = await this.prompt(this.getUsernameQuestion())

        await this.sendForgotPassword(opts.serverUrl, forgotAnswers.username)
        opts.username = forgotAnswers.username

        this.info('Reset key sent, check email')

        const resetAnswers = await this.prompt([
            {
                name    : 'resetKey'
              , message : 'Reset Key'
              , type    : 'input'
            }
          , merge({}, this.getPasswordQuestion(), {when: answers => answers.resetKey})
          , merge({}, this.getPasswordConfirmQuestion(), {when: answers => answers.resetKey})
        ])
        if (!resetAnswers.resetKey) {
            throw new ResetKeyNotEnteredError
        }

        const body = await this.sendResetPassword(opts.serverUrl, opts.username, resetAnswers.password, resetAnswers.resetKey)
        opts.password = this.encryptPassword(body.passwordEncrypted)
    }

    async promptChangePassword() {

        const {opts} = this

        opts.password = ''
        const changeAnswers = await this.prompt([
            merge({}, this.getPasswordQuestion(), {name: 'oldPassword', message: 'Current password'})
          , merge({}, this.getPasswordQuestion(), {message: 'New password'})
          , this.getPasswordConfirmQuestion()
        ])
        try {
            const body = await this.sendChangePassword(opts.serverUrl, opts.username, changeAnswers.oldPassword, changeAnswers.password)
            opts.password = this.encryptPassword(body.passwordEncrypted)
        } catch (err) {
            opts.password = ''
            await this.saveOpts()
            throw err
        }
    }

    async doLogin() {
        const {opts} = this
        try {
            this.info('Logging into', opts.serverUrl)
            const body = await this.testCredentials(opts.serverUrl, opts.username, this.decryptPassword(opts.password))
            this.info(chalk.bold.green('Login succeeded.'))
            opts.password = this.encryptPassword(body.passwordEncrypted)
        } catch (err) {
            if (err.name == 'UserNotConfirmedError') {
                this.info('You must confirm your account. Check your email.')
                var confirmAnswers = await this.prompt({
                    name    : 'key'
                  , type    : 'input'
                  , message : 'Enter confirm key'
                })
                try {
                    await this.sendConfirmKey(opts.serverUrl, opts.username, confirmAnswers.key)
                    this.info(chalk.bold.green('Login succeeded.'))
                } catch (err) {
                    opts.password = ''
                    throw err
                }
            } else {
                opts.password = ''
                throw err
            }
        } finally {
            await this.saveOpts()
        }
    }

    async settingsMenu() {

        const {opts} = this

        while (true) {

            var settingsChoices = this.getSettingsChoices(opts)
            var answers = await this.prompt([{
                name     : 'settingChoice'
              , message  : 'Settings Menu'
              , type     : 'rawlist'
              , choices  : settingsChoices
              , pageSize : settingsChoices.length + 1
            }])

            var {settingChoice} = answers

            if (settingChoice == 'done') {
                break
            }

            if (settingChoice == 'robotConfigs') {
                await this.robotConfigsMenu()
                continue
            }

            var question = settingsChoices.find(choice => choice.value == settingChoice).question

            answers = await this.prompt(question)

            opts[question.name] = answers[question.name]
            opts.delay = +opts.delay

            await this.saveOpts()
        }

        return true
    }

    async robotConfigsMenu() {

        var configs = this.opts.robots

        while (true) {

            var robotChoices = this.getRobotConfigsChoices(configs)
            var answers = await this.prompt({
                name     : 'robotChoice'
              , message  : 'Configure Robots'
              , type     : 'rawlist'
              , choices  : robotChoices
              , pageSize : robotChoices.length + 1
            })

            var {robotChoice} = answers

            if (robotChoice == 'done') {
                break
            }

            if (robotChoice == 'reset') {
                this.opts.robots = {}
                configs = this.opts.robots
                await this.saveOpts()
                continue
            }

            await this.configureRobotMenu(robotChoice)
        }
    }

    async configureRobotMenu(name) {

        var config = this.opts.robots[name] || ConfidenceRobot.getClassMeta(name).defaults

        while (true) {

            var robotChoices = this.getConfigureRobotChoices(name, config)
            var answers = await this.prompt({
                name     : 'robotChoice'
              , message  : 'Configure ' + name
              , type     : 'rawlist'
              , choices  : robotChoices
              , pageSize : robotChoices.length + 1
            })

            var {robotChoice} = answers

            if (robotChoice == 'done') {
                break
            }

            if (robotChoice == 'reset') {
                this.opts.robots[name] = merge({}, ConfidenceRobot.getClassMeta(name).defaults)
                config = this.opts.robots[name]
                await this.saveOpts()
                continue
            }

            var question = robotChoices.find(choice => choice.value == robotChoice).question

            answers = await this.prompt(question)

            config[question.name] = answers[question.name]
            config.moveWeight = +config.moveWeight
            config.doubleWeight = +config.doubleWeight

            await this.saveOpts()
        }
    }

    async joinMenu() {
        const {opts} = this
        const questions = this.getJoinQuestions(opts)
        const answers = await this.prompt(questions)
        if (!answers.matchId) {
            return true
        }
        opts.matchId = answers.matchId
        await this.joinOnlineMatch(opts)
        return true
    }

    async playLocalMatch(opts, advancedOpts) {
        const matchOpts = this.getMatchOpts(opts, advancedOpts)
        const match = new Match(opts.total, matchOpts)
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
        const matchOpts = this.getMatchOpts(opts, advancedOpts)
        const match = new Match(opts.total, matchOpts)
        const players = {
            White : new TermPlayer(White, opts)
          , Red   : new TermPlayer.Robot(this.newRobot(Red), opts)
        }
        await this.runMatch(match, players, opts)
    }

    async playRobots(opts, advancedOpts) {
        const matchOpts = this.getMatchOpts(opts, advancedOpts)
        const match = new Match(opts.total, matchOpts)
        const players = {
            White : new TermPlayer.Robot(this.newDefaultRobot(White), opts)
          , Red   : new TermPlayer.Robot(this.newRobot(Red), opts)
        }
        await this.runMatch(match, players, opts)
    }

    async runOnlineMatch(opts, isStart) {
        const client = this.newClient(opts.serverUrl, opts.username, this.decryptPassword(opts.password))
        try {
            await client.connect()
            const promise = isStart ? client.createMatch(opts) : client.joinMatch(opts.matchId)
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
                this.warn('The match was canceled', '-', err.message)
            } else {
                throw err
            }
        } finally {
            await this.destroyAll(players)
        }
    }

    async runLab() {
        var config = await this.loadLabConfig()
        if (config) {
            var board = Board.fromStateString(config.lastState)
            var persp = config.persp
        } else {
            var board = Board.setup()
            var persp = White
        }
        const {theme} = this.opts
        const helper = new LabHelper({board, persp, theme})
        await helper.interactive()
        await this.saveLabConfig(helper)
        return true
    }

    getMatchOpts(opts, advancedOpts = {}) {
        const matchOpts = {...opts}
        if (advancedOpts.startState) {
            this.info('Setting initial state')
            matchOpts.startState = advancedOpts.startState
        }
        if (advancedOpts.rollsFile) {
            this.info('Using custom rolls file')
            const {rolls} = JSON.parse(fs.readFileSync(advancedOpts.rollsFile))
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

    async destroyAll(players) {
        await Promise.all(Object.values(players).map(player => player.destroy()))
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

    getMatchChoices(opts, isOnline) {
        const choices = this.getBasicMatchInitialChoices(opts)
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

    getBasicMatchInitialChoices(opts) {
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
                  , default  : () => '' + opts.total
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
                  , default : () => opts.isCrawford
                }
            }
          , {
                value : 'isJacoby'
              , name  : 'Jacoby Rule'
              , question : {
                    name    : 'isJacoby'
                  , message : 'Jacoby Rule'
                  , type    : 'confirm'
                  , default : () => opts.isJacoby
                }
            }
        ]
    }

    getJoinQuestions(opts) {
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
              , default  : () => advancedOpts.rollsFile
              , validate : value => {
                    if (!value.length) {
                        return true
                    }
                    var data
                    try {
                        data = JSON.parse(fs.readFileSync(value))
                    } catch (err) {
                        return err.message
                    }
                    if (!Array.isArray(data.rolls)) {
                        return 'Invalid rolls data, expects rolls key to be an array'
                    }
                    if (!data.rolls.length) {
                        return 'Rolls cannot be empty'
                    }
                    // check for at least one valid first roll
                    var isUniqueFound = false
                    for (var i = 0; i < data.rolls.length; ++i) {
                        var dice = data.rolls[i]
                        try {
                            Dice.checkTwo(dice)
                        } catch (err) {
                            return 'Invalid roll found at index ' + i + ': ' + err.message
                        }
                        if (dice[0] != dice[1]) {
                            isUniqueFound = true
                        }
                    }
                    if (!isUniqueFound) {
                        return 'Cannot find one unique roll'
                    }
                    return true
                }
            }
        ]
    }

    getAccountChoices(opts) {
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
                  , default : () => opts.serverUrl
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
        if (!opts.username || !opts.password) {
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
        if (opts.username || opts.password) {
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
          , default : () => this.opts.username
        }
    }

    getPasswordQuestion() {
        return {
            name    : 'password'
          , message : 'Password'
          , type    : 'password'
          , default : () => this.opts.password
          , display : () => this.opts.password ? '******' : ''
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
                value : 'serverUrl'
              , name  : 'Server URL'
              , question : {
                    name    : 'serverUrl'
                  , message : 'Server URL'
                  , type    : 'input'
                  , default : () => opts.serverUrl
                }
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
                  , default : () => opts.recordDir
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
        ConfidenceRobot.listClassNames().forEach(name => {
            const classMeta = ConfidenceRobot.getClassMeta(name)
            const choice = {
                value : name
              , name  : name
              , question : {
                    display : () => {
                      const config = configs[name] || classMeta.defaults
                      return 'version: ' + config.version + ', moveWeight: ' + config.moveWeight.toString().padStart(4, ' ') + ', doubleWeight: ' + config.doubleWeight
                    }
                }
            }
            choices.push(choice)
        })
        return Menu.formatChoices(choices)
    }

    getConfigureRobotChoices(name, config) {
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
                  , validate : value => Util.errMessage(() => RobotDelegator.validateWeight(+value))
                }
            }
        ])
    }

    getDefaultOpts() {
        var opts = {}
        const settingsFile = this.getSettingsFile()
        if (settingsFile) {
            fse.ensureDirSync(path.dirname(settingsFile))
            if (!fs.existsSync(settingsFile)) {
                fse.writeJsonSync(settingsFile, {})
            }
            merge(opts, JSON.parse(fs.readFileSync(settingsFile)))
            if (ObsoleteServerUrls.indexOf(opts.serverUrl) > -1) {
                opts.serverUrl = this.getDefaultServerUrl()
            }
        }
        opts = merge({
            total         : 1
          , isJacoby      : false
          , isCrawford    : true
          , delay         : 0.5
          , serverUrl     : this.getDefaultServerUrl()
          , username      : ''
          , password      : ''
          , isRecord      : false
          , recordDir     : this.getDefaultRecordDir()
          , fastForced    : false
          , isCustomRobot : false
          , theme         : 'Default'
          , robots        : {}
        }, opts)
        ConfidenceRobot.listClassNames().forEach(name => {
            const {defaults} = ConfidenceRobot.getClassMeta(name)
            opts.robots[name] = merge({}, defaults, opts.robots[name])
        })
        return opts
    }

    async saveOpts() {
        const settingsFile = this.getSettingsFile()
        if (settingsFile) {
            await fse.ensureDir(path.dirname(settingsFile))
            await fse.writeJson(settingsFile, this.opts, {spaces: 2})
        }
    }

    async testCredentials(serverUrl, username, password) {
        const client = this.newClient(serverUrl, username, password)
        var res
        try {
            res = await client.connect()
        } finally {
            client.close()
        }
        return res
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
            this.warn(body)
            throw RequestError.forResponse(res, body, uri.split('/').pop() + ' failed')
        }
        return body
    }

    getDefaultServerUrl() {
        return DefaultServerUrl
    }

    getDefaultRecordDir() {
        return path.resolve(os.homedir(), 'gameon')
    }

    newCoordinator(opts) {
        return new Coordinator(opts)
    }

    newClient(serverUrl, username, password) {
        return new Client(serverUrl, username, password)
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

    getSettingsFile() {
        if (this.configDir) {
            return path.resolve(this.configDir, 'settings.json')
        }
    }

    getLabConfigFile() {
        if (this.configDir) {
            return path.resolve(this.configDir, 'lab.json')
        }
    }

    async loadLabConfig() {
        const stateFile = this.getLabConfigFile()
        if (fs.existsSync(stateFile)) {
            try {
                const data = await fse.readJson(stateFile)
                return data
            } catch (err) {
                this.debug(err)
                this.error('Failed to load saved lab state:', err.message)
            }
        }
    }

    async saveLabConfig(helper) {
        const stateFile = this.getLabConfigFile()
        if (stateFile) {
            const data = {
                lastState : helper.board.state28()
              , persp     : helper.persp
            }
            await fse.ensureDir(path.dirname(stateFile))
            await fse.writeJson(stateFile, data, {spaces: 2})
        }
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
}

Menu.DefaultConfigDir = path.resolve(os.homedir(), '.gameon')

const {
    MenuError
  , RequestError
  , ResetKeyNotEnteredError
} = Errors

module.exports = Menu