const Lib = require('./game')
const Logger = require('./logger')
const Util = require('./util')

const bodyParser = require('body-parser')
const crypto = require('crypto')
const express = require('express')

const {White, Red, Match} = Lib

class Rest extends Logger {

    constructor() {
        super()
        this.app = this.buildApp()
        this.matches = {}
    }

    buildApp() {
        const app = express()

        app.use(bodyParser.json())

        // create match
        app.post('/match', (req, res) => {

            const {secret, total, opts} = req.body

            try {
                Validate.secret(secret)
                const id = Rest.generateId(secret)
                if (this.matches[id]) {
                    throw new MatchAlreadyExistsError('match already exists')
                }
                const match = new Match(total, opts)
                match.id = id
                match.secrets = {
                    White : secret
                  , Red   : null
                }
                this.matches[id] = match
                res.status(201).json({id, message: 'match created'})
            } catch (err) {
                res.status(err.code || 400).json(Rest.errorBody(err))
                return
            }
        })

        // join match
        app.put('/match/:id', (req, res) => {
            const {secret} = req.body
            try {
                Validate.secret(secret)
                if (!this.matches[id]) {
                    throw new MatchNotFoundError('match not found')
                }
                const match = this.matches[id]
                if (match.secrets.Red) {
                    throw new MatchAlreadyJoinedError('match already joined')
                }
                match.secrets.Red = secret
                res.status(200).json({message: 'match joined'})
            } catch (err) {
                res.status(err.code || 400).json(Rest.errorBody(err))
                return
            }
        })

        
        return app
    }

    static errorBody(err) {
        const {message} = err
        var {name} = err
        if (!name) {
            name = err.constructor.name
        }
        return {message, name}
    }

    static generateId(str) {
        return crypto.createHash('sha256').update(str).digest().substring(0, 8)
    }
}


class Validate {
    static id(str) {
        if (!str || str.length != 8) {
            throw new ValidateError('invalid id')
        }
    }
    static secret(str) {
        if (!str || str.length != 32) {
            throw new ValidateError('secret must be string of length 32')
        }
    }
}

class RestError extends Error {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name
    }
}

class ValidateError extends RestError {}
class MatchAlreadyExistsError extends RestError {}
class MatchNotFoundError extends RestError {
    constructor(...args) {
        super(...args)
        this.code = 404
    }
}
class MatchAlreadyJoinedError extends RestError {}
module.exports = Rest