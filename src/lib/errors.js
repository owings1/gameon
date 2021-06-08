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
class GameError extends Error {

    constructor(message, ...args) {
        if (Array.isArray(message)) {
            message = message.join(' ')
        }
        super(message, ...args)
        this.name = this.constructor.name
        this.isGameError = true
    }
}


class IllegalStateError extends GameError {
    constructor(...args) {
        super(...args)
        this.isIllegalStateError = true
    }
}

class IllegalMoveError extends GameError {

    constructor(...args) {
        super(...args)
        this.isIllegalMoveError = true
    }
}

class ArgumentError       extends GameError {}
class InvalidRollError    extends GameError {}
class MatchCanceledError  extends GameError {}
class NotImplementedError extends GameError {}

class InvalidColorError     extends ArgumentError {}
class MaxDepthExceededError extends ArgumentError {}

class AlreadyRolledError        extends IllegalStateError {}
class DoubleNotAllowedError     extends IllegalStateError {}
class HasNotDoubledError        extends IllegalStateError {}
class HasNotRolledError         extends IllegalStateError {}
class GameAlreadyStartedError   extends IllegalStateError {}
class GameFinishedError         extends IllegalStateError {}
class GameNotFinishedError      extends IllegalStateError {}
class GameNotStartedError       extends IllegalStateError {}
class MatchFinishedError        extends IllegalStateError {}
class TurnAlreadyFinishedError  extends IllegalStateError {}
class TurnNotFinishedError      extends IllegalStateError {}

class IllegalBareoffError    extends IllegalMoveError {}
class MayNotBearoffError     extends IllegalMoveError {}
class MoveOutOfRangeError    extends IllegalMoveError {}
class MovesRemainingError    extends IllegalMoveError {}
class NoMovesMadeError       extends IllegalMoveError {}
class NoMovesRemainingError  extends IllegalMoveError {}
class NoPieceOnBarError      extends IllegalMoveError {}
class NoPieceOnSlotError     extends IllegalMoveError {}
class OccupiedSlotError      extends IllegalMoveError {}
class PieceOnBarError        extends IllegalMoveError {}

module.exports = {
    AlreadyRolledError
  , ArgumentError
  , DoubleNotAllowedError
  , GameAlreadyStartedError
  , GameError
  , GameFinishedError
  , GameNotFinishedError
  , GameNotStartedError
  , HasNotDoubledError
  , HasNotRolledError
  , IllegalBareoffError
  , IllegalMoveError
  , IllegalStateError
  , InvalidColorError
  , InvalidRollError
  , MatchCanceledError
  , MatchFinishedError
  , MaxDepthExceededError
  , MayNotBearoffError
  , MoveOutOfRangeError
  , MovesRemainingError
  , NoMovesMadeError
  , NoMovesRemainingError
  , NoPieceOnBarError
  , NoPieceOnSlotError
  , NotImplementedError
  , OccupiedSlotError
  , PieceOnBarError
  , TurnAlreadyFinishedError
  , TurnNotFinishedError
}