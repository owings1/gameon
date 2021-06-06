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
const Core = require('./core')
const Util = require('./util')

const {Profiler} = Core
const {MaxDepthExceededError} = Core.Errors

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

    _buildDepth(board, faces, index, parentStore, depth = 0) {

        if (depth > 4) {
            throw new MaxDepthExceededError
        }

        if (board.getWinner() == this.color) {
            // terminal case - winner
            this.hasWinner = true
            if (parentStore) {
                parentStore.setWinner()
                this.winners.push(parentStore)
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

        if (parentStore) {
            if (depth > parentStore.maxDepth) {
                // propagate up the max depth
                parentStore.setMaxDepth(depth)
            }
            if (face > parentStore.highestFace) {
                // propagate up highest face
                parentStore.setHighFace(face)
            }
        }

        const nextFaces = faces.slice(1)

        for (var i = 0, ilen = moves.length; i < ilen; ++i) {

            var move = moves[i]

            move.board = move.board.copy()
            move.do()

            // careful about loop and closure references
            var store = new TreeStore(move, depth, face, index, parentStore)

            if (!this.depthIndex[depth]) {
                this.depthIndex[depth] = []
            }
            this.depthIndex[depth].push(store)

            index[move.hash] = store

            if (!nextFaces.length) {
                continue
            }

            // recurse
            this._buildDepth(move.board, nextFaces, store.index, store, depth)
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
            var store = index[hash]
            if (store.hasWinner) {
                continue
            }
            if (store.maxDepth < maxDepth) {
                Profiler.inc('SequenceTree.pruneIndexRecursive.delete.maxDepth')
                store.deleted = true
                delete index[hash]
            } else if (store.highestFace < highestFace) {
                Profiler.inc('SequenceTree.pruneIndexRecursive.delete.highestFace')
                store.deleted = true
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

class TreeStore {

    constructor(move, depth, face, index, parentStore) {

        Profiler.start('TreeStore.create')
        var highestFace = face
        var moveSeriesFlag = move.flag

        if (parentStore) {
            if (parentStore.moveSeriesFlag != moveSeriesFlag) {
                moveSeriesFlag = -1
            }
            if (parentStore.face > face) {
                // progagate down the parent's face
                highestFace = parentStore.face
            }
        }
        this.move           = move
        this.depth          = depth
        this.face           = face
        this.highestFace    = highestFace
        this.moveSeriesFlag = moveSeriesFlag
        this.parentStore    = parentStore
        this.maxDepth       = depth
        this.index          = {}

        Profiler.stop('TreeStore.create')
    }

    parent() {
        return this.parentStore
    }

    moveSeries() {
        // profiling shows caching unnecessary (never hit)
        const moveSeries = [this.move.coords]
        for (var parent = this.parentStore; parent; parent = parent.parent()) {
            moveSeries.unshift(parent.move.coords)
        }
        return moveSeries
    }

    // propagate up maxDepth, hasWinner, highestFace

    setMaxDepth(depth) {
        //Profiler.inc('TreeStore.propagate')
        //Profiler.inc('TreeStore.propagate.setMaxDepth')
        this.maxDepth = depth
        if (this.parentStore && this.parentStore.maxDepth < depth) {
            this.parentStore.setMaxDepth(depth)
        }
    }

    setWinner() {
        //Profiler.inc('TreeStore.propagate')
        //Profiler.inc('TreeStore.propagate.setWinner')
        this.hasWinner = true
        if (this.parentStore && !this.parentStore.hasWinner) {
            this.parentStore.setWinner()
        }
    }

    setHighFace(face) {
        //Profiler.inc('TreeStore.propagate')
        //Profiler.inc('TreeStore.propagate.setHighFace')
        this.highestFace = face
        if (this.parentStore && this.parentStore.highestFace < face) {
            this.parentStore.setHighFace(face)
        }
    }

    prune(maxDepth, highestFace) {
        const hashes = Object.keys(this.index)
        for (var i = 0, ilen = hashes.length; i < ilen; ++i) {
            var hash = hashes[i]
            var store = this.index[hash]
            if (store.hasWinner) {
                continue
            }
            if (store.maxDepth < maxDepth) {
                Profiler.inc('TreeStore.prune.discard.maxDepth')
                delete store[hash]
                continue
            }
            if (store.highestFace < highestFace) {
                Profiler.inc('TreeStore.prune.discard.highestFace')
                delete store[hash]
            }
        }
    }

    // profiling shows caching not needed - never hit
    flagKey() {

        var flagKey = null

        // only do for doubles
        if (this.moveSeriesFlag == 8 && this.depth == 4) {

            Profiler.start('TreeStore.flagKey')

            const origins = [this.move.origin]
            for (var parent = this.parentStore; parent; parent = parent.parent()) {
                origins.push(parent.move.origin)
            }
            origins.sort(Util.sortNumericAsc)

            flagKey = '8/4-' + origins[0]
            for (var i = 1; i < 4; ++i) {
                flagKey += ',' + origins[i]
            }

            Profiler.stop('TreeStore.flagKey')
        }

        return flagKey
    }
}

module.exports = {
    SequenceTree
}