const Core = require('./core')

const {
    Colors
  , Direction
  , Opponent
  , OriginPoints
  , OutsideOrigins
  , PointOrigins
  , Profiler
} = Core

const {Red, White} = Colors
const {IllegalStateError} = Core.Errors

const CacheKeys = {}

function populateCacheKeys(keys) {

    const atomicKeys = [
        'isDisengaged'
    ]

    atomicKeys.forEach(key => keys[key] = key)

    const colorKeys = [
        'blotOrigins'
      , 'maxOriginOccupied'
      , 'maxPointOccupied'
      , 'mayBearoff'
      , 'minOriginOccupied'
      , 'minPointOccupied'
      , 'originsHeld'
      , 'originsHeldMap'
      , 'originsOccupied'
      , 'pipCount'
      , 'pointsHeld'
      , 'pointsOccupied'
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
class BoardAnalyzer {

    constructor(board) {
        this.board = board
        this.cache = {}
    }

    occupiesOrigin(color, origin) {
        const slot = this.board.slots[origin]
        return slot[0] && slot[0].color == color
    }

    canOccupyOrigin(color, origin) {
        const slot = this.board.slots[origin]
        return slot.length < 2 || slot[0].color == color
    }

    originOccupier(origin) {
        const slot = this.board.slots[origin]
        if (slot[0]) {
            return slot[0].color
        }
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

    // @cache
    originsOccupied(color) {
        Profiler.start('BoardAnalyzer.originsOccupied')
        const key = CacheKeys.originsOccupied[color]
        if (!this.cache[key]) {
            Profiler.inc('board.originsOccupied.cache.miss')
            const minKey = CacheKeys.minOriginOccupied[color]
            const maxKey = CacheKeys.maxOriginOccupied[color]
            const origins = []
            var minOrigin = Infinity
            var maxOrigin = -Infinity
            for (var i = 0; i < 24; ++i) {
                var slot = this.board.slots[i]
                if (slot[0] && slot[0].color == color) {
                    origins.push(i)
                    if (i < minOrigin) {
                        minOrigin = i
                    }
                    if (i > maxOrigin) {
                        maxOrigin = i
                    }
                }
            }
            this.cache[key] = origins
            this.cache[minKey] = minOrigin
            this.cache[maxKey] = maxOrigin
        } else {
            Profiler.inc('board.originsOccupied.cache.hit')
        }
        Profiler.stop('BoardAnalyzer.originsOccupied')
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
    minOriginOccupied(color) {
        const key = CacheKeys.minOriginOccupied[color]
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

    piecesOnOrigin(color, origin) {
        return this.occupiesOrigin(color, origin) ? this.board.slots[origin].length : 0
    }

    hasBar(color) {
        return this.board.bars[color].length > 0
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

    isAllHome(color) {
        return this.board.homes[color].length == 15
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
    originsHeldMap(color) {
        const key = CacheKeys.originsHeldMap[color]
        if (!this.cache[key]) {
            const origins = this.originsHeld(color)
            const originsMap = {}
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                originsMap[origins[i]] = true
            }
            this.cache[key] = originsMap
        }
        return this.cache[key]
    }

    // Two or more pieces
    // @cache
    pointsHeld(color) {
        const key = CacheKeys.pointsHeld[color]
        if (!this.cache[key]) {
            const points = []
            const origins = this.originsHeld(color)
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
        }
        return this.cache[key]
    }

    piecesHome(color) {
        return this.board.homes[color].length
    }

    piecesOnBar(color) {
        return this.board.bars[color].length
    }

    piecesOnPoint(color, point) {
        const slot = this.board.slots[PointOrigins[color][point]]
        return (slot[0] && slot[0].color == color) ? slot.length : 0
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

    // @cache
    blotOrigins(color) {
        Profiler.start('BoardAnalyzer.blotOrigins')
        const key = CacheKeys.blotOrigins[color]
        if (!this.cache[key]) {
            const origins = this.originsOccupied(color)
            const blotOrigins = []
            for (var i = 0, ilen = origins.length; i < ilen; ++i) {
                var origin = origins[i]
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

        try {
            const blots = []

            const blotOrigins = this.blotOrigins(color)
            const blotPointCount = blotOrigins.length

            if (blotPointCount == 0) {
                return blots
            }

            Profiler.start('BoardAnalyzer.blots.prep')
            const {blotPoints, pointsWithOpponent} = this._blotsPrep(color, blotOrigins)
            const opponentCount = pointsWithOpponent.length
            const minPointWithOpponent = pointsWithOpponent[opponentCount - 1]
            var maxPointWithOpponent = pointsWithOpponent[0]
            Profiler.stop('BoardAnalyzer.blots.prep')

            if (opponentCount == 0 && !isIncludeAll) {
                // this shouldn't happen in a real game
                return blots
            }

            var minOpponentIndex = 0
            Profiler.start('BoardAnalyzer.blots.process')

            for (var i = 0; i < blotPointCount; ++i) {

                var point = blotPoints[i]

                if (!isIncludeAll) {
                    if (point < minPointWithOpponent) {
                        break
                    }
                    // distanceToMax
                    if (point - maxPointWithOpponent > 11) {
                        continue
                    }
                    // distanceToMin
                    if (point - minPointWithOpponent < 0) {
                        continue
                    }
                }

                var origin = PointOrigins[color][point]

                var minDistance = Infinity
                var directCount = 0
                var indirectCount = 0
                
                if (point > minPointWithOpponent) {
                    // calculate attacker distance, direct/indirect shots
                    Profiler.start('BoardAnalyzer.blots.process.inner')
                    if (minOpponentIndex > 0 && minOpponentIndex < opponentCount) {
                        Profiler.inc('blots.opponent.point.skipped.minIndex', minOpponentIndex)
                    }

                    for (var j = minOpponentIndex; j < opponentCount; ++j) {

                        Profiler.inc('blots.opponent.point.process')

                        var opposer = pointsWithOpponent[j]

                        if (opposer > point) {
                            minOpponentIndex = j + 1
                            if (minOpponentIndex < opponentCount) {
                                maxPointWithOpponent = pointsWithOpponent[minOpponentIndex]
                            }
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
                    Profiler.stop('BoardAnalyzer.blots.process.inner')
                } else {
                    Profiler.inc('blots.point.disengaged')
                }

                if (!isIncludeAll && minDistance > 11) {
                    Profiler.inc('blots.point.attacker.notFound')
                    continue
                }

                blots.push({
                    point
                  , origin
                  , minDistance
                  , directCount
                  , indirectCount
                })
            }

            Profiler.stop('BoardAnalyzer.blots.process')
            Profiler.inc('blots.found', blots.length)

            return blots

        } finally {
            Profiler.stop('BoardAnalyzer.blots')
        }
    }

    _blotsPrep(color, blotOrigins) {
        const blotPoints = []
        const blotOriginCount = blotOrigins.length
        // opponent points are relative to this color, not the opponent's color
        const pointsWithOpponent = []
        const opponentOrigins = this.originsOccupied(Opponent[color])
        const opponentCount = opponentOrigins.length

        // create pre-sorted
        if (color == Red) {
            for (var i = blotOriginCount - 1; i >= 0; --i) {
                blotPoints.push(OriginPoints[color][blotOrigins[i]])
            }
            for (var p = opponentCount - 1; p >= 0; --p) {
                pointsWithOpponent.push(OriginPoints[color][opponentOrigins[p]])
            }
        } else {
            for (var i = 0; i < blotOriginCount; ++i) {
                blotPoints.push(OriginPoints[color][blotOrigins[i]])
            }
            for (var p = 0, plen = opponentCount; p < plen; ++p) {
                pointsWithOpponent.push(OriginPoints[color][opponentOrigins[p]])
            }
        }
        if (this.hasBar(Opponent[color])) {
            pointsWithOpponent.push(0)
        }
        return {blotPoints, pointsWithOpponent}
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

    // get the color of the nth piece on the given origin, if any.
    // used in terminal drawing.
    nthPieceOnOrigin(origin, n) {
        const piece = this.board.slots[origin][n]
        if (piece) {
            return piece.color
        }
    }

    // Red point 1 is origin 0
    // White point 1 is origin 23
    pointOrigin(color, point) {
        return PointOrigins[color][point]
    }

    // Red origin 0 is point 1
    // White origin 0 is point 24
    originPoint(color, origin) {
        return OriginPoints[color][origin]
    }

    validateLegalBoard() {
        BoardAnalyzer.validateLegalBoard(this.board)
    }

    static validateLegalBoard(board) {
        if (board.slots.length != 24) {
            throw new IllegalStateError('Board has ' + board.slots.length + ' slots')
        }
        const counts = {
            Red   : 0
          , White : 0
        }
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

module.exports = BoardAnalyzer