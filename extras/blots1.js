/*
    blots1(color, isIncludeAll = true) {

        Profiler.start('BoardAnalyzer.blots')

        try {

            const blots = []

            const blotOrigins = this.blotOrigins(color)

            if (blotOrigins.length == 0) {
                return blots
            }

            Profiler.start('BoardAnalyzer.blots.prep')
            const opponentOrigins = this.originsOccupied(Opponent[color])
            const opponentHasBar = this.hasBar(Opponent[color])

            const checkOrigin = PointOrigins[Opponent[color]][this.maxPointOccupied(Opponent[color])]
            const minPointWithOpponent = OriginPoints[color][checkOrigin]
            Profiler.stop('BoardAnalyzer.blots.prep')

            if (opponentOrigins.length == 0 && !opponentHasBar && !isIncludeAll) {
                // this shouldn't happen in a real game
                return blots
            }

            Profiler.start('BoardAnalyzer.blots.process')
            for (var i = 0, ilen = blotOrigins.length; i < ilen; ++i) {

                var origin = blotOrigins[i]

                var point = OriginPoints[color][origin]

                var minDistance = Infinity
                var directCount = 0
                var indirectCount = 0

                if (point > minPointWithOpponent) {
                    Profiler.start('BoardAnalyzer.blots.process.inner')
                    for (var j = 0, jlen = opponentOrigins.length; j < jlen; ++j) {

                        Profiler.inc('blots.opponent.point.process')
                        // the opponent point is relative to this color, not the opponent's color
                        var p = OriginPoints[color][opponentOrigins[j]]

                        if (p < point) {

                            var distance = point - p

                            if (distance < minDistance) {
                                minDistance = distance
                            }
                            if (distance < 7) {
                                directCount += 1
                            } else if (distance < 12) {
                                indirectCount += 1
                            }
                        } else {
                            Profiler.inc('blots.opponent.point.disengaged')
                        }
                    }
                    Profiler.stop('BoardAnalyzer.blots.process.inner')
                } else {
                    Profiler.inc('blots.point.disengaged')
                }

                if (opponentHasBar) {
                    if (point < minDistance) {
                        minDistance = point
                    }
                    if (point < 7) {
                        directCount += 1
                    } else if (point < 12) {
                        indirectCount += 1
                    }
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
*/