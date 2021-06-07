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
        this.turn        = turn
        this.maxDepth    = 0
        this.highestFace = 0
        this.flagKeys    = {}
        this.maxExample  = null
        this.result      = null
    }

    compute() {
        this.result = {
            // state28 strings
            allowedEndStates  : []
            // Map of {moveHash: {move, index: {...}}}
          , allowedMoveIndex  : {}
            // Map of state28 to move coords
          , endStatesToSeries : {}
          , allowedFaces      : []
        }
        const trees = this.buildTrees()
        this.result.maxDepth = this.maxDepth
        this.processTrees(trees)
        if (this.maxExample) {
            this.result.allowedFaces = this.maxExample.map(move => move.face).sort(Util.sortNumericDesc)
        }
        return this.getResult()
    }

    getResult() {
        return this.result
    }

    buildTrees() {
        const trees = []
        const {turn} = this
        const sequences = Dice.sequencesForFaces(turn.faces)
        for (var i = 0, ilen = sequences.length; i < ilen; ++i) {
            var tree = this.buildTree(turn.board, turn.color, sequences[i])
            if (tree.maxDepth > this.maxDepth) {
                this.maxDepth = tree.maxDepth
            }
            if (tree.highestFace > this.highestFace) {
                this.highestFace = tree.highestFace
            }
            trees.push(tree)
        }
        return trees
    }

    processTrees(trees) {

        const {result, maxDepth, highestFace} = this

        for (var i = 0, ilen = trees.length; i < ilen && maxDepth > 0; ++i) {

            var tree = trees[i]

            if (!tree.checkPasses(maxDepth, highestFace)) {
                continue
            }

            SequenceTree.pruneIndexRecursive(tree.index, maxDepth, highestFace)

            for (var hash in tree.index) {
                result.allowedMoveIndex[hash] = tree.index[hash]
            }

            this.processLeaves(tree.depthIndex[maxDepth])

            this.processWinners(tree.winners)
        }
    }

    processLeaves(leaves) {

        if (!leaves) {
            return
        }

        const {result, flagKeys, turn} = this

        for (var j = 0, jlen = leaves.length; j < jlen; ++j) {

            var node = leaves[j]

            var flagKey = node.flagKey()

            if (flagKey) {
                if (flagKeys[flagKey]) {
                    continue
                }
                flagKeys[flagKey] = true
            }

            var endState = node.move.board.state28()

            if (result.endStatesToSeries[endState]) {
                continue
            }

            // only about 25% of leaves are kept, flag key gets about twice
            /// as many as endState

            result.endStatesToSeries[endState] = node.moveSeries()
            result.allowedEndStates.push(endState)

            if (!this.maxExample) {
                this.maxExample = result.endStatesToSeries[endState]
            }
            // populate turn board cache
            turn.boardCache[endState] = node.move.board
        }
    }

    processWinners(winners) {

        const {result} = this

        for (var j = 0, jlen = winners.length; j < jlen; ++j) {

            var node = winners[j]

            if (node.depth == this.maxDepth) {
                // already covered in leaves
                continue
            }

            var {board} = node.move
            var endState = board.state28()

            if (result.endStatesToSeries[endState]) {
                // de-dupe
                continue
            }

            result.endStatesToSeries[endState] = node.moveSeries()
            result.allowedEndStates.push(endState)

            // populate turn board cache
            this.turn.boardCache[endState] = board
        }
    }

    buildTree(board, color, sequence) {
        throw new NotImplemntedError
    }
}

class DepthBuilder extends TurnBuilder {

    buildTree(board, color, sequence) {
        return new DepthTree(board, color, sequence).build()
    }
}

class BreadthBuilder extends TurnBuilder {

    buildTree(board, color, sequence) {
        return new BreadthTree(board, color, sequence).build()
    }
}

class SequenceTree {

    constructor(board, color, sequence) {
        this.board       = board
        this.color       = color
        this.sequence    = sequence
        this.maxDepth    = 0
        this.hasWinner   = false
        this.highestFace = 0
        this.depthIndex  = {}
        this.index       = {}
        this.winners     = []
    }

    build() {
        this.buildSequence(this.board, this.sequence, this.index)
        return this
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

class DepthTree extends SequenceTree {

    buildSequence(board, sequence, index, parentNode, depth = 0) {

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

        const face = sequence[0]
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

        const nextFaces = sequence.slice(1)

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
            this.buildSequence(move.board, nextFaces, node.index, node, depth)
        }
    }
}

class BreadthTree extends SequenceTree {

    buildSequence(board, sequence, index) {

        var lastNodes = [null]
        var parentIndex = null

        for (var i = 0, ilen = sequence.length; i < ilen; ++i) {

            var nextNodes = []

            var face = sequence[i]
            var depth = i + 1

            for (var j = 0, jlen = lastNodes.length; j < jlen; ++j) {

                var parentNode = lastNodes[j]
                if (parentNode) {
                    board       = parentNode.move.board
                    index       = parentNode.index
                    parentIndex = parentNode.index
                }

                var moves = board.getPossibleMovesForFace(this.color, face)

                if (!moves.length) {
                    continue
                }

                for (var k = 0, klen = moves.length; k < klen; ++k) {

                    var move = moves[k]
                    move.board = move.board.copy()
                    move.do()

                    var node = new TreeNode(move, depth, face, parentIndex, parentNode)

                    this.intakeNode(node, index)
                    nextNodes.push(node)
                }
            }

            lastNodes = nextNodes
        }
    }

    intakeNode(node, index) {
        const {depth, face, parentNode, move} = node
        const isWinner = move.board.getWinner() == this.color
        if (isWinner) {
            this.hasWinner = true
            this.winners.push(node)
            if (parentNode) {
                parentNode.setWinner()
            }
        }
        if (depth > this.maxDepth) {
            this.maxDepth = depth
        }
        if (face > this.highestFace) {
            this.highestFace = face
        }
        if (parentNode) {
            if (depth > parentNode.maxDepth) {
                parentNode.setMaxDepth(depth)
            }
            if (face > parentNode.highestFace) {
                parentNode.setHighFace(face)
            }
        }
        if (!this.depthIndex[depth]) {
            this.depthIndex[depth] = []
        }
        this.depthIndex[depth].push(node)
        index[move.hash] = node
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
  , BreadthTree
  , DepthTree
  , SequenceTree
}