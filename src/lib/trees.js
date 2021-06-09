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
        this.trees = []
        this.leaves = []
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
        const sequences = this.buildSequences(turn.faces)
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

    buildSequences(faces) {
        return Dice.sequencesForFaces(faces)
    }

    processTrees(trees) {

        const {result, maxDepth, highestFace} = this

        for (var i = 0, ilen = trees.length; i < ilen && maxDepth > 0; ++i) {

            var tree = trees[i]

            tree.prune(maxDepth, highestFace, true)

            var isEmpty = true
            for (var hash in tree.index) {
                result.allowedMoveIndex[hash] = tree.index[hash]
                isEmpty = false
            }

            if (isEmpty) {
                continue
            }

            this.trees.push(tree)

            this.processLeaves(tree.depthIndex[maxDepth])

            this.processWinners(tree.winners)
        }
    }

    processLeaves(leaves) {

        if (!leaves) {
            return
        }

        const {result, flagKeys, turn, maxDepth, highestFace} = this

        for (var j = 0, jlen = leaves.length; j < jlen; ++j) {

            var node = leaves[j]
            this.leaves.push(node)

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
                // Ihis condition is never met for legal rolls.
                //   If the depth = maxDepth, it is de-duped in processLeaves,
                //   and skipped above.
                //
                //   For doubles, depth would have to equal maxDepth. Thus if the
                //   depth < maxDepth, it has to be non-doubles.
                //
                //   If both faces are used, then depth would have to equal max depth.
                //
                //   If only one face is used, then there is no other tree with the
                //   same move.
                //
                // However, for generality, we leave this here, and have a test case
                // for it (DeviantBuilder).
                continue
            }

            this.leaves.push(node)
            result.endStatesToSeries[endState] = node.moveSeries()
            result.allowedEndStates.push(endState)

            // populate turn board cache
            this.turn.boardCache[endState] = board
        }
    }

    buildTree(board, color, sequence) {
        return this.newTree(board, color, sequence).build()
    }

    newTree(board, color, sequence) {
        throw new NotImplementedError
    }
}

class DepthBuilder extends TurnBuilder {

    newTree(board, color, sequence) {
        return new DepthTree(board, color, sequence)
    }
}

class BreadthBuilder extends TurnBuilder {

    newTree(board, color, sequence) {
        return new BreadthTree(board, color, sequence)
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
        this.depthIndex  = []
        this.index       = {}
        this.winners     = []
        Dice.checkFaces(this.sequence)
    }

    build() {
        this.buildSequence(this.board, this.sequence, this.index)
        return this
    }

    prune(maxDepth, highestFace, isRecursive, index = null) {
        index = index || this.index
        const hashes = Object.keys(index) // copy for modifying in place
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            Profiler.inc('SequenceTree.prune.check')
            var hash = hashes[i]
            var node = index[hash]
            if (node.hasWinner) {
                continue
            }
            if (node.maxDepth < maxDepth) {
                Profiler.inc('SequenceTree.prune.delete.maxDepth')
                node.deleted = true
                delete index[hash]
            } else if (node.highestFace < highestFace) {
                Profiler.inc('SequenceTree.prune.delete.highestFace')
                node.deleted = true
                delete index[hash]
            } else if (isRecursive && node.depth < maxDepth - 1) {
                // We don't need to prune all the children if this depth >= maxDepth -1,
                // since all the children will have depth == maxDepth. In fact, it is
                // hard to think of a case where this is necessary. It would have to
                // be on doubles.
                //
                // However, for generality, we leave this here, and have a test case
                // for it (see DeviantBuilder).
                this.prune(maxDepth, highestFace, true, index[hash].index)
            }
        }
    }

    createNode(move, depth, parent) {
        return new TreeNode(move, depth, parent)
    }

    serialize(sorter) {
        return this.constructor.serialize(this, sorter)
    }

    serializeIndex(sorter) {
        return this.constructor.serializeIndex(this.index, sorter)
    }

    static serialize(tree, sorter) {
        return {
            board       : tree.board.state28()
          , color       : tree.color
          , sequence    : tree.sequence
          , maxDepth    : tree.maxDepth
          , highestFace : tree.highestFace
          , hasWinner   : tree.hasWinner
          , index       : tree.serializeIndex(sorter)
        }
    }

    // circular with move objects (board/analyzer)
    static serializeIndex(index, sorter) {
        if (!index) {
            return index
        }
        const cleaned = {}
        const hashes = Object.keys(index)
        if (sorter) {
            hashes.sort(sorter)
        }
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            var hash = hashes[i]
            cleaned[hash] = index[hash].serialize()
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

        this.beforeMoves(depth, face, parentNode)

        const nextFaces = sequence.slice(1)

        for (var i = 0, ilen = moves.length; i < ilen; ++i) {

            var move = moves[i]

            move.board = move.board.copy()
            move.do()

            // careful about loop and closure references
            var node = new TreeNode(move, depth, parentNode)

            this.depthIndex[depth].push(node)

            index[move.hash] = node

            if (!nextFaces.length) {
                continue
            }

            // recurse
            this.buildSequence(move.board, nextFaces, node.index, node, depth)
        }
    }

    beforeMoves(depth, face, parentNode) {

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

        if (!this.depthIndex[depth]) {
            this.depthIndex[depth] = []
        }
    }
}

class BreadthTree extends SequenceTree {

    buildSequence(board, sequence, index) {

        var lastNodes = [null]

        for (var i = 0, ilen = sequence.length; i < ilen; ++i) {

            var nextNodes = []

            var face = sequence[i]
            var depth = i + 1

            for (var j = 0, jlen = lastNodes.length; j < jlen; ++j) {

                var parent = lastNodes[j]
                if (parent) {
                    board = parent.move.board
                    index = parent.index
                }

                var moves = board.getPossibleMovesForFace(this.color, face)

                if (!moves.length) {
                    continue
                }

                if (!this.depthIndex[depth]) {
                    this.depthIndex[depth] = []
                }

                for (var k = 0, klen = moves.length; k < klen; ++k) {

                    var move = moves[k]
                    move.board = move.board.copy()
                    move.do()

                    var node = new TreeNode(move, depth, parent)

                    this.intakeNode(node, index)
                    nextNodes.push(node)
                }
            }

            lastNodes = nextNodes
        }
    }

    intakeNode(node, index) {
        const {depth, parent, move} = node
        const {face} = move
        const isWinner = move.board.getWinner() == this.color
        if (isWinner) {
            this.hasWinner = true
            this.winners.push(node)
            if (parent) {
                parent.setWinner()
            }
        }
        if (depth > this.maxDepth) {
            this.maxDepth = depth
        }
        if (face > this.highestFace) {
            this.highestFace = face
        }
        if (parent) {
            if (depth > parent.maxDepth) {
                parent.setMaxDepth(depth)
            }
            if (face > parent.highestFace) {
                parent.setHighFace(face)
            }
        }
        this.depthIndex[depth].push(node)
        index[move.hash] = node
    }
}

class TreeNode {

    constructor(move, depth, parent) {

        Profiler.start('TreeNode.create')

        this.flag           = move.flag
        this.highestFace    = move.face
        this.move           = move
        this.depth          = depth
        this.parent         = parent
        this.maxDepth       = depth
        this.index          = {}

        if (parent) {
            if (parent.flag != this.flag) {
                this.flag = -1
            }
            if (parent.move.face > this.highestFace) {
                // progagate down the parent's face
                this.highestFace = parent.move.face
            }
        }

        Profiler.stop('TreeNode.create')
    }

    moveSeries() {
        // profiling shows caching unnecessary (never hit)
        const moveSeries = []
        for (var parent = this.parent, i = this.depth - 2; parent; parent = parent.parent, --i) {
            moveSeries[i] = parent.move.coords
        }
        moveSeries.push(this.move.coords)
        return moveSeries
    }

    // propagate up maxDepth, hasWinner, highestFace

    setMaxDepth(depth) {
        this.maxDepth = depth
        if (this.parent && this.parent.maxDepth < depth) {
            this.parent.setMaxDepth(depth)
        }
    }

    setWinner() {
        this.hasWinner = true
        if (this.parent && !this.parent.hasWinner) {
            this.parent.setWinner()
        }
    }

    setHighFace(face) {
        this.highestFace = face
        if (this.parent && this.parent.highestFace < face) {
            // This condition should never be met in valid rolls, hence Dice.checkFaces
            // in SequenceTree constructor. For distintc dice, we have already checked
            // in the constructor whether the parent face is higher. For doubles, all
            // the faces are the same.
            //
            // However, for generality, we leave this here, and have a test case
            // for it (see DeviantBuilder).
            this.parent.setHighFace(face)
        }
    }

    // profiling shows caching not needed - never hit
    flagKey() {

        var flagKey = null

        // only do for doubles
        if (this.flag == 8 && this.depth == 4) {

            Profiler.start('TreeNode.flagKey')

            const origins = [this.move.origin]
            for (var parent = this.parent; parent; parent = parent.parent) {
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

    serialize() {
        return this.constructor.serialize(this)
    }

    static serialize(node) {
        return {
            move         : node.move.coords
          , endState     : node.move.board.state28()
          , flag         : node.flag
          , highestFace  : node.highestFace
          , depth        : node.depth
          , maxDepth     : node.maxDepth
        }
    }
}

const {NotImplementedError} = Errors

module.exports = {
    BreadthBuilder
  , DepthBuilder
  , BreadthTree
  , DepthTree
  , SequenceTree
  , TurnBuilder
}