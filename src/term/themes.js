/**
 * gameon - Terminal Themes class
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
const chalk = require('chalk')
const Util = require('../lib/util')
const Errors = require('../lib/errors')

const {ucfirst} = Util

const {
    ThemeExistsError
  , ThemeConfigError
  , ThemeNotFoundError
} = Errors

const BuiltInThemes = {
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
        }
    }
  , Offbeat : {
        extends: ['Default']
      , styles : {
            'board.pointLabel.background' : 'red bright'
          , 'board.border.color'          : 'red dim'
          , 'board.piece.red.color'       : 'orange bold'
          , 'board.piece.white.color'     : '#0080ff bold'
        }
    }
    /*
  , WayOffbeat : {
        styles : {
            'text.background'             : 'cyan'
          , 'text.color'                  : 'blue'
          , 'board.background'            : 'green'
          , 'board.piece.white.color'     : '#0080ff bold'
          , 'board.piece.red.color'       : 'orange bold'
          , 'board.border.background'     : 'magenta'
          , 'board.border.color'          : 'black'
          , 'board.pointLabel.background' : 'red'
          , 'board.pointLabel.color'      : 'white'
          , 'text.piece.red.color'        : '#ff0088'
          , 'text.dice.color'             : 'purple'
          , 'cube.active.color'           : 'green'
          , 'cube.inactive.color'         : 'grey'
        }
    }
    */
}

const CustomThemes = {}

const Themes = {...BuiltInThemes}

class ThemeHelper {

    static register(name, config) {
        if (Themes[name]) {
            throw new ThemeExistsError('Theme already exists: ' + name)
        }
        this.validateConfig(config)
        CustomThemes[name] = config
        Themes[name] = config
    }

    static update(name, config) {
        if (BuiltInThemes[name]) {
            throw new ThemeExistsError('Cannot update a built-in theme: ' + name)
        }
        this.validateConfig(config)
        CustomThemes[name] = config
        Themes[name] = config
    }

    static list() {
        return Object.keys(Themes)
    }

    static listCustom() {
        return Object.keys(CustomThemes)
    }

    static clearCustom() {
        for (var name in CustomThemes) {
            delete CustomThemes[name]
            delete Themes[name]
        }
    }
    static getConfig(name) {
        if (!Themes[name]) {
            throw new ThemeNotFoundError('Theme not found: ' + name)
        }
        return Themes[name]
    }

    static getInstance(name) {
        const styles = this.getStyles(name)
        return new this(styles)
    }

    static validateConfig(config) {
        const styles = this.getStylesFromConfig(config)
        new this(styles)
    }

    static getStyles(name) {
        const config = this.getConfig((name))
        return this.getStylesFromConfig(config)
    }

    static getStylesFromConfig(config) {
        var styles = {}
        if (config.extends) {
            config.extends.forEach(parentName => {
                const parent = this.getConfig(parentName)
                styles = {...styles, ...parent.styles}
            })
        }
        styles = {...styles, ...config.styles}
        return styles
    }

    static styleKeys() {
        return [
            'text.background'
          , 'text.color'

          , 'board.background'

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
        ]
    }

    static defaultAliases() {
        return {
            'board.background'       : 'text.background'
          , 'text.piece.red.color'   : 'board.piece.red.color'
          , 'text.piece.white.color' : 'board.piece.white.color'
        }
    }

    constructor(styles) {
        this.loadStyles(styles)
    }

    loadStyles(styles) {

        styles = {
            'text.color'              : 'white'
          , 'text.background'         : 'black'
          , ...styles
        }

        const aliases = ThemeHelper.defaultAliases()
        for (var key in aliases) {
            if (!styles[key]) {
                styles[key] = styles[aliases[key]]
            }
        }

        const styleKeys = ThemeHelper.styleKeys()
        styleKeys.forEach(key => {
            var keyParts = key.split('.')
            var firstPart = keyParts[0]
            var lastPart = keyParts[keyParts.length - 1]
            if (!styles[key]) {
                if (lastPart == 'background') {
                    if (firstPart == 'board') {
                        styles[key] = styles['board.background']
                    } else {
                        styles[key] = styles['text.background']
                    }
                } else if (lastPart == 'color') {
                    styles[key] = styles['text.color']
                }
            }
        })

        const styleDefs = {}

        Object.keys(styles).forEach(key => {
            var [value, mod] = styles[key].split(' ')
            var keyParts = key.split('.')
            var lastKeyPart = keyParts[keyParts.length - 1]
            var isHex = value[0] == '#'

            if (lastKeyPart == 'background') {
                if (isHex) {
                    styleDefs[key] = ['bgHex', value]
                } else {
                    var builtInName = 'bg' + ucfirst(value)
                    if (mod) {
                        builtInName += ucfirst(mod)
                    }
                    if (chalk[builtInName]) {
                        styleDefs[key] = [builtInName]
                    } else {
                        styleDefs[key] = ['bgKeyword', value]
                    }
                }
            } else {
                if (isHex) {
                    styleDefs[key] = ['hex', value]
                } else {
                    styleDefs[key] = ['keyword', value]
                }
                if (mod) {
                    styleDefs[key].push(mod)
                }
            }
        })

        //console.log(styleDefs)

        const consolidatedKeyMap = {}
        for (var key of styleKeys) {
            var keyParts = key.split('.')
            keyParts.pop()
            consolidatedKeyMap[keyParts.join('.')] = true
        }

        const styleChalks = {}
        Object.keys(consolidatedKeyMap).forEach(key => {
            var bgKey = key + '.background'
            var fgKey = key + '.color'
            var bgDef = styleDefs[bgKey]
            var fgDef = styleDefs[fgKey]

            if (!fgDef) {
                fgDef = styleDefs['text.color']
            }
            if (!bgDef) {
                if (key.indexOf('board.') == 0) {
                    bgDef = styleDefs['board.background']
                } else {
                    bgDef = styleDefs['text.background']
                }
            }
            var styleChalk = chalk

            if (bgDef) {
                if (bgDef.length == 1) {
                    styleChalk = styleChalk[bgDef[0]]
                } else {
                    styleChalk = styleChalk[bgDef[0]](bgDef[1])
                }
                styleChalks[bgKey] = styleChalk
            }
            if (fgDef) {
                styleChalk = styleChalk[fgDef[0]](fgDef[1])
                if (fgDef[2]) {
                    styleChalk = styleChalk[fgDef[2]]
                }
                styleChalks[fgKey] = styleChalk
            }

            styleChalks[key] = styleChalk
        })

        const chalks = {
              boardBorder  : styleChalks['board.border']
            , boardSp      : styleChalks['board.background']
            , noticeText   : styleChalks['text.notice']
            , cubeActive   : styleChalks['cube.active']
            , cubeDisabled : styleChalks['cube.inactive']
            , diceRolled   : styleChalks['text.dice']
            , textDim      : styleChalks['text.dim']
            , gameStatus   : styleChalks['text.gameStatus']
            , hr           : styleChalks['text.dim']
            , pipLabel     : styleChalks['text.dim']
            , pipCount     : styleChalks['text.pipCount']
            , pointLabel   : styleChalks['board.pointLabel']
            , text         : styleChalks['text']
            , textBold     : styleChalks['text'].bold
            , piece : {
                  Red   : styleChalks['board.piece.red']
                , White : styleChalks['board.piece.white']
              }
            , colorText : {
                  Red   : styleChalks['text.piece.red']
                , White : styleChalks['text.piece.white']
              }
        }

        this.setChalks(chalks)
    }

    setChalks(chalks) {
        this.chalks = chalks
    }
}

module.exports = ThemeHelper