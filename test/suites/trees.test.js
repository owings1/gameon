const TestUtil = require('../util')

const {
    expect,
    getError,
    getErrorAsync,
    makeRandomMoves,
    randomElement,
    requireSrc,
    Rolls,
    States,
    States28,
    Structures
} = TestUtil

const Constants = requireSrc('lib/constants')
const Core = requireSrc('lib/core')
const Util = requireSrc('lib/util')
const {AbstractNode, SequenceTree, BreadthTree, DepthTree, DepthBuilder, TurnBuilder} = requireSrc('lib/trees')

const {White, Red} = Constants
const {Match, Game, Board, Turn, Piece, Dice} = Core

describe('TurnBuilder', () => {

    describe('#newTree', () => {

        it('should throw NotImplementedError', () => {
            const builder = new TurnBuilder
            const err = getError(() => builder.newTree())
            expect(err.name).to.equal('NotImplementedError')
        })
    })

    describe('#hasWinner', () => {
        it('should have winner on RedHasWinner12', () => {
            const turn1 = new Turn(Board.fromStateString(States.RedHasWinner12), Red, {breadthTrees: true})
            const turn2 = new Turn(Board.fromStateString(States.RedHasWinner12), Red)
            turn1.setRoll(1, 2)
            turn2.setRoll(1, 2)
            //console.log(turn1.allowedMoveIndex)
            //console.log('\n')
            //console.log(turn2.allowedMoveIndex)
            expect(turn1.builder.result.hasWinner).to.equal(true)
            expect(turn2.builder.result.hasWinner).to.equal(true)
            expect(turn1.builder.trees[0].winners.length).to.equal(1)
            expect(turn2.builder.trees[0].winners.length).to.equal(1)
            expect(turn1.builder.trees[1].winners.length).to.equal(1)
            expect(turn2.builder.trees[1].winners.length).to.equal(1)
        })
    })
})

describe('AbstractNode', () => {

    describe('#serialize', () => {
        it('should serialize empty node', () => {
            const node = new AbstractNode
            const result = node.serialize()
        })
    })
})

describe('SequenceTree', () => {

    describe('DepthTree', () => {

        describe('#buildSequence', () => {
            it('should throw MaxDepthExceededError on depth = 5', () => {
                const tree = new DepthTree(Board.setup(), White, [1, 2])
                const err = getError(() => tree.buildSequence(tree.board, tree.sequence, tree.index, null, 5))  
                expect(err.name).to.equal('MaxDepthExceededError')
            })

            it.skip('should set isWinner when no parent (coverage)', () => {
                const board = Board.fromStateString(States.WhiteWin)
                const tree = new DepthTree(board, White, [1, 2])
                tree.buildSequence(board)
                expect(tree.hasWinner).to.equal(true)
            })
        })

        describe.skip('#beforeMoves', () => {
            it('should not propagate maxDepth to parent if depth is less (deviant case)', () => {
                const tree = new DepthTree(Board.setup(), White, [1, 2])
                const node = tree.createNode({}, 2)
                tree.beforeMoves(1, 2, node)
                expect(node.maxDepth).to.equal(2)
            })
        })
    })

    describe('BreadthTree', () => {

        it('should have maxDepth 0 with white piece on bar for sequence [6,6,6,6] on setup board', () => {

            const board = new Board
            board.setup()
            board.pushBar(White, board.popOrigin(0))

            const tree = new BreadthTree(board, White, [6, 6, 6, 6]).build()
            

            expect(tree.maxDepth).to.equal(0)
        })

        it('should have maxDepth 2 for red for sequence [3, 1] on setup board', () => {

            const board = Board.setup()

            const tree = new BreadthTree(board, Red, [3, 1]).build()

            expect(tree.maxDepth).to.equal(2)
        })

        describe('#registerNode', () => {

            it('should not set parent winner if no parent (deviant)', () => {
                const board = Board.fromStateString(States.WhiteWin)
                const tree = new BreadthTree(board, Red, [1, 2])
                const move = board.buildMove(Red, 0, 1)
                move.do()
                const node = tree.createNode(move, 1)
                tree.depthIndex[1] = []
                tree.registerNode(node, tree.index)
                expect(tree.hasWinner).to.equal(true)
            })
        })

        describe('wip - TreeNode', () => {

            function indexJson(index) {
                return JSON.stringify(SequenceTree.serializeIndex(index), null, 2)
            }

            it('wip allowedMoveIndex2', () => {
                const t1 = new Turn(Board.setup(), White, {breadthTrees: true})
                const t2 = new Turn(Board.setup(), White)
                t1.setRoll(1, 2)
                t2.setRoll(1, 2)
                
            })
            it('wip moveSeries', () => {
                const t1 = new Turn(Board.setup(), White, {breadthTrees: true})
                const t2 = new Turn(Board.setup(), White)
                t1.setRoll(1, 1)
                t2.setRoll(1, 1)
                
            })

            it('wip buildSequence', () => {
                const board = Board.setup()
                const t1 = new DepthTree(board, White, [2, 1])
                t1.buildSequence(t1.board, [2], t1.index)
                t1.depthIndex[1][0].moveSeries()
                //console.log(t1.index)
            })

            it('wip prune', () => {
                const board = Board.fromStateString(States.WhitePrune1)
                const t1 = new DepthTree(board, White, [5, 1])
                const t2 = new DepthTree(board, White, [1, 5])
                t1.buildSequence(t1.board, [5, 1], t1.index)
                t2.buildSequence(t2.board, [1, 5], t2.index)
                //console.log(t2.index)
                t2.prune(2, 5, true)
                //console.log(t1)
                //console.log(t2.index)
            })

            it('wip prune 2', () => {
                const board = Board.setup()
                const tree = new DepthTree(board, Red, [3, 1])
                tree.buildSequence(board, [3, 1], tree.index)
                //console.log(SequenceTree.serializeIndex(tree.index, true))
                //console.log(tree.index['7:3'])
                tree.prune(tree.maxDepth, tree.highestFace, true)
                //console.log(SequenceTree.serializeIndex(tree.index, true))
                //console.log(SequenceTree.serializeIndex(turn.allowedMoveIndex, true))

                //const turn = new Turn(board, Red)
                //turn.setRoll([3, 1])                
                //turn.move(7, 3)
                //turn.move(5, 1)
            })

            it('sequence tree index equivalence with depth for basic example', () => {
                const board = new Board
                for (var i = 0; i < 4; ++i) {
                    board.pushOrigin(4, White)
                }
                const tree1 = new BreadthTree(board, White, [5, 2]).build()
                const tree2 = new DepthTree(board, White, [5, 2]).build()

                expect(indexJson(tree1.index)).to.equal(indexJson(tree2.index))
            })
        })
    })

    describe('high face', () => {

        it('should have highest face 4 on WhitePruneFace4', () => {
            const board = Board.fromStateString(States.WhitePruneFace4)
            const turn = new Turn(board, White)
            turn.setRoll(2, 4)
            expect(turn.builder.highestFace).to.equal(4)
        })
    })

    describe('leaf that does not pass', () => {

        it('should allow both the 5 and the 2 for EitherOneMoveWin', () => {
            const board = Board.fromStateString(States.EitherOneMoveWin)
            const turn = new Turn(board, White)
            turn.setRoll(5, 2)
            expect(turn.allowedMoveIndex).to.contain.key('23:5')
            expect(turn.allowedMoveIndex).to.contain.key('23:2')
            //console.log(turn.builder.trees)
        })
    })

    it('should allow 1 then 6', () => {
        const board = Board.fromStateString(States.WhiteAllow16)
        const turn = new Turn(board, White)
        turn.setRoll(1, 6)
        turn.move(18, 1)
        turn.move(19, 6)
        //console.log(turn.allowedMoveIndex)
        expect(turn.allowedMoveIndex).to.contain.key('18:1')
        expect(turn.allowedMoveIndex['18:1'].index).to.contain.key('19:6')
    })

    describe('#serialize', () => {

        it('should be JSONable', () => {
            const tree = new DepthTree(Board.setup(), White, [1, 2]).build()
            const result = tree.serialize()
            JSON.stringify(result)
        })

        it('should sort index', () => {
            const tree = new DepthTree(Board.setup(), White, [1, 2]).build()
            const result1 = tree.serialize((a, b) => a.localeCompare(b))
            const result2 = tree.serialize((a, b) => b.localeCompare(a))
            const keys1 = Object.keys(result1.index)
            const keys2 = Object.keys(result2.index)
            expect(keys1[0]).to.equal('0:1')
            expect(keys2[0]).to.equal('18:1')
        })

        it('should have color == White, board == initial', () => {
            const tree = new DepthTree(Board.setup(), White, [1, 2]).build()
            const result = tree.serialize()
            //console.log(result)
            expect(result.color).to.equal(White)
            expect(result.board).to.equal(tree.board.state28())
        })

        it('node 0:1 should have move.origin=0', () => {
            const tree = new DepthTree(Board.setup(), White, [1, 2]).build()
            const result = tree.serialize()
            //console.log(result)
            expect(result.index['0:1'].move.origin).to.equal(0)
        })

        it('index should be recursive', () => {

            const tree = new DepthTree(Board.setup(), White, [1, 1, 1, 1]).build()
            const sorter = (a, b) => a.localeCompare(b)
            const result = tree.serialize(sorter)

            const base1_exp = tree.index
            const keys1_exp = Object.keys(base1_exp).sort(sorter)

            const base1 = result.index
            const keys1 = Object.keys(base1)

            expect(JSON.stringify(keys1)).to.equal(JSON.stringify(keys1_exp))


            const base2_exp = base1_exp[keys1[0]].index
            const keys2_exp = Object.keys(base2_exp).sort(sorter)

            const base2 = base1[keys1[0]].index
            const keys2 = Object.keys(base2)

            expect(JSON.stringify(keys2)).to.equal(JSON.stringify(keys2_exp))


            const base3_exp = base2_exp[keys2[0]].index
            const keys3_exp = Object.keys(base3_exp).sort(sorter)

            const base3 = base2[keys2[0]].index
            const keys3 = Object.keys(base3)

            expect(JSON.stringify(keys3)).to.equal(JSON.stringify(keys3_exp))


            const base4_exp = base3_exp[keys3[0]].index
            const keys4_exp = Object.keys(base4_exp).sort(sorter)

            const base4 = base3[keys3[0]].index
            const keys4 = Object.keys(base4)

            expect(JSON.stringify(keys4)).to.equal(JSON.stringify(keys4_exp))
        })
    })

    describe('DeviantBuilder', () => {

        class DeviantBuilder extends DepthBuilder {
            buildSequences(faces) {
                return this.deviantSequences
            }
            newTree(...args) {
                return new DeviantTree(...args)
            }
            //buildTrees() {
            //    const trees = super.buildTrees()
            //    this.initialTreeCount = trees.length
            //    return trees
            //}
        }

        class DeviantTree extends DepthTree {
            constructor(board, color, sequence) {
                super(board, color, [1, 2])
                this.sequence = sequence
            }
        }

        it('test white win on deviant roll 3, 6, 2', () => {
            const board = Board.fromStateString(States.WhiteWin362)
            const turn = new Turn(board, White)
            const builder = new DeviantBuilder(turn)
            builder.deviantSequences = [
                [2, 3, 6],
                [2, 6, 3],
                [3, 2, 6],
                [3, 6, 2],
                [6, 2, 3],
                [6, 3, 2]
            ]
            builder.compute()
            expect(builder.maxDepth).to.equal(3)
            //expect(builder.initialTreeCount).to.equal(6)
            expect(builder.trees).to.have.length(6)
            // some will be non-winners
        })
    })

    describe('tree equivalence', () => {

        describe('depth vs breadth', () => {

            function checkEquivalence(t1, t2) {

                const amKeys1 = Object.keys(t1.allowedMoveIndex).sort()
                const amKeys2 = Object.keys(t2.allowedMoveIndex).sort()
                const stKeys1 = Object.keys(t1.endStatesToSeries).sort()
                const stKeys2 = Object.keys(t2.endStatesToSeries).sort()
                const states1 = t1.allowedEndStates.slice(0).sort()
                const states2 = t2.allowedEndStates.slice(0).sort()

                expect(JSON.stringify(t1.allowedFaces)).to.equal(JSON.stringify(t2.allowedFaces))
                expect(JSON.stringify(amKeys1)).to.equal(JSON.stringify(amKeys2))
                expect(JSON.stringify(stKeys1)).to.equal(JSON.stringify(stKeys2))
                expect(JSON.stringify(states1)).to.equal(JSON.stringify(states2))

                // check deep equivalence of index
                const ser1 = SequenceTree.serializeIndex(t1.allowedMoveIndex, (a, b) => b.localeCompare(a))
                const ser2 = SequenceTree.serializeIndex(t2.allowedMoveIndex, (a, b) => b.localeCompare(a))
                expect(JSON.stringify(ser1)).to.equal(JSON.stringify(ser2))

                // the series selected for an end state can be different, and often are,
                // since depth strategy uses flagKey optimization, which sorts the series
                /*
                for (var i = 0; i < stKeys1.length; i++) {
                    var series1 = t1.endStatesToSeries[stKeys1[i]]
                    var series2 = t2.endStatesToSeries[stKeys1[i]]
                    for (var series of [series1, series2]) {
                        series.sort((a, b) => {
                            const cmp = Util.sortNumericAsc(a.origin, b.origin)
                            return cmp != 0 ? cmp : Util.sortNumericAsc(a.face, b.face)
                        })
                    }
                    expect(JSON.stringify(series1)).to.equal(JSON.stringify(series2))
                }
                */
            }

            describe('all rolls', () => {

                const {allRolls} = Rolls
                //const allRolls = [[2, 3]]
                allRolls.forEach(roll => {

                    it('should be equivalent for White at initial state for ' + roll.join(','), () => {
                        const t1 = new Turn(Board.setup(), White)
                        const t2 = new Turn(Board.setup(), White, {breadthTrees: true})
                        expect(t2.opts.breadthTrees).to.equal(true)
                        t1.setRoll(roll)
                        t2.setRoll(roll.slice(0).reverse())
                        checkEquivalence(t1, t2)
                    })
                })
            })

            describe('fixed game play', () => {

                const rolls = Rolls.rolls

                var game1
                var game2

                before(() => {
                    var rollIndex1 = 1
                    var rollIndex2 = 1
                    const roller1 = () => rolls[rollIndex1++]
                    const roller2 = () => rolls[rollIndex2++]
                    game1 = new Game({roller: roller1})
                    game2 = new Game({roller: roller2, breadthTrees: true})
                })

                function playTurns(t1, t2) {
                    const moves = t1.endStatesToSeries[t1.allowedEndStates[0]] || []
                    for (var move of moves) {
                        t1.move(move)
                        t2.move(move)
                    }
                    t1.finish()
                    t2.finish()
                }

                it('game2 should have breadthTrees but not game1', () => {
                    expect(!!game1.opts.breadthTrees).to.equal(false)
                    expect(game2.opts.breadthTrees).to.equal(true)
                })

                it('should be equivalent at first turn', () => {
                    const t1 = game1.firstTurn()
                    const t2 = game2.firstTurn()
                    try {
                        checkEquivalence(t1, t2)
                    } finally {
                        playTurns(t1, t2)
                    }
                })

                Util.intRange(2, 60).forEach(i => {
                    it('should be equivalent at turn ' + i + ' for roll ' + rolls[i].join(','), () => {
                        
                        const turns = [game1.nextTurn().roll(), game2.nextTurn().roll()]
                        
                        if (i == 60) {
                            //console.log(turns[0].color)
                            //console.log(turns[0].startState)
                            //console.log(turns[0].dice)
                            //console.log(turns[0].allowedMoveIndex)
                            //console.log('\n')
                            //console.log(turns[1].allowedMoveIndex)
                            //console.log(JSON.stringify(SequenceTree.serializeIndex(turns[1].allowedMoveIndex), null, 2))
                            //console.log(turns[1].builder.trees[0].winners)
                            //console.log(turns[1].builder.trees[1].winners)
                            //for (var node of turns[1].builder.trees[0].winners) {
                            //    if (!node.hasWinner) {
                            //        console.log('winner no winner tree1', JSON.stringify(node.parent.serialize(), null, 2))
                            //    }
                            //}
                            //for (var node of turns[1].builder.trees[1].winners) {
                            //    if (!node.hasWinner) {
                            //        console.log('winner no winner tree2', JSON.stringify(node.parent.serialize(), null, 2))
                            //    }
                            //}
                            //for (var node of turns[1].builder.trees[0].depthIndex[2]) {
                            //    console.log('tree 1 leaf', node)
                            //}
                            //for (var node of turns[1].builder.trees[1].depthIndex[2]) {
                            //    console.log('tree 2 leaf', node)
                            //}
                        }
                        try {
                            checkEquivalence(...turns)
                        } finally {
                            playTurns(...turns)
                        }
                        
                    })
                })

                it('games should be finished and Red should win', () => {
                    game1.checkFinished()
                    game2.checkFinished()
                    expect(game1.isFinished).to.equal(true)
                    expect(game2.isFinished).to.equal(true)
                    expect(game1.getWinner()).to.equal(game2.getWinner())
                    expect(game1.getWinner()).to.equal(Red)
                })
            })
        })
    })
})