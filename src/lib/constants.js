/**
 * gameon - Constants class
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
const Pkg = require('../../package.json')
const Version = Pkg.version

const White = 'White'
const Red   = 'Red'

const Colors = {White, Red}

const ColorAbbr = {
    White : 'W'
  , Red   : 'R'
}

const ColorNorm = {
    White
  , Red
  , W : White
  , R : Red
}

const Direction = {
    White : 1
  , Red   : -1
}

const Opponent = {
    White : Red
  , Red   : White
}

const InsideOrigins = {
    White : [ 18, 19, 20, 21, 22, 23 ]
  , Red   : [ 5, 4, 3, 2, 1, 0 ]
}

const OutsideOrigins = {
    White : [
       0,  1,  2,  3,  4,  5,  6,
       7,  8,  9, 10, 11, 12, 13,
      14, 15, 16, 17
    ]
  , Red   : [
      23, 22, 21, 20, 19, 18, 17,
      16, 15, 14, 13, 12, 11, 10,
       9,  8,  7,  6
    ]
}

const TopPoints = [
  13, 14, 15, 16, 17,
  18, 19, 20, 21, 22,
  23, 24
]
const BottomPoints = [
  12, 11, 10, 9, 8,
   7,  6,  5, 4, 3,
   2,  1
]

const PointOrigins = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}
const OriginPoints = {
    Red   : {'-1': -1}
  , White : {'-1': -1}
}

function populatePointsAndOrigins(pointOrigins, originPoints) {
    for (var origin = 0; origin < 24; ++origin) {
        // Origins are from 0 to 23
        // Points are from 1 to 24
        var point = origin + 1
        // Red point 1 is origin 0
        pointOrigins.Red[point] = point - 1
        // White point 1 is origin 23
        pointOrigins.White[point] = 24 - point
        // Red origin 0 is point 1
        originPoints.Red[origin] = origin + 1
        // White origin 0 is point 24
        originPoints.White[origin] = 24 - origin
    }
}

populatePointsAndOrigins(PointOrigins, OriginPoints)

const MoveHashes = {}
const MoveCoords = {}

function populateMoveHashesCoords(hashes, coords) {
    const faces = [ 1, 2, 3, 4, 5, 6 ]
    for (var origin = -1; origin < 24; ++origin) {
        hashes[origin] = {}
        coords[origin] = {}
        faces.forEach(face => {
            hashes[origin][face] = origin + ':' + face
            coords[origin][face] = {origin, face}
        })
    }
}

populateMoveHashesCoords(MoveHashes, MoveCoords)

const BoardStrings = {
    Initial: '0|0|2:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0'
}

const Chars = {
    empty : ''
  , sp    : ' '
  , dblSp : '  '
  , br    : '\n'
  , hr    : '\u2501'
  , check : '\u2713'
  , pointer : '\u276f'
    //https://unicode-table.com/en/sets/arrow-symbols/#down-arrows
  , arrow : {
        left  : '\u2190'
      , up    : '\u2191'
      , right : '\u2192'
      , down  : '\u2193'
    }
    // https://codepoints.net/box_drawing
  , table: {
        dash    : '\u2501'
      , pipe    : '\u2503'
      , dblPipe : '\u2503\u2503'
      , top     : {
            left   : '\u250f'
          , middle : '\u2533'
          , right  : '\u2513'
        }
      , middle  : {
            left   : '\u2523'
          , middle : '\u254b'
          , right  : '\u252b'
        }
      , bottom  : {
            left   : '\u2523'//'\u2517'
          , middle : '\u253b'
          , right  : '\u252b'//'\u251b'
        }
      , footer  : {
            left   : '\u2517'
          , middle : '\u2501'
          , right  : '\u251b'
        }
    }
}
// Convenience aliases
Chars.table.top.mid    = Chars.table.top.middle
Chars.table.middle.mid = Chars.table.middle.middle
Chars.table.bottom.mid = Chars.table.bottom.middle
Chars.table.footer.mid = Chars.table.footer.middle
Chars.table.mid  = Chars.table.middle
Chars.table.foot = Chars.table.footer
Chars.table.bot  = Chars.table.bottom


const DefaultServerUrl = 'https://gameon.dougowings.net'
const ObsoleteServerUrls = [
    'ws://bg.dougowings.net:8080'
  , 'wss://bg.dougowings.net'
  , 'https://bg.dougowings.net'
]

const DefaultTermEnabled = !process.env.GAMEON_TEST
const DefaultThemeName = 'Default'

// This should be set in production environments with SESSION_SECRET
const DefaultSessionSecret = 'D2hjWtg95VkuzhFBVxnhDhSU4J9BYnz8'
const DefaultSessionCookie = 'gasid'

const DefaultEmailFromName    = 'Gameon'
const DefaultEmailFromAddress = 'noreply@nowhere.example'
const DefaultEmailType        = 'mock'

const DefaultAuthType = 'anonymous'
// This should be set by AUTH_SALT in production environments
const DefaultSalt  = 'RYm!BtLhPTx4%QrGku_6?Q*NZsfM54Q=Y9?p^q5$9#TM42YcY4WfEGb#48-x88-n'
// Minimum eight characters, at least one letter and one number:
// from: https://stackoverflow.com/questions/19605150/regex-for-password-must-contain-at-least-eight-characters-at-least-one-number-a
const DefaultPasswordRegex = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d\\w\\W]{8,}$'
const DefaultPasswordHelp = 'Minimum eight characters, at least one lowercase letter, one uppercase letter, and one number'

const InvalidUsernameChars = '/\\?%*:|"\'&#'.split('')
const EncryptedFlagPrefix = 'encrypted_'

const Menu = {

    LoginChoiceMap : {
        changePassword  : {
            message : 'Password changed'
          , method  : 'promptChangePassword'
        }
      , confirmAccount  : {
            message : 'Account confirmed'
          , method  : 'promptConfirmAccount'
        }
      , createAccount   : {
            message : 'Account created'
          , method  : 'promptCreateAccount'
        }
      , forgotPassword  : {
            message : 'Password reset'
          , method  : 'promptForgotPassword'
        }
      , newConfirmKey   : {
            message : 'New confirmation key requested. Check your email.'
          , method  : 'promptNewConfirmKey'
        }
      , testCredentials : {
            message : 'Testing credentials'
          , method  : null
        }
    }

  , MainChoiceMap : {
        play : {
            name   : 'Play'
          , method : 'playMenu'
          , select : 'p'
        }
      , account : {
            name   : 'Account'
          , method : 'accountMenu'
          , select : 'a'
        }
      , settings : {
            name   : 'Settings'
          , method : 'settingsMenu'
          , select : 's'
        }
      , lab : {
            name   : 'Lab'
          , method : 'runLab'
          , select : 'l'
        }
    }

 ,  PlayChoiceMap : {
        startOnline   : {
            message    : 'Start Online Match'
          , method     : 'startOnlineMatch'
          , isAdvanced : false
          , isOnline   : true
          , isCreate   : true
          , isJoin     : false
        }
      , joinOnline : {
            message     : 'Join Online Match'
          , method      : 'joinOnlineMatch'
          , isAdvanced  : false
          , isOnline    : true
          , isCreate    : false
          , isJoin      : true
          , matchAnswer : 'start'
        }
      , playHumans : {
            message    : 'Human vs Human'
          , method     : 'playHumans'
          , isAdvanced : true
          , isOnline   : false
          , isCreate   : true
          , isJoin     : false
        }
      , playRobot   : {
            message    : 'Human vs Robot'
          , method     : 'playRobot'
          , isAdvanced : true
          , isOnline   : false
          , isCreate   : true
          , isJoin     : false
        }
      , playRobots : {
            message    : 'Robot vs Robot'
          , method     : 'playRobots'
          , isAdvanced : true
          , isOnline   : false
          , isCreate   : true
          , isJoin     : false
        }
    }
}

const CHash = 'a9c0fc569fd231b004d44e718add99e2'

const Constants = {
    BoardStrings
  , BottomPoints
  , Chars
  , CHash
  , ColorAbbr
  , ColorNorm
  , Colors
  , DefaultAuthType
  , DefaultEmailFromAddress
  , DefaultEmailFromName
  , DefaultEmailType
  , DefaultPasswordHelp
  , DefaultPasswordRegex
  , DefaultSalt
  , DefaultServerUrl
  , DefaultSessionCookie
  , DefaultSessionSecret
  , DefaultThemeName
  , Direction
  , EncryptedFlagPrefix
  , InsideOrigins
  , InvalidUsernameChars
  , Menu
  , MoveCoords
  , MoveHashes
  , ObsoleteServerUrls
  , Opponent
  , OriginPoints
  , OutsideOrigins
  , Pkg
  , PointOrigins
  , Red
  , TopPoints
  , Version
  , White
}

module.exports = Constants