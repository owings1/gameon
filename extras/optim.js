/*
// Performance optimized
getPossibleMovesForFace(color, face) {
    Profiler.start('Board.getPossibleMovesForFace')
    const moves = []
    if (this.analyzer.hasBar(color)) {
        Profiler.start('Board.getPossibleMovesForFace.1')
        var {check, build} = this.checkMove(color, -1, face)
        if (check === true) {
            moves.push(new build.class(...build.args))
        }
        Profiler.stop('Board.getPossibleMovesForFace.1')
    } else {

        Profiler.start('Board.getPossibleMovesForFace.2')

        const {analyzer} = this

        const origins     = analyzer.originsOccupied(color)
        const mayBearoff  = analyzer.mayBearoff(color)
        const maxPoint    = analyzer.maxPointOccupied(color)
        const unavailable = analyzer.originsHeldMap(Opponent[color])

        Profiler.stop('Board.getPossibleMovesForFace.2')

        Profiler.start('Board.getPossibleMovesForFace.3')

        for (var i = 0, ilen = origins.length; i < ilen; ++i) {

            var origin = origins[i]
            var point = OriginPoints[color][origin]

            // Apply quick filters for performance

            // filter bearoff moves
            if (point <= face) {
                if (!mayBearoff) {
                    continue
                }
                if (point < face) {
                    if (point < maxPoint) {
                        continue
                    }
                }
                moves.push(new BearoffMove(this, color, origin, face, true))
            } else {
                // filter opponent points held
                var dest = origin + face * Direction[color]
                if (unavailable[dest]) {
                    continue
                }
                moves.push(new RegularMove(this, color, origin, face, true))
            }
            // We already filtered all the invalid moves, so we don't need to call checkMove
        }
        Profiler.stop('Board.getPossibleMovesForFace.3')
    }

    Profiler.stop('Board.getPossibleMovesForFace')

    return moves
}
*/

/*
// @cache
originsOccupied(color) {
    Profiler.start('BoardAnalyzer.originsOccupied')
    const key = CacheKeys.originsOccupied[color]
    if (!this.cache[key]) {
        Profiler.inc('board.originsOccupied.cache.miss')
        const data = {}
        for (var c in Colors) {
            data[c] = {origins: [], points: [], held: [], heldMap: {}, pointsHeld: [], min: Infinity, max: -Infinity, minPoint: Infinity, maxPoint: -Infinity}
        }
        for (var i = 0; i < 24; ++i) {
            var slot = this.board.slots[i]
            if (!slot[0]) {
                continue
            }
            var oColor = slot[0].color
            var point = OriginPoints[oColor][i]
            var d = data[oColor]
            d.origins.push(i)
            d.points.push(point)
            if (slot[1]) {
                d.held.push(i)
                d.pointsHeld.push(point)
                d.heldMap[i] = true
            }
            if (i < d.min) {
                d.min = i
            }
            if (i > d.max) {
                d.max = i
            }
            if (point < d.minPoint) {
                d.minPoint = point
            }
            if (point > d.maxPoint) {
                d.maxPoint = point
            }
        }
        for (var c in Colors) {
            this.cache[CacheKeys.originsOccupied[c]]   = data[c].origins
            this.cache[CacheKeys.pointsOccupied[c]]    = data[c].points
            this.cache[CacheKeys.originsHeld[c]]       = data[c].held
            this.cache[CacheKeys.pointsHeld[c]]        = data[c].pointsHeld
            this.cache[CacheKeys.originsHeldMap[c]]    = data[c].heldMap
            this.cache[CacheKeys.minOriginOccupied[c]] = data[c].min
            this.cache[CacheKeys.maxOriginOccupied[c]] = data[c].max
            this.cache[CacheKeys.minPointOccupied[c]]  = data[c].minPoint
            this.cache[CacheKeys.maxPointOccupied[c]]  = data[c].maxPoint
        }
    } else {
        Profiler.inc('board.originsOccupied.cache.hit')
    }
    Profiler.stop('BoardAnalyzer.originsOccupied')
    return this.cache[key]
}
*/

/*
_popBar(color) {
    delete this.cache[CacheKeys.mayBearoff[color]]
    delete this.cache[CacheKeys.pipCount[color]]
    delete this.cache[CacheKeys.isDisengaged]
}

_pushBar(color) {
    delete this.cache[CacheKeys.mayBearoff[color]]
    delete this.cache[CacheKeys.pipCount[color]]
    delete this.cache[CacheKeys.isDisengaged]
}

_popHome(color) {
    delete this.cache[CacheKeys.mayBearoff[color]]
    delete this.cache[CacheKeys.pipCount[color]]
    delete this.cache[CacheKeys.isDisengaged]
}

_pushHome(color) {
    delete this.cache[CacheKeys.mayBearoff[color]]
    delete this.cache[CacheKeys.pipCount[color]]
    delete this.cache[CacheKeys.isDisengaged]
}

_popOrigin(origin, color) {
    delete this.cache[CacheKeys.mayBearoff[color]]
    delete this.cache[CacheKeys.pipCount[color]]
    delete this.cache[CacheKeys.isDisengaged]

    //originsHeld
    //originsHeldMap
    //pointsHeld

    //blotOrigins

    //originsOccupied
    //pointsOccupied
    //minOriginOccupied
    //maxOriginOccupied
    //minPointOccupied
    //maxPointOccupied

    if (!this.cache[CacheKeys.originsOccupied[color]]) {
        return
    }

    var point = OriginPoints[color][origin]
    var count = this.board.slots[origin].length

    if (count > 1) {
        // it is still held, nothing to do
        return
    }

    // it is no longer held

    var arr
    var idx

    // remove from originsHeld, originsHeldMap, pointsHeld
    arr = this.cache[CacheKeys.originsHeld[color]]
    idx = arr.indexOf(origin)
    if (idx > -1) {
        arr.splice(idx, 1)
    }
    delete this.cache[CacheKeys.originsHeldMap[color]][origin]
    arr = this.cache[CacheKeys.pointsHeld[color]]
    idx = arr.indexOf(point)
    if (idx > -1) {
        arr.splice(idx, 1)
    }

    if (count == 1) {

        // it is a blot

        // let the blot cache repopulate
        delete this.cache[CacheKeys.blotOrigins[color]]

    } else {

        // it is no longer occupied

        // remove from originsOccupied, pointsOccupied
        arr = this.cache[CacheKeys.originsOccupied[color]]
        idx = arr.indexOf(origin)
        if (idx > -1) {
            arr.splice(idx, 1)
        }
        arr = this.cache[CacheKeys.pointsOccupied[color]]
        idx = arr.indexOf(point)
        if (idx > -1) {
            arr.splice(idx, 1)
        }

        arr = this.cache[CacheKeys.originsOccupied[color]]
        // check minOriginOccupied, maxOriginOccupied
        if (origin == this.cache[CacheKeys.minOriginOccupied[color]]) {
            // min should always be first element
            var newOriginValue = arr.length ? arr[0] : Infinity
            this.cache[CacheKeys.minOriginOccupied[color]] = newOriginValue

            // min origin is min point for Red, max point for Whte
            if (color == Red) {
                this.cache[CacheKeys.minPointOccupied[color]] = arr.length ? OriginPoints[color][newOriginValue] : Infinity
            } else {
                this.cache[CacheKeys.maxPointOccupied[color]] = arr.length ? OriginPoints[color][newOriginValue] : -Infinity
            }
        }
        if (origin == this.cache[CacheKeys.maxOriginOccupied[color]]) {
            var newOriginValue = arr.length ? arr[arr.length - 1] : -Infinity
            this.cache[CacheKeys.maxOriginOccupied[color]] = newOriginValue
            // max origin is max point for Red, min point for White
            if (color == Red) {
                this.cache[CacheKeys.maxPointOccupied[color]] = arr.length ? OriginPoints[color][newOriginValue] : -Infinity
            } else {
                this.cache[CacheKeys.minPointOccupied[color]] = arr.length ? OriginPoints[color][newOriginValue] : Infinity
            }
        }
    }

}

_pushOrigin(origin, color) {

    delete this.cache[CacheKeys.mayBearoff[color]]
    delete this.cache[CacheKeys.pipCount[color]]
    delete this.cache[CacheKeys.isDisengaged]

    //originsHeld
    //originsHeldMap
    //pointsHeld

    //blotOrigins

    //originsOccupied
    //pointsOccupied
    //minOriginOccupied
    //maxOriginOccupied
    //minPointOccupied
    //maxPointOccupied

    if (!this.cache[CacheKeys.originsOccupied[color]]) {
        return
    }

    var point = OriginPoints[color][origin]
    var count = this.board.slots[origin].length

    if (count > 2) {
        // it was already held, nothing to do
        return
    }

    if (count > 1) {

        // it is newly held

        // add to originsHeld, originsHeldMap, pointsHeld
        this.cache[CacheKeys.originsHeld[color]].push(origin)
        this.cache[CacheKeys.originsHeld[color]].sort()
        this.cache[CacheKeys.originsHeldMap[color]][origin] = true
        this.cache[CacheKeys.pointsHeld[color]].push(point)
        this.cache[CacheKeys.pointsHeld[color]].sort()

        return
    }

    // it is newly occupied

    delete this.cache[CacheKeys.blotOrigins[color]]

    // add to originsOccupied, pointsOccupied
    this.cache[CacheKeys.originsOccupied[color]].push(origin)
    this.cache[CacheKeys.originsOccupied[color]].sort()
    this.cache[CacheKeys.pointsOccupied[color]].push(point)
    this.cache[CacheKeys.pointsOccupied[color]].sort()

    // check min/max
    if (origin < this.cache[CacheKeys.minOriginOccupied[color]]) {
        this.cache[CacheKeys.minOriginOccupied[color]] = origin
        // min origin is min point for Red, max point for Whte
        if (color == Red) {
            this.cache[CacheKeys.minPointOccupied[color]] = point
        } else {
            this.cache[CacheKeys.maxPointOccupied[color]] = point
        }
    }

    if (origin > this.cache[CacheKeys.maxOriginOccupied[color]]) {
        this.cache[CacheKeys.maxOriginOccupied[color]] = origin
        if (color == Red) {
            this.cache[CacheKeys.maxPointOccupied[color]] = point
        } else {
            this.cache[CacheKeys.minPointOccupied[color]] = point
        }
    }
}

_copyCache(cache) {
    this.cache = {}
    if (!this.cache[CacheKeys.originsOccupied[color]]) {
        return
    }
    for (var color in Colors) {
        this.cache[CacheKeys.originsHeld[color]]       = cache[CacheKeys.originsHeld[color]].slice(0)
        this.cache[CacheKeys.pointsHeld[color]]        = cache[CacheKeys.pointsHeld[color]].slice(0)
        this.cache[CacheKeys.originsOccupied[color]]   = cache[CacheKeys.originsOccupied[color]].slice(0)
        this.cache[CacheKeys.pointsOccupied[color]]    = cache[CacheKeys.pointsOccupied[color]].slice(0)
        this.cache[CacheKeys.originsHeldMap[color]]    = {...cache[CacheKeys.originsHeldMap[color]]}
        this.cache[CacheKeys.minOriginOccupied[color]] = cache[CacheKeys.minOriginOccupied[color]]
        this.cache[CacheKeys.maxOriginOccupied[color]] = cache[CacheKeys.maxOriginOccupied[color]]
        this.cache[CacheKeys.minPointOccupied[color]]  = cache[CacheKeys.minPointOccupied[color]]
        this.cache[CacheKeys.maxPointOccupied[color]]  = cache[CacheKeys.maxPointOccupied[color]]
    }
}
*/