const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    parseKey,
    randomElement,
    requireSrc,
    MockPrompter,
    noop,
    tmpFile,
    tmpDir,
    States
} = TestUtil

const fs  = require('fs')
const fse = require('fs-extra')
const path = require('path')
const tmp = require('tmp')

const {resolve} = path

const Menu           = requireSrc('term/menu')
const {DrawInstance} = requireSrc('term/draw')
const TermPlayer     = requireSrc('term/player')
const ThemeHelper    = requireSrc('term/themes')

const Constants   = requireSrc('lib/constants')
const Core        = requireSrc('lib/core')
const Coordinator = requireSrc('lib/coordinator')
const Errors      = requireSrc('lib/errors')
const Robot       = requireSrc('robot/player')
const Client      = requireSrc('net/client')
const Server      = requireSrc('net/server')

const {White, Red} = Constants
const {Match, Game, Board, Turn, Dice} = Core

const {RandomRobot} = Robot

const {RequestError} = Errors

function newRando(...args) {
    return Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
}

describe('Draw', () => {

    describe('#drawBoard', () => {

        // these are just for coverage
        var game
        var draw

        beforeEach(() => {
            game = new Game
            draw = DrawInstance.forGame(game)
        })

        it('should not barf for initial board', () => {
            draw.getString()
        })

        it('should not barf for RedHitComeIn3', () => {
            game.board.setStateString(States.RedHitComeIn3)
            draw.getString()
        })

        it('should not barf for WhiteCornerCase24', () => {
            game.board.setStateString(States.WhiteCornerCase24)
            draw.getString()
        })

        it('should not barf for WhiteGammon1', () => {
            game.board.setStateString(States.WhiteGammon1)
            draw.getString()
        })

        it('should not barf for RedGammon1', () => {
            game.board.setStateString(States.RedGammon1)
            draw.getString()
        })

        it('should not barf when game isCrawford', () => {
            game.opts.isCrawford = true
            draw.getString()
        })

        it('should not barf when cubeOwner is red', () => {
            game.cubeOwner = Red
            draw.getString()
        })

        it('should not barf when cubeOwner is white', () => {
            game.cubeOwner = White
            draw.getString()
        })
    })
})

describe('Menu', () => {

    var player
    var menu

    var configDir
    var settingsFile
    var authDir
    var server

    beforeEach(async () => {
        authDir = tmpDir()
        configDir = tmpDir()
        server = new Server({
            authType: 'directory',
            authDir
        })
        server.logger.loglevel = 0
        server.auth.logger.loglevel = 0
        settingsFile = configDir + '/settings.json'
        menu = new Menu(configDir)
        menu.loglevel = 1
    })

    afterEach(async () => {
        await fse.remove(authDir)
        await fse.remove(configDir)
    })

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

    describe('#joinOnlineMatch', () => {

        it('should get call runMatch with mock method and mock client', async () => {
            var isCalled = false
            menu.newClient = () => { return {connect : noop, joinMatch: noop, close: noop}}
            menu.newCoordinator = () => { return {runMatch: () => isCalled = true}}
            await menu.joinOnlineMatch(menu.opts)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#playMenu', () => {

        beforeEach(async () => {
            await server.listen()
            menu.opts.serverUrl = 'http://localhost:' + server.port
        })

        afterEach(async () => {
            server.close()
        })

        it('should invalidate match id abcd with joinOnline, then quit', async () => {
            menu.loglevel = -1
            menu.prompt = MockPrompter([
                {playChoice: 'joinOnline'},
                {matchId: 'abcd'},
                {playChoice: 'quit'}
            ])
            await menu.playMenu()
        })

        it('should warn then done when joinOnline throws BadCredentialsError', async () => {
            menu.opts.username = 'nobody@nowhere.example'
            menu.opts.password = menu.encryptPassword('s9GLdoe9')
            menu.prompt = MockPrompter([
                {playChoice: 'joinOnline'},
                {matchId: '12345678'},
                {playChoice: 'quit'}
            ])
            menu.loglevel = -1
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
            menu.loglevel = -1
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
            expect(menu.opts.total).to.equal(5)
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
            expect(menu.opts.isJacoby).to.equal(true)
        })

        it('should set isCrawford to false', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'isCrawford'},
                {isCrawford: false},
                {matchChoice: 'quit'}
            ])
            await menu.matchMenu()
            expect(menu.opts.isCrawford).to.equal(false)

        })

        it('should quit', async () => {
            menu.prompt = MockPrompter([
                {matchChoice: 'quit'}
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

        it('should go to playLocalMatch with mock method, then quit', async () => {
            var isCalled = false
            menu.prompt = MockPrompter([
                {matchChoice: 'start'},
                {matchChoice: 'quit'}
            ])
            menu.playLocalMatch = () => isCalled = true
            await menu.matchMenu()
            expect(isCalled).to.equal(true)
        })
    })

    describe('#accountMenu', () => {

        beforeEach(async () => {
            await server.listen()
            menu.opts.serverUrl = 'http://localhost:' + server.port
        })

        afterEach(async () => {
            server.close()
        })

        it('should sign up, log in and confirm user', async () => {
            const username = 'nobody@nowhere.example'
            const password = '9Axf5kAR'
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
            const password = '37GbrWAZ'
            await server.auth.createUser(username, oldPassword, true)
            menu.opts.username = username
            menu.prompt = MockPrompter([
                {accountChoice: 'changePassword'},
                {oldPassword, password, passwordConfirm: password},
                {accountChoice: 'done'}
            ])
            await menu.accountMenu()
            await server.auth.authenticate(username, password)
        })

        it('should clear credentials', async () => {
            menu.opts.username = 'nobody@nowhere.example'
            menu.opts.password = menu.encryptPassword('qN3zUpVh')
            menu.prompt = MockPrompter([
                {accountChoice: 'clearCredentials'},
                {accountChoice: 'done'}
            ])
            await menu.accountMenu()
            expect(!!menu.opts.username).to.equal(false)
            expect(!!menu.opts.password).to.equal(false)
        })

        it('should change username', async () => {
            const username = 'nobody@nowhere.example'
            menu.prompt = MockPrompter([
                {accountChoice: 'username'},
                {username},
                {accountChoice: 'done'}
            ])
            await menu.accountMenu()
            expect(menu.opts.username).to.equal(username)
        })

        it('should change and encrypt password', async () => {
            const password = '6yahTQ8H'
            menu.prompt = MockPrompter([
                {accountChoice: 'password'},
                {password},
                {accountChoice: 'done'}
            ])
            await menu.accountMenu()
            expect(menu.decryptPassword(menu.opts.password)).to.equal(password)
        })

        it('should change serverUrl', async () => {
            const serverUrl = 'http://nowhere.example'
            menu.prompt = MockPrompter([
                {accountChoice: 'serverUrl'},
                {serverUrl},
                {accountChoice: 'done'}
            ])
            await menu.accountMenu()
            expect(menu.opts.serverUrl).to.equal(serverUrl)
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
            menu.error = e => err = e
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
            menu.error = e => err = e
            menu.opts.username = 'nobody2@nowhere.example'
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
            menu.error = e => err = e
            const username = 'nobody@nowhere.example'
            const oldPassword = 'C7pUaA3c'
            const badPassword = 'etzF4Y8L'
            const password = 'fVvqK99g'
            await server.auth.createUser(username, oldPassword, true)
            menu.opts.username = username
            menu.opts.password = menu.encryptPassword(oldPassword)
            menu.prompt = MockPrompter([
                {accountChoice: 'changePassword'},
                {oldPassword: badPassword, password, passwordConfirm: password},
                {accountChoice: 'done'}
            ])
            await menu.accountMenu()
            expect(!!menu.opts.password).to.equal(false)
            expect(!!err).to.equal(true)
        })
    })

    describe('#settingsMenu', () => {

        it('should set serverUrl then done', async () => {
            menu.prompt = MockPrompter([
                {settingChoice: 'serverUrl'},
                {serverUrl: 'ws://localhost:8811'},
                {settingChoice: 'done'}
            ])
            await menu.settingsMenu()
            expect(menu.opts.serverUrl).to.equal('ws://localhost:8811')
        })

        it('should set robot delay to 4 then done', async () => {
            menu.prompt = MockPrompter([
                {settingChoice: 'delay'},
                {delay: '4'},
                {settingChoice: 'done'}
            ])
            await menu.settingsMenu()
            expect(menu.opts.delay).to.equal(4)
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
            expect(menu.opts.robots.RandomRobot.moveWeight).to.equal(1)
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
            expect(menu.opts.robots.RandomRobot.moveWeight).to.equal(defaults.moveWeight)
        })

        it('should set RandomRobot version to v2', async () => {
            menu.prompt = MockPrompter([
                {robotChoice: 'RandomRobot'},
                {robotChoice: 'version'},
                {version: 'v2'},
                {robotChoice: 'done'},
                {robotChoice: 'done'}
            ])
            await menu.robotConfigsMenu()
            expect(menu.opts.robots.RandomRobot.version).to.equal('v2')
            // call .choices() for coverage
            const question = menu.getConfigureRobotChoices('RandomRobot', menu.opts.robots.RandomRobot).find(it => it.value == 'version').question
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
            expect(menu.opts.robots.RandomRobot.doubleWeight).to.equal(1)
        })
    })

    ///////////////////

    describe('#doLogin', () => {

        beforeEach(async () => {
            await server.listen()
            menu.opts.serverUrl = 'http://localhost:' + server.port
        })

        afterEach(async () => {
            server.close()
        })

        it('should unset password and throw cause BadCredentialsError for bad confirmKey', async () => {
            menu.loglevel = 0
            const username = 'nobody@nowhere.example'
            const password = 'r2tW5aUn'
            const confirmKey = 'bad-confirm-key'
            menu.opts.username = username
            menu.opts.password = menu.encryptPassword(password)
            await server.auth.createUser(username, password)
            menu.prompt = MockPrompter([{key: confirmKey}])
            const err = await getErrorAsync(() => menu.doLogin())
            expect(!!menu.opts.password).to.equal(false)
            expect(err.cause.name).to.equal('BadCredentialsError')
        })
    })

    describe('#encryptPassword', () => {

        it('should return empty string for undefined', () => {
            const res = menu.encryptPassword(undefined)
            expect(res).to.equal('')
        })
    })

    describe('#getDefaultOpts', () => {


        it('should merge optsFile if specified', () => {
            fse.writeJsonSync(settingsFile, {total: 5})
            const result = menu.getDefaultOpts()
            expect(result.total).to.equal(5)
        })

        it('should normalize opts file if not exists', () => {
            
            fse.removeSync(settingsFile)
            menu.getDefaultOpts()
            const content = fs.readFileSync(settingsFile, 'utf-8')
            JSON.parse(content)
        })

        it('should replace obsolete server url', () => {
            fse.writeJsonSync(settingsFile, {serverUrl: 'ws://bg.dougowings.net:8080'})
            const exp = menu.getDefaultServerUrl()
            const result = menu.getDefaultOpts()
            expect(result.serverUrl).to.equal(exp)
        })
    })

    describe('#getPasswordConfirmQuestion', () => {

        it('question should invalidate non-matching password', () => {
            const question = menu.getPasswordConfirmQuestion()
            const res = question.validate('asdf', {password:'fdsa'})
            expect(res.toLowerCase()).to.contain('password').and.to.contain('match')
        })
    })

    describe('#newClient', () => {

        it('should return new client', () => {
            const client = menu.newClient('mockUrl', '', '')
            expect(client.constructor.name).to.equal('Client')
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
            menu.opts.isCustomRobot = true
            menu.newRobot()
        })
    })

    describe('#playLocalMatch', () => {

        it('should call runMatch for mock coordinator', async () => {
            var isCalled = false
            menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
            await menu.playLocalMatch(menu.opts)
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
            menu.warn = (...args) => warnStr += args.join(' ')
            await menu.playLocalMatch(menu.opts)
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

            const err = await getErrorAsync(() => menu.playLocalMatch(menu.opts))
            expect(err.message).to.equal('testMessage')
        })
    })

    describe('#playRobot', () => {

        it('should call runMatch for mock coordinator', async () => {
            var isCalled = false
            menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
            await menu.playRobot(menu.opts)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#playRobots', () => {

        it('should call runMatch for mock coordinator', async () => {
            var isCalled = false
            menu.newCoordinator = () => {return {runMatch: () => isCalled = true}}
            await menu.playRobots(menu.opts)
            expect(isCalled).to.equal(true)
        })
    })

    describe('#prompt', () => {

        // coverage tricks

        const inquirer = require('inquirer')

        var oldPrompt

        before(() => {
            oldPrompt = inquirer.prompt
        })

        afterEach(() => {
            inquirer.prompt = oldPrompt
        })

        it('should call inquirer.prompt with array and set menu._prompt', () => {
            var q
            inquirer.prompt = questions => q = questions
            menu.prompt()
            expect(Array.isArray(q)).to.equal(true)
        })
    })

    describe('#runOnlineMatch', () => {

        beforeEach(async () => {
            await server.listen()
            menu.opts.serverUrl = 'http://localhost:' + server.port
        })

        afterEach(async () => {
            server.close()
        })

        it('should ')
    })

    describe('#saveOpts', () => {

        it('should write default opts', async () => {
            const opts = menu.getDefaultOpts()
            await menu.saveOpts()
            const result = JSON.parse(fs.readFileSync(settingsFile))
            expect(JSON.stringify(result)).to.equal(JSON.stringify(opts))
        })
    })

    describe('#startOnlineMatch', () => {

        it('should get call runMatch with mock method and mock client', async () => {
            var isCalled = false
            menu.newClient = () => { return {connect : noop, createMatch: noop, close: noop}}
            menu.newCoordinator = () => { return {runMatch: () => isCalled = true}}
            await menu.startOnlineMatch(menu.opts)
            expect(isCalled).to.equal(true)
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

describe('Coordinator', () => {

    var coord
    var r1
    var r2

    beforeEach(() => {
        coord = new Coordinator
        r1 = newRando(White)
        r2 = newRando(Red)
        t1 = new TermPlayer(White)
        t2 = new TermPlayer(Red)
        t1.logger.loglevel = 1
        t2.logger.loglevel = 1
        t1.logger.stdout = {write: noop}
        t2.logger.stdout = t1.logger.stdout
    })

    describe('#runMatch', () => {
        it('should play 3 point match with mock runGame', async () => {
            const match = new Match(3)
            coord.runGame = (players, game) => {
                game.board.setStateString(States.EitherOneMoveWin)
                makeRandomMoves(game.firstTurn(), true)
            }
            await coord.runMatch(match, r1, r2)
            expect(match.hasWinner()).to.equal(true)
        })
    })

    describe('#runGame', () => {

        var game

        var rolls
        var roller

        beforeEach(() => {
            rolls = []
            roller = () => rolls.shift() || Dice.rollTwo()
            game = new Game({roller})
        })

        it('should play RedWinWith66 for white first move 6,1 then red 6,6', async () => {
            game.board.setStateString(States.RedWinWith66)
            rolls = [[6, 1]]
            t1.rollTurn = turn => turn.setRoll([6, 6])
            t2.rollTurn = turn => turn.setRoll([6, 6])
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '13'},
                {face: '6'},
                {origin: '8'},
                {finish: 'f'}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'r'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {finish: 'f'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
        })

        it('should end with white refusing double on second turn', async () => {
            rolls = [[6, 1]]
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '13'},
                {origin: '8'},
                {finish: 'f'},
                {accept: 'n'}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
        })

        it('should play RedWinWith66 for white first move 6,1 then red double, white accept, red rolls 6,6 backgammon', async () => {
            game.board.setStateString(States.RedWinWith66)
            rolls = [[6, 1]]
            t1.rollTurn = turn => turn.setRoll([6, 6])
            t2.rollTurn = turn => turn.setRoll([6, 6])
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '13'},
                {face: '6'},
                {origin: '8'},
                {finish: 'f'},
                {accept: 'y'}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {finish: 'f'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
            expect(game.cubeValue).to.equal(2)
            expect(game.finalValue).to.equal(8)
        })

        it('should play RedWinWith66, white 6,1, red double, white accept, red 6,5, white 1,2, red cant double 6,6, backgammon', async () => {
            game.board.setStateString(States.RedWinWith66)
            rolls = [
                [6, 1],
                [6, 5],
                [1, 2],
                [6, 6]
            ]
            t1.prompt = MockPrompter([
                // white's first turn
                {origin: '13'},
                {face: '6'},
                {origin: '8'},
                {finish: 'f'},
                // accept
                {accept: 'y'},
                // white's turn
                {action: 'r'},
                {origin: '24'},
                {face: '2'},
                {origin: '24'},
                {finish: 'f'}
            ])
            t2.prompt = MockPrompter([
                // red's turn
                {action: 'd'},
                {origin: '6'},
                {finish: 'f'},
                // red's turn
                {origin: '6'},
                {origin: '6'},
                {origin: '6'},
                {finish: 'f'}
            ])
            await coord.runGame({White: t1, Red: t2}, game)
            expect(game.winner).to.equal(Red)
            expect(game.cubeValue).to.equal(2)
            expect(game.finalValue).to.equal(8)
        })
    })
})

describe('Reporter', () => {

    var player

    beforeEach(() => {
        player = new TermPlayer(White)
        player.logger.loglevel = 1
        player.logger.stdout = {write: () => {}}
    })

    describe('#move', () => {
        it('should include \'bar\' if origin is -1', () => {
            const board = Board.fromStateString(States.WhiteCornerCase24)
            const move = board.buildMove(White, -1, 4)
            const draw = DrawInstance.forBoard(board)
            const {reporter} = draw
            const result = reporter.move(move).toString()
            expect(result).to.contain('bar')
        })

        it('should include \'home\' for red if origin is 0 and face is 2', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const move = board.buildMove(Red, 0, 2)
            const draw = DrawInstance.forBoard(board)
            const {reporter} = draw
            const result = reporter.move(move).toString()
            expect(result).to.contain('home')
        })

        it('should include HIT for hit move', () => {
            const board = Board.fromStateString(States.EitherHitWith11)
            const move = board.buildMove(White, 22, 1)
            const draw = DrawInstance.forBoard(board)
            const {reporter} = draw
            const result = reporter.move(move).toString()
            expect(result).to.contain('HIT')
        })
    })
})

describe('TermPlayer', () => {

    var player

    beforeEach(() => {
        player = new TermPlayer(White)
        player.logger.loglevel = 1
        player.logger.stdout = {write: () => {}}
    })

    describe('#playRoll', () => {

        var game
        var rolls
        var roller

        beforeEach(() => {
            rolls = []
            roller = () => rolls.shift() || Dice.rollTwo()
            game = new Game({roller})
            player.thisGame = game
        })

        it('should return without prompting if turn.isCantMove', async () => {
            const turn = game.firstTurn()
            // force properties
            turn.isCantMove = true
            turn.allowedMoveCount = 0
            await player.playRoll(turn, game)
        })

        it('should play first roll White 6,1 then break with board as expected for 6 point', async () => {
            rolls = [[6, 1]]
            player.prompt = MockPrompter([
                {origin: '13'},
                {origin: '8'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })

        it('should play first roll White 6,1 undo first then second with board as expected for 6 point', async () => {
            rolls = [[6, 1]]
            player.prompt = MockPrompter([
                {origin: '13'},
                {origin: 'u'},
                {origin: '13'},
                {origin: '8'},
                {finish: 'u'},
                {origin: '8'},
                {finish: 'f'}
            ])
            const turn = game.firstTurn()
            await player.playRoll(turn, game)
            turn.finish()
            expect(turn.isFinished).to.equal(true)
            expect(game.board.stateString()).to.equal(States.WhiteTakes61)
        })

        it('should not prompt with fastForced on force move', async () => {
            rolls = [[1, 2]]
            makeRandomMoves(game.firstTurn(), true)
            game.board.setStateString(States.EitherOneMoveWin)
            player.prompt = () => {throw new Error}
            player.opts.fastForced = true
            const turn = game.nextTurn()
            turn.roll()
            await player.playRoll(turn, game)
            turn.finish()
            expect(game.checkFinished()).to.equal(true)
            expect(game.getWinner()).to.equal(White)
        })
    })

    describe('#prompt', () => {

        // coverage tricks

        const inquirer = require('inquirer')

        var oldPrompt

        before(() => {
            oldPrompt = inquirer.prompt
        })

        afterEach(() => {
            inquirer.prompt = oldPrompt
        })

        it('should call inquirer.prompt with array and set player._prompt', () => {
            var q
            inquirer.prompt = questions => q = questions
            player.prompt()
            expect(Array.isArray(q)).to.equal(true)
        })
    })

    describe('#promptDecideDouble', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return true for y', async () => {
            player.prompt = MockPrompter({accept: 'y'})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(true)
        })

        it('should return false for n', async () => {
            player.prompt = MockPrompter({accept: 'n'})
            const result = await player.promptDecideDouble(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptTurnOption', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return false for r', async () => {
            player.prompt = MockPrompter({action: 'r'})
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })

        it('should return true for d', async () => {
            player.prompt = MockPrompter({action: 'd'})
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(true)
        })

        it('should invalidate foo', async () => {
            player.prompt = MockPrompter({action: 'foo'})
            const err = await getErrorAsync(() => player.promptTurnOption(turn))
            expect(err.message).to.contain('Validation failed for action')
        })

        it('should throw MatchCanceledError for action=q, confirm=true', async () => {
            player.prompt = MockPrompter([
                {action: 'q'},
                {confirm : true}
            ])
            const err = await getErrorAsync(() => player.promptTurnOption(turn))
            expect(err.name).to.equal('MatchCanceledError')
        })

        it('should return false for q, confirm=false, r', async () => {
            player.prompt = MockPrompter([
                {action: 'q'},
                {confirm: false},
                {action: 'r'}
            ])
            const result = await player.promptTurnOption(turn)
            expect(result).to.equal(false)
        })
    })

    describe('#promptFace', () => {

        var turn

        beforeEach(() => {
            const game = new Game
            makeRandomMoves(game.firstTurn(), true)
            turn = game.nextTurn()
        })

        it('should return 3 for [3, 3, 3, 3] and not prompt', async () => {
            const result = await player.promptFace(turn, [3, 3, 3, 3])
            expect(result).to.equal(3)
        })

        it('should return 5 for 5 with [5, 6]', async () => {
            player.prompt = MockPrompter({face: '5'})
            const result = await player.promptFace(turn, [5, 6])
            expect(result).to.equal(5)
        })

        it('should fail validation for 3 with [1, 2]', async () => {
            player.prompt = MockPrompter({face: '3'})
            const err = await getErrorAsync(() => player.promptFace(turn, [1, 2]))
            expect(err.message).to.contain('Validation failed for face')
        })
    })

    describe('#promptFinish', () => {

        it('should return true for f', async () => {
            player.prompt = MockPrompter({finish: 'f'})
            const result = await player.promptFinish()
            expect(result).to.equal(true)
        })

        it('should return false for u', async () => {
            player.prompt = MockPrompter({finish: 'u'})
            const result = await player.promptFinish()
            expect(result).to.equal(false)
        })

        it('should invalidate for foo', async () => {
            player.prompt = MockPrompter({finish: 'foo'})
            const err = await getErrorAsync(() => player.promptFinish())
            expect(err.message).to.contain('Validation failed for finish')
        })
    })

    describe('#promptOrigin', () => {

        var turn

        beforeEach(() => {
            turn = new Turn(new Board, White)
        })

        it('should return -1 for b with [-1]', async () => {
            player.prompt = MockPrompter({origin: 'b'})
            const result = await player.promptOrigin(turn, [-1])
            expect(result).to.equal(-1)
        })

        it('should return 0 for 24 with [0, 4]', async () => {
            player.prompt = MockPrompter({origin: '24'})
            const result = await player.promptOrigin(turn, [0, 4])
            expect(result).to.equal(0)
        })

        it('should return undo for u with [11, 12] canUndo=true', async () => {
            player.prompt = MockPrompter({origin: 'u'})
            const result = await player.promptOrigin(turn, [11, 12], true)
            expect(result).to.equal('undo')
        })

        it('should fail validation for 3 with [3, 4]', async () => {
            player.prompt = MockPrompter({origin: '3'})
            const err = await getErrorAsync(() => player.promptOrigin(turn, [3, 4]))
            expect(err.message).to.contain('Validation failed for origin')
        })

        it('should throw MatchCanceledError for origin=q, confirm=true', async () => {
            player.prompt = MockPrompter([
                {origin: 'q'},
                {confirm : true}
            ])
            const err = await getErrorAsync(() => player.promptOrigin(turn, [1, 2]))
            expect(err.name).to.equal('MatchCanceledError')
        })

        it('should return -1 for q, confirm=false, b with [-1]', async () => {
            player.prompt = MockPrompter([
                {origin: 'q'},
                {confirm: false},
                {origin: 'b'}
            ])
            const result = await player.promptOrigin(turn, [-1])
            expect(result).to.equal(-1)
        })
    })

    describe('#rollTurn', () => {

        // coverage

        it('should roll', async () => {
            const turn = new Turn(Board.setup(), White)
            await player.rollTurn(turn)
            expect(turn.isRolled).to.equal(true)
        })
    })

    describe('events', () => {

        // coverage

        var game
        var players
        var rolls
        var roller

        beforeEach(() => {
            rolls = [[6, 1]]
            roller = () => rolls.shift() || Dice.rollTwo()
            game = new Game({roller})
            players = {
                White : player,
                Red   : newRando(Red)
            }
            makeRandomMoves(game.firstTurn(), true)
        })

        describe('afterRoll', () => {

            it('should pass for red turn with isDualTerm=false', () => {
                player.emit('gameStart', game, null, players)
                const turn = game.nextTurn()
                turn.roll()
                player.emit('afterRoll', turn)
            })

            it('should log waiting for opponent turn if opponent isNet', () => {
                var logStr = ''
                player.emit('gameStart', game, null, players)
                const turn = game.nextTurn()
                turn.roll()
                player.logger.info = (...args) => logStr += args.join(' ')
                // hack opponent property
                player.opponent.isNet = true
                player.emit('afterRoll', turn)
                expect(logStr.toLowerCase()).to.contain('waiting')
            })
        })

        describe('beforeOption', () => {

            it('should log waiting for opponent turn if opponent isNet', () => {
                var logStr = ''
                player.emit('gameStart', game, null, players)
                const turn = game.nextTurn()
                player.logger.info = (...args) => logStr += args.join(' ')
                // hack opponent property
                player.opponent.isNet = true
                player.emit('beforeOption', turn)
                expect(logStr.toLowerCase()).to.contain('waiting')
            })
        })

        describe('doubleOffered', () => {

            it('should log waiting for self turn if opponent isNet', () => {
                var logStr = ''
                player.emit('gameStart', game, null, players)
                makeRandomMoves(game.nextTurn().roll(), true)
                const turn = game.nextTurn()
                turn.setDoubleOffered()
                player.logger.info = (...args) => logStr += args.join(' ')
                // hack opponent property
                player.opponent.isNet = true
                player.emit('doubleOffered', turn, game)
                expect(logStr.toLowerCase()).to.contain('waiting')
            })
        })

        describe('turnEnd', () => {

            it('should pass for red cant move', () => {
                player.emit('gameStart', game, null, players)
                // place red on bar
                game.board.bars.Red.push(game.board.slots[5].pop())
                const turn = game.nextTurn()
                turn.setRoll([6, 6])
                turn.finish()
                player.emit('turnEnd', turn)
            })
        })
    })
})

describe('Robot', () => {

    it('should play robot v robot double after 3 turns', async function () {
        this.timeout(1000)
        const white = new TermPlayer.Robot(newRando(White), {delay: 0})
        const red = new TermPlayer.Robot(newRando(Red), {delay: 0})
        white.logger.loglevel = 1
        red.logger.loglevel = 1
        white.logger.stdout = {write: () => {}}
        red.logger.stdout = {write: () => {}}
        white.robot.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        red.robot.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        white.robot.decideDouble = turn => turn.setDoubleDeclined()
        red.robot.decideDouble = turn => turn.setDoubleDeclined()
        const match = new Match(1, {isCrawford: false})
        const coordinator = new Coordinator
        await coordinator.runMatch(match, white, red)
        expect(match.checkFinished()).to.equal(true)
    })

    describe('#delay', () => {

        it('should delay for delay=0.01', async () => {
            const player = new TermPlayer.Robot(newRando(White), {delay: 0.01})
            await player.delay()
        })
    })

    describe('#meta', () => {

        it('should have isRobot=true', async () => {
            const player = new TermPlayer.Robot(newRando(White), {delay: 0.01})
            const result = player.meta()
            expect(result.isRobot).to.equal(true)
        })
    })
})