/**
 * gameon - Dice class
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
const {Red, White} = require('./constants')

const {InvalidRollError, InvalidRollDataError} = require('./errors')

class Dice {

    /**
     * @return integer
     */
    static rollOne() {
        return Math.ceil(Math.random() * 6)
    }

    /**
     * @return Array[integer]
     */
    static rollTwo() {
        return [Dice.rollOne(), Dice.rollOne()]
    }

    /**
     * @return Array[integer]
     */
    static faces(roll) {
        const faces = [roll[0], roll[1]]
        if (roll[0] == roll[1]) {
            faces.push(roll[0])
            faces.push(roll[1])
        }
        return faces
    }

    /**
     * @throws GameError.InvalidRollError
     */
    static checkOne(face) {
        if (!Number.isInteger(face)) {
            throw new InvalidRollError('die face must be an integer')
        }
        if (face > 6) {
            throw new InvalidRollError('die face cannot be greater than 6')
        }
        if (face < 1) {
            throw new InvalidRollError('die face cannot be less than 1')
        }
    }

    /**
     * @throws GameError.InvalidRollError
     */
    static checkTwo(faces) {
        if (faces.length > 2) {
            throw new InvalidRollError('more than two dice not allowed')
        }
        Dice.checkOne(faces[0])
        Dice.checkOne(faces[1])
    }

    /**
     * @throws GameError.InvalidRollError
     */
    static checkFaces(faces)  {
        if (faces.length == 4) {
            Dice.checkOne(faces[0])
            if (faces[0] != faces[1] || faces[0] != faces[2] || faces[0] != faces[3]) {
                throw new InvalidRollError('4 faces must be equal')
            }
        } else {
            if (faces.length != 2) {
                throw new InvalidRollError('faces must be length 2 or 4')
            }
            Dice.checkOne(faces[0])
            Dice.checkOne(faces[1])
        }
    }

    /**
     * @return string
     */
    static getWinner(dice) {
        if (dice[0] == dice[1]) {
            return null
        }
        return dice[0] > dice[1] ? White : Red
    }

    /**
     * @return Array[Array[integer]]
     */
    static sequencesForFaces(faces) {
        if (faces.length == 2) {
            return [
                [faces[0], faces[1]]
              , [faces[1], faces[0]]
            ]
        }
        return [
            [faces[0], faces[1], faces[2], faces[3]]
        ]
    }

    /**
     * @return Function
     */
    static createRoller(rolls) {
        let rollIndex = 0
        let maxIndex = rolls.length - 1
        return () => {
            if (rollIndex > maxIndex) {
                rollIndex = 0
            }
            return rolls[rollIndex++]
        }
    }

    /**
     * @throws ArgumentError.InvalidRollDataError
     *
     * @return Object
     */
    static validateRollsData(data) {
        if (!Array.isArray(data.rolls)) {
            throw new InvalidRollDataError('Rolls key must be an array')
        }
        if (!data.rolls.length) {
            throw new InvalidRollDataError('Rolls cannot be empty')
        }
        // check for at least one valid first roll
        let isUniqueFound = false
        for (var i = 0; i < data.rolls.length; ++i) {
            var dice = data.rolls[i]
            try {
                Dice.checkTwo(dice)
            } catch (err) {
                throw new InvalidRollDataError('Invalid roll found at index ' + i + ': ' + err.message, err)
            }
            if (dice[0] != dice[1]) {
                isUniqueFound = true
            }
        }
        if (!isUniqueFound) {
            throw new InvalidRollDataError('Cannot find one unique roll')
        }
        return data
    }
}

module.exports = Dice