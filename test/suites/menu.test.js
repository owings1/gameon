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
    getErrorAsync,
    parseKey,
    requireSrc,
    MockPrompter,
    noop,
    NullOutput,
    States28,
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

    var player
    var menu

    var configDir
    var settingsFile
    var credentialsFile
    var labConfigFile
    var authDir
    var server

    beforeEach(async () => {
        authDir = tmpDir()
        configDir = tmpDir()
        server = new Server({
            authType: 'directory',
            authDir
        })
        server.loglevel = 0
        settingsFile = resolve(configDir, 'settings.json')
        credentialsFile = resolve(configDir, 'credentials.json')
        labConfigFile = resolve(configDir, 'lab.json')
        menu = new Menu(configDir)
        menu.loglevel = 1
        menu.eraseScreen = noop
    })

    afterEach(async () => {
        await fse.remove(authDir)
        await fse.remove(configDir)
    })

    function newThrowingCoordinator(err) {
        err = err || new Error('test')
        return {runMatch: () => {throw err}}
    }

    describe('menus', () => {

        describe('#mainMenu', () => {

            it('should quit', async () => {
                menu.prompt = MockPrompter({choice: 'quit'})
                await menu.mainMenu()
            })

            it('should go to play menu, new local match menu, then come back, then quit', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'play'},
                    {choice: 'playHumans'},
                    {choice: 'quit'},
                    {choice: 'quit'},
                    {choice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should go to settings menu then done then quit', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'settings'},
                    {choice: 'done'},
                    {choice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should go to account menu then quit', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'account'},
                    {choice: 'done'},
                    {choice: 'quit'}
                ])
                await menu.mainMenu()
            })

            // not clear this should be the spec, maybe a better error
            it.skip('should do nothing for unknown choice then quit', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'foo'},
                    {choice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should run lab and quit', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'lab'},
                    {choice: 'quit'}
                ])
                menu.runLab = noop
                await menu.mainMenu()
            })
        })

        describe('#playMenu', () => {

            beforeEach(async () => {
                await server.listen()
                menu.credentials.serverUrl = 'http://localhost:' + server.port
            })

            afterEach(async () => {
                server.close()
            })

            it('should invalidate match id abcd with joinOnline, then quit', async () => {
                menu.alerter.loglevel = -1
                menu.prompt = MockPrompter([
                    {choice: 'joinOnline'},
                    {matchId: 'abcd'},
                    {choice: 'quit'}
                ])
                await menu.playMenu()
            })

            it('should alert warning/error then done when joinOnline throws BadCredentialsError', async () => {
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

            it('should alert error then done for joinOnline when matchMenu throws MatchCanceledError', async () => {
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

            it('should return true for choice back', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'back'}
                ])
                const res = await menu.playMenu()
                expect(res).to.equal(true)
            })

            it('should continue when matchMenu returns true', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'playRobot'},
                    {choice: 'quit'}
                ])
                menu.matchMenu = () => true
                await menu.playMenu()
            })
        })

        describe('#matchMenu', () => {

            it('should set match total to 5', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'total'},
                    {total: '5'},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
                expect(menu.settings.matchOpts.total).to.equal(5)
            })

            it('should invalidate total=-1', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'total'},
                    {total: '-1'}
                ])
                const err = await getErrorAsync(() => menu.matchMenu('playHumans'))
                expect(err.message).to.contain('Validation failed for total')
            })

            it('should set isJacoby to true', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'isJacoby'},
                    {isJacoby: true},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
                expect(menu.settings.matchOpts.isJacoby).to.equal(true)
            })

            it('should set isCrawford to false', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'isCrawford'},
                    {isCrawford: false},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
                expect(menu.settings.matchOpts.isCrawford).to.equal(false)
            })

            it('should quit', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playHumans')
            })

            it('should quit for back', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'back'}
                ])
                await menu.matchMenu('playHumans')
            })

            it('should go to startOnlineMatch with startOnline and mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.startOnlineMatch = () => isCalled = true
                await menu.matchMenu('startOnline')
                expect(isCalled).to.equal(true)
            })

            it('should go to playRobot with playRobot and mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.playRobot = () => isCalled = true
                await menu.matchMenu('playRobot')
                expect(isCalled).to.equal(true)
            })

            it('should go to playRobots with playRobots and mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.playRobots = () => isCalled = true
                await menu.matchMenu('playRobots')
                expect(isCalled).to.equal(true)
            })

            it('should go to playHumans with playHumans mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {choice: 'start'},
                    {choice: 'quit'}
                ])
                menu.playHumans = () => isCalled = true
                await menu.matchMenu('playHumans')
                expect(isCalled).to.equal(true)
            })

            it('should go to advanced for playRobot', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'advanced'},
                    {startState: '', rollsFile: ''},
                    {choice: 'quit'}
                ])
                await menu.matchMenu('playRobot')
            })
        })

        describe('#accountMenu', () => {

            beforeEach(async () => {
                await server.listen()
                menu.credentials.serverUrl = 'http://localhost:' + server.port
            })

            afterEach(async () => {
                server.close()
            })

            async function makeUser(username, password, isConfirm = true) {
                username = username || 'nobody@nowhere.example'
                password = password || '8QwuU68W'
                return await server.auth.createUser(username, password, true) 
            }

            it('should sign up, log in and confirm user', async () => {
                const username = 'nobody@nowhere.example'
                const password = '9Axf5kAR'
                menu.prompt = MockPrompter([
                    {choice: 'createAccount'},
                    {username, password, passwordConfirm: password},
                    {key: () => parseKey(server.api.auth.email.impl.lastEmail)},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                const user = await server.auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should send forget password and reset for confirmed user', async () => {
                const {username, password} = await makeUser(null, '8QwuU68W')
                const oldPassword = '2q2y9K7V'
                menu.prompt = MockPrompter([
                    {choice: 'forgotPassword'},
                    {username},
                    {resetKey: () => parseKey(server.api.auth.email.impl.lastEmail), password, passwordConfirm: password},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                await server.auth.authenticate(username, password)
            })

            it('should change password and authenticate', async () => {
                const username = 'nobody@nowhere.example'
                const oldPassword = '9YWS8b8F'
                const newPassword = '37GbrWAZ'
                await server.auth.createUser(username, oldPassword, true)
                menu.credentials.username = username
                menu.prompt = MockPrompter([
                    {choice: 'changePassword'},
                    {oldPassword, newPassword, passwordConfirm: newPassword},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                await server.auth.authenticate(username, newPassword)
            })

            it('should clear credentials', async () => {
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

            it('should change username', async () => {
                const username = 'nobody@nowhere.example'
                menu.prompt = MockPrompter([
                    {choice: 'username'},
                    {username},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.credentials.username).to.equal(username)
            })

            it('should change and encrypt password', async () => {
                const password = '6yahTQ8H'
                menu.prompt = MockPrompter([
                    {choice: 'password'},
                    {password},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.decryptPassword(menu.credentials.password)).to.equal(password)
            })

            it('should change serverUrl', async () => {
                const serverUrl = 'http://nowhere.example'
                menu.prompt = MockPrompter([
                    {choice: 'serverUrl'},
                    {serverUrl},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.credentials.serverUrl).to.equal(serverUrl)
            })

            it('should prompt forgot password then done when key not entered', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'd4PUxRs2'
                await server.auth.createUser(username, password, true)
                menu.prompt = MockPrompter([
                    {choice: 'forgotPassword'},
                    {username},
                    {resetKey: ''},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
            })

            it('should alert error and done when promptForgotPassword throws', async () => {
                const err = new Error('testMessage')
                menu.loglevel = -1
                menu.promptForgotPassword = () => { throw err }
                const username = 'nobody@nowhere.example'
                const password = 'd4PUxRs2'
                await server.auth.createUser(username, password, true)
                menu.prompt = MockPrompter([
                    {choice: 'forgotPassword'},
                    {choice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.alerts.lastError).to.equal(err)
            })

            it('should alert BadCredentialsError and done when password entered and login fails', async () => {
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

            it('should alert BadCredentialsError then done on incorrect password for change-password', async () => {
                menu.loglevel = -1
                const username = 'nobody@nowhere.example'
                const oldPassword = 'C7pUaA3c'
                const badPassword = 'etzF4Y8L'
                const password = 'fVvqK99g'
                await server.auth.createUser(username, oldPassword, true)
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

            it('should set robot delay to 4 then done', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'delay'},
                    {delay: '4'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
                expect(menu.settings.delay).to.equal(4)
            })

            it('should invalidate robot delay foo', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'delay'},
                    {delay: 'foo'},
                    {choice: 'done'}
                ])
                const err = await getErrorAsync(() => menu.settingsMenu())
                expect(err.message).to.contain('Validation failed for delay')
            })

            it('should go to robotConfgs then done', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'robotConfigs'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
            })

            it('should go to robotsMenu for isCustomRobot=true', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'isCustomRobot'},
                    {isCustomRobot: true},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
            })

            it('should set theme to Default', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'theme'},
                    {theme: 'Default'},
                    {choice: 'done'}
                ])
                await menu.settingsMenu()
            })

            describe('coverage', () => {

                it('isCustomRobot=true robots non-empty', async () => {
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

                it('isCustomRobot=true recordDir empty', async () => {
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

                it('settingsChoices.theme.choices', () => {
                    const choices = menu.q.settingsChoices()
                    const question = choices.find(choice => choice.value == 'theme').question
                    const res = question.choices()
                    expect(res).to.contain('Default')
                })
            })
        })

        describe('#robotMenu', () => {

            it('should reset RunningRobot moveWeight', async () => {
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

            it('should run and done', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
            })

            it('should reset config, select RandomRobot and done', async () => {
                menu.prompt = MockPrompter([
                    {choice: 'reset'},
                    {choice: 'RandomRobot'},
                    {choice: 'done'},
                    {choice: 'done'}
                ])
                await menu.robotsMenu()
            })

            it('should set RandomRobot moveWeight to 1', async () => {
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

            it('should set RandomRobot moveWeight to 1 then reset', async () => {
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

            it('should set RandomRobot version to v2', async () => {
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

            it('should set RandomRobot doubleWeight to 1', async () => {
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

            it('should return empty string for undefined', () => {
                const res = menu.decryptPassword(undefined)
                expect(res).to.equal('')
            })
        })

        describe('#doLogin', () => {

            beforeEach(async () => {
                await server.listen()
                menu.credentials.serverUrl = 'http://localhost:' + server.port
            })

            afterEach(async () => {
                await server.close()
            })

            it('should throw cause BadCredentialsError for bad confirmKey', async () => {
                menu.loglevel = 0
                const username = 'nobody@nowhere.example'
                const password = 'r2tW5aUn'
                const confirmKey = 'bad-confirm-key'
                menu.credentials.username = username
                menu.credentials.password = menu.encryptPassword(password)
                await server.auth.createUser(username, password)
                menu.prompt = MockPrompter([{key: confirmKey}])
                const err = await getErrorAsync(() => menu.doLogin())
                expect(err.cause.name).to.equal('BadCredentialsError')
            })
        })

        describe('#encryptPassword', () => {

            it('should return empty string for undefined', () => {
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

            it('should set start state for advancedOpts', async () => {
                const defaults = Menu.settingsDefaults().matchOpts
                const res = await menu.getMatchOpts(defaults, {startState: States28.WhiteCantMove})
                expect(res.startState).to.equal(States28.WhiteCantMove)
            })

            it('should set roller for advancedOpts rollsFile', async () => {
                const defaults = Menu.settingsDefaults().matchOpts
                const res = await menu.getMatchOpts(defaults, {
                    rollsFile: resolve(__dirname, '../rolls.json')
                })
                expect(typeof res.roller).to.equal('function')
            })
        })

        describe('#q.passwordConfirm', () => {

            it('question should invalidate non-matching password', () => {
                const question = menu.q.passwordConfirm()
                const res = question.validate('asdf', {password:'fdsa'})
                expect(res.toLowerCase()).to.contain('password').and.to.contain('match')
            })
        })

        describe('#joinOnlineMatch', () => {

            it('should call runMatch with mock method and mock client', async () => {
                var isCalled = false
                menu.newClient = () => ({connect : noop, joinMatch: noop, close: noop, on: noop, removeListener: noop})
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.joinOnlineMatch('asdfasdf')
                expect(isCalled).to.equal(true)
            })
        })

        describe('#loadCredentials', () => {

            it('should replace obsolete server url', async () => {
                fse.writeJsonSync(credentialsFile, {serverUrl: 'ws://bg.dougowings.net:8080'})
                const exp = Menu.getDefaultServerUrl()
                await menu.loadCredentials()
                expect(menu.credentials.serverUrl).to.equal(exp)
            })

            describe('coverage', () => {

                it('configDir=null', async () => {
                    menu.configDir = null
                    await menu.loadCredentials()
                })
            })
        })

        describe('#loadCustomThemes', () => {

            beforeEach(() => {
                ThemeHelper.clearCustom()
            })

            async function writeTheme(name, config) {
                const themesDir = menu.getThemesDir()
                const file = resolve(themesDir, name + '.json')
                await fse.ensureDir(themesDir)
                await fse.writeJson(file, config, {spaces: 2})
            }

            async function writeThemeRaw(name, data) {
                const themesDir = menu.getThemesDir()
                const file = resolve(themesDir, name + '.json')
                await fse.ensureDir(themesDir)
                fs.writeFileSync(file, data)
            }

            it('should load basic theme', async () => {
                await writeTheme('Test', {
                    styles: {
                        'text.color': 'white'
                    }
                })

                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('Test')
            })

            it('should load dependencies', async () => {
                await writeTheme('t1', {
                    extends: ['t2'],
                    styles: {'text.color': 'white'}
                })
                await writeTheme('t2', {
                    extends: ['Default']
                })
                menu.logger.loglevel = 1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(2)
                result.sort((a, b) => a.localeCompare(b))
                expect(result[0]).to.equal('t1')
                expect(result[1]).to.equal('t2')
            })

            it('should return empty after second call', async () => {
                await writeTheme('Test', {
                    styles: {
                        'text.color': 'white'
                    }
                })

                const res1 = await menu.loadCustomThemes()
                expect(res1.length).to.equal(1)

                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(0)
            })

            it('should not load bad json, but load the rest', async () => {
                await writeThemeRaw('TestBad', 'p')
                await writeTheme('TestGood', {extends: ['Default']})
                menu.logger.loglevel = -1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('TestGood')
            })

            it('should not load bad dependencies, but load the rest', async () => {
                await writeTheme('TestGood', {extends: ['Default']})
                await writeTheme('TestBad', {extends: ['Nothing']})
                menu.logger.loglevel = -1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('TestGood')
            })

            it('should not load bad config, but load the rest', async () => {
                await writeTheme('TestGood', {extends: ['Default']})
                await writeTheme('TestBad', {styles: {'text.color': 'asdflkasd'}})
                menu.logger.loglevel = -1
                const result = await menu.loadCustomThemes()
                expect(result.length).to.equal(1)
                expect(result[0]).to.equal('TestGood')
            })

            describe('coverage', () => {

                it('configDir=null', async () => {
                    menu.configDir = null
                    await menu.loadCustomThemes()
                })

                it('ensureThemesLoaded', async () => {
                    await menu.loadCustomThemes()
                    await menu.ensureThemesLoaded()
                })
            })
        })

        describe('#loadLabConfig', () => {

            describe('coverage', () => {

                it('configDir=null', async () => {
                    menu.configDir = null
                    const res = await menu.loadLabConfig()
                    expect(!!res).to.equal(false)
                })

                it('bad json', async () => {
                    fs.writeFileSync(labConfigFile, 'asdf')
                    menu.logger.loglevel = -1
                    const res = await menu.loadLabConfig()
                    expect(!!res).to.equal(false)
                })
            })
        })

        describe('#loadSettings', () => {

            it('should merge settingsFile if specified', async () => {
                fse.writeJsonSync(settingsFile, {matchOpts: {total: 5}})
                await menu.loadSettings()
                const result = menu.settings
                expect(result.matchOpts.total).to.equal(5)
            })

            it('should normalize opts file if not exists', async () => {
                fse.removeSync(settingsFile)
                await menu.loadSettings()
                const content = fs.readFileSync(settingsFile, 'utf-8')
                JSON.parse(content)
            })

            describe('coverage', () => {
                it('configDir=null', async () => {
                    menu.configDir = null
                    await menu.loadSettings()
                })
            
                it('isCustomRobot=true, robots={}', async () => {
                    menu.settings.isCustomRobot = true
                    menu.settings.robots = {}
                    await menu.loadSettings()
                })
            })
        })

        describe('#newCoordinator', () => {

            it('should return new coordinator', () => {
                const coordinator = menu.newCoordinator()
                expect(coordinator.constructor.name).to.equal('Coordinator')
            })
        })

        describe('#newRobot', () => {

            it('should not throw when isCustomRobot', () => {
                menu.settings.isCustomRobot = true
                menu.newRobot()
            })
        })

        describe('#playHumans', () => {

            it('should call runMatch for mock coordinator', async () => {
                var isCalled = false
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.playHumans(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })

            it('should alert warn match canceled but not throw for mock coodinator', async () => {
                const err = new MatchCanceledError
                menu.newCoordinator = () => newThrowingCoordinator(err)
                menu.loglevel = 0
                await menu.playHumans(menu.settings.matchOpts)
                await menu.consumeAlerts()
                expect(menu.alerts.lastError).to.equal(err)
            })

            it('should throw on non-match-canceled for mock coodinator', async () => {
                const exp = new Error
                menu.newCoordinator = () => newThrowingCoordinator(exp)
                const err = await getErrorAsync(() => menu.playHumans(menu.settings.matchOpts))
                expect(err).to.equal(exp)
            })
        })

        describe('#playRobot', () => {

            it('should call runMatch for mock coordinator', async () => {
                var isCalled = false
                menu.newCoordinator = () => ({runMatch: () => isCalled = true})
                await menu.playRobot(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })

            it('should cancel match on interrupt', async () => {
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

            it('should call runMatch for mock coordinator', async () => {
                var isCalled = false
                menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
                await menu.playRobots(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })
        })

        describe('#prompt', () => {

            // coverage tricks

            it.skip('should call inquirer.prompt', () => {
                var q
                menu.inquirer = {prompt: questions => q = questions}
                menu.prompt()
                expect(Array.isArray(q)).to.equal(true)
            })
        })

        describe('#promptChangePassword', () => {

            it('should throw when api.changePassword throws and clear password', async () => {
                const exp = new Error
                menu.api.changePassword = () => {throw exp}
                const newPassword = 'asdf,k(8khDJJ)'
                menu.prompt = MockPrompter([
                    {oldPassword: 'asdf(8dflLL)', newPassword, passwordConfirm: newPassword}
                ])
                const err = await getErrorAsync(() => menu.promptChangePassword())
                expect(err).to.equal(exp)
                expect(!!menu.credentials.password).to.equal(false)
            })
        })

        describe('#promptMatchAdvancedOpts', () => {

            it('should populate valid rolls file', async () => {
                const advancedOpts = {}
                menu.prompt = MockPrompter([
                    {startState: '', rollsFile: resolve(__dirname, '../rolls.json')}
                ])
                const res = await menu.promptMatchAdvancedOpts(advancedOpts)
                expect(res.rollsFile).to.contain('rolls.json')
            })

            it('should populate valid start state', async () => {
                const advancedOpts = {}
                menu.prompt = MockPrompter([
                    {startState: States28.Initial, rollsFile: ''}
                ])
                const res = await menu.promptMatchAdvancedOpts(advancedOpts)
                expect(res.startState).to.equal(States28.Initial)
            })

            it('should invalidate bad start state', async () => {
                const advancedOpts = {}
                menu.prompt = MockPrompter([
                    {startState: 'asdf', rollsFile: ''}
                ])
                const err = await getErrorAsync(() => menu.promptMatchAdvancedOpts(advancedOpts))
                expect(err instanceof Error).to.equal(true)
            })
        })

        describe('#runLab', () => {

            describe('coverage', () => {

                it('override interactive', async () => {
                    menu.once('beforeRunLab', lab => {
                        lab.interactive = noop
                    })
                    await menu.runLab()
                })

                it('override interactive labConfig', async () => {
                    menu.once('beforeRunLab', lab => {
                        lab.interactive = noop
                    })
                    await fse.writeJson(resolve(configDir, 'lab.json'), {
                        lastState: States28.Initial,
                        persp: 'White'
                    })
                    await menu.runLab()
                })

                it('override runCommand', async () => {
                    menu.once('beforeRunLab', lab => {
                        lab.runCommand = noop
                    })
                    await menu.runLab('q')
                })
            })
        })

        describe('#saveCredentials', () => {

            describe('coverage', () => {

                it('configDir=null', async () => {
                    menu.configDir = null
                    await menu.saveCredentials()
                })
            })
        })

        describe('#saveLabConfig', () => {

            describe('coverage', () => {

                it('configDir=null', async () => {
                    menu.configDir = null
                    await menu.saveLabConfig()
                })
            })
        })

        describe('#saveSettings', () => {

            it('should write default settings', async () => {
                const settings = Menu.settingsDefaults()
                await menu.saveSettings()
                const result = JSON.parse(fs.readFileSync(settingsFile))
                expect(result).to.jsonEqual(settings)
            })

            it('should not throw when configDir=null', async () => {
                menu.configDir = null
                await menu.saveSettings()
            })
        })

        describe('#startOnlineMatch', () => {

            describe('server', () => {

                var menu1
                var menu2

                beforeEach(async () => {
                    menu1 = menu
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
                })

                afterEach(async () => {
                    await new Promise(resolve => setTimeout(resolve, 200))
                    server.close()
                })

                it('should cancel waiting on capture interrupt', async () => {
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

                it('should let menu2 join then cancel on interrupt', done => {

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

                    const fakeInquirer = {prompt: () => new Promise(resolve => {})}

                    // We could call at any time, but we don't want to double call.
                    var count = 0

                    const prep = player => {
                        if (isDebug) {
                            player.loglevel = 4
                        } else {
                            player.loglevel = -1
                        }
                        player.output = new NullOutput
                        player.inquirer = fakeInquirer
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

            it('should call runMatch with mock method and mock client', async () => {
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

            it('should set case to error in body', () => {
                const res = {status: 500}
                const body = {error: {name: 'TestError', message: 'test error message'}}
                const err = RequestError.forResponse(res, body)
                expect(err.cause.name).to.equal('TestError')
            })

            it('should construct without body', () => {
                const res = {status: 500}
                const err = RequestError.forResponse(res)
            })
        })
        
    })

    describe('Alerts', () => {
        it('should have alert with error', () => {
            const exp = new Error('test')
            menu.alerts.error(exp)
            const res = menu.alerts.getErrors()[0]
            expect(res).to.equal(exp)
            
        })
    })

    describe('BoxStatus', () => {

        var stat

        beforeEach(() => {
            stat = new BoxStatus
        })

        it('should track line height plus render height after answered with less height', () => {
            stat.emit('render', {width: 1, indent: 0, height: 10})
            stat.emit('line', {width: 1, indent: 0})
            stat.emit('answered', {width: 1, indent: 0, height: 2})
            stat.emit('render', {width: 1, indent: 0, height: 10})
            stat.emit('answered', {width: 1, indent: 0, height: 2})
            expect(stat.height).to.equal(13)
        })
    })
})