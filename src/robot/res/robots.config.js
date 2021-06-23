/**
 * gameon - Robots config
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
const KnownRobots = {
    BearoffRobot   : {
        filename : 'bearoff'
      , defaults : {
            moveWeight   : 0.6
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , FirstTurnRobot : {
        filename : 'first-turn'
      , defaults : {
            moveWeight   : 1.0
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , HittingRobot   : {
        filename    : 'hitting'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.4
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , OccupyRobot    : {
        filename    : 'occupy'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.45
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , PrimeRobot     : {
        filename    : 'prime'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.55
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , RandomRobot    : {
        filename : 'random'
      , defaults : {
            moveWeight   : 0
          , doubleWeight : 0
          , version      : 'v1'
        }
    }
  , RunningRobot   : {
        filename    : 'running'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.44
          , doubleWeight : 0
          , version      : 'v1'
        }   
    }
  , SafetyRobot    : {
        filename    : 'safety'
      , isCalibrate : true
      , defaults : {
            moveWeight   : 0.5
          , doubleWeight : 0
          , version      : 'v2'
        }   
    }
  , DoubleRobot    : {
        filename   : 'double'
      , defaults   : {
            moveWeight   : 0
          , doubleWeight : 1
          , version      : 'v1'
        }
    }
}

module.exports = {
    KnownRobots
}