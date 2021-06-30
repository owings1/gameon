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
            'board.border.color'      : 'grey'
          , 'board.piece.red.color'   : 'red bold'
          , 'board.piece.white.color' : 'white bold'
          , 'cube.inactive.color'     : 'grey'
          , 'hr.color'                : 'grey'
          , 'table.even.color'        : '#66fffc'
          , 'table.title.color'       : '#ff6bb3 bold'
          , 'text.background'         : 'black'
          , 'text.color'              : 'white'
          , 'text.dice.color'         : 'magenta'
          , 'text.gameStatus.color'   : 'cyan'
          , 'text.notice.color'       : 'yellow bold'
          , 'text.pipCount.color'     : 'grey bold'
        }
    }
  , Offbeat : {
        extends: ['Default']
      , styles : {
            'board.border.color'          : 'red dim'
          , 'board.piece.red.color'       : 'orange bold'
          , 'board.piece.white.color'     : '#0080ff bold'
          , 'board.pointLabel.background' : 'red bright'
          , 'table.head.color'            : 'orange'
          //, 'table.background'            : '#a19299'
          //, 'table.border.background'     : 'blue'
          //, 'board.background' : 'blue'
        }
    }
}

const Categories = [
    'board'
  , 'board.border'
  , 'board.piece.red'
  , 'board.piece.white'
  , 'board.pointLabel'
  , 'cube.active'
  , 'cube.inactive'
  , 'hr'
  , 'table'
  , 'table.border'
  , 'table.even'
  , 'table.foot'
  , 'table.head'
  , 'table.odd'
  , 'table.title'
  , 'text'
  , 'text.dice'
  , 'text.gameStatus'
  , 'text.notice'
  , 'text.piece.red'
  , 'text.piece.white'
  , 'text.pipCount'
]
const CategoryAliases = {
    'board'        : 'text'
  , 'table'        : 'text'
  , 'table.border' : 'board.border'
}

const Aliases = {
    'text.piece.red.color'   : 'board.piece.red.color'
  , 'text.piece.white.color' : 'board.piece.white.color'
  , 'table.even.background'  : 'table.background'
  , 'table.foot.background'  : 'table.background'
  , 'table.head.background'  : 'table.background'
  , 'table.odd.background'   : 'table.background'
  , 'table.title.background' : 'table.background'
}

const CategoriesMap = {}
const Keys = []
const KeysMap = {}

function _populate() {
    const types = ['background', 'color']
    Categories.forEach(category => {
        CategoriesMap[category] = true
        types.forEach(type => {
            const key = [category, type].join('.')
            Keys.push(key)
            KeysMap[key] = true
        })
    })
    Object.entries(CategoryAliases).forEach(([targetCategory, sourceCategory]) => {
        types.forEach(type => {
            const sourceKey = [sourceCategory, type].join('.')
            const targetKey = [targetCategory, type].join('.')
            if (!Aliases[targetKey]) {
                Aliases[targetKey] = sourceKey
            }
        })
    })
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