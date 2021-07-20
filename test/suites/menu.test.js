/**
 * gameon - test suite - term classes
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
const TestUtil = require('../util')
const {
    expect,
    getError,
    parseKey,
    requireSrc,
    MockPrompter,
    noop,
    NullOutput,
    States28,
    update,
    tmpDir
} = TestUtil

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')

const {resolve} = path

describe('-', () => {

    const Coordinator = requireSrc('lib/coordinator')
    const Errors      = requireSrc('lib/errors')
    const Menu        = requireSrc('term/menu')
    const Robot       = requireSrc('robot/player')
    const {BoxStatus} = requireSrc('term/helpers/term.box')
    const Server      = requireSrc('net/server')
    const ThemeHelper = requireSrc('term/themes')

    const {RequestError, MatchCanceledError} = Errors

    beforeEach(async function () {
        const dirs = {
            auth  : tmpDir()
          , config: tmpDir()
        }
        const server = new Server({
            authType: 'directory',
            authDir: dirs.auth
        })
        const files = Object.fromEntries(
            ['settings', 'credentials', 'lab'].map(name =>
                [name, resolve(dirs.config, name +  '.json')]
            )
        )
        const menu = new Menu(dirs.config)
        menu.eraseScreen = noop
        this.fixture = {
            dirs
          , files
          , menu
          , server
          , auth  : server.auth
        }
        server.loglevel = 0
        menu.loglevel = 1
    })

    afterEach(async function () {
        await Promise.all(Object.values(this.fixture.dirs).map(dir => fse.remove(dir)))
        this.fixture.server.close()
    })

    function newThrowingCoordinator(err) {
        err = err || new Error('test')
        return {runMatch: () => {throw err}}
    }

    describe('menus', () => {

        describe('#mainMenu', () => {

            it('should quit', function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter({choice: 'quit'})
                return menu.mainMenu()
            })

            it('should go to play menu, new local match menu, then come back, then quit', function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'play'},
                    {choice: 'playHumans'},
                    {choice: 'quit'},
                    {choice: 'quit'},
                    {choice: 'quit'}
                ])
                return menu.mainMenu()
            })

            it('should go to settings menu then done then quit', function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'settings'},
                    {choice: 'done'},
                    {choice: 'quit'}
                ])
                return menu.mainMenu()
            })

            it('should go to account menu then quit', function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'account'},
                    {choice: 'done'},
                    {choice: 'quit'}
                ])
                return menu.mainMenu()
            })

            // not clear this should be the spec, maybe a better error
            it.skip('should do nothing for unknown choice then quit', function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'foo'},
                    {choice: 'quit'}
                ])
                return menu.mainMenu()
            })

            it('should run lab and quit', function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'lab'},
                    {choice: 'quit'}
                ])
                menu.runLab = noop
                return menu.mainMenu()
            })
        })

        describe('#playMenu', () => {

            beforeEach(async function () {
                const {menu, server} = this.fixture
                await server.listen()
                menu.credentials.serverUrl = 'http://localhost:' + server.port
            })

            it('should invalidate match id abcd with joinOnline, then quit', async function () {
                const {menu} = this.fixture
                menu.alerter.loglevel = -1
                menu.prompt = MockPrompter([
                    {choice: 'joinOnline'},
                    {matchId: 'abcd'},
                    {choice: 'quit'}
                ])
                await menu.playMenu()
            })

            it('should alert warning/error then done when joinOnline throws BadCredentialsError', async function () {
                const {menu} = this.fixture
                menu.credentials.username = 'nobody@nowhere.example'
                menu.credentials.password = menu.encryptPassword('s9GLdoe9')
                menu.prompt = MockPrompter([
                    {choice: 'joinOnline'},
                    {choice: 'start'},
                    {matchId: '12345678'},
                    {choice: 'quit'}
                ])
                var logObj
                menu.alerts.on('log.warn', obj => logObj = obj)
                menu.loglevel = -1
                await menu.playMenu()
                const err = menu.alerts.lastError
                expect(err.isBadCredentialsError).to.equal(true)
                expect(logObj.message.toLowerCase()).to.contain('authentication')
            })

            it('should alert error then done for joinOnline when matchMenu throws MatchCanceledError', async function () {
                const {menu} = this.fixture
                const exp = new MatchCanceledError
                menu.matchMenu = () => {
                    throw exp
                }
                menu.prompt = MockPrompter([
                    {choice: 'joinOnline'},
                    {choice: 'quit'}
                ])
                menu.loglevel = -1
                await menu.playMenu()
                expect(menu.alerts.lastError).to.equal(exp)
            })

            it('should return true for choice back', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'back'}
                ])
                const res = await menu.playMenu()
                expect(res).to.equal(true)
            })

            it('should continue when matchMenu returns true', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'playRobot'},
                    {choice: 'quit'}
                ])
                menu.matchMenu = () => true
                await menu.playMenu()
            })
        })

        describe('#matchMenu', () => {

            it('should set match total to 5', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'total'},
                    {total: '5'},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
                expect(menu.settings.matchOpts.total).to.equal(5)
            })

            it('should invalidate total=-1', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'total'},
                    {total: '-1'}
                ])
                const err = await getError(() => menu.matchMenu('playHumans'))
                expect(err.message).to.contain('Validation failed for total')
            })

            it('should set isJacoby to true', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'isJacoby'},
                    {isJacoby: true},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
                expect(menu.settings.matchOpts.isJacoby).to.equal(true)
            })

            it('should set isCrawford to false', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'isCrawford'},
                    {isCrawford: false},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
                expect(menu.settings.matchOpts.isCrawford).to.equal(false)
            })

            it('should quit', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
            })

            it('should quit for back', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'back'}
                ])
                await menu.matchMenu('playHumans')
            })

            it('should go to startOnlineMatch with startOnline and mock method, then quit', async function () {
                const {menu} = this.fixture
                let isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.startOnlineMatch = () => isCalled = true
                await menu.matchMenu('startOnline')
                expect(isCalled).to.equal(true)
            })

            it('should go to playRobot with playRobot and mock method, then quit', async function () {
                const {menu} = this.fixture
                let isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.playRobot = () => isCalled = true
                await menu.matchMenu('playRobot')
                expect(isCalled).to.equal(true)
            })

            it('should go to playRobots with playRobots and mock method, then quit', async function () {
                const {menu} = this.fixture
                let isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.playRobots = () => isCalled = true
                await menu.matchMenu('playRobots')
                expect(isCalled).to.equal(true)
            })

            it('should go to playHumans with playHumans mock method, then quit', async function () {
                const {menu} = this.fixture
                let isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.playHumans = () => isCalled = true
                await menu.matchMenu('playHumans')
                expect(isCalled).to.equal(true)
            })

            it('should go to advanced for playRobot', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'advanced'},
                    {startState: '', rollsFile: ''},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playRobot')
            })
        })

        describe('#accountMenu', () => {

            beforeEach(async function () {
                const {menu, server} = this.fixture
                await server.listen()
                menu.credentials.serverUrl = 'http://localhost:' + server.port
            })

            it('should sign up, log in and confirm user', async function () {
                const {menu, auth} = this.fixture
                const username = 'nobody@nowhere.example'
                const password = '9Axf5kAR'
                menu.prompt = MockPrompter([
                    {choice: 'createAccount'},
                    {username, password, passwordConfirm: password},
                    {key: () => parseKey(auth.email.impl.lastEmail)},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                const user = await auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should send forget password and reset for confirmed user', async function () {
                const {menu, auth} = this.fixture
                const username = 'nobody@nowhere.example'
                const password = '8QwuU68W'
                await auth.createUser(username, password, true)
                const oldPassword = '2q2y9K7V'
                menu.prompt = MockPrompter([
                    {choice: 'forgotPassword'},
                    {username},
                    {resetKey: () => parseKey(auth.email.impl.lastEmail), password, passwordConfirm: password},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                await auth.authenticate(username, password)
            })

            it('should change password and authenticate', async function () {
                const {menu, auth} = this.fixture
                const username = 'nobody@nowhere.example'
                const oldPassword = '9YWS8b8F'
                const newPassword = '37GbrWAZ'
                await auth.createUser(username, oldPassword, true)
                menu.credentials.username = username
                menu.prompt = MockPrompter([
                    {choice: 'changePassword'},
                    {oldPassword, newPassword, passwordConfirm: newPassword},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                await auth.authenticate(username, newPassword)
            })

            it('should clear credentials', async function () {
                const {menu} = this.fixture
                menu.credentials.username = 'nobody@nowhere.example'
                menu.credentials.password = menu.encryptPassword('qN3zUpVh')
                menu.prompt = MockPrompter([
                    {choice: 'clearCredentials'},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(!!menu.credentials.username).to.equal(false)
                expect(!!menu.credentials.password).to.equal(false)
            })

            it('should change username', async function () {
                const {menu} = this.fixture
                const username = 'nobody@nowhere.example'
                menu.prompt = MockPrompter([
                    {choice: 'username'},
                    {username},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.credentials.username).to.equal(username)
            })

            it('should change and encrypt password', async function () {
                const {menu} = this.fixture
                const password = '6yahTQ8H'
                menu.prompt = MockPrompter([
                    {choice: 'password'},
                    {password},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.decryptPassword(menu.credentials.password)).to.equal(password)
            })

            it('should change serverUrl', async function () {
                const {menu} = this.fixture
                const serverUrl = 'http://nowhere.example'
                menu.prompt = MockPrompter([
                    {choice: 'serverUrl'},
                    {serverUrl},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.credentials.serverUrl).to.equal(serverUrl)
            })

            it('should prompt forgot password then done when key not entered', async function () {
                const {menu, auth} = this.fixture
                const username = 'nobody@nowhere.example'
                const password = 'd4PUxRs2'
                await auth.createUser(username, password, true)
                menu.prompt = MockPrompter([
                    {choice: 'forgotPassword'},
                    {username},
                    {resetKey: ''},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
            })

            it('should alert error and done when promptForgotPassword throws', async function () {
                const {menu, auth} = this.fixture
                const err = new Error('testMessage')
                menu.loglevel = -1
                menu.promptForgotPassword = () => { throw err }
                const username = 'nobody@nowhere.example'
                const password = 'd4PUxRs2'
                await auth.createUser(username, password, true)
                menu.prompt = MockPrompter([
                    {choice: 'forgotPassword'},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.alerts.lastError).to.equal(err)
            })

            it('should alert BadCredentialsError and done when password entered and login fails', async function () {
                const {menu} = this.fixture
                menu.loglevel = -1
                menu.credentials.username = 'nobody2@nowhere.example'
                const password = 'JUzrDc5k'
                menu.prompt = MockPrompter([
                    {choice: 'password'},
                    {password},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.alerts.lastError.isBadCredentialsError).to.equal(true)
            })

            it('should alert BadCredentialsError then done on incorrect password for change-password', async function () {
                const {menu, auth} = this.fixture
                menu.loglevel = -1
                const username = 'nobody@nowhere.example'
                const oldPassword = 'C7pUaA3c'
                const badPassword = 'etzF4Y8L'
                const password = 'fVvqK99g'
                await auth.createUser(username, oldPassword, true)
                menu.credentials.username = username
                menu.credentials.password = menu.encryptPassword(oldPassword)
                menu.prompt = MockPrompter([
                    {choice: 'changePassword'},
                    {oldPassword: badPassword, newPassword: password, passwordConfirm: password},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.alerts.lastError.isBadCredentialsError).to.equal(true)
            })
        })

        describe('#settingsMenu', () => {

            it('should set robot delay to 4 then done', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'delay'},
                    {delay: '4'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
                expect(menu.settings.delay).to.equal(4)
            })

            it('should invalidate robot delay foo', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'delay'},
                    {delay: 'foo'},
                    {choice: 'done'}
                ])
                const err = await getError(() => menu.settingsMenu())
                expect(err.message).to.contain('Validation failed for delay')
            })

            it('should go to robotConfgs then done', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'robotConfigs'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
            })

            it('should go to robotsMenu for isCustomRobot=true', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'isCustomRobot'},
                    {isCustomRobot: true},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
            })

            it('should set theme to Default', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'theme'},
                    {theme: 'Default'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
            })

            describe('coverage', () => {

                it('isCustomRobot=true robots non-empty', async function () {
                    const {menu} = this.fixture
                    await menu.ensureSettingsLoaded()
                    menu.settings.robots = Menu.robotsDefaults()
                    menu.prompt = MockPrompter([
                        {choice: 'isCustomRobot'},
                        {isCustomRobot: true},
                        {choice: 'done'},
                        {choice: 'done'}
                    ])
                    await menu.settingsMenu()
                })

                it('isCustomRobot=true recordDir empty', async function () {
                    const {menu} = this.fixture
                    await menu.ensureSettingsLoaded()
                    menu.settings.recordDir = null
                    menu.settings.robots = Menu.robotsDefaults()
                    menu.prompt = MockPrompter([
                        {choice: 'isCustomRobot'},
                        {isCustomRobot: true},
                        {choice: 'done'},
                        {choice: 'done'}
                    ])
                    await menu.settingsMenu()
                })

                it('settingsChoices.theme.choices', function () {
                    const {menu} = this.fixture
                    const choices = menu.q.settingsChoices()
                    const question = choices.find(choice => choice.value == 'theme').question
                    const res = question.choices()
                    expect(res).to.contain('Default')
                })
            })
        })

        describe('#robotMenu', () => {

            it('should reset RunningRobot moveWeight', async function () {
                const {menu} = this.fixture
                await menu.ensureSettingsLoaded()
                menu.settings.robots = Menu.robotsDefaults()
                const exp = menu.settings.robots.RunningRobot.moveWeight
                menu.settings.robots.RunningRobot.moveWeight *= 0.5
                menu.prompt = MockPrompter([
                    {choice: 'reset'}
                ])
                await menu.robotMenu('RunningRobot')
                expect(menu.settings.robots.RunningRobot.moveWeight).to.equal(exp)
            })
        })

        describe('#robotsMenu', () => {

            it('should run and done', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
            })

            it('should reset config, select RandomRobot and done', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'reset'},
                    {choice: 'RandomRobot'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
            })

            it('should set RandomRobot moveWeight to 1', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'RandomRobot'},
                    {choice: 'moveWeight'},
                    {moveWeight: 1},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
                expect(menu.settings.robots.RandomRobot.moveWeight).to.equal(1)
            })

            it('should set RandomRobot moveWeight to 1 then reset', async function () {
                const {menu} = this.fixture
                const defaults = Robot.ConfidenceRobot.getClassMeta('RandomRobot').defaults
                menu.prompt = MockPrompter([
                    {choice: 'RandomRobot'},
                    {choice: 'moveWeight'},
                    {moveWeight: 1},
                    {choice: 'reset'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
                expect(menu.settings.robots.RandomRobot.moveWeight).to.equal(defaults.moveWeight)
            })

            it('should set RandomRobot version to v2', async function () {
                const {menu} = this.fixture
                const defaults = Robot.ConfidenceRobot.getClassMeta('RandomRobot').defaults
                menu.prompt = MockPrompter([
                    {choice: 'RandomRobot'},
                    {choice: 'version'},
                    {version: 'v2'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
                expect(menu.settings.robots.RandomRobot.version).to.equal('v2')
                // call .choices() for coverage
                const question = menu.q.robotChoices('RandomRobot', menu.settings.robots.RandomRobot, defaults).find(it => it.value == 'version').question
                const choices = question.choices()
                expect(choices).to.contain('v2')
            })

            it('should set RandomRobot doubleWeight to 1', async function () {
                const {menu} = this.fixture
                menu.prompt = MockPrompter([
                    {choice: 'RandomRobot'},
                    {choice: 'doubleWeight'},
                    {doubleWeight: '1'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
                expect(menu.settings.robots.RandomRobot.doubleWeight).to.equal(1)
            })
        })
    })

    ///////////////////

    describe('methods', () => {

        describe('#decryptPassword', () => {

            it('should return empty string for undefined', function () {
                const {menu} = this.fixture
                const res = menu.decryptPassword(undefined)
                expect(res).to.equal('')
            })
        })

        describe('#doLogin', () => {

            beforeEach(async function () {
                const {menu, server} = this.fixture
                await server.listen()
                menu.credentials.serverUrl = 'http://localhost:' + server.port
            })

            it('should throw cause BadCredentialsError for bad confirmKey', async function () {
                const {menu, auth} = this.fixture
                menu.loglevel = 0
                const username = 'nobody@nowhere.example'
                const password = 'r2tW5aUn'
                const confirmKey = 'bad-confirm-key'
                menu.credentials.username = username
                menu.credentials.password = menu.encryptPassword(password)
                await auth.createUser(username, password)
                menu.prompt = MockPrompter([{key: confirmKey}])
                const err = await getError(() => menu.doLogin())
                expect(err.cause.name).to.equal('BadCredentialsError')
            })
        })

        describe('#encryptPassword', () => {

            it('should return empty string for undefined', function () {
                const {menu} = this.fixture
                const res = menu.encryptPassword(undefined)
                expect(res).to.equal('')
            })
        })

        describe('#getDefaultConfigDir', () => {

            describe('coverage', () => {
                it('call', () => {
                    Menu.getDefaultConfigDir()
                })
            })
        })

        describe('#getMatchOpts', () => {

            it('should set start state for advancedOpts', async function () {
                const {menu} = this.fixture
                const defaults = Menu.settingsDefaults().matchOpts
                const res = await menu.getMatchOpts(defaults, {startState: States28.WhiteCantMove})
                expect(res.startState).to.equal(States28.WhiteCantMove)
            })

            it('should set roller for advancedOpts rollsFile', async function () {
                const {menu} = this.fixture
                const defaults = Menu.settingsDefaults().matchOpts
                const res = await menu.getMatchOpts(defaults, {
                    rollsFile: resolve(__dirname, '../rolls.json')
                })
                expect(typeof res.roller).to.equal('function')
            })
        })

        describe('#q.passwordConfirm', () => {

            it('question should invalidate non-matching password', function () {
                const {menu} = this.fixture
                const question = menu.q.passwordConfirm()
                const res = question.validate('asdf', {password:'fdsa'})
                expect(res.toLowerCase()).to.contain('password').and.to.contain('match')
            })
        })

        describe('#joinOnlineMatch', () => {

            it('should call runMatch with mock method and mock client', async function () {
                const {menu} = this.fixture
                var isCalled = false
                menu.newClient = () => ({connect : noop, joinMatch: noop, close: noop, on: noop, removeListener: noop})
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.joinOnlineMatch('asdfasdf')
                expect(isCalled).to.equal(true)
            })
        })

        describe('#loadCredentials', () => {

            it('should replace obsolete server url', async function () {
                const {menu, files} = this.fixture
                await fse.writeJson(files.credentials, {serverUrl: 'ws://bg.dougowings.net:8080'})
                const exp = Menu.getDefaultServerUrl()
                await menu.loadCredentials()
                expect(menu.credentials.serverUrl).to.equal(exp)
            })

            describe('coverage', () => {

                it('configDir=null', async function () {
                    const {menu} = this.fixture
                    menu.configDir = null
                    await menu.loadCredentials()
                })
            })
        })

        describe('#loadCustomThemes', () => {

            beforeEach(function () {

                ThemeHelper.clearCustom()

                this.writeTheme = async function writeTheme(name, config) {
                    const {menu} = this.fixture
                    const themesDir = menu.getThemesDir()
                    const file = resolve(themesDir, name + '.json')
                    await fse.ensureDir(themesDir)
                    await fse.writeJson(file, config, {spaces: 2})
                }

                this.writeThemeRaw = async function writeThemeRaw(name, data) {
                    const {menu} = this.fixture
                    const themesDir = menu.getThemesDir()
                    const file = resolve(themesDir, name + '.json')
                    await fse.ensureDir(themesDir)
                    fs.writeFileSync(file, data)
                }
            })

            it('should load basic theme', async function () {
                const {menu} = this.fixture
                await this.writeTheme('Test', {
                    styles: {
                        'text.color': 'white'
                    }
                })
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('Test')
            })

            it('should load dependencies', async function () {
                const {menu} = this.fixture
                await this.writeTheme('t1', {
                    extends: ['t2'],
                    styles: {'text.color': 'white'}
                })
                await this.writeTheme('t2', {
                    extends: ['Default']
                })
                menu.loglevel = 1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(2)
                result.sort((a, b) => a.localeCompare(b))
                expect(result[0]).to.equal('t1')
                expect(result[1]).to.equal('t2')
            })

            it('should return empty after second call', async function () {
                const {menu} = this.fixture
                await this.writeTheme('Test', {
                    styles: {
                        'text.color': 'white'
                    }
                })

                const res1 = await menu.loadCustomThemes()
                expect(res1.length).to.equal(1)

                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(0)
            })

            it('should not load bad json, but load the rest', async function () {
                const {menu} = this.fixture
                await this.writeThemeRaw('TestBad', 'p')
                await this.writeTheme('TestGood', {extends: ['Default']})
                menu.loglevel = -1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('TestGood')
            })

            it('should not load bad dependencies, but load the rest', async function () {
                const {menu} = this.fixture
                await this.writeTheme('TestGood', {extends: ['Default']})
                await this.writeTheme('TestBad', {extends: ['Nothing']})
                menu.loglevel = -1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('TestGood')
            })

            it('should not load bad config, but load the rest', async function () {
                const {menu} = this.fixture
                await this.writeTheme('TestGood', {extends: ['Default']})
                await this.writeTheme('TestBad', {styles: {'text.color': 'asdflkasd'}})
                menu.loglevel = -1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('TestGood')
            })

            describe('coverage', () => {

                it('configDir=null', async function () {
                    const {menu} = this.fixture
                    menu.configDir = null
                    await menu.loadCustomThemes()
                })

                it('ensureThemesLoaded', async function () {
                    const {menu} = this.fixture
                    await menu.loadCustomThemes()
                    await menu.ensureThemesLoaded()
                })
            })
        })

        describe('#loadLabConfig', () => {

            describe('coverage', () => {

                it('configDir=null', async function () {
                    const {menu} = this.fixture
                    menu.configDir = null
                    const res = await menu.loadLabConfig()
                    expect(!!res).to.equal(false)
                })

                it('bad json', async function () {
                    const {menu, files} = this.fixture
                    fs.writeFileSync(files.lab, 'asdf')
                    menu.logger.loglevel = -1
                    const res = await menu.loadLabConfig()
                    expect(!!res).to.equal(false)
                })
            })
        })

        describe('#loadSettings', () => {

            it('should merge settingsFile if specified', async function () {
                const {menu, files} = this.fixture
                await fse.writeJson(files.settings, {matchOpts: {total: 5}})
                await menu.loadSettings()
                const result = menu.settings
                expect(result.matchOpts.total).to.equal(5)
            })

            it('should normalize opts file if not exists', async function () {
                const {menu, files} = this.fixture
                await fse.remove(files.settings)
                await menu.loadSettings()
                const content = fs.readFileSync(files.settings, 'utf-8')
                JSON.parse(content)
            })

            describe('coverage', () => {

                it('configDir=null', async function () {
                    const {menu} = this.fixture
                    menu.configDir = null
                    await menu.loadSettings()
                })
            
                it('isCustomRobot=true, robots={}', async function () {
                    const {menu} = this.fixture
                    menu.settings.isCustomRobot = true
                    menu.settings.robots = {}
                    await menu.loadSettings()
                })
            })
        })

        describe('#newCoordinator', () => {

            it('should return new coordinator', function () {
                const {menu} = this.fixture
                const coordinator = menu.newCoordinator()
                expect(coordinator.constructor.name).to.equal('Coordinator')
            })
        })

        describe('#newRobot', () => {

            it('should not throw when isCustomRobot', function () {
                const {menu} = this.fixture
                menu.settings.isCustomRobot = true
                menu.newRobot()
            })
        })

        describe('#playHumans', () => {

            it('should call runMatch for mock coordinator', async function () {
                const {menu} = this.fixture
                var isCalled = false
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.playHumans(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })

            it('should alert match canceled but not throw for mock coodinator', async function () {
                const {menu} = this.fixture
                const err = new MatchCanceledError
                menu.newCoordinator = () => newThrowingCoordinator(err)
                menu.loglevel = -1
                await menu.playHumans(menu.settings.matchOpts)
                await menu.consumeAlerts()
                expect(menu.alerts.lastError).to.equal(err)
            })

            it('should throw on non-match-canceled for mock coodinator', async function () {
                const {menu} = this.fixture
                const exp = new Error
                menu.newCoordinator = () => newThrowingCoordinator(exp)
                const err = await getError(() => menu.playHumans(menu.settings.matchOpts))
                expect(err).to.equal(exp)
            })
        })

        describe('#playRobot', () => {

            it('should call runMatch for mock coordinator', async function () {
                const {menu} = this.fixture
                var isCalled = false
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.playRobot(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })

            it('should cancel match on interrupt', async function () {
                const {menu} = this.fixture
                menu.logger.console.log = noop
                menu.once('beforeMatchStart', (match, players) => {
                    menu.loglevel = 0
                    match.opts.roller = () => [6, 1]
                    Object.values(players).forEach(player => {
                        player.loglevel = -1
                        player.output = new NullOutput
                        player.drawBoard = noop
                        player.promptWaitingForOpponent = () => {}
                    })
                    // prevent logging to screen
                    players.White.inquirer = {
                        prompt: () => new Promise(resolve => {})
                    }
                    setTimeout(() => menu.captureInterrupt())
                })
                await menu.playRobot({total: 1})
            })
        })

        describe('#playRobots', () => {

            it('should call runMatch for mock coordinator', async function () {
                const {menu} = this.fixture
                var isCalled = false
                menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
                await menu.playRobots(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })
        })

        describe('#prompt', () => {

            // coverage tricks

            it.skip('should call inquirer.prompt', function () {
                const {menu} = this.fixture
                var q
                menu.inquirer = {prompt: questions => q = questions}
                menu.prompt()
                expect(Array.isArray(q)).to.equal(true)
            })
        })

        describe('#promptChangePassword', () => {

            it('should throw when api.changePassword throws and clear password', async function () {
                const {menu} = this.fixture
                const exp = new Error
                menu.api.changePassword = () => {throw exp}
                const newPassword = 'asdf,k(8khDJJ)'
                menu.prompt = MockPrompter([
                    {oldPassword: 'asdf(8dflLL)', newPassword, passwordConfirm: newPassword}
                ])
                const err = await getError(() => menu.promptChangePassword())
                expect(err).to.equal(exp)
                expect(!!menu.credentials.password).to.equal(false)
            })
        })

        describe('#promptMatchAdvancedOpts', () => {

            it('should populate valid rolls file', async function () {
                const {menu} = this.fixture
                const advancedOpts = {}
                menu.prompt = MockPrompter([
                    {startState: '', rollsFile: resolve(__dirname, '../rolls.json')}
                ])
                const res = await menu.promptMatchAdvancedOpts(advancedOpts)
                expect(res.rollsFile).to.contain('rolls.json')
            })

            it('should populate valid start state', async function () {
                const {menu} = this.fixture
                const advancedOpts = {}
                menu.prompt = MockPrompter([
                    {startState: States28.Initial, rollsFile: ''}
                ])
                const res = await menu.promptMatchAdvancedOpts(advancedOpts)
                expect(res.startState).to.equal(States28.Initial)
            })

            it('should invalidate bad start state', async function () {
                const {menu} = this.fixture
                const advancedOpts = {}
                menu.prompt = MockPrompter([
                    {startState: 'asdf', rollsFile: ''}
                ])
                const err = await getError(() => menu.promptMatchAdvancedOpts(advancedOpts))
                expect(err instanceof Error).to.equal(true)
            })
        })

        describe('#runLab', () => {

            describe('coverage', () => {

                it('override interactive', async function () {
                    const {menu} = this.fixture
                    menu.once('beforeRunLab', lab => {
                        lab.interactive = noop
                    })
                    await menu.runLab()
                })

                it('override interactive labConfig', async function () {
                    const {menu, dirs} = this.fixture
                    menu.once('beforeRunLab', lab => {
                        lab.interactive = noop
                    })
                    await fse.writeJson(resolve(dirs.config, 'lab.json'), {
                        lastState: States28.Initial,
                        persp: 'White'
                    })
                    await menu.runLab()
                })

                it('override runCommand', async function () {
                    const {menu} = this.fixture
                    menu.once('beforeRunLab', lab => {
                        lab.runCommand = noop
                    })
                    await menu.runLab('q')
                })
            })
        })

        describe('#saveCredentials', () => {

            describe('coverage', () => {

                it('configDir=null', async function () {
                    const {menu} = this.fixture
                    menu.configDir = null
                    await menu.saveCredentials()
                })
            })
        })

        describe('#saveLabConfig', () => {

            describe('coverage', () => {

                it('configDir=null', async function () {
                    const {menu} = this.fixture
                    menu.configDir = null
                    await menu.saveLabConfig()
                })
            })
        })

        describe('#saveSettings', () => {

            it('should write default settings', async function () {
                const {menu, files} = this.fixture
                const settings = Menu.settingsDefaults()
                await menu.saveSettings()
                const result = JSON.parse(fs.readFileSync(files.settings))
                expect(result).to.jsonEqual(settings)
            })

            it('should not throw when configDir=null', async function () {
                const {menu} = this.fixture
                menu.configDir = null
                await menu.saveSettings()
            })
        })

        describe('#startOnlineMatch', () => {

            describe('server', () => {

                beforeEach(async function () {
                    const {menu, server} = this.fixture
                    const menu1 = menu
                    await server.listen()
                    const username = 'nobody@nowhere.example'
                    const password = '9YWS8b8F'
                    const user = await server.auth.createUser(username, password, true)
                    menu1.credentials = {
                        username
                      , password : menu.encryptPassword(user.passwordEncrypted)
                      , serverUrl : 'http://localhost:' + server.port
                    }
                    menu2 = new Menu
                    menu2.credentials = {...menu.credentials}
                    menu1.logger.name = 'Menu1'
                    menu2.logger.name = 'Menu2'
                    menu1.on('beforeMatchStart', (match, players, coordinator) =>
                        coordinator.logger.name = 'Coordinator1'
                    )
                    menu2.on('beforeMatchStart', (match, players, coordinator) =>
                        coordinator.logger.name = 'Coordinator2'
                    )
                    menu1.on('clientWaitStart', client => client.logger.name = 'Client1')
                    menu2.on('clientWaitStart', client => client.logger.name = 'Client2')
                    update(this.fixture, {menu1, menu2})
                })

                it('should cancel waiting on capture interrupt', async function () {
                    const {menu} = this.fixture
                    menu.logger.console.log = noop
                    var isCalled = false
                    menu.once('clientWaitStart', () => {
                        isCalled = true
                        setTimeout(() => menu.captureInterrupt())
                    })
                    menu.loglevel = -1
                    await menu.startOnlineMatch({total: 1})
                    expect(isCalled).to.equal(true)
                    expect(!!menu.captureInterrupt).to.equal(false)
                })

                it('should let menu2 join then cancel on interrupt', function (done) {
                    const {menu1, menu2, server} = this.fixture

                    const finish = () => {
                        menu1.captureInterrupt()
                        menu2.captureInterrupt()
                        done()
                    }

                    const isDebug = false

                    if (isDebug) {
                        // debug logger names, etc
                        server.loglevel = 4
                        menu1.loglevel = 4
                        menu2.loglevel = 4
                    } else {
                        menu1.loglevel = -1
                        menu2.loglevel = -1
                        menu1.logger.console.log = noop
                        menu2.logger.console.log = noop
                    }

                    //const fakeInquirer = {prompt: () => new Promise(resolve => {})}

                    // We could call at any time, but we don't want to double call.
                    var count = 0

                    const prep = player => {
                        if (isDebug) {
                            player.loglevel = 4
                        } else {
                            player.loglevel = -1
                        }
                        player.output = new NullOutput
                        player.inquirer.opt.output = new NullOutput
                        //player.inquirer = fakeInquirer
                        player.drawBoard = noop
                        player.on('firstRoll', () => {
                            if (++count == 2) {
                                finish()
                            }
                        })
                    }

                    menu1.on('beforeMatchStart', (match, players) => prep(players.White))
                    menu2.on('beforeMatchStart', (match, players) => prep(players.Red))

                    menu1.on('clientWaitStart', client => {
                        client.on('matchCreated', id => {
                            menu2.joinOnlineMatch(id)
                        })
                    })

                    menu1.startOnlineMatch({total: 1})
                })
            })

            it('should call runMatch with mock method and mock client', async function () {
                const {menu} = this.fixture
                var isCalled = false
                menu.newClient = () => ({connect : noop, createMatch: noop, close: noop, on: noop, removeListener: noop})
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.startOnlineMatch(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })
        })
    })

    describe('RequestError', () => {

        describe('#forResponse', () => {

            it('should set case to error in body', function () {
                const res = {status: 500}
                const body = {error: {name: 'TestError', message: 'test error message'}}
                const err = RequestError.forResponse(res, body)
                expect(err.cause.name).to.equal('TestError')
            })

            it('should construct without body', function () {
                const res = {status: 500}
                const err = RequestError.forResponse(res)
            })
        })
        
    })

    describe('Alerts', () => {
        it('should have alert with error', function () {
            const {menu} = this.fixture
            const exp = new Error('test')
            menu.alerts.error(exp)
            const res = menu.alerts.getErrors()[0]
            expect(res).to.equal(exp)
            
        })
    })

    describe('BoxStatus', () => {

        beforeEach(function () {
            this.fixture.stat = new BoxStatus
        })

        it('should track line height plus render height after answered with less height', function () {
            const {stat} = this.fixture
            stat.emit('render', {width: 1, indent: 0, height: 10})
            stat.emit('line', {width: 1, indent: 0})
            stat.emit('answered', {width: 1, indent: 0, height: 2})
            stat.emit('render', {width: 1, indent: 0, height: 10})
            stat.emit('answered', {width: 1, indent: 0, height: 2})
            expect(stat.height).to.equal(13)
        })
    })
})