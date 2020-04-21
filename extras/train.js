const Core = require('./src/lib/core')
const {Board} = Core

var game = JSON.parse(fs.readFileSync('/Users/dowings/gameon/match_ff0bdcb7-ca6f-45f7-8598-0950002ed1f4/game_1.json'))

var turns = game.turns.filter(turn => turn.color == 'White')

var dataset = turns.map(turn => {
    return {
        input: turn.allowedEndStates.map(str => Board.fromStateString(str).stateStructure()),
        output: Board.fromStateString(turn.endState).stateStructure()
    }
})




const Mind = require('node-mind')
var mind = new Mind()
var dataset = require('./001/train/game_1_f1924130-7490-456f-8d27-03f7a1d6d144.json')
mind.learn(dataset)

var pred = mind.download()

[0, 0, 2, 0, 0, 0, 0, -5, 0, -3, 0, 0, 0, 5, -5, 0, 0, 0, 3, 0, 5, 0, 0, 0, 0, -2, 0, 0]


NaN
[
    {input: [ 0, 0, 0, 500, 1, 1, 1 ], ouput: [1, 1, 1]},
    {input: [ [0, 1, 0], [0, 0, 0] ], ouput: [0, 1, 0]},
    {input: [ [1, 1, 0], [0, 0, 1] ], ouput: [1, 1, 0]},
    {input: [ [0, 1, 1], [0, 0, 1] ], ouput: [0, 1, 1]}
]

[
    {input: [ 0, 0, 0 ], ouput: [1, 1, 1]},
    {input: [ 0, 1, 0 ], ouput: [0, 1, 0]},
    {input: [ 1, 1, 0 ], ouput: [1, 1, 0]},
    {input: [ 0, 1, 1 ], ouput: [0, 1, 1]}
]

var mind = new Mind()
mind.learn([
  { input: [[0, 0, 0],[0, 0, 0]], output: [ 0, 1, 0 ] },
  { input: [[0, 1, 0],[0, 1, 0]], output: [ 1, 1, 0 ] },
  { input: [[1, 0, 0],[1, 0, 0]], output: [ 1, 1, 1 ] },
  { input: [[1, 1, 0],[1, 1, 0]], output: [ 0, 1, 0 ] }
])

var mind = new Mind()
mind.learn([
  { input: [0, 0, 0], output: [ 0, 1, 0 ] },
  { input: [0, 1, 0], output: [ 1, 1, 0 ] },
  { input: [1, 0, 0], output: [ 1, 1, 1 ] },
  { input: [1, 1, 0], output: [ 0, 1, 0 ] }
])

var mind = new Mind()
mind.learn([
  { input: [0, 0, 2], output: [ 0, 1, 0 ] },
  { input: [0, -1, 0], output: [ 1, 1, 0 ] },
  { input: [1, 0, 0], output: [ 1, 1, 1 ] },
  { input: [1, 1, 0], output: [ 0, 1, 0 ] }
])

var mind = new Mind()
mind.learn([
  { input: [0, 0, 2], output: 0 },
  { input: [0, -1, 0], output: 1 },
  { input: [1, 0, 0], output: 1 },
  { input: [1, 1, 0], output: 0 }
])


var brain = require('brain.js')
var net = new brain.NeuralNetwork({
    inputSize: 56,
    inputRange: 100,
    hiddenLayers: [20, 20, 20],
    iterations: 20000,
    log: true,
    logPeriod: 1
})
var dataset = require('./game.json')

var dataset = []
for (var i = 1; i <100; i++) {
    dataset = dataset.concat(require('./game_' + i.toString().padStart(3, '0') + '.json'))
}

net.train(dataset)

