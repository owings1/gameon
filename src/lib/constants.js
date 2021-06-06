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
const Util = require('./util')
const {intRange} = Util

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
    White : intRange(18, 23)
  , Red   : intRange(0, 5).reverse()
}

const OutsideOrigins = {
    White : intRange(0, 17)
  , Red   : intRange(6, 23).reverse()
}

const PointOrigins = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}
const OriginPoints = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}

function populatePointsAndOrigins(pointOrigins, originPoints) {
    intRange(0, 23).forEach(origin => {
        // Origins are from 0 to 23
        // Points are from 1 to 24
        const point = origin + 1
        // Red point 1 is origin 0
        pointOrigins.Red[point] = point - 1
        // White point 1 is origin 23
        pointOrigins.White[point] = 24 - point
        // Red origin 0 is point 1
        originPoints.Red[origin] = origin + 1
        // White origin 0 is point 24
        originPoints.White[origin] = 24 - origin
    })
}

populatePointsAndOrigins(PointOrigins, OriginPoints)

const MoveHashes = {}
const MoveCoords = {}

function populateMoveHashesCoords(hashes, coords) {
    const faces = intRange(1, 6)
    intRange(-1, 23).forEach(origin => {
        hashes[origin] = {}
        coords[origin] = {}
        faces.forEach(face => {
            hashes[origin][face] = origin + ':' + face
            coords[origin][face] = {origin, face}
        })
    })
}

populateMoveHashesCoords(MoveHashes, MoveCoords)

const Constants = {
    Red
  , White
  , Colors
  , ColorAbbr
  , ColorNorm
  , Direction
  , Opponent
  , InsideOrigins
  , OutsideOrigins
  , PointOrigins
  , OriginPoints
  , MoveHashes
  , MoveCoords
}
module.exports = Constants