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
const Logger = require('../lib/logger')

const {
    DefaultSessionCookie,
    DefaultSessionSecret,
    DefaultTokenCookie,
    IsTest,
} = require('../lib/constants')

const {
    defaults,
    securityCheck,
} = require('../lib/util')

const {SecurityError} = require('../lib/errors')

const bodyParser   = require('body-parser')
const cookieParser = require('cookie-parser')
const express      = require('express')
const path         = require('path')
const session      = require('express-session')

const {resolve} = path

const ResourcePath = resolve(__dirname, '../www')
const StaticPath   = resolve(ResourcePath, 'static')
const ViewPath     = resolve(ResourcePath, 'templates')

class Web {

    static defaults(env) {
        return {
            /* `SESSION_COOKIE` must be set to custom value in production environments */
            sessionCookie   : env.SESSION_COOKIE || DefaultSessionCookie,
            /* `SESSION_SECRET` must be set to custom value in production environments */
            sessionSecret   : env.SESSION_SECRET || DefaultSessionSecret,
            sessionInsecure : Boolean(env.SESSION_INSECURE),
            sessionExpiry   : +env.SESSION_EXPIRY || 86400 * 1000,
            tokenCookie     : env.TOKEN_COOKIE || DefaultTokenCookie,
        }
    }

    constructor(auth, opts) {

        this.logger = new Logger(this.constructor.name, {server: true})

        this.opts = defaults(Web.defaults(process.env), opts)
        this.auth = auth

        this._checkSecurity(process.env)

        this.app = this.createExpressApp()
    }

    get loglevel() {
        return this.logger.loglevel
    }

    set loglevel(n) {
        this.logger.loglevel = n
    }

    createExpressApp() {

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
            const hasCookie = Boolean(req.cookies[this.opts.sessionCookie])
            const hasUser = Boolean(req.session.user)
            // Clear old session cookies.
            if (hasCookie && !hasUser) {
                res.clearCookie(this.opts.sessionCookie)
                res.clearCookie(DefaultSessionCookie)
            }
            // Set logged in.
            req.loggedIn = hasCookie && hasUser
            // Set view locals.
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
                res.cookie(this.opts.tokenCookie, user.token, {
                    httpOnly : false,
                    secure   : !this.opts.sessionInsecure,
                    sameSite : true,
                })
                res.status(302).redirect('/dashboard')
            }).catch(err => {
                if (err.isBadCredentialsError || err.isValidateError) {
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
            req.loggedIn = false
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

    /**
     * Ensure the defaults are not used in production environments.
     *
     * @throws SecurityError
     *
     * @param {object} (optional) The environment variables
     * @returns {boolean} Whether all values are custom
     */
    _checkSecurity(env) {

        const checks = [
            {
                name    : 'SESSION_SECRET',
                value   : this.opts.sessionSecret,
                default : DefaultSessionSecret,
            },
            {
                name    : 'SESSION_COOKIE',
                value   : this.opts.sessionCookie,
                default : DefaultSessionCookie,
            },
            {
                name    : 'TOKEN_COOKIE',
                value   : this.opts.tokenCookie,
                default : DefaultTokenCookie,
            }
        ]

        const {error, warning} = securityCheck(checks, env)

        if (error) {
            throw new SecurityError(error)
        }

        if (warning) {
            if (!IsTest) {
                this.logger.warn(warning)
            }
            return false
        }

        return true
    }
}

module.exports = Web