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

function addProps(err) {
    if (!Cache[err.name]) {
        Cache[err.name] = []
        for (var name in Errors) {
            if (err instanceof Errors[name]) {
                Cache[err.name].push('is' + name)
            }
        }
    }
    for (var i = 0, ilen = Cache[err.name].length; i < ilen; ++i) {
        err[Cache[err.name][i]] = true
    }
}

class BaseError extends Error {

    constructor(message, ...args) {
        if (Array.isArray(message)) {
            message = message.join(' ')
        }
        super(message, ...args)
        this.name = this.constructor.name
        addProps(this)
    }
}

class RequestError extends BaseError {

    static forResponse(res, body, ...args) {
        const err = new RequestError(...args)
        err.res = res
        err.status = res.status
        err.body = body
        if (body && body.error) {
            err.cause = body.error
        }
        return err
    }
}

class ArgumentError   extends BaseError {}
class ClientError     extends BaseError {}
class DependencyError extends BaseError {}
class GameError       extends BaseError {}
class MenuError       extends BaseError {}
class RobotError      extends BaseError {}
class ThemeError      extends BaseError {}

// ArgumentError
class DuplicateColumnError  extends ArgumentError {}
class IncompatibleKeysError extends ArgumentError {}
class InvalidColorError     extends ArgumentError {}
class InvalidColumnError    extends ArgumentError {}
class InvalidDirError       extends ArgumentError {}
class InvalidRegexError     extends ArgumentError {}
class InvalidRollDataError  extends ArgumentError {}
class InvalidSortDirError   extends ArgumentError {}
class MaxDepthExceededError extends ArgumentError {}

// ClientError
class ConnectionClosedError extends ClientError {}

// DependencyError
class CircularDependencyError   extends DependencyError {}
class MissingDependencyError    extends DependencyError {}
class UnresolvedDependencyError extends DependencyError {}

// GameError
class IllegalStateError   extends GameError {}
class IllegalMoveError    extends GameError {}
class InvalidRollError    extends GameError {}
class MatchCanceledError  extends GameError {}
class NotImplementedError extends GameError {}

// GameError > IllegalMoveError
class IllegalBareoffError   extends IllegalMoveError {}
class MayNotBearoffError    extends IllegalMoveError {}
class MoveOutOfRangeError   extends IllegalMoveError {}
class MovesRemainingError   extends IllegalMoveError {}
class NoMovesMadeError      extends IllegalMoveError {}
class NoMovesRemainingError extends IllegalMoveError {}
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
class TurnAlreadyFinishedError extends IllegalStateError {}
class TurnCanceledError        extends IllegalStateError {}
class TurnNotFinishedError     extends IllegalStateError {}

// MenuError
class ResetKeyNotEnteredError extends MenuError {}
class WaitingAbortedError     extends MenuError {}

// RequestError
class HandshakeError          extends RequestError {}
class MatchAlreadyExistsError extends RequestError {}
class MatchAlreadyJoinedError extends RequestError {}
class MatchNotFoundError      extends RequestError {}
class NotYourTurnError        extends RequestError {}
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
  , CircularDependencyError
  , ClientError
  , ConnectionClosedError
  , DependencyError
  , DoubleNotAllowedError
  , DuplicateColumnError
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
  , IncompatibleKeysError
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
  , NotYourTurnError
  , OccupiedSlotError
  , PieceOnBarError
  , RequestError
  , ResetKeyNotEnteredError
  , RobotError
  , StyleError
  , ThemeConfigError
  , ThemeError
  , ThemeExistsError
  , ThemeNotFoundError
  , TurnCanceledError
  , TurnAlreadyFinishedError
  , TurnNotFinishedError
  , UndecidedMoveError
  , UnresolvedDependencyError
  , ValidateError
  , WaitingAbortedError
}

module.exports = Errors