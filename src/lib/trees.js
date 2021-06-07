/**
 * gameon - Tree classes
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
const Core   = require('./core')
const Errors = require('./errors')
const Util   = require('./util')

const {Dice, Profiler} = Core
const {MaxDepthExceededError} = Errors

class TurnBuilder {

    constructor(turn) {
        this.turn = turn
        this.maxDepth = 0
        this.allowedFaces = []
        // state28 strings
        this.allowedEndStates = []
        // Map of {moveHash: {move, index: {...}}}
        this.allowedMoveIndex = {}
        // Map of state28 to move coords
        this.endStatesToSeries = {}
    }

    compute() {
        throw new NotImplementedError
    }

    getResult() {
        return {
            allowedFaces      : this.allowedFaces
          , allowedEndStates  : this.allowedEndStates
          , allowedMoveIndex  : this.allowedMoveIndex
          , endStatesToSeries : this.endStatesToSeries
          , maxDepth          : this.maxDepth
        }
    }
}

class DepthBuilder extends TurnBuilder {

    compute() {
        this.trees = []
        this.flagKeys = {}
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
            var tree = SequenceTree.buildDepth(turn.board, turn.color, sequence)
            if (tree.maxDepth > this.maxDepth) {
                this.maxDepth = tree.maxDepth
            }
            if (tree.highestFace > this.highestFace) {
                this.highestFace = tree.highestFace
            }
            this.trees.push(tree)
        }
    }

    processTrees() {

        for (var i = 0, ilen = this.trees.length; i < ilen && this.maxDepth > 0; ++i) {

            var tree = this.trees[i]

            if (!tree.checkPasses(this.maxDepth, this.highestFace)) {
                continue
            }

            SequenceTree.pruneIndexRecursive(tree.index, this.maxDepth, this.highestFace)

            for (var hash in tree.index) {
                this.allowedMoveIndex[hash] = tree.index[hash]
            }

            var leaves = tree.depthIndex[this.maxDepth]

            if (leaves) {
                this.processLeaves(leaves)
            }

            this.processWinners(tree.winners)
        }
    }

    processLeaves(leaves) {

        for (var j = 0, jlen = leaves.length; j < jlen; ++j) {

            var node = leaves[j]

            var flagKey = node.flagKey()

            if (flagKey) {
                if (this.flagKeys[flagKey]) {
                    continue
                }
                this.flagKeys[flagKey] = true
            }

            var endState = node.move.board.state28()

            if (this.endStatesToSeries[endState]) {
                continue
            }

            // only about 25% of leaves are kept, flag key gets about twice
            /// as many as endState

            this.endStatesToSeries[endState] = node.moveSeries()
            this.allowedEndStates.push(endState)

            if (!this.maxExample) {
                this.maxExample = this.endStatesToSeries[endState]
            }
            // populate turn board cache
            this.turn.boardCache[endState] = node.move.board
        }
    }

    processWinners(winners) {
        for (var j = 0, jlen = winners.length; j < jlen; ++j) {

            var node = winners[j]

            if (node.depth == this.maxDepth) {
                // already covered in leaves
                continue
            }

            var {board} = node.move
            var endState = board.state28()

            if (this.endStatesToSeries[endState]) {
                // de-dupe
                continue
            }

            this.endStatesToSeries[endState] = node.moveSeries()
            this.allowedEndStates.push(endState)

            // populate turn board cache
            this.turn.boardCache[endState] = board
        }
    }
}

class BreadthBuilder extends TurnBuilder {

    compute() {
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
}

class SequenceTree {

    constructor(board, color, sequence) {
        this.board     = board
        this.color     = color
        this.sequence  = sequence
        this.hasWinner = false
        this.maxDepth  = 0        
    }

    // build breadth first, flat node list structure
    buildBreadth() {

        Profiler.start('SequenceTree.buildBreadth')

        this.leaves    = null
        this.maxDepth  = -1
        this.nodeCount = 0

        const result = this._buildBreadth()

        this.maxDepth  = result.maxDepth
        this.hasWinner = result.hasWinner
        this.leaves    = result.leaves
        this.nodeCount = result.nodeCount

        Profiler.stop('SequenceTree.buildBreadth')
    }

    // build depth first, proper tree structure
    buildDepth() {

        Profiler.start('SequenceTree.buildDepth')

        //this.depth       = 0
        this.index       = {}
        this.winners     = []
        this.depthIndex  = {}
        this.highestFace = 0

        this._buildDepth(this.board, this.sequence, this.index)

        Profiler.stop('SequenceTree.buildDepth')
    }

    checkPasses(maxDepth, highestFace) {
        if (this.hasWinner) {
            return true
        }
        if (this.maxDepth < maxDepth) {
            Profiler.inc('SequenceTree.check.fail.maxDepth')
            return false
        }
        if (this.highestFace < highestFace) {
            Profiler.inc('SequenceTree.check.fail.highestFace')
            return false
        }
        return true
    }

    _buildDepth(board, faces, index, parentNode, depth = 0) {

        if (depth > 4) {
            throw new MaxDepthExceededError
        }

        if (board.getWinner() == this.color) {
            // terminal case - winner
            this.hasWinner = true
            if (parentNode) {
                parentNode.setWinner()
                this.winners.push(parentNode)
            }
            return
        }

        const face = faces[0]
        const moves = board.getPossibleMovesForFace(this.color, face)

        if (!moves.length) {
            Profiler.inc('tree.build.no.moves')
            // terminal case - no available moves
            // this happens too infrequently to warrant trying to remove it from the tree.
            return
        }

        // continuation case

        depth += 1

        if (depth > this.maxDepth) {
            this.maxDepth = depth
        }
        if (face > this.highestFace) {
            this.highestFace = face
        }

        if (parentNode) {
            if (depth > parentNode.maxDepth) {
                // propagate up the max depth
                parentNode.setMaxDepth(depth)
            }
            if (face > parentNode.highestFace) {
                // propagate up highest face
                parentNode.setHighFace(face)
            }
        }

        const nextFaces = faces.slice(1)

        for (var i = 0, ilen = moves.length; i < ilen; ++i) {

            var move = moves[i]

            move.board = move.board.copy()
            move.do()

            // careful about loop and closure references
            var node = new TreeNode(move, depth, face, index, parentNode)

            if (!this.depthIndex[depth]) {
                this.depthIndex[depth] = []
            }
            this.depthIndex[depth].push(node)

            index[move.hash] = node

            if (!nextFaces.length) {
                continue
            }

            // recurse
            this._buildDepth(move.board, nextFaces, node.index, node, depth)
        }
    }

    _buildBreadth() {

        const root = {board: this.board, depth: 0, parent: null, movesMade: [], highestFace: -Infinity}
        Profiler.inc('node.create')

        var hasWinner = false
        var maxDepth = 0
        var nodeCount = 1

        var lastNodes = [root]
        var leaves = lastNodes


        for (var i = 0, ilen = this.sequence.length; i < ilen; ++i) {

            var face = this.sequence[i]
            var depth = i + 1

            var nextNodes = []

            for (var j = 0, jlen = lastNodes.length; j < jlen; ++j) {

                var parent = lastNodes[j]

                Profiler.start('SequenceTree.buildBreadth.1')
                var nextMoves = parent.board.getPossibleMovesForFace(this.color, face)
                Profiler.stop('SequenceTree.buildBreadth.1')

                for (var k = 0, klen = nextMoves.length; k < klen; ++k) {

                    var move = nextMoves[k]

                    Profiler.start('SequenceTree.buildBreadth.2')
                    move.board = move.board.copy()
                    Profiler.stop('SequenceTree.buildBreadth.2')

                    Profiler.start('SequenceTree.buildBreadth.3')
                    move.do()
                    Profiler.stop('SequenceTree.buildBreadth.3')

                    Profiler.start('SequenceTree.buildBreadth.4')
                    var child = {
                        board       : move.board
                      , depth
                      , isWinner    : move.board.getWinner() == this.color
                      , movesMade   : parent.movesMade.slice(0)
                      , highestFace : face > parent.highestFace ? face : parent.highestFace
                    }
                    Profiler.inc('node.create')

                    nodeCount += 1

                    child.movesMade.push(move)
                    nextNodes.push(child)

                    if (child.isWinner) {
                        hasWinner = true
                    }
                    if (depth > maxDepth) {
                        maxDepth = depth
                        // leaves only include nodes of maxDepth, since a tree is for a single sequence
                        // i.e. a shorter winning tree would always have a different sequence. the proof
                        // is left as an exercise for the reader.
                        leaves = nextNodes
                    }
                    Profiler.stop('SequenceTree.buildBreadth.4')
                }
            }

            lastNodes = nextNodes
        }

        return {hasWinner, maxDepth, leaves, nodeCount}
    }

    static buildBreadth(board, color, sequence) {
        const tree = new SequenceTree(board, color, sequence)
        tree.buildBreadth()
        return tree
    }

    static buildDepth(board, color, sequence) {
        const tree = new SequenceTree(board, color, sequence)
        tree.buildDepth()
        return tree
    }

    static pruneIndexRecursive(index, maxDepth, highestFace) {
        const hashes = Object.keys(index) // copy for modifying in place
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            Profiler.inc('SequenceTree.pruneIndexRecursive.check')
            var hash = hashes[i]
            var node = index[hash]
            if (node.hasWinner) {
                continue
            }
            if (node.maxDepth < maxDepth) {
                Profiler.inc('SequenceTree.pruneIndexRecursive.delete.maxDepth')
                node.deleted = true
                delete index[hash]
            } else if (node.highestFace < highestFace) {
                Profiler.inc('SequenceTree.pruneIndexRecursive.delete.highestFace')
                node.deleted = true
                delete index[hash]
            }
        }
    }

    // circular with move objects (board/analyzer)
    static serializeIndex(index, isSort) {
        if (!index) {
            return index
        }
        const cleaned = {}
        const hashes = Object.keys(index)
        if (isSort) {
            hashes.sort(typeof isSort == 'function' ? isSort : undefined)
        }
        for (var hash of hashes) {
            cleaned[hash] = {}
            for (var k in index[hash]) {
                if (k == 'move') {
                    cleaned[hash][k] = index[hash][k].coords
                } else if (k == 'index') {
                    // recurse
                    cleaned[hash][k] = SequenceTree.serializeIndex(index[hash][k])
                }
            }
        }
        return cleaned
    }
}

class TreeNode {

    constructor(move, depth, face, index, parentNode) {

        Profiler.start('TreeNode.create')
        var highestFace = face
        var moveSeriesFlag = move.flag

        if (parentNode) {
            if (parentNode.moveSeriesFlag != moveSeriesFlag) {
                moveSeriesFlag = -1
            }
            if (parentNode.face > face) {
                // progagate down the parent's face
                highestFace = parentNode.face
            }
        }
        this.move           = move
        this.depth          = depth
        this.face           = face
        this.highestFace    = highestFace
        this.moveSeriesFlag = moveSeriesFlag
        this.parentNode     = parentNode
        this.maxDepth       = depth
        this.index          = {}

        Profiler.stop('TreeNode.create')
    }

    parent() {
        return this.parentNode
    }

    moveSeries() {
        // profiling shows caching unnecessary (never hit)
        const moveSeries = [this.move.coords]
        for (var parent = this.parentNode; parent; parent = parent.parent()) {
            moveSeries.unshift(parent.move.coords)
        }
        return moveSeries
    }

    // propagate up maxDepth, hasWinner, highestFace

    setMaxDepth(depth) {
        this.maxDepth = depth
        if (this.parentNode && this.parentNode.maxDepth < depth) {
            this.parentNode.setMaxDepth(depth)
        }
    }

    setWinner() {
        this.hasWinner = true
        if (this.parentNode && !this.parentNode.hasWinner) {
            this.parentNode.setWinner()
        }
    }

    setHighFace(face) {
        this.highestFace = face
        if (this.parentNode && this.parentNode.highestFace < face) {
            this.parentNode.setHighFace(face)
        }
    }

    prune(maxDepth, highestFace) {
        const hashes = Object.keys(this.index)
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            var hash = hashes[i]
            var node = this.index[hash]
            if (node.hasWinner) {
                continue
            }
            if (node.maxDepth < maxDepth) {
                //Profiler.inc('TreeNode.prune.discard.maxDepth')
                delete node[hash]
                continue
            }
            if (node.highestFace < highestFace) {
                //Profiler.inc('TreeNode.prune.discard.highestFace')
                delete node[hash]
            }
        }
    }

    // profiling shows caching not needed - never hit
    flagKey() {

        var flagKey = null

        // only do for doubles
        if (this.moveSeriesFlag == 8 && this.depth == 4) {

            Profiler.start('TreeNode.flagKey')

            const origins = [this.move.origin]
            for (var parent = this.parentNode; parent; parent = parent.parent()) {
                origins.push(parent.move.origin)
            }
            origins.sort(Util.sortNumericAsc)

            flagKey = '8/4-' + origins[0]
            for (var i = 1; i < 4; ++i) {
                flagKey += ',' + origins[i]
            }

            Profiler.stop('TreeNode.flagKey')
        }

        return flagKey
    }
}

const {NotImplementedError} = Errors

module.exports = {
    BreadthBuilder
  , DepthBuilder
  , SequenceTree
}