/**
 * gameon - Theme configs
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
const BuiltIn = {
    Default : {
        styles : {
            'text.background'         : 'black'
          , 'text.color'              : 'white'
          , 'text.dice.color'         : 'magenta'
          , 'text.dim.color'          : 'grey'
          , 'text.notice.color'       : 'yellow bold'
          , 'text.gameStatus.color'   : 'cyan'
          , 'text.pipCount.color'     : 'grey bold'
          , 'board.piece.red.color'   : 'red bold'
          , 'board.piece.white.color' : 'white bold'
          , 'board.border.color'      : 'grey'
          , 'cube.inactive.color'     : 'grey'
          , 'table.odd.color'         : '#66fffc'
          , 'table.title.color'       : '#ff6bb3 bold'
        }
    }
  , Offbeat : {
        extends: ['Default']
      , styles : {
            'board.pointLabel.background' : 'red bright'
          , 'board.border.color'          : 'red dim'
          , 'board.piece.red.color'       : 'orange bold'
          , 'board.piece.white.color'     : '#0080ff bold'
          , 'table.head.color'            : 'orange'
          //, 'table.background'            : '#a19299'
          //, 'table.border.background'     : 'blue'
          //, 'board.background' : 'blue'
        }
    }
}

const Keys = [
    'text.background'
  , 'text.color'

  , 'board.background'
  , 'board.color'

  , 'board.border.background'
  , 'board.border.color'

  , 'board.piece.white.background'
  , 'board.piece.white.color'

  , 'board.piece.red.background'
  , 'board.piece.red.color'

  , 'board.pointLabel.background'
  , 'board.pointLabel.color'

  , 'cube.active.background'
  , 'cube.active.color'

  , 'cube.inactive.background'
  , 'cube.inactive.color'

  , 'text.piece.red.color'
  , 'text.piece.white.color'
  , 'text.pipCount.color'
  , 'text.dim.color'
  , 'text.notice.color'
  , 'text.gameStatus.color'
  , 'text.dice.color'

  , 'hr.background'
  , 'hr.color'

  , 'table.background'

  , 'table.border.background'
  , 'table.border.color'

  , 'table.even.background'
  , 'table.even.color'
  , 'table.odd.background'
  , 'table.odd.color'

  , 'table.head.background'
  , 'table.head.color'

  , 'table.foot.background'
  , 'table.foot.color'

  , 'table.title.background'
  , 'table.title.color'

  , 'table.dim.background'
  , 'table.dim.color'
]

const Aliases = {
    'board.background'        : 'text.background'
  , 'board.color'             : 'text.color'
  , 'text.piece.red.color'    : 'board.piece.red.color'
  , 'text.piece.white.color'  : 'board.piece.white.color'
  , 'hr.color'                : 'text.dim.color'
  , 'table.background'        : 'text.background'
  , 'table.border.background' : 'board.border.background'
  , 'table.border.color'      : 'board.border.color'
  , 'table.even.background'   : 'table.background'
  , 'table.odd.background'    : 'table.background'
  , 'table.head.background'   : 'table.background'
  , 'table.foot.background'   : 'table.background'
  , 'table.dim.background'    : 'table.background'
  , 'table.dim.color'         : 'text.dim.color'
}

// Without the background/color qualifier.
// E.g. board.border.background and board.border.color reduce to board.border
const Categories = []
const CategoriesMap = {}
const KeysMap = {}

function _populate() {
    Keys.forEach(key => {
        KeysMap[key] = true
        const keyParts = key.split('.')
        keyParts.pop()
        CategoriesMap[keyParts.join('.')] = true
    })
    Object.keys(CategoriesMap).forEach(category => {
        Categories.push(category)
    })
    Categories.sort()
}

_populate()

module.exports = {
    Aliases
  , Categories
  , CategoriesMap
  , BuiltIn
  , Keys
  , KeysMap
}