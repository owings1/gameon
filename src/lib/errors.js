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

export class BaseError extends Error {

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

export class RequestError extends BaseError {

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

export class ClientError extends BaseError {

    static forConnectFailedError(err) {
        // WebSocketClient throws generic Error
        const error = new ConnectionFailedError(err)
        const [message, ...lines] = err.message.trim().split('\n')
        error.message = message
        error.responseHeaders = lines.slice(1)
        return error
    }

    // From WebSocketClient:
    //  ❯ You must specify a full WebSocket URL, including protocol.
    //  ❯ You must specify a full WebSocket URL, including hostname. Relative URLs are not supported.
    //  ❯ Protocol list contains invalid character ...
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

export class ArgumentError   extends BaseError {}
export class AuthError       extends BaseError {}
export class DependencyError extends BaseError {}
export class GameError       extends BaseError {}
export class InternalError   extends BaseError {}
export class MenuError       extends BaseError {}
export class ProgrammerError extends BaseError {}
export class PromptError     extends BaseError {}
export class RobotError      extends BaseError {}
export class SecurityError   extends BaseError {}
export class ThemeError      extends BaseError {}

// ArgumentError
export class DuplicateColumnError  extends ArgumentError {}
export class DuplicateKeyError     extends ArgumentError {}
export class InvalidColorError     extends ArgumentError {}
export class InvalidColumnError    extends ArgumentError {}
export class InvalidDirError       extends ArgumentError {}
export class InvalidRegexError     extends ArgumentError {}
export class InvalidRollDataError  extends ArgumentError {}
export class InvalidSortDirError   extends ArgumentError {}
export class MaxDepthExceededError extends ArgumentError {}

// AuthError
export class BadCredentialsError   extends AuthError {}
export class UserConfirmedError    extends AuthError {}
export class UserExistsError       extends AuthError {}
export class UserLockedError       extends AuthError {}
export class UserNotConfirmedError extends AuthError {}
export class UserNotFoundError     extends AuthError {}

// ClientError
export class ConnectionClosedError   extends ClientError {}
export class ConnectionFailedError   extends ClientError {}
export class ParallelRequestError    extends ClientError {}
export class UnexpectedResponseError extends ClientError {}

// DependencyError
export class CircularDependencyError   extends DependencyError {}
export class MissingDependencyError    extends DependencyError {}
export class UnresolvedDependencyError extends DependencyError {}

// GameError
export class IllegalStateError    extends GameError {}
export class IllegalMoveError     extends GameError {}
export class InvalidRollError     extends GameError {}
export class MatchCanceledError   extends GameError {}
export class NotImplementedError  extends GameError {}
export class WaitingFinishedError extends GameError {}

// GameError > IllegalMoveError
export class IllegalBareoffError   extends IllegalMoveError {}
export class MayNotBearoffError    extends IllegalMoveError {}
export class MoveOutOfRangeError   extends IllegalMoveError {}
export class NoPieceOnBarError     extends IllegalMoveError {}
export class NoPieceOnSlotError    extends IllegalMoveError {}
export class OccupiedSlotError     extends IllegalMoveError {}
export class PieceOnBarError       extends IllegalMoveError {}

// GameError > IllegalStateError
export class AlreadyRolledError       extends IllegalStateError {}
export class DoubleNotAllowedError    extends IllegalStateError {}
export class GameAlreadyStartedError  extends IllegalStateError {}
export class GameFinishedError        extends IllegalStateError {}
export class GameNotFinishedError     extends IllegalStateError {}
export class GameNotStartedError      extends IllegalStateError {}
export class HasNotDoubledError       extends IllegalStateError {}
export class HasNotRolledError        extends IllegalStateError {}
export class MatchFinishedError       extends IllegalStateError {}
export class MovesRemainingError      extends IllegalStateError {}
export class NoMovesMadeError         extends IllegalStateError {}
export class NoMovesRemainingError    extends IllegalStateError {}
export class TurnAlreadyFinishedError extends IllegalStateError {}
export class TurnCanceledError        extends IllegalStateError {}
export class TurnNotFinishedError     extends IllegalStateError {}

// MenuError
export class ResetKeyNotEnteredError extends MenuError {}
export class WaitingAbortedError     extends MenuError {}

// PromptError
export class PromptActiveError extends PromptError {}

// RequestError
export class HandshakeError          extends RequestError {}
export class InvalidActionError      extends RequestError {}
export class MatchAlreadyExistsError extends RequestError {}
export class MatchAlreadyJoinedError extends RequestError {}
export class MatchNotFoundError      extends RequestError {}
export class ValidateError           extends RequestError {}

// RobotError
export class InvalidRobotError  extends RobotError {}
export class InvalidWeightError extends RobotError {}
export class NoDelegatesError   extends RobotError {}
export class UndecidedMoveError extends RobotError {}

// RobotError > InvalidRobotError
export class InvalidRobotVersionError extends InvalidRobotError {}

// ThemeError
export class StyleError         extends ThemeError {}
export class ThemeConfigError   extends ThemeError {}
export class ThemeExistsError   extends ThemeError {}
export class ThemeNotFoundError extends ThemeError {}

const Errors = {
    AlreadyRolledError,
    ArgumentError,
    AuthError,
    BadCredentialsError,
    BaseError,
    CircularDependencyError,
    ClientError,
    ConnectionClosedError,
    ConnectionFailedError,
    DependencyError,
    DoubleNotAllowedError,
    DuplicateColumnError,
    DuplicateKeyError,
    GameAlreadyStartedError,
    GameError,
    GameFinishedError,
    GameNotFinishedError,
    GameNotStartedError,
    HandshakeError,
    HasNotDoubledError,
    HasNotRolledError,
    IllegalBareoffError,
    IllegalMoveError,
    IllegalStateError,
    InternalError,
    InvalidActionError,
    InvalidColorError,
    InvalidColumnError,
    InvalidDirError,
    InvalidRegexError,
    InvalidRobotError,
    InvalidRobotVersionError,
    InvalidRollDataError,
    InvalidRollError,
    InvalidSortDirError,
    InvalidWeightError,
    MatchAlreadyExistsError,
    MatchAlreadyJoinedError,
    MatchCanceledError,
    MatchFinishedError,
    MatchNotFoundError,
    MaxDepthExceededError,
    MayNotBearoffError,
    MenuError,
    MissingDependencyError,
    MoveOutOfRangeError,
    MovesRemainingError,
    NoDelegatesError,
    NoMovesMadeError,
    NoMovesRemainingError,
    NoPieceOnBarError,
    NoPieceOnSlotError,
    NotImplementedError,
    OccupiedSlotError,
    ParallelRequestError,
    PieceOnBarError,
    ProgrammerError,
    PromptActiveError,
    PromptError,
    RequestError,
    ResetKeyNotEnteredError,
    RobotError,
    SecurityError,
    StyleError,
    ThemeConfigError,
    ThemeError,
    ThemeExistsError,
    ThemeNotFoundError,
    TurnAlreadyFinishedError,
    TurnCanceledError,
    TurnNotFinishedError,
    UndecidedMoveError,
    UnexpectedResponseError,
    UnresolvedDependencyError,
    UserConfirmedError,
    UserExistsError,
    UserLockedError,
    UserNotConfirmedError,
    UserNotFoundError,
    ValidateError,
    WaitingAbortedError,
    WaitingFinishedError,
}