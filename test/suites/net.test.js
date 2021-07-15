/**
 * gameon - test suite - net classes
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
const Test = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    parseKey,
    parseCookies,
    randomElement,
    requireSrc,
    States
} = Test

const Auth        = requireSrc('net/auth')
const Client      = requireSrc('net/client')
const Constants   = requireSrc('lib/constants')
const Coordinator = requireSrc('lib/coordinator')
const Core        = requireSrc('lib/core')
const NetPlayer   = requireSrc('net/player')
const Robot       = requireSrc('robot/player')
const Server      = requireSrc('net/server')
const Util        = requireSrc('lib/util')

const {White, Red}  = Constants
const {Match, Dice} = Core

const AWS   = require('aws-sdk')
const fetch = require('node-fetch')
const fs    = require('fs')
const fse   = require('fs-extra')
const tmp   = require('tmp')

const {destroyAll} = Util

function newRando(...args) {
    return Robot.ConfidenceRobot.getDefaultInstance('RandomRobot', ...args)
}

describe('NetPlayer', () => {

    var server

    var client1
    var client2

    var client // alias for client1

    beforeEach(async () => {

        server = new Server
        server.loglevel = 1

        await server.listen()

        const serverUrl = 'http://localhost:' + server.port

        client1 = new Client(serverUrl)
        client2 = new Client(serverUrl)

        client1.loglevel = 1
        client2.loglevel = 1

        client = client1
    })

    afterEach(async () => {
        await client1.close()
        await client2.close()
        server.close()
    })

    async function eastAndWest(opts) {

        opts = {total: 1, ...opts}

        await client1.connect()
        await client2.connect()

        const playersWest = {
            White : newRando(White)
          , Red   : new NetPlayer(client1, Red)
        }
        const playersEast = {
            White : new NetPlayer(client2, White)
          , Red   : newRando(Red)
        }

        const coordWest = new Coordinator
        const coordEast = new Coordinator

        let promise
        client1.on('matchCreated', id => {
            promise = client2.joinMatch(id)
        })
        const matchWest = await client1.createMatch(opts)
        const matchEast = await promise

        return {
            east : {players: playersEast, coord: coordEast, match: matchEast},
            west : {players: playersWest, coord: coordWest, match: matchWest}
        }
    }

    it('should play robot v robot over net', async function () {

        this.timeout(20000)

        const {east, west} = await eastAndWest({total: 1})

        try {
            await Promise.all([
                east.coord.runMatch(east.match, east.players.White, east.players.Red),
                west.coord.runMatch(west.match, west.players.White, west.players.Red)
            ])
        } finally {
            await destroyAll(east.players)
            await destroyAll(west.players)
        }
    })

    it('should play robot v robot over net with double accept, decline', async function() {
        this.timeout(2000)
        //server.loglevel = 4

        const {east, west} = await eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.turnOption = turn => turn.setDoubleOffered()
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        const p1 = east.coord.runMatch(east.match, east.players.White, east.players.Red)
        const p2 = west.coord.runMatch(west.match, west.players.White, west.players.Red)

        try {
            await p1
            await p2
        } finally {
            await destroyAll(east.players)
            await destroyAll(west.players)
        }
    })

    it('should play robot v robot over net with double after 3 moves accept, decline', async function() {
        this.timeout(2000)
        //server.loglevel = 4

        const {east, west} = await eastAndWest({total: 2, isCrawford: false})

        west.players.White.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        east.players.Red.turnOption = (turn, game) => {
            if (game.getTurnCount() > 3) {
                turn.setDoubleOffered()
            }
        }
        east.players.Red.decideDouble = turn => turn.setDoubleDeclined()

        const p1 = east.coord.runMatch(east.match, east.players.White, east.players.Red)
        const p2 = west.coord.runMatch(west.match, west.players.White, west.players.Red)

        try {
            await p1
            await p2
        } finally {
            await destroyAll(east.players)
            await destroyAll(west.players)
        }
    })
})

describe('Auth', () => {


    describe('#defaults', () => {

        it('should set passwordHelp to non default when regex defined', () => {
            const d1 = Auth.defaults({})
            const d2 = Auth.defaults({AUTH_PASSWORD_REGEX: '.*'})
            expect(d2.passwordHelp).to.not.equal(d1.passwordHelp)
        })
    })

    describe('#validateUsername', () => {

        it('should throw ValidateError for empty', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = ''
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for bar char ?', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = 'foo?@example.example'
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for bad email chunky', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = 'chunky'
            const err = getError(() => auth.validateUsername(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should pass for nobody@nowhere.example', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = 'nobody@nowhere.example'
            auth.validateUsername(input)
        })
    })

    describe('#validatePassword', () => {

        it('should throw ValidateError for empty', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = ''
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for length 7', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = '5ZycJj3'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for missing number', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = 'aDlvkdoslK'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        it('should throw ValidateError for start with encrypted_', () => {
            const auth = Auth.create({authType: 'anonymous'})
            const input = 'encrypted_aDlvkdoslK'
            const err = getError(() => auth.validatePassword(input))
            expect(err.name).to.equal('ValidateError')
        })

        const passCases = [
            'dbHg5eva'
          , 'dY@a45-S'
          , '=Bwx4r%aWB_T'
          , 'a1d//////G'
        ]

        passCases.forEach(input => {
            it('should pass for ' + input, () => {
                const auth = Auth.create({authType: 'anonymous'})
                auth.validatePassword(input)
            })
        })
    })

    describe('Anonymous', () => {

        it('should accept blank username/password', async () => {
            const auth = Auth.create({authType: 'anonymous'})
            await auth.authenticate()
        })

        const nimps = [
            'createUser'
          , 'readUser'
          , 'updateUser'
          , 'deleteUser'
          , 'userExists'
          , 'listAllUsers'
        ]

        nimps.forEach(method => {
            it('should throw NotImplementedError for ' + method, async () => {
                const auth = Auth.create({authType: 'anonymous'})
                const err = await getErrorAsync(() => auth.impl[method]())
                expect(err.name).to.equal('NotImplementedError')
            })
        })

        describe('#authenticate', () => {
            it('should return passwordEncrypted when password non-empty', async () => {
                const auth = Auth.create({authType: 'anonymous'})
                const user = await auth.authenticate(null, 'a')
                expect(user.passwordEncrypted).to.have.length.greaterThan(0)
            })
        })
    })

    describe('Directory', () => {

        var authDir

        beforeEach(() => {
            authDir = tmp.dirSync().name
        })

        afterEach(async () => {
            await fse.remove(authDir)
        })

        it('should fail with no directory specified', () => {
            const err = getError(() => { Auth.create({authType: 'directory'}) })
            expect(err instanceof Error).to.equal(true)
        })

        it('should fail with non-existent directory', () => {
            const opts = {authDir: '/non-existent'}
            const err = getError(() => { Auth.create({authType: 'directory', ...opts}) })
            expect(err instanceof Error).to.equal(true)
        })

        it('should pass with diretory specified', () => {
            const opts = {authDir}
            const auth = Auth.create({authType: 'directory', ...opts})
        })

        function newAuth() {
            const opts = {authDir}
            const auth = Auth.create({authType: 'directory', ...opts})
            auth.logger.loglevel = 0
            auth.email.logger.loglevel = 0
            return auth
        }

        describe('#createUser', () => {

            it('should return user data with username', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Daz5zGAZa'
                const user = await auth.createUser(username, password, true)
                expect(user.username).to.equal(username)
            })

            it('should throw UserExistsError for duplicate user case insensitive', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Daz5zGAZa'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.createUser(username.toUpperCase(), password, true))
                expect(err.name).to.equal('UserExistsError')
            })
        })

        describe('#readUser', () => {

            it('should return user data with username', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'vALkke5N'
                await auth.createUser(username, password, true)
                const user = await auth.readUser(username)
                expect(user.username).to.equal(username)
            })

            it('should throw UserNotFoundError', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const err = await getErrorAsync(() => auth.readUser(username))
                expect(err.name).to.equal('UserNotFoundError')
            })

            it('should throw InternalError cause by SyntaxError when malformed json', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'mUad3h8b'
                await auth.createUser(username, password, true)
                // hack file
                fs.writeFileSync(auth.impl._userFile(username), '{]')
                const err = await getErrorAsync(() => auth.readUser(username))
                expect(err.name).to.equal('InternalError')
                expect(err.cause.name).to.equal('SyntaxError')
            })
        })

        describe('#deleteUser', () => {

            it('should throw UserNotFoundError', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const err = await getErrorAsync(() => auth.deleteUser(username))
                expect(err.name).to.equal('UserNotFoundError')
            })

            it('should delete user, and then user should not exist', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'PPt7HKvP'
                await auth.createUser(username, password, true)
                await auth.deleteUser(username)
                const result = await auth.userExists(username)
                expect(result).to.equal(false)
            })
        })

        describe('#listAllUsers', () => {

            it('should return empty list', async () => {
                const auth = newAuth()
                const result = await auth.listAllUsers()
                expect(result).to.have.length(0)
            })

            it('should return singleton of created user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Sa32q9QT'
                await auth.createUser(username, password, true)
                const result = await auth.listAllUsers()
                expect(result).to.have.length(1)
                expect(result).to.contain(username)
            })

            it('should throw InternalError caused by ENOENT when directory gets nuked', async () => {
                const auth = newAuth()
                await fse.remove(auth.impl.opts.authDir)
                const err = await getErrorAsync(() => auth.listAllUsers())
                expect(err.name).to.equal('InternalError')
                expect(err.cause.code).to.equal('ENOENT')
            })

            it('should return empty after user deleted', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'rGnPNs54'
                await auth.createUser(username, password, true)
                await auth.deleteUser(username)
                const result = await auth.listAllUsers()
                expect(result).to.have.length(0)
            })
        })

        describe('#authenticate', () => {

            it('should pass for created user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'AgJ7jfr9'
                await auth.createUser(username, password, true)
                await auth.authenticate(username, password)
            })

            it('should throw BadCredentialsError for bad password', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Sfekx6Yx'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.authenticate(username, password + 'x'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for non-existent user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Nm4PcTHe'
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw InternalError when impl throws', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'g3AkYhC6'
                const e = new Error
                auth.impl.readUser = () => { throw e }
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.isInternalError).to.equal(true)
                expect(err.cause).to.equal(e)
            })

            it('should throw UserLockedError for user locked', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'vu3a8EZm'
                await auth.createUser(username, password, true)
                await auth.lockUser(username)
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.name).to.equal('UserLockedError')
            })

            it('should pass for user locked then unlocked', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'vu3a8EZm'
                await auth.createUser(username, password, true)
                await auth.lockUser(username)
                await auth.unlockUser(username)
                await auth.authenticate(username, password)
            })

            it('should accept encrypted password', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 't6jn5Xwa'
                const user = await auth.createUser(username, password, true)
                await auth.authenticate(username, user.passwordEncrypted)
            })

            it('should throw UserNotConfirmedError for unconfirmed user', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'c9dxCZRL'
                await auth.createUser(username, password)
                const err = await getErrorAsync(() => auth.authenticate(username, password))
                expect(err.name).to.equal('UserNotConfirmedError')
            })
        })

        describe('#sendConfirmEmail', () => {

            it('should set lastEmail in mock email', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'mAGP6hsZ'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                expect(auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should throw UserConfirmedError if user confirmed', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'QEAY8baN'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.sendConfirmEmail(username))
                expect(err.name).to.equal('UserConfirmedError')
            })
        })

        describe('#sendResetEmail', () => {

            it('should set lastEmail in mock email', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'Q6rzSPnk'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                expect(auth.email.impl.lastEmail.Destination.ToAddresses).to.have.length(1).and.to.contain(username)
            })

            it('should throw UserNotConfirmedError if user not confirmed', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'rwF84M82'
                await auth.createUser(username, password)
                const err = await getErrorAsync(() => auth.sendResetEmail(username))
                expect(err.name).to.equal('UserNotConfirmedError')
            })
        })

        describe('#confirmUser', () => {

            it('should confirm user with key sent in email', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'j7VHVRUd'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                // parse key from email
                const confirmKey = parseKey(auth.email.impl.lastEmail)
                await auth.confirmUser(username, confirmKey)
                const user = await auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should throw BadCredentialsError for bad key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'JkrsX89y'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                const err = await getErrorAsync(() => auth.confirmUser(username, 'badkey'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for expired key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'HGLV5gHT'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                const confirmKey = parseKey(auth.email.impl.lastEmail)
                // hack expiry setting
                auth.opts.confirmExpiry = -1
                const err = await getErrorAsync(() => auth.confirmUser(username, confirmKey))
                expect(err.name).to.equal('BadCredentialsError')
                expect(err.message.toLowerCase()).to.contain('expire')
            })
        })

        describe('#resetPassword', () => {

            it('should reset password and authenticate', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'TGVN4pxL'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const resetKey = parseKey(auth.email.impl.lastEmail)
                const newPassword = 'k8hWfxC8'
                await auth.resetPassword(username, newPassword, resetKey)
                await auth.authenticate(username, newPassword)
            })

            it('should throw BadCredentialsError for bad key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'JkrsX89y'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const newPassword = 'H69Xwqwu'
                const err = await getErrorAsync(() => auth.resetPassword(username, newPassword, 'badkey'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for expired key', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'HGLV5gHT'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const newPassword = '2vy2WM5c'
                const confirmKey = parseKey(auth.email.impl.lastEmail)
                // hack expiry setting
                auth.opts.resetExpiry = -1
                const err = await getErrorAsync(() => auth.resetPassword(username, newPassword, confirmKey))
                expect(err.name).to.equal('BadCredentialsError')
                expect(err.message.toLowerCase()).to.contain('expire')
            })
        })

        describe('#changePassword', () => {

            it('should change password and authenticate', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'AjD4eEFn'
                const newPassword = 'mFUHv2we'
                await auth.createUser(username, password, true)
                await auth.changePassword(username, password, newPassword)
                await auth.authenticate(username, newPassword)
            })

            it('should throw BadCredentialsError for bad old password', async () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'AjD4eEFn'
                const newPassword = 'mFUHv2we'
                await auth.createUser(username, password, true)
                const err = await getErrorAsync(() => auth.changePassword(username, newPassword, newPassword))
                expect(err.name).to.equal('BadCredentialsError')
            })
        })

        describe('#parseToken', () => {

            it('should return initial value for getToken', () => {
                const auth = newAuth()
                const username = 'nobody@nowhere.example'
                const password = 'gck3fRYu'
                const res = auth.parseToken(auth.getToken(username, password))
                expect(res.username).to.equal(username)
                expect(res.password).to.equal(password)
            })
        })
    })

    function s3Suite(s3_bucket) {

        return function() {

            this.timeout(10000)

            const s3_prefix = 'test/' + +new Date + '/'

            function newAuth() {
                const opts = {authType: 's3', s3_bucket, s3_prefix}
                const auth = Auth.create(opts)
                auth.logger.loglevel = 1
                return auth
            }

            var s3

            before(() => {
                s3 = new AWS.S3()
            })

            describe('#createUser', () => {

                it('should create user', async () => {
                    const auth = newAuth()
                    const username = 'nobody1@nowhere.example'
                    const password = 'a7CGQSdV'
                    await auth.createUser(username, password, true)
                    // cleanup
                    await auth.deleteUser(username)
                })
            })

            describe('#readUser', () => {

                it('should read user case insensitive', async () => {
                    const auth = newAuth()
                    const username = 'nobody2@nowhere.example'
                    const password = '2SnMTw6M'
                    await auth.createUser(username, password, true)
                    try {
                        const user = await auth.readUser(username.toUpperCase())
                        expect(user.username).to.equal(username)
                    } finally {
                        // cleanup
                        await auth.deleteUser(username)
                    }
                })

                it('should throw UserNotFoundError', async () => {
                    const auth = newAuth()
                    const username = 'nobody3@nowhere.example'
                    const err = await getErrorAsync(() => auth.readUser(username))
                    expect(err.name).to.equal('UserNotFoundError')
                })

                it('should throw InternalError caused by SyntaxError when malformed json', async () => {
                    const auth = newAuth()
                    const username = 'nobody-syntax-err@nowhere.example'
                    const password = 'VBvUa7TX'
                    await auth.createUser(username, password, true)
                    try {
                        // hack object
                        await auth.impl.s3.putObject({
                            Bucket : s3_bucket,
                            Key : auth.impl._userKey(username),
                            Body: Buffer.from('{]')
                        }).promise()
                        const err = await getErrorAsync(() => auth.readUser(username))
                        expect(err.name).to.equal('InternalError')
                        expect(err.cause.name).to.equal('SyntaxError')
                    } finally {
                        // cleanup
                        await auth.deleteUser(username)
                    }
                })
            })

            describe('#userExists', () => {

                it('should return true for created user', async () => {
                    const auth = newAuth()
                    const username = 'nobody4@nowhere.example'
                    const password = 'gB3tbM96'
                    await auth.createUser(username, password, true)
                    try {
                        const result = await auth.userExists(username)
                        expect(result).to.equal(true)
                    } finally {
                        // cleanup
                        await auth.deleteUser(username)
                    }
                })

                it('should return false for non existent', async () => {
                    const auth = newAuth()
                    const username = 'nobody5@nowhere.example'
                    const result = await auth.userExists(username)
                    expect(result).to.equal(false)
                })

                it('should throw InternalError with cause BadRequest when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    const err = await getErrorAsync(() => auth.userExists(username))
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('BadRequest')
                })
            })

            describe('#deleteUser', () => {

                it('should throw UserNotFoundError for bad user', async () => {
                    const auth = newAuth()
                    const username = 'bad-delete-user@nowhere.example'
                    const err = await getErrorAsync(() => auth.deleteUser(username))
                    expect(err.name).to.equal('UserNotFoundError')
                })

                it('should throw InvalidBucketName when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getErrorAsync(() => auth.impl.deleteUser(username))
                    expect(err.name).to.equal('InvalidBucketName')
                })
            })

            describe('#updateUser', () => {
                it('should throw InvalidBucketName when bucket is bad', async () => {
                    const auth = newAuth()
                    const username = 'bad-bucke-update-user@nowhere.example'
                    // hack opts to produce error
                    auth.impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getErrorAsync(() => auth.impl.updateUser(username, {}))
                    expect(err.name).to.equal('InvalidBucketName')
                })
            })

            describe('#listAllUsers', () => {
                it('should throw InternalError with cause NotImplementedError', async () => {
                    const auth = newAuth()
                    const err = await getErrorAsync(() => auth.listAllUsers())
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('NotImplementedError')
                })
            })
        }
        
    }

    if (process.env.TEST_AUTH_S3_BUCKET) {
        describe('S3', s3Suite(process.env.TEST_AUTH_S3_BUCKET))
    } else {
        describe.skip('S3', s3Suite())
    }
})