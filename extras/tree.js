/*
compute() {
    this.allowedMoveIndex2 = {}
    this.trees = []
    this.maxFaces = 0
    this.highestFace = 0
    // the max number of faces determine the faces allowed, though not always required.
    this.maxExample = null
    this.buildTrees()
    this.processTrees()
    if (this.maxExample) {
        this.allowedFaces = this.maxExample.map(move => move.face).sort(Util.sortNumericDesc)
    }
}

buildTrees() {

    const {turn} = this

    const sequences = Dice.sequencesForFaces(turn.faces)
    for (var i = 0, ilen = sequences.length; i < ilen; ++i) {
        var sequence = sequences[i]
        var tree = SequenceTree.buildBreadth(turn.board, turn.color, sequence)
        if (tree.maxDepth > this.maxDepth) {
            this.maxDepth = tree.maxDepth
        }
        this.trees.push(tree)
    }
}

processTrees() {
    // the "most number of faces" rule has an exception when bearing off the last piece.
    // see test case RedBearoff51

    // leaves that meet the depth/win threshold, or are winners

    const leaves = []
    if (this.maxDepth > 0) {
        for (var i = 0, ilen = this.trees.length; i < ilen; ++i) {
            var tree = this.trees[i]
            // Tree Filter - trees must meet the depth/win threshold
            if (tree.maxDepth < this.maxDepth && !tree.hasWinner) {
                continue
            }

            for (var j = 0, jlen = tree.leaves.length; j < jlen; ++j) {
                var leaf = tree.leaves[j]
                // Node Filter 1 - leaves must meet the depth/win threshold
                if (leaf.depth == this.maxDepth || leaf.isWinner) {
                    if (leaf.highestFace > this.highestFace) {
                        this.highestFace = leaf.highestFace
                    }
                    leaves.push(leaf)
                }
            }
        }
    }
    this.processLeaves(leaves)
}

processLeaves(leaves) {

    for (var i = 0, ilen = leaves.length; i < ilen; ++i) {

        Profiler.inc('tree.leaf.process')

        var leaf = leaves[i]

        // Node Filter 2 - leaves must meet the final high-face/win threshold
        if (leaf.highestFace != this.highestFace && leaf.isWinner) {
            continue
        }

        var {board, movesMade} = leaf

        if (movesMade.length > this.maxFaces) {
            this.maxFaces = movesMade.length
            this.maxExample = movesMade
        }

        var endState = board.state28()

        var seriesCoords = []
        var currentIndex = this.allowedMoveIndex

        for (var j = 0, jlen = movesMade.length; j < jlen; ++j) {
            var move = movesMade[j]
            Profiler.inc('tree.leaf.move.process')
            if (!currentIndex[move.hash]) {
                currentIndex[move.hash] = {move, index: {}}
                Profiler.inc('tree.leaf.move.cache.miss')
            } else {
                Profiler.inc('tree.leaf.move.cache.hit')
            }
            currentIndex = currentIndex[move.hash].index
            // only if we will use it below
            if (!this.endStatesToSeries[endState]) {
                seriesCoords.push(move.coords)
            }
        }

        if (this.endStatesToSeries[endState]) {
            // de-dupe
            continue
        }

        this.allowedEndStates.push(endState)
        this.endStatesToSeries[endState] = seriesCoords

        // populate turn board cache
        this.turn.boardCache[endState] = board
    }
}
*/