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
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
/**
 * Package info
 */
export const BaseDir = path.resolve(DIR, '../..')
export const Pkg = JSON.parse(fs.readFileSync(path.resolve(BaseDir, 'package.json')))
export const Version = Pkg.version

export const DefaultLocale = 'en'
export const LocaleNames   = Pkg.lingui.locales.map(locale => path.basename(locale))
export const LocalesDir    = path.resolve(BaseDir, 'locale')

/**
 * Test Environment
 */
export const IsTest = parseInt(process.env.GAMEON_TEST) > 0

/**
 * Core
 */
export const White = 'White'
export const Red   = 'Red'

export const Colors = {White, Red}

export const ColorAbbr = {
    White : 'W',
    Red   : 'R',
}

export const ColorNorm = {
    White,
    Red,
    W : White,
    R : Red,
}

export const Direction = {
    White : 1,
    Red   : -1,
}

export const Opponent = {
    White : Red,
    Red   : White,
}

export const InsideOrigins = {
    White : [ 18, 19, 20, 21, 22, 23 ],
    Red   : [ 5, 4, 3, 2, 1, 0 ],
}

export const OutsideOrigins = {
    White : [
       0,  1,  2,  3,  4,  5,  6,
       7,  8,  9, 10, 11, 12, 13,
      14, 15, 16, 17
    ],
    Red   : [
      23, 22, 21, 20, 19, 18, 17,
      16, 15, 14, 13, 12, 11, 10,
       9,  8,  7,  6
    ],
}

export const TopPoints = [
  13, 14, 15, 16, 17,
  18, 19, 20, 21, 22,
  23, 24
]
export const BottomPoints = [
  12, 11, 10, 9, 8,
   7,  6,  5, 4, 3,
   2,  1
]

export const PointOrigins = {
    Red   : {'-1': -1},
    White : {'-1': -1},
}
export const OriginPoints = {
    Red   : {'-1': -1},
    White : {'-1': -1},
}

for (let origin = 0; origin < 24; ++origin) {
    // Origins are from 0 to 23
    // Points are from 1 to 24
    let point = origin + 1
    // Red point 1 is origin 0
    PointOrigins.Red[point] = point - 1
    // White point 1 is origin 23
    PointOrigins.White[point] = 24 - point
    // Red origin 0 is point 1
    OriginPoints.Red[origin] = origin + 1
    // White origin 0 is point 24
    OriginPoints.White[origin] = 24 - origin
}


export const MoveHashes = {}
export const MoveCoords = {}

const faces = [ 1, 2, 3, 4, 5, 6 ]
for (let origin = -1; origin < 24; ++origin) {
    MoveHashes[origin] = {}
    MoveCoords[origin] = {}
    faces.forEach(face => {
        MoveHashes[origin][face] = origin + ':' + face
        MoveCoords[origin][face] = {origin, face}
    })
}


export const BoardStrings = {
    Initial: '0|0|2:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0',
}

/**
 * Symbols
 */
 export const Chars = {
    empty : '',
    sp    : ' ',
    dblSp : '  ',
    br    : '\n',
    hr    : '\u2501',
    info  : '\u2139',
    warn  : '\u26a0',
    error : '\u2716',
    check : '\u2713', // \u2714 \u221a
    pointer : '\u276f',
    bullet  : '\u2022',
    //https://unicode-table.com/en/sets/arrow-symbols/#down-arrows
    arrow : {
        left  : '\u2190',
        up    : '\u2191',
        right : '\u2192',
        down  : '\u2193',
    },
    // https://codepoints.net/box_drawing
    table: {
        dash    : '\u2501',  // console: 2500
        pipe    : '\u2503', // console: 2502
        vdash   : '|',
        dot     : '\u2022',
        dblPipe : '\u2503\u2503',
        top     : {
            left   : '\u250f', // console: 250c
            middle : '\u2533',
            right  : '\u2513',
        },
        middle  : {
            left   : '\u2523',  // console: 251c
            middle : '\u254b', 
            right  : '\u252b', // console: 2524
        },
        bottom  : {
            left   : '\u2523',// \u2517
            middle : '\u253b',
            right  : '\u252b',// \u251b
        },
        footer  : {
            left   : '\u2517', // console: 2518
            middle : '\u2501',
            right  : '\u251b',
        },
    },
}
// Convenience aliases
Chars.table.top.mid    = Chars.table.top.middle
Chars.table.middle.mid = Chars.table.middle.middle
Chars.table.bottom.mid = Chars.table.bottom.middle
Chars.table.footer.mid = Chars.table.footer.middle
Chars.table.mid  = Chars.table.middle
Chars.table.foot = Chars.table.footer
Chars.table.bot  = Chars.table.bottom


/**
 * User settings.
 */
 export const DefaultAnsiEnabled = !IsTest
 export const DefaultThemeName = 'Default'
 export const DefaultServerUrl = 'https://gameon.dougowings.net'
 export const ObsoleteServerUrls = [
    'ws://bg.dougowings.net:8080',
    'wss://bg.dougowings.net',
    'https://bg.dougowings.net',
]
export const CHash = 'a9c0fc569fd231b004d44e718add99e2'

/**
 * Server, Auth, Email
 */
/* AUTH_SALT must be set to custom value in production environments. */
export const DefaultAuthSalt  = 'RYm!BtLhPTx4%QrGku_6?Q*NZsfM54Q=Y9?p^q5$9#TM42YcY4WfEGb#48-x88-n'
/* SESSION_COOKIE must be set to custom value in production environments. */
export const DefaultSessionCookie = 'gasid'
/* SESSION_SECRET must be set to custom value in production environments. */
export const DefaultSessionSecret = 'D2hjWtg95VkuzhFBVxnhDhSU4J9BYnz8'
/* TOKEN_COOKIE must be set to custom value in production environments. */
export const DefaultTokenCookie = 'gatoken'

export const DefaultAuthType         = 'anonymous'
export const DefaultAuthHash         = 'sha512'
export const DefaultAuthSaltHash     = 'sha256'
export const DefaultEmailFromName    = 'Gameon'
export const DefaultEmailFromAddress = 'noreply@nowhere.example'
export const DefaultEmailType        = 'mock'
// Minimum eight characters, at least one letter and one number:
// from: https://stackoverflow.com/questions/19605150/regex-for-password-must-contain-at-least-eight-characters-at-least-one-number-a
// TODO: make translatable
export const DefaultPasswordHelp = 'Minimum eight characters, at least one lowercase letter, one uppercase letter, and one number'
export const DefaultPasswordMin = 8
export const DefaultPasswordRegex = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d\\w\\W]{8,}$'
export const InvalidUsernameChars = '/\\?%*:|"\'&#'.split('')
export const EncryptedFlagPrefix = 'encrypted_'


export const MatchCancelRef = {
    peerDisconnected: {
        reason: 'Peer disconnected',
        attrs: {
            isClientShouldClose : false,
            isNet               : true,
        },
    },
    serverShutdown: {
        reason: 'Server Shutdown',
        attrs: {
            isServerShutdown    : true,
            isClientShouldClose : true,
            isNet               : true,
        },
    },
}
