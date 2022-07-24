/**
 * gameon - BoardAnalyzer class
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
import {
    Red,
    White,
    Direction,
    Opponent,
    OriginPoints,
    OutsideOrigins,
    PointOrigins,
} from './contants.js'

import {DefaultProfiler as Profiler} from './util/profiler.js'
import {IllegalStateError} from './errors.js'

const CacheKeys = {}

function populateCacheKeys(keys) {

    const atomicKeys = [
        'isDisengaged'
    ]

    atomicKeys.forEach(key => keys[key] = key)

    const colorKeys = [
        'blotOrigins',
        'maxOriginOccupied',
        'maxPointOccupied',
        'mayBearoff',
        'minOriginOccupied',
        'minPointOccupied',
        'originsHeld',
        'originsOccupied',
        'pipCount',
        'pointsHeld',
        'pointsOccupied',
    ]

    colorKeys.forEach(key => {
        keys[key] = {
            Red   : key + '.' + Red
          , White : key + '.' + White
        }
    })
}

populateCacheKeys(CacheKeys)

// NB: Caching methods return a reference for performance. Callers must make a copy
///    if they will modify the result
export default class BoardAnalyzer {

    constructor(board) {
        this.board = board
        this.cache = {}
    }

    // @cache
    blotOrigins(color) {
        Profiler.start('BoardAnalyzer.blotOrigins')
        const key = CacheKeys.blotOrigins[color]
        if (!this.cache[key]) {
            const origins = this.originsOccupied(color)
            const blotOrigins = []
            for (let i = 0, ilen = origins.length; i < ilen; ++i) {
                const origin = origins[i]
                if (this.board.slots[origin].length == 1) {
                    blotOrigins.push(origin)
                }
            }
            this.cache[key] = blotOrigins
        }
        Profiler.stop('BoardAnalyzer.blotOrigins')
        return this.cache[key]
    }

    // Not cached, since it is currently only called once by SafetyRobot
    blots(color, isIncludeAll = true) {
        Profiler.start('BoardAnalyzer.blots')
        const blots = BlotHelper.blots(this, color, isIncludeAll)
        Profiler.stop('BoardAnalyzer.blots')
        return blots
    }

    canOccupyOrigin(color, origin) {
        const slot = this.board.slots[origin]
        return slot.length < 2 || slot[0].color == color
    }

    hasBar(color) {
        return this.board.bars[color].length > 0
    }

    // To check for bearing off for less than a face value
    // No cache
    hasPieceBehind(color, origin) {

        if (Direction[color] == 1) {
            var start = 0
            var end   = origin - 1
        } else {
            var start = origin + 1
            var end   = 23
        }
        for (var i = start; i <= end; ++i) {
            if (this.board.slots[i][0] && this.board.slots[i][0].color == color) {
                return true
            }
        }
        return false
        /*
        if (color == White) {
            // for white, point 1 is origin 23, so we are looking for the min
            return this.minOriginOccupied(color) < origin
        }
        // for red point 1 is origin 0, so we are looking for the max
        return this.maxOriginOccupied(color) > origin
        */
    }

    isAllHome(color) {
        return this.board.homes[color].length == 15
    }

    // This function is relatively fast, but we cache since several robots use it.
    // @cache
    isDisengaged() {
        //Profiler.start('BoardAnalyzer.isDisengaged')
        const key = CacheKeys.isDisengaged
        if (!(key in this.cache)) {
            if (this.board.hasWinner()) {
                var isDisengaged = true
            } else if (this.hasBar(White) || this.hasBar(Red)) {
                var isDisengaged = false
            } else {
                const originsRed = this.originsOccupied(Red)
                const originsWhite = this.originsOccupied(White)
                const backmostRed = originsRed.length ? originsRed[originsRed.length - 1] : -Infinity
                const backmostWhite = originsWhite.length ? originsWhite[0] : Infinity
                var isDisengaged = backmostWhite > backmostRed
            }
            this.cache[key] = isDisengaged
        }
        //Profiler.stop('BoardAnalyzer.isDisengaged')
        return this.cache[key]
    }

    // @cache
    maxOriginOccupied(color) {
        const key = CacheKeys.maxOriginOccupied[color]
        if (!(key in this.cache)) {
            // will populate
            this.originsOccupied(color)
        }
        return this.cache[key]
    }

    // @cache
    maxPointOccupied(color) {
        const key = CacheKeys.maxPointOccupied[color]
        if (!(key in this.cache)) {
            if (color == White) {
                var origin = this.minOriginOccupied(color)
                if (origin == Infinity) {
                    this.cache[key] = -Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            } else {
                var origin = this.maxOriginOccupied(color)
                if (origin == -Infinity) {
                    this.cache[key] = -Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            }
        }
        return this.cache[key]
    }

    // @cache
    mayBearoff(color) {
        Profiler.start('BoardAnalyzer.mayBearoff')
        const key = CacheKeys.mayBearoff[color]
        if (!(key in this.cache)) {
            Profiler.inc('board.mayBearoff.cache.miss')
            var isAble = !this.hasBar(color)
            if (isAble) {
                const maxKey = CacheKeys.maxPointOccupied[color]
                if (maxKey in this.cache) {
                    Profiler.inc('board.mayBearoff.cache.maxPoint.hit')
                    isAble = this.cache[maxKey] < 7
                } else {
                    Profiler.inc('board.mayBearoff.cache.maxPoint.miss')
                    for (var i = 0; i < 18; ++i) {
                        var piece = this.board.slots[OutsideOrigins[color][i]][0]
                        if (piece && piece.color == color) {
                            isAble = false
                            break
                        }
                    }
                }
            }
            this.cache[key] = isAble
        } else {
            Profiler.inc('board.mayBearoff.cache.hit')
        }
        Profiler.stop('BoardAnalyzer.mayBearoff')
        return this.cache[key]
    }

    // @cache
    minOriginOccupied(color) {
        const key = CacheKeys.minOriginOccupied[color]
        if (!(key in this.cache)) {
            // will populate
            this.originsOccupied(color)
        }
        return this.cache[key]
    }

    // @cache
    minPointOccupied(color) {
        const key = CacheKeys.minPointOccupied[color]
        if (!(key in this.cache)) {
            if (color == White) {
                var origin = this.maxOriginOccupied(color)
                if (origin == -Infinity) {
                    this.cache[key] = Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            } else {
                var origin = this.minOriginOccupied(color)
                if (origin == Infinity) {
                    this.cache[key] = Infinity
                } else {
                    this.cache[key] = OriginPoints[color][origin]
                }
            }
        }
        return this.cache[key]
    }

    // get the color of the nth piece on the given origin, if any.
    // used in terminal drawing.
    nthPieceOnOrigin(origin, n) {
        const piece = this.board.slots[origin][n]
        if (piece) {
            return piece.color
        }
    }

    occupiesOrigin(color, origin) {
        const slot = this.board.slots[origin]
        return slot[0] && slot[0].color == color
    }

    originOccupier(origin) {
        const slot = this.board.slots[origin]
        if (slot[0]) {
            return slot[0].color
        }
        return null
    }

    // Two or more pieces
    // @cache
    originsHeld(color) {
        //Profiler.start('BoardAnalyzer.originsHeld')
        const key = CacheKeys.originsHeld[color]
        if (!this.cache[key]) {
            const origins = []
            for (var i = 0; i < 24; ++i) {
                var slot = this.board.slots[i]
                if (slot.length > 1 && slot[0].color == color) {
                    origins.push(i)
                }
            }
            this.cache[key] = origins
        }
        //Profiler.stop('BoardAnalyzer.originsHeld')
        return this.cache[key]
    }

    // @cache
    originsOccupied(color) {
        Profiler.start('BoardAnalyzer.originsOccupied')
        const key = CacheKeys.originsOccupied[color]
        if (!this.cache[key]) {
            Profiler.inc('board.originsOccupied.cache.miss')
            const minKey = CacheKeys.minOriginOccupied[color]
            const maxKey = CacheKeys.maxOriginOccupied[color]
            const origins = []
            for (var i = 0; i < 24; ++i) {
                var slot = this.board.slots[i]
                if (slot[0] && slot[0].color == color) {
                    origins.push(i)
                }
            }
            this.cache[key] = origins
            if (origins.length) {
                this.cache[minKey] = origins[0]
                this.cache[maxKey] = origins[origins.length - 1]
            } else {
                this.cache[minKey] = Infinity
                this.cache[maxKey] = -Infinity
            }
        } else {
            Profiler.inc('board.originsOccupied.cache.hit')
        }
        Profiler.stop('BoardAnalyzer.originsOccupied')
        return this.cache[key]
    }

    piecesHome(color) {
        return this.board.homes[color].length
    }

    piecesOnBar(color) {
        return this.board.bars[color].length
    }

    piecesOnOrigin(color, origin) {
        return this.occupiesOrigin(color, origin) ? this.board.slots[origin].length : 0
    }

    piecesOnPoint(color, point) {
        return this.piecesOnOrigin(color, PointOrigins[color][point])
    }

    // @cache
    pipCount(color) {
        const key = CacheKeys.pipCount[color]
        if (!(key in this.cache)) {
            var count = this.board.bars[color].length * 25
            const points = this.pointsOccupied(color)
            for (var i = 0, ilen = points.length; i < ilen; ++i) {
                count += this.piecesOnPoint(color, points[i]) * points[i]
            }
            this.cache[key] = count
        }
        return this.cache[key]
    }

    pipCounts() {
        return {
            White : this.pipCount(White)
          , Red   : this.pipCount(Red)
        }
    }

    // Two or more pieces
    // @cache
    pointsHeld(color) {
        const key = CacheKeys.pointsHeld[color]
        if (!this.cache[key]) {
            const points = []
            const origins = this.originsHeld(color)
            // create pre-sorted
            if (color == Red) {
                for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                    points.push(OriginPoints[color][origins[i]])
                }
            } else {
                for (var i = origins.length - 1; i >= 0; --i) {
                    points.push(OriginPoints[color][origins[i]])
                }
            }
            this.cache[key] = points
        }
        return this.cache[key]
    }

    // One or more pieces
    // @cache
    pointsOccupied(color) {
        //Profiler.start('BoardAnalyzer.pointsOccupied')
        const key = CacheKeys.pointsOccupied[color]
        if (!this.cache[key]) {
            //Profiler.start('BoardAnalyzer.pointsOccupied.1')
            const points = []
            const origins = this.originsOccupied(color)
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                // create pre-sorted
                if (color == Red) {
                    // Origin 0 is Red point 1
                    points.push(OriginPoints[color][origins[i]])
                } else {
                    // Origin 0 is White point 24
                    points.unshift(OriginPoints[color][origins[i]])
                }
            }
            this.cache[key] = points
            //Profiler.stop('BoardAnalyzer.pointsOccupied.1')
        }
        //Profiler.stop('BoardAnalyzer.pointsOccupied')
        return this.cache[key]
    }

    // Not cached, since it is currently only called once by PrimeRobot
    primes(color) {
        //Profiler.start('BoardAnalyzer.primes')
        // NB: make a copy, so we can modify
        const pointsHeld = this.pointsHeld(color).slice(0)
        const primes = []
        while (pointsHeld.length > 1) {
            var pointStart = pointsHeld.shift()
            var pointEnd = pointStart
            while (pointsHeld[0] == pointEnd + 1) {
                pointEnd = pointsHeld.shift()
            }
            if (pointEnd > pointStart) {
                primes.push({
                    pointStart
                  , pointEnd
                  , start : PointOrigins[color][pointStart]
                  , end   : PointOrigins[color][pointEnd]
                  , size  : pointEnd - pointStart + 1
                })
            }
        }
        //Profiler.stop('BoardAnalyzer.primes')
        return primes
    }

    statOrigin(origin) {
        const slot = this.board.slots[origin]
        const stat = {count: slot.length}
        if (slot[0]) {
            stat.color = slot[0].color
        }
        return stat
    }

    statPoint(color, point) {
        return this.statOrigin(PointOrigins[color][point])
    }

    validateLegalBoard() {
        BoardAnalyzer.validateLegalBoard(this.board)
    }

    static validateLegalBoard(board) {
        if (board.slots.length != 24) {
            throw new IllegalStateError('Board has ' + board.slots.length + ' slots')
        }
        const counts = {Red: 0, White: 0}
        for (var i = 0; i < 24; ++i) {
            var slot = board.slots[i]
            var slotColor = null
            for (var p = 0; p < slot.length; ++p) {
                var piece = slot[p]
                if (slotColor && slotColor != piece.color) {
                    throw new IllegalStateError('Different colors on origin ' + i)
                }
                if (!(piece.color in counts)) {
                    throw new IllegalStateError('Invalid piece color: ' + piece.color)
                }
                slotColor = piece.color
                counts[piece.color] += 1
            }
        }
        for (var color in counts) {
            for (var p = 0; p < board.homes[color].length; ++p) {
                var piece = board.homes[color][p]
                if (piece.color != color) {
                    throw new IllegalStateError(color + ' home has ' + piece.color + ' piece')
                }
                counts[color] += 1
            }
            for (var p = 0; p < board.bars[color].length; ++p) {
                var piece = board.bars[color][p]
                if (piece.color != color) {
                    throw new IllegalStateError(color + ' bar has ' + piece.color + ' piece')
                }
                counts[color] += 1
            }
            if (counts[color] != 15) {
                throw new IllegalStateError(color + ' has ' + counts[color] + ' pieces on the board')
            }
        }
        if (board.homes.Red.length == 15 && board.homes.White.length == 15) {
            throw new IllegalStateError('both colors have 15 on home')
        }
        if (board.bars.Red.length == 15 && board.bars.White.length == 15) {
            throw new IllegalStateError('both colors have 15 on the bar')
        }
    }
}

class BlotHelper {

    static blots(analyzer, color, isIncludeAll) {

        const blots = []

        const origins = analyzer.blotOrigins(color)

        if (!origins.length) {
            return blots
        }

        Profiler.start('BlotHelper.prep')
        const {points, opposers} = BlotHelper._prep(analyzer, color, origins)
        Profiler.stop('BlotHelper.prep')

        if (!opposers.length && !isIncludeAll) {
            // this shouldn't happen in a real game
            return blots
        }

        const opposerCount = opposers.length
        const minOpposer = opposers[opposerCount - 1]

        Profiler.start('BlotHelper.process')

        var maxOpposerMinIndex = 0

        for (var i = 0, ilen = points.length; i < ilen; ++i) {

            var point = points[i]
            var maxOpposer = opposers[maxOpposerMinIndex]

            if (!isIncludeAll) {
                // distanceToMin
                if (point < minOpposer) {
                    break
                }
                // distanceToMax
                if (point - maxOpposer > 11) {
                    continue
                }
            }

            var minDistance = Infinity
            var directCount = 0
            var indirectCount = 0
            
            if (point > minOpposer) {
                // calculate attacker distance, direct/indirect shots
                Profiler.start('BlotHelper.process.inner')

                for (var j = maxOpposerMinIndex; j < opposerCount; ++j) {

                    Profiler.inc('blots.opponent.point.process')

                    var opposer = opposers[j]

                    if (opposer > point) {
                        // update maxOpposerMinIndex
                        maxOpposerMinIndex = j + 1
                        Profiler.inc('blots.opponent.point.disengaged')
                        continue
                    }

                    var distance = point - opposer

                    if (distance < minDistance) {
                        minDistance = distance
                    }
                    if (distance < 7) {
                        directCount += 1
                    } else if (distance < 12) {
                        indirectCount += 1
                    } else {
                        break
                    }
                }
                Profiler.stop('BlotHelper.process.inner')
            } else {
                Profiler.inc('blots.point.disengaged')
            }

            if (minDistance > 11 && !isIncludeAll) {
                Profiler.inc('blots.point.attacker.notFound')
                continue
            }

            blots.push({
                origin : PointOrigins[color][point]
              , point
              , minDistance
              , directCount
              , indirectCount
            })
        }

        Profiler.stop('BlotHelper.process')
        Profiler.inc('blots.found', blots.length)

        return blots
    }

    static _prep(analyzer, color, origins) {

        // opponent points are relative to this color, not the opponent's color
        const opposers = []
        const opponentOrigins = analyzer.originsOccupied(Opponent[color])
        const points = []
        // create pre-sorted
        if (color == Red) {
            for (var i = origins.length - 1; i >= 0; --i) {
                points.push(OriginPoints[color][origins[i]])
            }
            for (var p = opponentOrigins.length - 1; p >= 0; --p) {
                opposers.push(OriginPoints[color][opponentOrigins[p]])
            }
        } else {
            for (var i = 0; i < origins.length; ++i) {
                points.push(OriginPoints[color][origins[i]])
            }
            for (var p = 0, plen = opponentOrigins.length; p < plen; ++p) {
                opposers.push(OriginPoints[color][opponentOrigins[p]])
            }
        }
        if (analyzer.hasBar(Opponent[color])) {
            opposers.push(0)
        }
        return {points, opposers}
    }
}
