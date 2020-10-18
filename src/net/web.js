/**
 * gameon - Web class
 *
 * Copyright (C) 2020 Doug Owings
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
const Util   = require('../lib/util')

const bodyParser   = require('body-parser')
const cookieParser = require('cookie-parser')
const express      = require('express')
const {merge}      = Util
const path         = require('path')
const session      = require('express-session')

// This should be set in production environments with SESSION_SECRET
const DefaultSessionSecret = 'D2hjWtg95VkuzhFBVxnhDhSU4J9BYnz8'

class Web {

    defaults(env) {
        return {
            sessionSecret   : env.SESSION_SECRET || DefaultSessionSecret
          , sessionInsecure : !!env.SESSION_INSECURE
          , sessionExpiry   : +env.SESSION_EXPIRY || 600000
        }
    }

    constructor(auth, opts) {
        this.logger = new Logger(this.constructor.name, {server: true})
        this.auth = auth
        this.opts = merge({}, this.defaults(process.env), opts)
        this.app = this.createExpressApp()
    }

    createExpressApp() {

        const app = express()
        const formParser = bodyParser.urlencoded({extended: true})

        app.set('trust proxy', 1)

        app.set('view engine', 'ejs')
        app.set('views', path.resolve(__dirname, '../www/templates'))

        app.use(session({
            secret            : this.opts.sessionSecret
          , name              : 'gasid'
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
            if (req.cookies.gasid && !req.session.user) {
                res.clearCookie('gasid')
            }
            req.loggedIn = !!(req.cookies.gasid && req.session.user)
            if (req.loggedIn) {
                res.locals.user = req.session.user
            }
            next()
        })

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
                res.status(302).redirect('/dashboard')
            }).catch(err => {
                if (err.name == 'BadCredentialsError' || err.name == 'ValidationError') {
                    res.status(400)
                } else {
                    res.status(500)
                }
                res.render('login', {errors: [err]})
            })
        })

        app.get('/dashboard', (req, res) => {
            if (!req.loggedIn) {
                res.status(302).redirect('/login')
                return
            }
            res.render('dashboard')
        })

        app.use((req, res) => {
            res.status(404).send('Not found')
        })

        return app
    }
}

module.exports = Web