/**
 * gameon - Web class
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
const Auth      = require('./auth')
const Constants = require('../lib/constants')
const Errors    = require('../lib/errors')
const Logger    = require('../lib/logger')
const Util      = require('../lib/util')

const bodyParser   = require('body-parser')
const cookieParser = require('cookie-parser')
const express      = require('express')
const path         = require('path')
const session      = require('express-session')

const {resolve} = path

const {
    DefaultSessionCookie
    // This should be set in production environments with SESSION_SECRET
  , DefaultSessionSecret
} = Constants

const {SecurityError} = Errors

const ResourcePath = resolve(__dirname, '../www')

const StaticPath = resolve(ResourcePath, 'static')
const ViewPath   = resolve(ResourcePath, 'templates')

class Web {

    static defaults(env) {
        return {
            sessionSecret   : env.SESSION_SECRET || DefaultSessionSecret
          , sessionInsecure : !!env.SESSION_INSECURE
          , sessionExpiry   : +env.SESSION_EXPIRY || 86400 * 1000
          , sessionCookie   : env.SESSION_COOKIE || DefaultSessionCookie
        }
    }

    constructor(opts) {

        this.logger = new Logger(this.constructor.name, {server: true})

        this.opts = Util.defaults(Web.defaults(process.env), opts)
        this.auth = Auth.create({...opts, ...this.opts, loggerPrefix: 'Web'})

        this.app = this.createExpressApp()
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
        this.auth.loglevel = n
    }

    createExpressApp() {

        if (this.opts.sessionSecret == DefaultSessionSecret) {
            if (!process.env.GAMEON_TEST) {
                this.logger.warn(
                    'SESSION_SECRET not set, using default.'
                  , 'For security, SESSION_SECRET must be set'
                  , 'in production environemnts.'
                )
            }
            if (process.env.NODE_ENV == 'production') {
                throw new SecurityError(
                    'Must set custom SESSION_SECRET when NODE_ENV=production'
                )
            }
        }

        const app = express()
        const formParser = bodyParser.urlencoded({extended: true})

        app.set('trust proxy', 1)

        app.set('view engine', 'ejs')
        app.set('views', ViewPath)

        app.use(session({
            secret            : this.opts.sessionSecret
          , name              : this.opts.sessionCookie
          , resave            : false
          , saveUninitialized : false
          , cookie            : {
                httpOnly : true
              , secure   : !this.opts.sessionInsecure
              , sameSite : true
              , maxAge   : this.opts.sessionExpiry
            }
        }))

        app.use(cookieParser())

        app.use((req, res, next) => {
            // clear old session cookies
            if (req.cookies[this.opts.sessionCookie] && !req.session.user) {
                res.clearCookie(this.opts.sessionCookie)
                res.clearCookie('gatoken')
            }
            // set logged in
            req.loggedIn = !!(req.cookies[this.opts.sessionCookie] && req.session.user)
            // set view locals
            if (req.loggedIn) {
                res.locals.loggedIn = true
                res.locals.user = req.session.user
            }
            res.locals.errors = null
            next()
        })

        function requireLogin(req, res, next) {
            if (!req.loggedIn) {
                res.status(302).redirect('/login')
            } else {
                next()
            }
        }

        app.get('/', (req, res) => {
            res.status(200).render('index')
        })

        app.get('/login', (req, res) => {
            res.status(200).render('login')
        })

        app.post('/login', formParser, (req, res) => {
            const {username, password} = req.body
            this.auth.authenticate(username, password).then(user => {
                req.session.user = user
                res.cookie('gatoken', user.token, {
                    httpOnly : false
                  , secure   : !this.opts.sessionInsecure
                  , sameSite : true
                })
                res.status(302).redirect('/dashboard')
            }).catch(err => {
                if (err.name == 'BadCredentialsError' || err.name == 'ValidateError') {
                    res.status(400)
                } else {
                    res.status(500)
                }
                res.render('login', {errors: [err]})
            })
        })

        app.get('/logout', (req, res) => {
            res.clearCookie(this.opts.sessionCookie)
            delete req.session.user
            res.status(302).redirect('/')
        })

        app.get('/dashboard', requireLogin, (req, res) => {
            res.status(200).render('dashboard')
        })

        app.get('/play', requireLogin, (req, res) => {
            res.status(200).render('play', {
                Gameon: {
                    
                }
            })
        })

        app.use('/static', express.static(StaticPath))

        app.use((req, res) => {
            res.status(404).send('Not found')
        })

        return app
    }
}

module.exports = Web