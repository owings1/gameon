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
    States28,
    tmpDir
} = TestUtil

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')

const {resolve} = path

describe('Menu', () => {

    const Errors      = requireSrc('lib/errors')
    const Menu        = requireSrc('term/menu')
    const Robot       = requireSrc('robot/player')
    const Server      = requireSrc('net/server')
    const ThemeHelper = requireSrc('term/themes')

    const {RequestError} = Errors

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
        //console.log({authDir})
        server.logger.loglevel = 0
        server.auth.logger.loglevel = 0
        settingsFile = configDir + '/settings.json'
        credentialsFile = configDir + '/credentials.json'
        labConfigFile = resolve(configDir, 'lab.json')
        menu = new Menu(configDir)
        menu.logger.loglevel = 1
    })

    afterEach(async () => {
        await fse.remove(authDir)
        await fse.remove(configDir)
    })

    describe('menus', () => {

        describe('#mainMenu', () => {

            it('should quit', async () => {
                menu.prompt = MockPrompter({mainChoice: 'quit'})
                await menu.mainMenu()
            })

            it('should go to play menu, new local match menu, then come back, then quit', async () => {
                menu.prompt = MockPrompter([
                    {mainChoice: 'play'},
                    {playChoice: 'newLocal'},
                    {matchChoice: 'quit'},
                    {playChoice: 'quit'},
                    {mainChoice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should go to settings menu then done then quit', async () => {
                menu.prompt = MockPrompter([
                    {mainChoice: 'settings'},
                    {settingChoice: 'done'},
                    {mainChoice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should go to account menu then quit', async () => {
                menu.prompt = MockPrompter([
                    {mainChoice: 'account'},
                    {accountChoice: 'done'},
                    {mainChoice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should do nothing for unknown choice then quit', async () => {
                menu.prompt = MockPrompter([
                    {mainChoice: 'foo'},
                    {mainChoice: 'quit'}
                ])
                await menu.mainMenu()
            })

            it('should run lab and quit', async () => {
                menu.prompt = MockPrompter([
                    {mainChoice: 'lab'},
                    {mainChoice: 'quit'}
                ])
                menu.runLab = noop
                await menu.mainMenu()
            })
        })

        describe('#joinMenu', () => {

            it('should go to joinOnlineMatch for matchId with mock method', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {matchId: '12345678'}
                ])
                menu.joinOnlineMatch = () => isCalled = true
                await menu.joinMenu()
                expect(isCalled).to.equal(true)
            })

            it('should not go to joinOnlineMatch without matchId with mock method', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {matchId: ''}
                ])
                menu.joinOnlineMatch = () => isCalled = true
                await menu.joinMenu()
                expect(isCalled).to.equal(false)
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
                menu.logger.loglevel = -1
                menu.prompt = MockPrompter([
                    {playChoice: 'joinOnline'},
                    {matchId: 'abcd'},
                    {playChoice: 'quit'}
                ])
                await menu.playMenu()
            })

            it('should warn then done when joinOnline throws BadCredentialsError', async () => {
                menu.credentials.username = 'nobody@nowhere.example'
                menu.credentials.password = menu.encryptPassword('s9GLdoe9')
                menu.prompt = MockPrompter([
                    {playChoice: 'joinOnline'},
                    {matchId: '12345678'},
                    {playChoice: 'quit'}
                ])
                menu.logger.loglevel = -1
                await menu.playMenu()
            })

            it('should warn then done when joinMenu throws MatchCanceledError', async () => {
                menu.joinMenu = () => {
                    throw new Client.Errors.MatchCanceledError
                }
                menu.prompt = MockPrompter([
                    {playChoice: 'joinOnline'},
                    {playChoice: 'quit'}
                ])
                menu.logger.loglevel = -1
                await menu.playMenu()
            })

            it('should return true for choice back', async () => {
                menu.prompt = MockPrompter([
                    {playChoice: 'back'}
                ])
                const res = await menu.playMenu()
                expect(res).to.equal(true)
            })

            it('should continue when matchMenu returns true', async () => {
                menu.prompt = MockPrompter([
                    {playChoice: 'playRobot'},
                    {playChoice: 'quit'}
                ])
                menu.matchMenu = () => true
                await menu.playMenu()
            })
        })

        describe('#matchMenu', () => {

            it('should set match total to 5', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'total'},
                    {total: '5'},
                    {matchChoice: 'quit'}
                ])
                await menu.matchMenu()
                expect(menu.settings.matchOpts.total).to.equal(5)
            })

            it('should invalidate total=-1', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'total'},
                    {total: '-1'}
                ])
                const err = await getErrorAsync(() => menu.matchMenu())
                expect(err.message).to.contain('Validation failed for total')
            })

            it('should set isJacoby to true', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'isJacoby'},
                    {isJacoby: true},
                    {matchChoice: 'quit'}
                ])
                await menu.matchMenu()
                expect(menu.settings.matchOpts.isJacoby).to.equal(true)
            })

            it('should set isCrawford to false', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'isCrawford'},
                    {isCrawford: false},
                    {matchChoice: 'quit'}
                ])
                await menu.matchMenu()
                expect(menu.settings.matchOpts.isCrawford).to.equal(false)

            })

            it('should quit', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'quit'}
                ])
                await menu.matchMenu()
            })

            it('should quit for back', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'back'}
                ])
                await menu.matchMenu()
            })

            it('should go to startOnlineMatch with isOnline and mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {matchChoice: 'start'},
                    {matchChoice: 'quit'}
                ])
                menu.startOnlineMatch = () => isCalled = true
                await menu.matchMenu(true)
                expect(isCalled).to.equal(true)
            })

            it('should go to playRobot with isRobot and mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {matchChoice: 'start'},
                    {matchChoice: 'quit'}
                ])
                menu.playRobot = () => isCalled = true
                await menu.matchMenu(false, true)
                expect(isCalled).to.equal(true)
            })

            it('should go to playRobots with isRobots and mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {matchChoice: 'start'},
                    {matchChoice: 'quit'}
                ])
                menu.playRobots = () => isCalled = true
                await menu.matchMenu(false, false, true)
                expect(isCalled).to.equal(true)
            })

            it('should go to playHumans with mock method, then quit', async () => {
                var isCalled = false
                menu.prompt = MockPrompter([
                    {matchChoice: 'start'},
                    {matchChoice: 'quit'}
                ])
                menu.playHumans = () => isCalled = true
                await menu.matchMenu()
                expect(isCalled).to.equal(true)
            })

            it('should go to advanced for isRobot', async () => {
                menu.prompt = MockPrompter([
                    {matchChoice: 'advanced'},
                    {startState: '', rollsFile: ''},
                    {matchChoice: 'quit'}
                ])
                await menu.matchMenu(false, true)
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

            it('should sign up, log in and confirm user', async () => {
                const username = 'nobody@nowhere.example'
                const password = '9Axf5kAR'
                //console.log(menu.credentials)
                //server.logger.loglevel = 4
                menu.prompt = MockPrompter([
                    {accountChoice: 'createAccount'},
                    {username, password, passwordConfirm: password},
                    {key: () => parseKey(server.auth.email.impl.lastEmail)},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                const user = await server.auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should send forget password and reset for confirmed user', async () => {
                const username = 'nobody@nowhere.example'
                const oldPassword = '2q2y9K7V'
                const password = '8QwuU68W'
                await server.auth.createUser(username, oldPassword, true)
                menu.prompt = MockPrompter([
                    {accountChoice: 'forgotPassword'},
                    {username},
                    {resetKey: () => parseKey(server.auth.email.impl.lastEmail), password, passwordConfirm: password},
                    {accountChoice: 'done'}
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
                    {accountChoice: 'changePassword'},
                    {oldPassword, newPassword, passwordConfirm: newPassword},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                await server.auth.authenticate(username, newPassword)
            })

            it('should clear credentials', async () => {
                menu.credentials.username = 'nobody@nowhere.example'
                menu.credentials.password = menu.encryptPassword('qN3zUpVh')
                menu.prompt = MockPrompter([
                    {accountChoice: 'clearCredentials'},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(!!menu.credentials.username).to.equal(false)
                expect(!!menu.credentials.password).to.equal(false)
            })

            it('should change username', async () => {
                const username = 'nobody@nowhere.example'
                menu.prompt = MockPrompter([
                    {accountChoice: 'username'},
                    {username},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.credentials.username).to.equal(username)
            })

            it('should change and encrypt password', async () => {
                const password = '6yahTQ8H'
                menu.prompt = MockPrompter([
                    {accountChoice: 'password'},
                    {password},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.decryptPassword(menu.credentials.password)).to.equal(password)
            })

            it('should change serverUrl', async () => {
                const serverUrl = 'http://nowhere.example'
                menu.prompt = MockPrompter([
                    {accountChoice: 'serverUrl'},
                    {serverUrl},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(menu.credentials.serverUrl).to.equal(serverUrl)
            })

            it('should prompt forgot password then done when key not entered', async () => {
                const username = 'nobody@nowhere.example'
                const password = 'd4PUxRs2'
                await server.auth.createUser(username, password, true)
                menu.prompt = MockPrompter([
                    {accountChoice: 'forgotPassword'},
                    {username},
                    {resetKey: ''},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
            })

            it('should log error and done when promptForgotPassword throws', async () => {
                var err
                menu.logger.loglevel = 0
                menu.logger.error = e => err = e
                menu.promptForgotPassword = () => { throw new Error }
                const username = 'nobody@nowhere.example'
                const password = 'd4PUxRs2'
                await server.auth.createUser(username, password, true)
                menu.prompt = MockPrompter([
                    {accountChoice: 'forgotPassword'},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(!!err).to.equal(true)
            })

            it('should log error and done when password entered and login fails', async () => {
                var err
                menu.logger.loglevel = 0
                menu.logger.error = e => err = e
                menu.credentials.username = 'nobody2@nowhere.example'
                const password = 'JUzrDc5k'
                menu.prompt = MockPrompter([
                    {accountChoice: 'password'},
                    {password},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(!!err).to.equal(true)
            })

            it('should unset password and log error then done on incorrect password for change-password', async () => {
                var err
                menu.logger.loglevel = 0
                menu.logger.error = e => err = e
                const username = 'nobody@nowhere.example'
                const oldPassword = 'C7pUaA3c'
                const badPassword = 'etzF4Y8L'
                const password = 'fVvqK99g'
                await server.auth.createUser(username, oldPassword, true)
                menu.credentials.username = username
                menu.credentials.password = menu.encryptPassword(oldPassword)
                menu.prompt = MockPrompter([
                    {accountChoice: 'changePassword'},
                    {oldPassword: badPassword, password, passwordConfirm: password},
                    {accountChoice: 'done'}
                ])
                await menu.accountMenu()
                expect(!!menu.credentials.password).to.equal(false)
                expect(!!err).to.equal(true)
            })
        })

        describe('#settingsMenu', () => {

            it('should set robot delay to 4 then done', async () => {
                menu.prompt = MockPrompter([
                    {settingChoice: 'delay'},
                    {delay: '4'},
                    {settingChoice: 'done'}
                ])
                await menu.settingsMenu()
                expect(menu.settings.delay).to.equal(4)
            })

            it('should invalidate robot delay foo', async () => {
                menu.prompt = MockPrompter([
                    {settingChoice: 'delay'},
                    {delay: 'foo'},
                    {settingChoice: 'done'}
                ])
                const err = await getErrorAsync(() => menu.settingsMenu())
                expect(err.message).to.contain('Validation failed for delay')
            })

            it('should go to robotConfgs then done', async () => {
                menu.prompt = MockPrompter([
                    {settingChoice: 'robotConfigs'},
                    {robotChoice: 'done'},
                    {settingChoice: 'done'}
                ])
                await menu.settingsMenu()
            })

            it('should go to robotConfigsMenu for isCustomRobot=true', async () => {
                menu.prompt = MockPrompter([
                    {settingChoice: 'isCustomRobot'},
                    {isCustomRobot: true},
                    {robotChoice: 'done'},
                    {settingChoice: 'done'}
                ])
                await menu.settingsMenu()
            })

            it('should set theme to Default', async () => {
                menu.prompt = MockPrompter([
                    {settingChoice: 'theme'},
                    {theme: 'Default'},
                    {settingChoice: 'done'}
                ])
                await menu.settingsMenu()
            })

            describe('coverage', () => {

                it('isCustomRobot=true robots non-empty', async () => {
                    await menu.ensureSettingsLoaded()
                    menu.settings.robots = Menu.robotDefaults()
                    menu.prompt = MockPrompter([
                        {settingChoice: 'isCustomRobot'},
                        {isCustomRobot: true},
                        {robotChoice: 'done'},
                        {settingChoice: 'done'}
                    ])
                    await menu.settingsMenu()
                })

                it('isCustomRobot=true recordDir empty', async () => {
                    await menu.ensureSettingsLoaded()
                    menu.settings.recordDir = null
                    menu.settings.robots = Menu.robotDefaults()
                    menu.prompt = MockPrompter([
                        {settingChoice: 'isCustomRobot'},
                        {isCustomRobot: true},
                        {robotChoice: 'done'},
                        {settingChoice: 'done'}
                    ])
                    await menu.settingsMenu()
                })

                it('getSettingsChoices.theme.choices', () => {
                    const choices = menu.getSettingsChoices()
                    const question = choices.find(choice => choice.value == 'theme').question
                    const res = question.choices()
                    expect(res).to.contain('Default')
                })
            })
        
        })

        describe('#configureRobotMenu', () => {

            it('should reset RunningRobot moveWeight', async () => {
                await menu.ensureSettingsLoaded()
                menu.settings.robots = Menu.robotDefaults()
                const exp = menu.settings.robots.RunningRobot.moveWeight
                menu.settings.robots.RunningRobot.moveWeight *= 0.5
                menu.prompt = MockPrompter([
                    {robotChoice: 'reset'}
                ])
                await menu.configureRobotMenu('RunningRobot')
                expect(menu.settings.robots.RunningRobot.moveWeight).to.equal(exp)
            })
        })

        describe('#robotConfigsMenu', () => {

            it('should run and done', async () => {
                menu.prompt = MockPrompter([
                    {robotChoice: 'done'}
                ])
                await menu.robotConfigsMenu()
            })

            it('should reset config, select RandomRobot and done', async () => {
                menu.prompt = MockPrompter([
                    {robotChoice: 'reset'},
                    {robotChoice: 'RandomRobot'},
                    {robotChoice: 'done'},
                    {robotChoice: 'done'}
                ])
                await menu.robotConfigsMenu()
            })

            it('should set RandomRobot moveWeight to 1', async () => {
                menu.prompt = MockPrompter([
                    {robotChoice: 'RandomRobot'},
                    {robotChoice: 'moveWeight'},
                    {moveWeight: 1},
                    {robotChoice: 'done'},
                    {robotChoice: 'done'}
                ])
                await menu.robotConfigsMenu()
                expect(menu.settings.robots.RandomRobot.moveWeight).to.equal(1)
            })

            it('should set RandomRobot moveWeight to 1 then reset', async () => {
                const defaults = Robot.ConfidenceRobot.getClassMeta('RandomRobot').defaults
                menu.prompt = MockPrompter([
                    {robotChoice: 'RandomRobot'},
                    {robotChoice: 'moveWeight'},
                    {moveWeight: 1},
                    {robotChoice: 'reset'},
                    {robotChoice: 'done'},
                    {robotChoice: 'done'}
                ])
                await menu.robotConfigsMenu()
                expect(menu.settings.robots.RandomRobot.moveWeight).to.equal(defaults.moveWeight)
            })

            it('should set RandomRobot version to v2', async () => {
                const defaults = Robot.ConfidenceRobot.getClassMeta('RandomRobot').defaults
                menu.prompt = MockPrompter([
                    {robotChoice: 'RandomRobot'},
                    {robotChoice: 'version'},
                    {version: 'v2'},
                    {robotChoice: 'done'},
                    {robotChoice: 'done'}
                ])
                await menu.robotConfigsMenu()
                expect(menu.settings.robots.RandomRobot.version).to.equal('v2')
                // call .choices() for coverage
                const question = menu.getConfigureRobotChoices('RandomRobot', menu.settings.robots.RandomRobot, defaults).find(it => it.value == 'version').question
                const choices = question.choices()
                expect(choices).to.contain('v2')
            })

            it('should set RandomRobot doubleWeight to 1', async () => {
                menu.prompt = MockPrompter([
                    {robotChoice: 'RandomRobot'},
                    {robotChoice: 'doubleWeight'},
                    {doubleWeight: '1'},
                    {robotChoice: 'done'},
                    {robotChoice: 'done'}
                ])
                await menu.robotConfigsMenu()
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

            it('should unset password and throw cause BadCredentialsError for bad confirmKey', async () => {
                menu.logger.loglevel = 0
                const username = 'nobody@nowhere.example'
                const password = 'r2tW5aUn'
                const confirmKey = 'bad-confirm-key'
                menu.credentials.username = username
                menu.credentials.password = menu.encryptPassword(password)
                await server.auth.createUser(username, password)
                menu.prompt = MockPrompter([{key: confirmKey}])
                const err = await getErrorAsync(() => menu.doLogin())
                expect(!!menu.credentials.password).to.equal(false)
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

        describe('#getPasswordConfirmQuestion', () => {

            it('question should invalidate non-matching password', () => {
                const question = menu.getPasswordConfirmQuestion()
                const res = question.validate('asdf', {password:'fdsa'})
                expect(res.toLowerCase()).to.contain('password').and.to.contain('match')
            })
        })

        describe('#joinOnlineMatch', () => {

            it('should get call runMatch with mock method and mock client', async () => {
                var isCalled = false
                menu.newClient = () => { return {connect : noop, joinMatch: noop, close: noop, on: noop}}
                menu.newCoordinator = () => { return {runMatch: () => isCalled = true}}
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

        describe('#newClient', () => {

            it('should return new client', () => {
                const client = menu.newClient('mockUrl', '', '')
                expect(client.constructor.name).to.equal('Client')
            })

            it('should not decrypt when isDecrypt = false', () => {
                const client = menu.newClient({serverUrl: 'mockUrl', password: 'foo'}, false)
                expect(client.password).to.equal('foo')
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
                menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
                await menu.playHumans(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })

            it('should warn match canceled but not throw for mock coodinator', async () => {
                menu.newCoordinator = () => {
                    return {
                        runMatch: () => {
                            const err = new Error('testMessage')
                            err.name = 'MatchCanceledError'
                            throw err
                        }
                    }
                }
                var warnStr = ''
                menu.logger.warn = (...args) => warnStr += args.join(' ')
                await menu.playHumans(menu.settings.matchOpts)
                expect(warnStr).to.contain('testMessage')
            })

            it('should throw on non-match-canceled for mock coodinator', async () => {
                menu.newCoordinator = () => {
                    return {
                        runMatch: () => {
                            throw new Error('testMessage')
                        }
                    }
                }

                const err = await getErrorAsync(() => menu.playHumans(menu.settings.matchOpts))
                expect(err.message).to.equal('testMessage')
            })
        })

        describe('#playRobot', () => {

            it('should call runMatch for mock coordinator', async () => {
                var isCalled = false
                menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
                await menu.playRobot(menu.settings.matchOpts)
                expect(isCalled).to.equal(true)
            })

            it('should cancel match on interrupt', async () => {
                menu.once('beforeMatchStart', (match, players) => {
                    menu.logger.loglevel = 0
                    match.opts.roller = () => [6, 1]
                    Object.values(players).forEach(player => {
                        player.logger.loglevel = 0
                        player.drawBoard = noop
                    })
                    // prevent logging to screen
                    players.White._inquirer = {
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

            it('should call inquirer.prompt with array and set menu._prompt', () => {
                var q
                menu._inquirer = {prompt: questions => q = questions}
                menu.prompt()
                expect(Array.isArray(q)).to.equal(true)
            })
        })

        describe('#promptChangePassword', () => {

            it('should throw when sendChangePassword throws and clear password', async () => {
                const exp = new Error
                menu.sendChangePassword = () => {throw exp}
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

                var menu2

                beforeEach(async () => {
                    await server.listen()
                    const username = 'nobody@nowhere.example'
                    const password = '9YWS8b8F'
                    const user = await server.auth.createUser(username, password, true)
                    menu.credentials = {
                        username
                      , password : menu.encryptPassword(user.passwordEncrypted)
                      , serverUrl : 'http://localhost:' + server.port
                    }
                    menu2 = new Menu
                    menu2.credentials = {...menu.credentials}
                })

                afterEach(async () => {
                    server.close()
                })

                it('should cancel waiting on capture interrupt', async () => {
                    var isCalled = false
                    menu.once('clientWaitStart', () => {
                        isCalled = true
                        setTimeout(() => menu.captureInterrupt())
                    })
                    menu.logger.loglevel = 0
                    await menu.startOnlineMatch({total: 1})
                    expect(isCalled).to.equal(true)
                    expect(!!menu.captureInterrupt).to.equal(false)
                })

                it.skip('should let menu2 join then cancel on interrupt', async () => {
                    var p2
                    menu.once('clientWaitStart', client => {
                        client.on('matchCreated', id => {
                            menu2.once('clientWaitStart', client2 => {
                                client2.on('matchJoined', () => {
                                    setTimeout(() => {
                                        menu.captureInterrupt()
                                        //client2.close()
                                        //menu2.captureInterrupt()
                                    })
                                })
                            })
                            p2 = menu2.joinOnlineMatch(id)
                        })
                    })
                    const p1 = menu.startOnlineMatch({total: 1})
                    try {
                        await p1
                    } catch (err) {
                        console.error(err)
                    }
                    try {
                        await p2
                    } catch (err) {
                        console.error(err)
                    }
                
                })
            })

            it('should get call runMatch with mock method and mock client', async () => {
                var isCalled = false
                menu.newClient = () => { return {connect : noop, createMatch: noop, close: noop, on: noop}}
                menu.newCoordinator = () => { return {runMatch: () => isCalled = true}}
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
})