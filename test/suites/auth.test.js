/**
 * gameon - test suite - Auth
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
import fse from 'fs-extra'
import fs from 'fs'
import {expect} from 'chai'
import Auth from '../../src/net/auth.js'
import TestUtil from '../util.js'
import process from 'process'

const {
    getError,
    parseKey,
    tmpDir,
} = TestUtil

describe('Auth', () => {

    const logLevel = 0

    beforeEach(function () {
        this.lastEmail = function () {
            return this.auth.email.impl.lastEmail
        }
        this.parseKey = function (content) {
            content = typeof content == 'undefined' ? this.lastEmail() : content
            return parseKey(content)
        }
    })

    describe('Static', () => {

        describe('#defaults', () => {

            it('should set passwordHelp to non default when regex defined', function () {
                const d1 = Auth.defaults({})
                const d2 = Auth.defaults({AUTH_PASSWORD_REGEX: '.*'})
                expect(d2.passwordHelp).to.not.equal(d1.passwordHelp)
            })
        })

        describe('#create', () => {

            it('should throw ArgumentError for type directory with no directory specified', function () {
                const err = getError(() => { Auth.create({authType: 'directory'}) })
                expect(err.isArgumentError).to.equal(true)
            })

            it('should throw ArgumentError for type directory with non-existent directory', function () {
                const opts = {authType: 'directory', authDir: '/non-existent'}
                const err = getError(() => { Auth.create(opts) })
                expect(err.isArgumentError).to.equal(true)
            })
        })
    })

    describe('Anonymous', () => {

        beforeEach(function () {
            this.auth = Auth.create({authType: 'anonymous'})
            this.auth.logLevel = logLevel
        })

        describe('#authenticate', () => {

            it('should accept blank username/password', async function () {
                await this.auth.authenticate()
            })

            it('should return passwordEncrypted when password non-empty', async function () {
                const user = await this.auth.authenticate(null, 'a')
                expect(user.passwordEncrypted).to.have.length.greaterThan(0)
            })
        })

        const nimps = [
            'createUser'
          , 'readUser'
          , 'updateUser'
          , 'deleteUser'
          , 'userExists'
          , 'listAllUsers'
        ]

        nimps.sort().forEach(method => {

            describe(`#${method}`, () => {

                it(`should throw NotImplementedError for ${method}`, async function () {
                    const err = await getError(() => this.auth.impl[method]())
                    expect(err.name).to.equal('NotImplementedError')
                })
            })            
        })

        describe('#validateUsername', () => {

            const passCases = [
                'nobody@nowhere.example'
              , 'Kimberly@nowhere.example'
            ]

            const throwCases = [
                [''                     , 'empty']
              , ['foo?@example.example' , 'bad char ?']
              , ['chunky'               , 'bad email chunky']
            ]

            passCases.forEach(input => {
                const exp = input.toLowerCase()
                it(`should pass for ${input} and return ${exp}`, function () {
                    const res = this.auth.validateUsername(input)
                    expect(res).to.equal(exp)
                })
            })

            throwCases.forEach(([input, desc]) => {
                it(`should throw ValidateError for ${desc}`, function () {
                    const err = getError(() => this.auth.validateUsername(input))
                    expect(err.name).to.equal('ValidateError')
                })
            })
        })

        describe('#validatePassword', () => {

            const passCases = [
                'dbHg5eva'
              , 'dY@a45-S'
              , '=Bwx4r%aWB_T'
              , 'a1d//////G'
            ]

            const throwCases = [
                [''                     , 'empty']
              , ['5ZycJj3'              , 'length 7']
              , ['aDlvkdoslK'           , 'missing number']
              , ['encrypted_aDlvkdoslK' , 'start with encrypted_']
            ]

            passCases.forEach(input => {
                it(`should pass for ${input}`, function () {
                    this.auth.validatePassword(input)
                })
            })

            throwCases.forEach(([input, desc]) => {
                it(`should throw ValidateError for ${desc}`, function () {
                    const err = getError(() => this.auth.validatePassword(input))
                    expect(err.name).to.equal('ValidateError')
                })
            })
        })
    })

    describe('Directory', () => {

        beforeEach(function () {
            this.authDir = tmpDir()
            this.auth = Auth.create({authType: 'directory', authDir: this.authDir})
            this.auth.logLevel = logLevel
        })

        afterEach(async function () {
            await fse.remove(this.authDir)
        })

        describe('#authenticate', () => {

            it('should pass for created user', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'AgJ7jfr9'
                await auth.createUser(username, password, true)
                await auth.authenticate(username, password)
            })

            it('should throw BadCredentialsError for bad password', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'Sfekx6Yx'
                await auth.createUser(username, password, true)
                const err = await getError(() => auth.authenticate(username, password + 'x'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for non-existent user', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'Nm4PcTHe'
                const err = await getError(() => auth.authenticate(username, password))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw InternalError when impl throws', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'g3AkYhC6'
                const e = new Error
                auth.impl.readUser = () => { throw e }
                const err = await getError(() => auth.authenticate(username, password))
                expect(err.isInternalError).to.equal(true)
                expect(err.cause).to.equal(e)
            })

            it('should throw UserLockedError for user locked', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'vu3a8EZm'
                await auth.createUser(username, password, true)
                await auth.lockUser(username)
                const err = await getError(() => auth.authenticate(username, password))
                expect(err.name).to.equal('UserLockedError')
            })

            it('should pass for user locked then unlocked', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'vu3a8EZm'
                await auth.createUser(username, password, true)
                await auth.lockUser(username)
                await auth.unlockUser(username)
                await auth.authenticate(username, password)
            })

            it('should accept encrypted password', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 't6jn5Xwa'
                const user = await auth.createUser(username, password, true)
                await auth.authenticate(username, user.passwordEncrypted)
            })

            it('should throw UserNotConfirmedError for unconfirmed user', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'c9dxCZRL'
                await auth.createUser(username, password)
                const err = await getError(() => auth.authenticate(username, password))
                expect(err.name).to.equal('UserNotConfirmedError')
            })
        })

        describe('#changePassword', () => {

            it('should change password and authenticate', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'AjD4eEFn'
                const newPassword = 'mFUHv2we'
                await auth.createUser(username, password, true)
                await auth.changePassword(username, password, newPassword)
                await auth.authenticate(username, newPassword)
            })

            it('should throw BadCredentialsError for bad old password', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'AjD4eEFn'
                const newPassword = 'mFUHv2we'
                await auth.createUser(username, password, true)
                const err = await getError(() => auth.changePassword(username, newPassword, newPassword))
                expect(err.name).to.equal('BadCredentialsError')
            })
        })

        describe('#confirmUser', () => {

            it('should confirm user with key sent in email', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'j7VHVRUd'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                // parse key from email
                const confirmKey = this.parseKey()
                await auth.confirmUser(username, confirmKey)
                const user = await auth.readUser(username)
                expect(user.confirmed).to.equal(true)
            })

            it('should throw BadCredentialsError for bad key', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'JkrsX89y'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                const err = await getError(() => auth.confirmUser(username, 'badkey'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for expired key', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'HGLV5gHT'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                const confirmKey = this.parseKey()
                // hack expiry setting
                auth.opts.confirmExpiry = -1
                const err = await getError(() => auth.confirmUser(username, confirmKey))
                expect(err.name).to.equal('BadCredentialsError')
                expect(err.message.toLowerCase()).to.contain('expire')
            })
        })

        describe('#createUser', () => {

            it('should return user data with username', async function () {
                const username = 'nobody@nowhere.example'
                const password = 'Daz5zGAZa'
                const user = await this.auth.createUser(username, password, true)
                expect(user.username).to.equal(username)
            })

            it('should throw UserExistsError for duplicate user case insensitive', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'Daz5zGAZa'
                await auth.createUser(username, password, true)
                const err = await getError(() => auth.createUser(username.toUpperCase(), password, true))
                expect(err.name).to.equal('UserExistsError')
            })
        })

        describe('#deleteUser', () => {

            it('should throw UserNotFoundError', async function () {
                const username = 'nobody@nowhere.example'
                const err = await getError(() => this.auth.deleteUser(username))
                expect(err.name).to.equal('UserNotFoundError')
            })

            it('should delete user, and then user should not exist', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'PPt7HKvP'
                await auth.createUser(username, password, true)
                await auth.deleteUser(username)
                const result = await auth.userExists(username)
                expect(result).to.equal(false)
            })
        })

        describe('#listAllUsers', () => {

            it('should return empty list', async function () {
                const result = await this.auth.listAllUsers()
                expect(result).to.have.length(0)
            })

            it('should return singleton of created user', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'Sa32q9QT'
                await auth.createUser(username, password, true)
                const result = await auth.listAllUsers()
                expect(result).to.have.length(1)
                expect(result).to.contain(username)
            })

            it('should throw InternalError caused by ENOENT when directory gets nuked', async function () {
                const {auth} = this
                await fse.remove(this.authDir)
                const err = await getError(() => auth.listAllUsers())
                expect(err.name).to.equal('InternalError')
                expect(err.cause.code).to.equal('ENOENT')
            })

            it('should return empty after user deleted', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'rGnPNs54'
                await auth.createUser(username, password, true)
                await auth.deleteUser(username)
                const result = await auth.listAllUsers()
                expect(result).to.have.length(0)
            })
        })

        describe('#parseToken', () => {

            it('should return initial value for getToken', function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'gck3fRYu'
                const res = auth.parseToken(auth.getToken(username, password))
                expect(res.username).to.equal(username)
                expect(res.password).to.equal(password)
            })
        })

        describe('#readUser', () => {

            it('should return user data with username', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'vALkke5N'
                await auth.createUser(username, password, true)
                const user = await auth.readUser(username)
                expect(user.username).to.equal(username)
            })

            it('should throw UserNotFoundError', async function () {
                const username = 'nobody@nowhere.example'
                const err = await getError(() => this.auth.readUser(username))
                expect(err.name).to.equal('UserNotFoundError')
            })

            it('should throw InternalError cause by SyntaxError when malformed json', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'mUad3h8b'
                await auth.createUser(username, password, true)
                // hack file
                fs.writeFileSync(auth.impl._userFile(username), '{]')
                const err = await getError(() => auth.readUser(username))
                expect(err.name).to.equal('InternalError')
                expect(err.cause.name).to.equal('SyntaxError')
            })
        })

        describe('#resetPassword', () => {

            it('should reset password and authenticate', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'TGVN4pxL'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const resetKey = this.parseKey()
                const newPassword = 'k8hWfxC8'
                await auth.resetPassword(username, newPassword, resetKey)
                await auth.authenticate(username, newPassword)
            })

            it('should throw BadCredentialsError for bad key', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'JkrsX89y'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const newPassword = 'H69Xwqwu'
                const err = await getError(() => auth.resetPassword(username, newPassword, 'badkey'))
                expect(err.name).to.equal('BadCredentialsError')
            })

            it('should throw BadCredentialsError for expired key', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'HGLV5gHT'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                const newPassword = '2vy2WM5c'
                const confirmKey = this.parseKey()
                // hack expiry setting
                auth.opts.resetExpiry = -1
                const err = await getError(() => auth.resetPassword(username, newPassword, confirmKey))
                expect(err.name).to.equal('BadCredentialsError')
                expect(err.message.toLowerCase()).to.contain('expire')
            })
        })

        describe('#sendConfirmEmail', () => {

            it('should set lastEmail in mock email', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'mAGP6hsZ'
                await auth.createUser(username, password)
                await auth.sendConfirmEmail(username)
                expect(this.lastEmail().Destination.ToAddresses)
                    .to.have.length(1).and
                    .to.contain(username)
            })

            it('should throw UserConfirmedError if user confirmed', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'QEAY8baN'
                await auth.createUser(username, password, true)
                const err = await getError(() => auth.sendConfirmEmail(username))
                expect(err.name).to.equal('UserConfirmedError')
            })
        })

        describe('#sendResetEmail', () => {

            it('should set lastEmail in mock email', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'Q6rzSPnk'
                await auth.createUser(username, password, true)
                await auth.sendResetEmail(username)
                expect(this.lastEmail().Destination.ToAddresses)
                    .to.have.length(1).and
                    .to.contain(username)
            })

            it('should throw UserNotConfirmedError if user not confirmed', async function () {
                const {auth} = this
                const username = 'nobody@nowhere.example'
                const password = 'rwF84M82'
                await auth.createUser(username, password)
                const err = await getError(() => auth.sendResetEmail(username))
                expect(err.name).to.equal('UserNotConfirmedError')
            })
        })
    })

    if (process.env.TEST_AUTH_S3_BUCKET) {
        describe('S3', s3Suite(process.env.TEST_AUTH_S3_BUCKET))
    } else {
        describe.skip('S3', s3Suite())
    }

    function s3Suite(s3_bucket) {

        return function() {

            this.timeout(10000)

            const s3_prefix = 'test/' + +new Date + '/'

            beforeEach(function () {
                this.auth = Auth.create({authType: 's3', s3_bucket, s3_prefix})
                this.auth.logLevel = logLevel
                this.impl = this.auth.impl
                this.s3 = this.impl.s3
                this.cleanUsers = []
            })

            afterEach(function () {
                return Promise.all(
                    this.cleanUsers.map(username =>
                        this.auth.deleteUser(username).catch(err =>
                            console.error('Failed to delete user', username, err)
                        )
                    )
                )
            })

            describe('#createUser', function () {

                it('should create user', async function () {
                    const username = 'nobody1@nowhere.example'
                    const password = 'a7CGQSdV'
                    await this.auth.createUser(username, password, true)
                    this.cleanUsers.push(username)
                })
            })

            describe('#deleteUser', () => {

                it('should throw UserNotFoundError for bad user', async function () {
                    const username = 'bad-delete-user@nowhere.example'
                    const err = await getError(() => this.auth.deleteUser(username))
                    expect(err.name).to.equal('UserNotFoundError')
                })

                it('impl should throw InvalidBucketName when bucket is bad', async function () {
                    const {impl} = this
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getError(() => impl.deleteUser(username))
                    expect(err.name).to.equal('InvalidBucketName')
                })
            })

            describe('#listAllUsers', () => {

                it('should throw InternalError with cause NotImplementedError', async function () {
                    const err = await getError(() => this.auth.listAllUsers())
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('NotImplementedError')
                })
            })

            describe('#readUser', function () {

                it('should read user case insensitive', async function () {
                    const username = 'nobody2@nowhere.example'
                    const password = '2SnMTw6M'
                    const user = await this.auth.createUser(username, password, true)
                    this.cleanUsers.push(username)
                    expect(user.username).to.equal(username)
                })

                it('should throw UserNotFoundError', async function () {
                    const username = 'nobody3@nowhere.example'
                    const err = await getError(() => this.auth.readUser(username))
                    expect(err.name).to.equal('UserNotFoundError')
                })

                it('should throw InternalError caused by SyntaxError when malformed json', async function () {
                    const {auth, impl, s3} = this
                    const username = 'nobody-syntax-err@nowhere.example'
                    const password = 'VBvUa7TX'
                    await auth.createUser(username, password, true)
                    this.cleanUsers.push(username)
                    // hack object
                    const params = {
                        Bucket : s3_bucket
                      , Key    : impl._userKey(username)
                      , Body   : Buffer.from('{]')
                    }
                    await s3.putObject(params).promise()
                    const err = await getError(() => auth.readUser(username))
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('SyntaxError')
                })
            })

            describe('#updateUser', () => {

                it('impl should throw InvalidBucketName when bucket is bad', async function () {
                    const {impl} = this
                    const username = 'bad-bucke-update-user@nowhere.example'
                    // hack opts to produce error
                    impl.opts.s3_bucket = '!badbucket'
                    // call on impl for coverage
                    const err = await getError(() => impl.updateUser(username, {}))
                    expect(err.name).to.equal('InvalidBucketName')
                })
            })

            describe('#userExists', function () {

                it('should return true for created user', async function () {
                    const {auth} = this
                    const username = 'nobody4@nowhere.example'
                    const password = 'gB3tbM96'
                    await auth.createUser(username, password, true)
                    this.cleanUsers.push(username)
                    const result = await auth.userExists(username)
                    expect(result).to.equal(true)
                })

                it('should return false for non existent', async function () {
                    const username = 'nobody5@nowhere.example'
                    const result = await this.auth.userExists(username)
                    expect(result).to.equal(false)
                })

                it('should throw InternalError with cause BadRequest when bucket is bad', async function () {
                    const {auth, impl} = this
                    const username = 'bad-bucket@nowhere.example'
                    // hack opts to produce error
                    impl.opts.s3_bucket = '!badbucket'
                    const err = await getError(() => auth.userExists(username))
                    expect(err.name).to.equal('InternalError')
                    expect(err.cause.name).to.equal('BadRequest')
                })
            })
        }
    }
})