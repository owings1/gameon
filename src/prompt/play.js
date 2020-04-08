const {Match, Game, Opponent, Red, White} = require('../lib/game')

const Client = require('../lib/client')
const Logger = require('../lib/logger')
const Util   = require('../lib/util')

const chalk     = require('chalk')
const inquirer  = require('inquirer')
const sp        = Util.joinSpace

const Shorts = {
    Red   : chalk.bold.red('R')
  , White : chalk.bold.white('W')
  , R     : chalk.bold.red('R')
  , W     : chalk.bold.white('W')
}

const Chars = {
    topLeft      : '\u250f'
  , topMid       : '\u2533'
  , topRight     : '\u2513'
  , midLeft      : ''  // TODO
  , sep          : '\u2503'
  , dblSep       : '\u2503\u2503'
  , midRight     : ''  // TODO
  , botLeft      : '\u2517'
  , botMiddle    : '\u253b'
  , botRight     : '\u251b'
  , dash         : '\u2501'
  , die          :  {
        1  : '\u2680'
      , 2  : '\u2681'
      , 3  : '\u2682'
      , 4  : '\u2683'
      , 5  : '\u2684'
      , 6  : '\u2685'
    }
}

class Menu {

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    async mainMenu() {
        const getMainChoices = () => [
            {
                value : 'newLocal'
              , name  : 'New Local Match'
            }
          , {
                value : 'newOnline'
              , name  : 'New Online Match'
            }
          , {
                value : 'joinOnline'
              , name  : 'Join Online Match'
            }
          , {
                value : 'quit'
              , name  : 'Quit'
            }
        ]
        while (true) {
            var mainChoices = getMainChoices()
            var answers = await this.prompt({
                name    : 'mainChoice'
              , message : 'Select option'
              , type    : 'rawlist'
              , choices : mainChoices
            })
            var {mainChoice} = answers
            if (mainChoice == 'newLocal' || mainChoice == 'newOnline') {
                var matchOpts = await this.newMatchMenu(mainChoice == 'newOnline')
                if (!matchOpts) {
                    continue
                }
                if (mainChoice == 'newLocal') {
                    var player = this.newLocalPlayer()
                    await player.playMatch(new Match(matchOpts.total, matchOpts))
                }
                var player = this.newSocketPlayer(matchOpts.serverUrl)
                await player.startMatch(matchOpts)
            }
            if (mainChoice == 'joinOnline') {
                var joinAnswers = await this.prompt([
                    {
                        name    : 'serverUrl'
                      , message : 'Server URL'
                      , type    : 'input'
                      , default : 'ws://localhost:8080'
                    }
                  , {
                        name    : 'matchId'
                      , message : 'Match ID'
                      , type    : 'input'
                      , when    : answers => answers.serverUrl
                    }
                ])
                if (joinAnswers.serverUrl && joinAnswers.matchId) {
                    var player = this.newSocketPlayer(joinAnswers.serverUrl)
                    await player.joinMatch(joinAnswers.matchId)
                }
            }
            if (mainChoice == 'quit') {
                break
            }
        }
    }

    newLocalPlayer() {
        return new LocalPlayer
    }

    newSocketPlayer(serverUrl) {
        return new SocketPlayer(serverUrl)
    }

    async newMatchMenu(isOnline) {
        const matchOpts = {
            total      : 1
          , isJacoby   : false
          , isCrawford : true
          , serverUrl  : null
        }
        const getMainChoices = () => {
            var choices = [
                {
                    value : 'start'
                  , name  : 'Start Match'
                }
            ]
            if (isOnline) {
                choices.push({
                    value : 'serverUrl'
                  , name  : 'Server URL'
                  , question : {
                        name    : 'serverUrl'
                      , message : 'Server URL'
                      , type    : 'input'
                      , default : () => matchOpts.serverUrl || 'ws://localhost:8080'
                    }
                })
            }
            choices = choices.concat([
                {
                    value : 'total'
                  , name  : 'Match Total'
                  , question : {
                        name     : 'total'
                      , message  : 'Match Total'
                      , type     : 'input'
                      , default  : () => '' + matchOpts.total
                      , validate : PromptPlayer.validator('matchTotal')
                    }
                }
              , {
                    value : 'isJacoby'
                  , name  : 'Jacoby Rule'
                  , question : {
                        name    : 'isJacoby'
                      , message : 'Jacoby Rule'
                      , type    : 'confirm'
                      , default : () => matchOpts.isJacoby
                    }
                }
              , {
                    value : 'isCrawford'
                  , name  : 'Crawford Rule'
                  , question : {
                        name    : 'isCrawford'
                      , message : 'Crawford Rule'
                      , type    : 'confirm'
                      , default : () => matchOpts.isCrawford
                    }
                }
              , {
                    value : 'quit'
                  , name  : 'Cancel'
                }
            ])
            return choices
        }

        while (true) {
            var mainChoices = getMainChoices()
            var maxLength = Math.max(...mainChoices.map(choice => choice.name.length))
            mainChoices.forEach(choice => {
                if (choice.question) {
                    choice.name = sp(choice.name.padEnd(maxLength + 1, ' '), ':', matchOpts[choice.value])
                }
            })
            var answers = await this.prompt({
                name    : 'mainChoice'
              , message : 'Select option'
              , type    : 'rawlist'
              , choices : mainChoices
            })
            var {mainChoice} = answers
            if (mainChoice == 'start') {
                return matchOpts
            }
            if (mainChoice == 'quit') {
                return
            }
            var question = mainChoices.find(choice => choice.value == mainChoice).question
            answers = await this.prompt(question)
            matchOpts[question.name] = answers[question.name]
            matchOpts.total = +matchOpts.total
        }
    }

    static doMainIfEquals(lhs, rhs) {
        if (lhs === rhs) {
            Menu.main(new Menu)
        }
    }
}


class PromptPlayer extends Logger {

    constructor() {
        super()
    }

    async playMatch(match) {
        this.match = match
        this.info('Starting match')
        while (true) {
            var game = await this.nextGame()
            await this.playGame(game)
            await this.updateScore()
            if (match.hasWinner()) {
                break
            }
        }
        const winner = match.getWinner()
        this.info(winner, 'wins the match', match.scores[winner], 'to', match.scores[Opponent[winner]])
        delete this.match
    }

    async nextGame() {
        return this.match.nextGame()
    }

    async updateScore() {
        this.match.updateScore()
    }

    drawBoard(...args) {
        return PromptPlayer.drawBoard(...args)
    }

    prompt(questions) {
        this._prompt = inquirer.prompt(Util.castToArray(questions))
        return this._prompt
    }

    static validator(name, params) {
        switch (name) {
            case 'face':
                var {faces} = params
                return value => (faces.indexOf(+value) > -1) || 'Please enter one of ' + faces.join()
            case 'origin':
                var {choices} = params
                return value => (choices.indexOf(value) > -1) || 'Please enter one of ' + choices.join()
            case 'matchTotal':
                return value => {
                    value = +value
                    return !isNaN(value) && Number.isInteger(value) && value > 0 || 'Please enter a number > 0'
                }
        }
    }

    static describeMove(move) {
        const origin = move.isComeIn ? 'bar' : move.origin + 1
        const dest = move.isBearoff ? 'home' : move.dest + 1
        return sp(move.color, 'moves from', origin, 'to', dest)
    }

    static drawBoard(game, match) {

        const {board, cubeOwner, cubeValue} = game
        const {isCrawford} = game.opts

        const topHalf = board.slots.slice(0, 12)
        const botHalf = board.slots.slice(12, 24)
        const p = 4
        const m = 1

        const builder = []
        const wr = (...args) => {
            builder.push(sp(...args))
        }

        const writeSlotRow = (slot, d) => {
            var c = slot[d] ? slot[d].c : ''
            var str = c.padStart(p, ' ')
            if (c == 'R') {
                str = chalk.bold.red(str)
            } else if (c == 'W') {
                str = chalk.bold.white(str)
            }
            wr(str)
        }

        const writeHome = color => {
            wr('  ')
            if (board.homes[color].length > 0) {
                wr(sp(Shorts[color], chalk.grey(board.homes[color].length)))
            }
        }

        const writeBarRow = color => {
            wr(Chars.sep.padEnd(6 * p + 1, ' '))
            if (board.bars[color].length > 0) {
                wr(sp(' ', Shorts[color], chalk.grey(board.bars[color].length)))
            } else {
                wr(chalk.grey('  ' + Chars.dblSep + ' '))
            }
            wr(''.padEnd(6 * p, ' ') + Chars.sep)
        }

        const writeCubePart = n => {
            var cubeStr
            switch (n) {
                case 0:
                    cubeStr = Chars.topLeft + ''.padEnd(3, Chars.dash) + Chars.topRight
                    break
                case 1:
                    cubeStr = (Chars.sep + ' ' + (isCrawford ? 'CR' : cubeValue)).padEnd(4, ' ') + Chars.sep
                    break
                case 2:
                    cubeStr = Chars.botLeft + ''.padEnd(3, Chars.dash) + Chars.botRight
                    break
            }
            if (cubeStr) {
                if (isCrawford) {
                    cubeStr = chalk.grey(cubeStr)
                }
                wr(cubeStr)
            }
        }

        wr('\n')

        // Top numbers
        wr(' ')
        for (var i = 12; i >= 1; i--) {
            wr(i.toString().padStart(p, ' '))
            if (i == 7) {
                wr('    ')
            }
        }
        wr('\n')
        wr(Chars.topLeft.padEnd(12 * p + 2 + 4, Chars.dash) + Chars.topRight + '\n')

        // Top piece rows
        for (var d = 0; d < 6; d++) {
            wr(Chars.sep)
            for (var i = topHalf.length - 1; i >= 0; i--) {
                writeSlotRow(topHalf[i], d)
                if (i == 6) {
                    wr(chalk.grey('  ' + Chars.dblSep))
                }
            }
            wr(' ' + Chars.sep)
            // Top home
            if (d == 0) {
                writeHome(Red)
            }
            if (match && d == 1) {
                wr(' ' + match.scores.Red + 'pts')
            }
            if (cubeValue && cubeOwner == Red) {
                wr(' ')
                writeCubePart(d - 2)
            }
            wr('\n')
        }

        // Top piece overflow numbers row
        wr(Chars.sep)
        for (var i = topHalf.length - 1; i >= 0; i--) {
            var slot = topHalf[i]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(p, ' ')))
            if (i == 6) {
                wr(chalk.grey('  ' + Chars.dblSep))
            }
        }
        wr(' ' + Chars.sep)
        wr('\n')

        writeBarRow(White)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            writeCubePart(0)
        }
        wr('\n')

        // between bars blank row
        wr(Chars.sep.padEnd(6 * p + 1, ' '))
        wr(chalk.grey('  ' + Chars.dblSep))
        wr(''.padEnd(6 * p + 1, ' ') + Chars.sep)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            writeCubePart(1)
        }
        wr('\n')

        writeBarRow(Red)
        if (cubeValue && !cubeOwner) {
            wr(' ')
            writeCubePart(2)
        }
        wr('\n')

        // Bottom piece overflow numbers row
        wr(Chars.sep)
        for (var i = 0; i < botHalf.length; i++) {
            var slot = botHalf[i]
            var n = slot.length > 6 ? slot.length : ''
            wr(chalk.grey(('' + n).padStart(p, ' ')))
            if (i == 5) {
                wr(chalk.grey('  ' + Chars.dblSep))
            }
        }
        wr(' ' + Chars.sep + '\n')

        // Bottom piece rows
        for (var d = 5; d >= 0; d--) {
            wr(Chars.sep)
            for (var i = 0; i < botHalf.length; i++) {
                writeSlotRow(botHalf[i], d)
                if (i == 5) {
                    wr(chalk.grey('  ' + Chars.dblSep))
                }
            }
            wr(' ' + Chars.sep)
            // Bottom home
            if (d == 0) {
                writeHome(White)
            }
            if (match && d == 1) {
                wr(' ' + match.scores.White + 'pts')
            }
            if (cubeValue && cubeOwner == White) {
                wr(' ')
                writeCubePart(5 - d - 1)
            }
            wr('\n')
        }

        // Bottom numbers
        wr(Chars.botLeft.padEnd(12 * p + 2 + 4, Chars.dash) + Chars.botRight + '\n')
        wr(' ')
        for (var i = 13; i < 25; i++) {
            wr(('' + i).padStart(p, ' '))
            if (i == 18) {
                wr('    ')
            }
        }
        wr('\n')

        wr('\n')

        return builder.join('')
    }
}

class LocalPlayer extends PromptPlayer {

    constructor() {
        super()
    }

    async playGame(game) {

        this.info('Starting game')
        const firstTurn = await this.firstTurn(game)
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())
        await this.playRoll(firstTurn, game)

        while (true) {

            var turn = await this.nextTurn(game)
            this.info(turn.color + "'s turn")

            var action = game.canDouble(turn.color) ? await this.promptAction() : 'roll'

            if (action == 'double') {
                this.info(turn.color, 'wants to double the stakes to', game.cubeValue * 2)
                turn.setDoubleOffered()
                var accept = await this.promptAcceptDouble(turn)
                if (accept) {
                    game.cubeValue *= 2
                    game.cubeOwner = Opponent[turn.color]
                    this.log(Opponent[turn.color], 'accepts the double')
                    this.log(Opponent[turn.color], 'owns the cube at', game.cubeValue)
                } else {
                    turn.setDoubleDeclined()
                    game.checkFinished()
                    break
                }
            }

            this._rollForTurn(turn, game.turns.length)

            await this.playRoll(turn, game)

            if (game.checkFinished()) {
                break
            }
        }

        this.writeStdout(this.drawBoard(game, this.match))
        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async firstTurn(game) {
        return game.firstTurn()
    }

    async nextTurn(game) {
        return game.nextTurn()
    }

    async playRoll(turn, game) {
        if (turn.isCantMove) {
            this.info(turn.color, 'rolls', turn.dice.join())
            this.info(turn.color, 'cannot move')
            await this.finishTurn(turn, game)
            return
        }
        const drawBoard = () => this.writeStdout(this.drawBoard(game, this.match))
        drawBoard()
        while (true) {
            this.info(turn.color, 'rolled', turn.diceSorted.join(), 'with', turn.remainingFaces.join(), 'remaining')
            var moves = turn.getNextAvailableMoves()
            var origin = await this.promptOrigin(moves.map(move => move.origin), turn.moves.length > 0)
            if (origin == 'undo') {
                turn.unmove()
                drawBoard()
                continue
            }
            var face = await this.promptFace(moves.filter(move => move.origin == origin).map(move => move.face))
            var move = turn.move(origin, face)
            this.info(PromptPlayer.describeMove(move))
            drawBoard()
            if (turn.getNextAvailableMoves().length == 0) {
                var finish = await this.promptFinishOrUndo()
                if (finish == 'undo') {
                    turn.unmove()
                    drawBoard()
                    continue
                } else {
                    await this.finishTurn(turn, game)
                    break
                }
            }
        }
    }

    async finishTurn(turn, game) {
        turn.finish()
    }

    async promptAction() {
        const answers = await this.prompt({
            name    : 'action'
          , type    : 'rawlist'
          , choices : ['roll', 'double']
        })
        return answers.action
    }

    async promptAcceptDouble(turn) {
        const answers = await this.prompt({
            name    : 'accept'
          , type    : 'confirm'
          , message : sp('Does', Opponent[turn.color], 'accept the double?')
        })
        return answers.accept
    }

    async promptOrigin(origins, canUndo) {
        origins = Util.uniqueInts(origins).sort(Util.sortNumericAsc).map(i => i > -1 ? i + 1 : i)
        const choices = origins.map(i => '' + i)
        var message = 'Origin '
        if (origins[0] == -1) {
            message += ' [(b)ar]'
            choices[0] = 'b'
        } else {
            message += '[' + choices.join() + ']'
        }
        if (canUndo) {
            choices.push('u')
            message += ' or (u)ndo'
        }
        const question = {
            name     : 'origin'
          , type     : 'input'
          , message
          , validate : PromptPlayer.validator('origin', {choices})
        }
        if (origins.length == 1) {
            question.default = '' + choices[0]
        }
        const answers = await this.prompt(question)
        if (answers.origin == 'u') {
            return 'undo'
        } else if (answers.origin == 'b') {
            return -1
        }
        return +answers.origin - 1
    }

    async promptFace(faces) {
        faces = Util.uniqueInts(faces).sort(Util.sortNumericDesc)
        if (faces.length == 1) {
            return faces[0]
        }
        const answers = await this.prompt({
            name     : 'face'
          , type     : 'input'
          , message  : 'Die [' + faces.join() + ']'
          , validate : PromptPlayer.validator('face', {faces})
          , default  : '' + faces[0]
        })
        return +answers.face
    }

    async promptFinishOrUndo() {
        const answers = await this.prompt({
            name    : 'finish'
          , type    : 'rawlist'
          , choices : ['finish', 'undo']
        })
        return answers.finish
    }

    // allow override for testing
    _rollForTurn(turn, i) {
        turn.roll()
    }
}

class SocketPlayer extends LocalPlayer {

    constructor(serverUrl) {
        super()
        this.serverUrl = serverUrl
        this.client = new Client(serverUrl)
        this.color = null
        this.match = null
    }

    async startMatch(matchOpts) {
        this.color = White
        const match = await this.client.startMatch(matchOpts)
        await this.playMatch(match)
    }

    async joinMatch(matchId) {
        this.color = Red
        const match = await this.client.joinMatch(matchId)
        await this.playMatch(match)
    }

    async nextGame() {
        return await this.client.nextGame()
    }

    async playGame(game) {

        const drawBoard = () => this.writeStdout(this.drawBoard(game, this.match))

        this.info('Starting game')
        const firstTurn = await this.client.firstTurn(game)
        this.info(firstTurn.color, 'wins the first roll with', firstTurn.dice.join())
        if (firstTurn.color == this.color) {
            await this.playRoll(firstTurn, game)
            drawBoard()
        } else {
            drawBoard()
            this.info(firstTurn.color, 'rolled', firstTurn.dice.join())
            await this.waitForOpponentMoves(firstTurn, game)
        }

        while (true) {

            drawBoard()

            var turn = await this.nextTurn(game)
            this.info(turn.color + "'s turn")

            if (turn.color == this.color) {
                await this.playTurn(turn, game)
            } else {
                await this.waitForOpponentTurn(turn, game)
            }

            if (game.checkFinished()) {
                break
            }
        }

        this.writeStdout(this.drawBoard(game, this.match))
        this.info(game.winner, 'has won the game with', game.finalValue, 'points')
    }

    async nextTurn(game) {
        return await this.client.nextTurn(game)
    }

    async playTurn(turn, game) {
        if (game.canDouble(turn.color)) {
            var action = await this.promptAction()
        }
        if (action == 'double') {
            await this.offerDouble(turn, game)
            if (turn.isDoubleDeclined) {
                return
            }
            this.info('Opponent accepted the double')
        }
        await this.rollTurn(turn, game)
        await this.playRoll(turn, game)
    }

    async offerDouble(turn, game) {
        await this.client.offerDouble(turn, game)
    }

    async acceptDouble(turn, game) {
        await this.client.acceptDouble(turn, game)
        this.info('You have accepted the double')
        const drawBoard = () => this.writeStdout(this.drawBoard(game, this.match))
        drawBoard()
    }

    async declineDouble(turn, game) {
        await this.client.declineDouble(turn, game)
    }

    async rollTurn(turn, game) {
        await this.client.rollTurn(turn, game)
    }

    async finishTurn(turn, game) {
        this.info('Finishing turn')
        await this.client.finishMoves(turn, game)
    }

    async waitForOpponentTurn(turn, game) {
        this.info('Waiting for opponent action')
        await this.client.waitForOpponentOption(turn, game)
        if (turn.isDoubleOffered) {
            this.info(turn.color, 'wants to double the stakes to', game.cubeValue * 2)
            const isAccept = await this.promptAcceptDouble(turn, game)
            if (isAccept) {
                await this.acceptDouble(turn, game)
                await this.client.waitForOpponentOption(turn, game)
            } else {
                await this.declineDouble(turn, game)
                return
            }
        }
        this.info(turn.color, 'rolled', turn.diceSorted.join())
        await this.waitForOpponentMoves(turn, game)

    }

    async waitForOpponentMoves(turn, game) {
        this.info('Waiting for opponent to move')
        await this.client.waitForOpponentMoves(turn, game)
    }
}

Menu.main = function(menu) {
    menu.mainMenu()
    return menu
}

Menu.doMainIfEquals(require.main, module)


PromptPlayer.Menu = Menu
PromptPlayer.LocalPlayer = LocalPlayer
PromptPlayer.SocketPlayer = SocketPlayer
module.exports = PromptPlayer