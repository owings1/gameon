/**
 * gameon - Constants class
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
const chalk = require('chalk')

const White = 'White'
const Red   = 'Red'

const Colors = {White, Red}

const ColorAbbr = {
    White : 'W'
  , Red   : 'R'
}

const ColorNorm = {
    White
  , Red
  , W : White
  , R : Red
}

const Direction = {
    White : 1
  , Red   : -1
}

const Opponent = {
    White : Red
  , Red   : White
}

const InsideOrigins = {
    White : [ 18, 19, 20, 21, 22, 23 ]
  , Red   : [ 5, 4, 3, 2, 1, 0 ]
}

const OutsideOrigins = {
    White : [
       0,  1,  2,  3,  4,  5,  6,
       7,  8,  9, 10, 11, 12, 13,
      14, 15, 16, 17
    ]
  , Red   : [
      23, 22, 21, 20, 19, 18, 17,
      16, 15, 14, 13, 12, 11, 10,
       9,  8,  7,  6
    ]
}

const TopPoints = [
  13, 14, 15, 16, 17,
  18, 19, 20, 21, 22,
  23, 24
]
const BottomPoints = [
  12, 11, 10, 9, 8,
   7,  6,  5, 4, 3,
   2,  1
]

const PointOrigins = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}
const OriginPoints = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}

function populatePointsAndOrigins(pointOrigins, originPoints) {
    for (var origin = 0; origin < 24; ++origin) {
        // Origins are from 0 to 23
        // Points are from 1 to 24
        var point = origin + 1
        // Red point 1 is origin 0
        pointOrigins.Red[point] = point - 1
        // White point 1 is origin 23
        pointOrigins.White[point] = 24 - point
        // Red origin 0 is point 1
        originPoints.Red[origin] = origin + 1
        // White origin 0 is point 24
        originPoints.White[origin] = 24 - origin
    }
}

populatePointsAndOrigins(PointOrigins, OriginPoints)

const MoveHashes = {}
const MoveCoords = {}

function populateMoveHashesCoords(hashes, coords) {
    const faces = [ 1, 2, 3, 4, 5, 6 ]
    for (var origin = -1; origin < 24; ++origin) {
        hashes[origin] = {}
        coords[origin] = {}
        faces.forEach(face => {
            hashes[origin][face] = origin + ':' + face
            coords[origin][face] = {origin, face}
        })
    }
}

populateMoveHashesCoords(MoveHashes, MoveCoords)

const BoardStrings = {
    Initial: '0|0|2:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0'
}

const Draw = {
    Chars : {
        topLeft      : '\u250f'
      , topMid       : '\u2533'
      , topRight     : '\u2513'
      , midLeft      : ''  // TODO
      , sep          : '\u2503'
      , dblSep       : '\u2503\u2503'
      , midRight     : ''  // TODO
      , botLeft      : '\u2517'
      , botMiddle    : '\u253b'
      , botRight     : '\u251b'
      , dash         : '\u2501'
      , pip          : 'PIP'
      , crawford     : 'CR'
      , pts          : 'pts'
      , empty        : ''
      , slash        : '/'
      , sp           : ' '
      , dblSp        : '  '
      , br           : '\n'
      , die          :  {
            1  : '\u2680'
          , 2  : '\u2681'
          , 3  : '\u2682'
          , 4  : '\u2683'
          , 5  : '\u2684'
          , 6  : '\u2685'
        }
    }
  , ChalkColorFor : {
        Red   : 'red'
     ,  White : 'white'
    }
  , Shorts : {
        Red   : chalk.bold.red('R')
      , White : chalk.bold.white('W')
      , R     : chalk.bold.red('R')
      , W     : chalk.bold.white('W')
    }
  , PadFixed   : 4
  , MidFixed   : 1
  , RightFixed : 10
}
Draw.TopBorder    = Draw.Chars.topLeft.padEnd(12 * Draw.PadFixed + 2 + 4, Draw.Chars.dash) + Draw.Chars.topRight
Draw.BottomBorder = Draw.Chars.botLeft.padEnd(12 * Draw.PadFixed + 2 + 4, Draw.Chars.dash) + Draw.Chars.botRight

const Constants = {
    BoardStrings
  , BottomPoints
  , ColorAbbr
  , ColorNorm
  , Colors
  , Direction
  , Draw
  , InsideOrigins
  , MoveCoords
  , MoveHashes
  , Opponent
  , OriginPoints
  , OutsideOrigins
  , PointOrigins
  , Red
  , TopPoints
  , White
}

module.exports = Constants