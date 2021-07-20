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
            'board.border.color'           : 'grey'
          , 'board.cube.inactive.color'    : 'grey'
          , 'board.inside.background'      : 'black'
          , 'board.outside.pipCount.color' : 'grey'
          , 'board.piece.red.color'        : 'red bold'
          , 'board.piece.white.color'      : 'white bold'

          , 'hr.color' : 'grey dim'

          , 'diff.plus.color'  : 'green bold'
          , 'diff.minus.color' : 'red bold'

          , 'table.row.even.color' : '#66fffc'
          , 'table.title.color'    : '#ff6bb3 bold'

          , 'text.background' : 'black'
          , 'text.color'      : 'white'

          , 'board.log.dice.color'       : 'magenta'
          , 'board.log.gameStatus.color' : 'cyan'
          , 'board.log.notice.color'     : 'yellow bold'

          , 'alert.box.border.color'       : 'grey'
          , 'alert.success.message.color'  : 'green'
          , 'alert.error.level.color'      : 'red'
          , 'alert.warn.level.color'       : 'yellow'

          , 'menu.screen.background'   : 'grey dim'
          , 'menu.screen.border.color' : 'white'

          , 'menu.box.border.background'  : 'cyan'
          , 'menu.box.border.color'       : 'black'

          , 'prompt.answer.color'                 : 'cyan'
          , 'prompt.check.pass.color'             : 'green'
          , 'prompt.choice.selected.color'        : 'cyan'
          , 'prompt.choice.disabled.color'        : 'grey'
          , 'prompt.choice.paren.color'           : 'grey'
          , 'prompt.message.help.color'           : 'white dim'
          , 'prompt.message.prefix.color'         : 'white'
          , 'prompt.message.prefix.default.color' : 'green'
          , 'prompt.message.question.color'       : 'white bold'
        }
    }
  , Offbeat : {
        extends: ['Default']
      , styles : {
            'board.border.color'          : 'red dim'
          , 'board.piece.red.color'       : 'orange bold'
          , 'board.piece.white.color'     : '#0080ff bold'
          , 'board.pointLabel.background' : 'red bright'
          , 'board.pointLabel.color'      : 'white bold'
          , 'board.cube.active.color'     : 'white'

          , 'alert.error.message.color' : 'pink'

          , 'menu.screen.background'   : 'yellow'
          , 'menu.screen.border.color' : 'orange'
          , 'menu.box.border.background'  : 'red'
          , 'menu.box.border.color'       : 'grey'

          , 'prompt.answer.color'               : 'blue'
          , 'prompt.input.color'                : 'green'
          , 'prompt.choice.color'               : 'pink'
          , 'prompt.choice.selected.background' : 'grey dim'
          , 'prompt.choice.selected.color'      : 'orange'

          , 'table.head.color' : 'orange'

          //, 'board.inside.background'      : '#1f1f1f'
          //, 'board.outside.background'     : '#1f3631'
          //, 'board.outside.pipCount.color' : 'yellow'
        }
    }
}

const Categories = [

    'board.border'
  , 'board.piece.red'
  , 'board.piece.white'
  , 'board.pointLabel'
  , 'board.inside'
  , 'board.outside'
  , 'board.cube.active'
  , 'board.cube.inactive'
  , 'board.outside.pipCount'
  , 'board.bar.piece.red'
  , 'board.bar.piece.white'
  , 'board.outside.piece.red'
  , 'board.outside.piece.white'

  , 'hr'

  , 'table.border'
  , 'table.row'
  , 'table.row.even'
  , 'table.row.odd'
  , 'table.foot'
  , 'table.head'
  , 'table.title'

  , 'board.log'
  , 'board.log.dice'
  , 'board.log.gameStatus'
  , 'board.log.notice'
  , 'board.log.piece.red'
  , 'board.log.piece.white'

  , 'alert.screen'
  , 'alert.box'
  , 'alert.box.border'
  , 'alert.info.message'
  , 'alert.success.message'
  , 'alert.warn.level'
  , 'alert.warn.message'
  , 'alert.error.level'
  , 'alert.error.message'

  , 'menu.screen'
  , 'menu.screen.border'

  , 'menu.box'
  , 'menu.box.border'

  , 'prompt.answer'
  , 'prompt.caret.error'
  , 'prompt.check.pass'
  , 'prompt.choice'
  , 'prompt.choice.disabled'
  , 'prompt.choice.selected'
  , 'prompt.choice.number'
  , 'prompt.choice.number.selected'
  , 'prompt.choice.paren'
  , 'prompt.choice.paren.selected'
  , 'prompt.input'
  , 'prompt.message.prompt'
  , 'prompt.message.question'
  , 'prompt.message.prefix'
  , 'prompt.message.prefix.default'
  , 'prompt.message.suffix'
  , 'prompt.message.error'
  , 'prompt.message.help'
  , 'prompt.separator'

  , 'diff.plus'
  , 'diff.minus'

  , 'text'
]

const DefaultStyles = {
    'text.color'      : 'default'
  , 'text.background' : 'default'

  , 'diff.plus.background'  : 'default'
  , 'diff.minus.background' : 'default'

  , 'prompt.check.pass.background' : 'default'
}

// Order matters

const CategoryAliases = {

    'board.border'  : 'text'
  , 'board.inside'  : 'text'

  , 'board.outside' : 'board.inside'
  , 'board.log'     : 'board.outside'

  , 'board.pointLabel'     : 'board.border'
  , 'board.log.dice'       : 'board.log'
  , 'board.log.gameStatus' : 'board.log'
  , 'board.log.notice'     : 'board.log'

  , 'board.outside.pipCount' : 'board.outside'

  , 'hr' : 'text'
  , 'diff.plus'  : 'text'
  , 'diff.minus' : 'text'

  , 'menu.screen'        : 'text'
  , 'menu.screen.border' : 'text'

  , 'menu.box'        : 'text'
  , 'menu.box.border' : 'menu.box'

  , 'alert.screen'          : 'menu.screen'
  , 'alert.box'             : 'text'
  , 'alert.box.border'      : 'alert.box'
  , 'alert.info.message'    : 'text'
  , 'alert.success.message' : 'text'
  , 'alert.warn.message'    : 'text'
  , 'alert.warn.level'      : 'text'
  , 'alert.error.message'   : 'text'
  , 'alert.error.level'     : 'text'

  , 'prompt.answer'                 : 'text'
  , 'prompt.check.pass'             : 'alert.success.message'
  , 'prompt.caret.error'            : 'alert.error.level'
  , 'prompt.message.prompt'         : 'text'
  , 'prompt.input'                  : 'prompt.message.prompt'
  , 'prompt.message.error'          : 'alert.error.message'
  , 'prompt.message.question'       : 'text'
  , 'prompt.message.help'           : 'text'

  , 'prompt.message.prefix'         : 'prompt.message.question'
  , 'prompt.message.suffix'         : 'prompt.message.question'
  , 'prompt.message.prefix.default' : 'prompt.message.prefix'

  , 'prompt.choice'                 : 'text'
  , 'prompt.choice.selected'        : 'prompt.answer'
  , 'prompt.choice.disabled'        : 'prompt.choice'
  , 'prompt.choice.number'          : 'prompt.choice'
  , 'prompt.choice.paren'           : 'prompt.choice.number'
  , 'prompt.choice.number.selected' : 'prompt.choice.selected'
  , 'prompt.separator'              : 'hr'

  , 'table.border'   : 'board.border'
  , 'table.row'      : 'text'
  , 'table.row.even' : 'table.row'
  , 'table.row.odd'  : 'table.row'
  , 'table.head'     : 'table.row'
  , 'table.foot'     : 'table.row'
  , 'table.title'    : 'table.head'
}

const KeyAliases = {

    'board.piece.red.background'           : 'board.inside.background'
  , 'board.piece.white.background'         : 'board.inside.background'

  , 'board.bar.piece.red.background'       : 'board.border.background'
  , 'board.bar.piece.white.background'     : 'board.border.background'

  , 'board.outside.piece.red.background'   : 'board.outside.background'
  , 'board.outside.piece.white.background' : 'board.outside.background'
  , 'board.cube.active.background'         : 'board.outside.background'
  , 'board.cube.inactive.background'       : 'board.outside.background'

  , 'board.log.piece.red.background'       : 'board.log.background'
  , 'board.log.piece.white.background'     : 'board.log.background'

  , 'board.piece.red.color'   : 'text.color'
  , 'board.piece.white.color' : 'text.color'

  , 'board.outside.piece.red.color'   : 'board.piece.red.color'
  , 'board.log.piece.red.color'       : 'board.piece.red.color'
  , 'board.bar.piece.red.color'       : 'board.piece.red.color'
  , 'board.outside.piece.white.color' : 'board.piece.white.color'
  , 'board.log.piece.white.color'     : 'board.piece.white.color'
  , 'board.bar.piece.white.color'     : 'board.piece.white.color'

  , 'board.cube.active.color'   : 'board.border.color'
  , 'board.cube.inactive.color' : 'board.cube.active.color'

  , 'prompt.choice.paren.selected.color'       : 'prompt.choice.paren.color'
  , 'prompt.choice.paren.selected.background'  : 'prompt.choice.number.selected.background'

  , 'menu.screen.border.background' : 'menu.screen.background'
  //, 'menu.box.border.background' : 'menu.screen.background'
}

const Aliases = {}
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
            Aliases[targetKey] = sourceKey
        })
    })
    Object.entries(KeyAliases).forEach(([targetKey, sourceKey]) => {
        Aliases[targetKey] = sourceKey
    })
}

_populate()

module.exports = {
    Aliases
  , Categories
  , CategoriesMap
  , DefaultStyles
  , BuiltIn
  , Keys
  , KeysMap
}