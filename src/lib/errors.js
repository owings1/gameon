/**
 * gameon - Error classes
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
const Cache = {}

function getProps(err) {
    if (!Cache[err.name]) {
        Cache[err.name] = []
        for (var name in Errors) {
            if (err instanceof Errors[name]) {
                Cache[err.name].push('is' + name)
            }
        }
    }
    return Cache[err.name]
}

function addProps(err, src) {
    const props = getProps(src || err)
    for (var i = 0, ilen = props.length; i < ilen; ++i) {
        err[props[i]] = true
    }
}

class BaseError extends Error {

    constructor(message, ...args) {
        if (Array.isArray(message)) {
            message = message.join(' ')
        }
        super(message, ...args)
        this.name = this.constructor.name
        if (!this.cause) {
            this.cause = args.find(it => it instanceof Error)
        }
        if (!this.cause && (message instanceof Error)) {
            this.cause = message
        }
        if (message instanceof Error) {
            this.message = message.message || message.code
        }
        addProps(this)
        const names = [this.name]
        if (this.cause instanceof Error) {
            addProps(this.cause)
            addProps(this, this.cause)
            names.push(this.cause.name || this.cause.constructor.name)
        }
        if (!this.names) {
            this.names = names
        }
        if (!this.namePath) {
            this.namePath = this.names.join('.')
        }
        args.forEach(arg => {
            if (typeof arg == 'object' && arg.attrs) {
                if (typeof arg.attrs == 'object') {
                    Object.entries(arg.attrs).forEach(([key, value]) => {
                        this[key] = value
                    })
                }
            }
        })
    }
}

class RequestError extends BaseError {

    static forResponse(res, body, ...args) {
        const err = new RequestError(...args)
        err.res = res
        err.status = res.status
        err.body = body
        if (body && body.error) {
            if (body.error.name in Errors) {
                err.cause = new Errors[body.error.name](body.error.message)
                addProps(err, err.cause)
            } else {
                err.cause = body.error
            }
            err.message += ' (' + [err.cause.name, err.cause.message].filter(Boolean).join(': ') + ')'
        }
        return err
    }

    static forError(cause, ...args) {
        const err = new RequestError(cause, ...args)
        if (cause && (cause.cause instanceof Error)) {
            addProps(err, cause.cause)
        }
        return err
    }
}

class ClientError extends BaseError {

    static forConnectFailedError(err) {
        // WebSocketClient throws generic Error
        const error = new ConnectionFailedError(err)
        const [message, ...lines] = err.message.trim().split('\n')
        error.message = message
        error.responseHeaders = lines.slice(1)
        return error
    }

    // From WebSocketClient:
    //  ??? You must specify a full WebSocket URL, including protocol.
    //  ??? You must specify a full WebSocket URL, including hostname. Relative URLs are not supported.
    //  ??? Protocol list contains invalid character ...
    static forConnectThrowsError(err) {
        return new ClientError(new ArgumentError(err.message))
    }

    static forData(data, fallbackMessage) {
        data = data || {}
        let message = data.error || fallbackMessage
        if (!message && data.action) {
            message = `Unexpected action: ${data.action}`
        }
        if (!message) {
            message = 'Unknown server error'
        }
        const args = [message]
        let causeName
        if (data.cause) {
            let cause
            if (data.cause.name in Errors) {
                cause = new Errors[data.cause.name](data.cause.error)
            } else {
                cause = data.cause
            }
            args.push(cause)
            causeName = cause.name
        }
        if (data.attrs) {
            args.push({attrs: data.attrs})
        }
        let err
        if (data.name in Errors) {
            err = new Errors[data.name](...args)
            if (!err.isClientError) {
                err = new ClientError(err)
            }
        } else {
            err = new ClientError(...args)
        }
        for (var prop in data) {
            if (data.hasOwnProperty(prop) && !(prop in err)) {
                err[prop] = data[prop]
            }
        }
        if (causeName) {
            err.names.push(causeName)
            err.namePath += '.' + causeName
        }
        return err
    }
}

class ArgumentError   extends BaseError {}
class AuthError       extends BaseError {}
class DependencyError extends BaseError {}
class GameError       extends BaseError {}
class InternalError   extends BaseError {}
class MenuError       extends BaseError {}
class ProgrammerError extends BaseError {}
class PromptError     extends BaseError {}
class RobotError      extends BaseError {}
class SecurityError   extends BaseError {}
class ThemeError      extends BaseError {}

// ArgumentError
class DuplicateColumnError  extends ArgumentError {}
class DuplicateKeyError     extends ArgumentError {}
class InvalidColorError     extends ArgumentError {}
class InvalidColumnError    extends ArgumentError {}
class InvalidDirError       extends ArgumentError {}
class InvalidRegexError     extends ArgumentError {}
class InvalidRollDataError  extends ArgumentError {}
class InvalidSortDirError   extends ArgumentError {}
class MaxDepthExceededError extends ArgumentError {}

// AuthError
class BadCredentialsError   extends AuthError {}
class UserConfirmedError    extends AuthError {}
class UserExistsError       extends AuthError {}
class UserLockedError       extends AuthError {}
class UserNotConfirmedError extends AuthError {}
class UserNotFoundError     extends AuthError {}

// ClientError
class ConnectionClosedError   extends ClientError {}
class ConnectionFailedError   extends ClientError {}
class ParallelRequestError    extends ClientError {}
class UnexpectedResponseError extends ClientError {}

// DependencyError
class CircularDependencyError   extends DependencyError {}
class MissingDependencyError    extends DependencyError {}
class UnresolvedDependencyError extends DependencyError {}

// GameError
class IllegalStateError    extends GameError {}
class IllegalMoveError     extends GameError {}
class InvalidRollError     extends GameError {}
class MatchCanceledError   extends GameError {}
class NotImplementedError  extends GameError {}
class WaitingFinishedError extends GameError {}

// GameError > IllegalMoveError
class IllegalBareoffError   extends IllegalMoveError {}
class MayNotBearoffError    extends IllegalMoveError {}
class MoveOutOfRangeError   extends IllegalMoveError {}
class NoPieceOnBarError     extends IllegalMoveError {}
class NoPieceOnSlotError    extends IllegalMoveError {}
class OccupiedSlotError     extends IllegalMoveError {}
class PieceOnBarError       extends IllegalMoveError {}

// GameError > IllegalStateError
class AlreadyRolledError       extends IllegalStateError {}
class DoubleNotAllowedError    extends IllegalStateError {}
class GameAlreadyStartedError  extends IllegalStateError {}
class GameFinishedError        extends IllegalStateError {}
class GameNotFinishedError     extends IllegalStateError {}
class GameNotStartedError      extends IllegalStateError {}
class HasNotDoubledError       extends IllegalStateError {}
class HasNotRolledError        extends IllegalStateError {}
class MatchFinishedError       extends IllegalStateError {}
class MovesRemainingError      extends IllegalStateError {}
class NoMovesMadeError         extends IllegalStateError {}
class NoMovesRemainingError    extends IllegalStateError {}
class TurnAlreadyFinishedError extends IllegalStateError {}
class TurnCanceledError        extends IllegalStateError {}
class TurnNotFinishedError     extends IllegalStateError {}

// MenuError
class ResetKeyNotEnteredError extends MenuError {}
class WaitingAbortedError     extends MenuError {}

// PromptError
class PromptActiveError extends PromptError {}

// RequestError
class HandshakeError          extends RequestError {}
class InvalidActionError      extends RequestError {}
class MatchAlreadyExistsError extends RequestError {}
class MatchAlreadyJoinedError extends RequestError {}
class MatchNotFoundError      extends RequestError {}
class ValidateError           extends RequestError {}

// RobotError
class InvalidRobotError  extends RobotError {}
class InvalidWeightError extends RobotError {}
class NoDelegatesError   extends RobotError {}
class UndecidedMoveError extends RobotError {}

// RobotError > InvalidRobotError
class InvalidRobotVersionError extends InvalidRobotError {}

// ThemeError
class StyleError         extends ThemeError {}
class ThemeConfigError   extends ThemeError {}
class ThemeExistsError   extends ThemeError {}
class ThemeNotFoundError extends ThemeError {}

const Errors = {
    AlreadyRolledError
  , ArgumentError
  , AuthError
  , BadCredentialsError
  , BaseError
  , CircularDependencyError
  , ClientError
  , ConnectionClosedError
  , ConnectionFailedError
  , DependencyError
  , DoubleNotAllowedError
  , DuplicateColumnError
  , DuplicateKeyError
  , GameAlreadyStartedError
  , GameError
  , GameFinishedError
  , GameNotFinishedError
  , GameNotStartedError
  , HandshakeError
  , HasNotDoubledError
  , HasNotRolledError
  , IllegalBareoffError
  , IllegalMoveError
  , IllegalStateError
  , InternalError
  , InvalidActionError
  , InvalidColorError
  , InvalidColumnError
  , InvalidDirError
  , InvalidRegexError
  , InvalidRobotError
  , InvalidRobotVersionError
  , InvalidRollDataError
  , InvalidRollError
  , InvalidSortDirError
  , InvalidWeightError
  , MatchAlreadyExistsError
  , MatchAlreadyJoinedError
  , MatchCanceledError
  , MatchFinishedError
  , MatchNotFoundError
  , MaxDepthExceededError
  , MayNotBearoffError
  , MenuError
  , MissingDependencyError
  , MoveOutOfRangeError
  , MovesRemainingError
  , NoDelegatesError
  , NoMovesMadeError
  , NoMovesRemainingError
  , NoPieceOnBarError
  , NoPieceOnSlotError
  , NotImplementedError
  , OccupiedSlotError
  , ParallelRequestError
  , PieceOnBarError
  , ProgrammerError
  , PromptError
  , PromptActiveError
  , RequestError
  , ResetKeyNotEnteredError
  , RobotError
  , SecurityError
  , StyleError
  , ThemeConfigError
  , ThemeError
  , ThemeExistsError
  , ThemeNotFoundError
  , TurnAlreadyFinishedError
  , TurnCanceledError
  , TurnNotFinishedError
  , UndecidedMoveError
  , UnexpectedResponseError
  , UnresolvedDependencyError
  , UserConfirmedError
  , UserExistsError
  , UserLockedError
  , UserNotConfirmedError
  , UserNotFoundError
  , ValidateError
  , WaitingAbortedError
  , WaitingFinishedError
}

module.exports = Errors