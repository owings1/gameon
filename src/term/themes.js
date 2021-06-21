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
const chalk  = require('chalk')
const Util   = require('../lib/util')
const Errors = require('../lib/errors')

const {ucfirst} = Util

const {
    MaxDepthExceededError
  , StyleError
  , ThemeExistsError
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
}

const CustomThemes = {}

const Themes = {...BuiltInThemes}

const MaxExtendsDepth = 10

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
        Object.keys(CustomThemes).forEach(name => {
            delete CustomThemes[name]
            delete Themes[name]
        })
    }

    static getInstance(name) {
        const styles = this.getStyles(name)
        return Theme.forStyles(styles)
    }

    static getDefaultInstance() {
        return this.getInstance('Default')
    }

    static getConfig(name) {
        if (!Themes[name]) {
            throw new ThemeNotFoundError('Theme not found: ' + name)
        }
        return Themes[name]
    }

    static getStyles(name) {
        const config = this.getConfig(name)
        return this.stylesForConfig(config)
    }

    static validateConfig(config) {
        const styles = this.stylesForConfig(config)
        Theme.validateStyles(styles)
        //Theme.forStyles(styles)
    }

    static stylesForConfig(config) {
        const styles = {...config.styles}
        this._extendStyles(styles, config.extends)
        return styles
    }

    static _extendStyles(styles, parents, depth = 0) {
        if (!parents) {
            return
        }
        if (depth > MaxExtendsDepth) {
            throw new MaxDepthExceededError('Too much theme inheritance')
        }
        parents.forEach(name => {
            const config = this.getConfig(name)
            this._extendStyles(styles, config.extends, depth + 1)
            if (!config.styles) {
                return
            }
            Object.keys(config.styles).forEach(key => {
                if (!styles[key]) {
                    styles[key] = config.styles[key]
                }
            })
        })
    }
}

const StyleKeys = [
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

const DefaultAliases = {
    'board.background'       : 'text.background'
  , 'text.piece.red.color'   : 'board.piece.red.color'
  , 'text.piece.white.color' : 'board.piece.white.color'
}

const StyleKeysMap = {}
// Without the background/color qualifier.
// E.g. board.border.background and board.border.color reduce to board.border
const Categories = []

function populateStyleMaps() {
    const categoriesMap = {}
    StyleKeys.forEach(key => {
        StyleKeysMap[key] = true
        const keyParts = key.split('.')
        keyParts.pop()
        categoriesMap[keyParts.join('.')] = true
    })
    Object.keys(categoriesMap).forEach(category => {
        Categories.push(category)
    })
}

populateStyleMaps()

function getStyleType(key) {
    return key.substring(key.lastIndexOf('.') + 1)
}

function getStyleSection(key) {
    return key.substring(0, key.indexOf('.'))
}

function isValidHexColor(value) {
    if (value[0] != '#') {
        return false
    }
    return !isNaN(parseInt('0x' + value.substring(1)))
}

class Theme {

    static forStyles(styles) {
        const chalks = this.build(styles)
        return new this(chalks)
    }

    static validateStyles(styles) {
        Object.entries(styles).forEach(([key, value]) => {
            this.validateStyle(key, value)
        })
    }

    static validateStyle(key, value) {
        if (!StyleKeysMap[key]) {
            throw new StyleError('Unknown style key: ' + key)
        }
        try {
            const def = this.buildDef(key, value)
            const type = getStyleType(key)
            if (type == 'background') {
                var result = this.buildChalk(null, def)
            } else {
                var result = this.buildChalk(def, null)
            }
            // try to call the chalk
            result[0]('')
        } catch (err) {
            if (!err.isThemeError) {
                err = new StyleError('Style validation failed for ' + key + ': ' + err.message, err)
            }
            throw err
        }
    }

    static build(_styles) {

        const styles = this.buildStyles(_styles)
        const defs   = this.buildDefs(styles)
        const chalks = this.buildChalks(defs)

        return chalks
    }

    static buildStyles(_styles) {

        // Minimal defaults.
        const styles = {
            'text.color'      : 'white'
          , 'text.background' : 'black'
          , ..._styles
        }

        // Default aliases.
        Object.entries(DefaultAliases).forEach(([key, alias]) => {
            if (!styles[key]) {
                styles[key] = styles[alias]
            }
        })

        // Additional defaults for text/board sections.
        StyleKeys.forEach(key => {
            //const keyParts  = key.split('.')
            const section = getStyleSection(key)//keyParts[0]
            const type  = getStyleType(key)//keyParts[keyParts.length - 1]
            if (!styles[key]) {
                if (type == 'background') {
                    if (section == 'board') {
                        styles[key] = styles['board.background']
                    } else {
                        styles[key] = styles['text.background']
                    }
                } else if (type == 'color') {
                    styles[key] = styles['text.color']
                }
            }
        })

        return styles
    }

    // Convert values into array definitions to construct chalk callables.
    static buildDefs(styles) {

        const defs = {}

        Object.entries(styles).forEach(([key, value]) => {
            defs[key] = this.buildDef(key, value)
        })

        return defs
    }

    // Build chalk callables. Each key will have its own, e.g. text.color
    // and text.background, as well as a single chalk callable for each
    // category, e.g. text or board.piece.white, which includes both the
    // foreground and background styles.
    static buildChalks(defs) {

        const chalks = {}

        Categories.forEach(category => {

            const bgKey = category + '.background'
            const fgKey = category + '.color'

            var bgDef = defs[bgKey]
            var fgDef = defs[fgKey]

            if (!fgDef) {
                // default to text color
                fgDef = defs['text.color']
            }
            if (!bgDef) {
                // default to board or text background
                if (getStyleSection(category) == 'board') {
                    bgDef = defs['board.background']
                } else {
                    bgDef = defs['text.background']
                }
            }

            const result = this.buildChalk(fgDef, bgDef)

            chalks[category] = result[0]
            chalks[fgKey]    = result[1]
            chalks[bgKey]    = result[2]
        })

        return chalks
    }

    // Examples:
    //
    //    text.color:
    //          '#ffffff bold' --> ['hex', '#ffffff', 'bold']
    //          'blue dim'     --> ['keyword', 'blue', 'dim']
    //
    //    text.background:
    //          'orange'         -->  ['bgKeyword', 'orange']
    //          'red bright'     -->  ['bgRedBright']
    //          '#ffffff'        -->  ['bgHex', '#ffffff']
    //          '#ffffff bright' -->  ['bgHex', '#ffffff'] 
    //
    static buildDef(key, value) {

        const [color, mod] = value.split(' ')
        const type         = getStyleType(key)
        const isHex        = isValidHexColor(color)

        if (type == 'background') {
            if (isHex) {
                return ['bgHex', color]
            }
            var builtInName = 'bg' + ucfirst(color)
            if (mod) {
                builtInName += ucfirst(mod)
            }
            if (chalk[builtInName]) {
                return [builtInName]
            }
            return ['bgKeyword', color]
        }

        const def = [isHex ? 'hex' : 'keyword', color]
        if (mod) {
            def.push(mod)
        }

        return def
    }

    // construct chalk callables, returns array [combined, fg, bg]
    static buildChalk(fgDef, bgDef) {
        
        var theChalk = chalk

        var fgChalk
        var bgChalk

        if (bgDef) {
            if (bgDef.length == 1) {
                // native chalk method, e.g. bgRed or bgRedBright
                theChalk = theChalk[bgDef[0]]
            } else {
                // hex or keyword construct
                theChalk = theChalk[bgDef[0]](bgDef[1])
            }
            bgChalk = theChalk
        }
        if (fgDef) {
            // always a hex or keyword construct
            theChalk = theChalk[fgDef[0]](fgDef[1])
            if (fgDef[2]) {
                // modifier property, e.g. bold or dim
                theChalk = theChalk[fgDef[2]]
            }
            fgChalk = theChalk
        }

        return [theChalk, fgChalk, bgChalk]
    }

    constructor(chalks) {
        // Index the chalk callables for use by DrawHelper/Reporter
        this.chalks = {
              boardBorder  : chalks['board.border']
            , boardSp      : chalks['board.background']
            , noticeText   : chalks['text.notice']
            , cubeActive   : chalks['cube.active']
            , cubeDisabled : chalks['cube.inactive']
            , diceRolled   : chalks['text.dice']
            , textDim      : chalks['text.dim']
            , gameStatus   : chalks['text.gameStatus']
            , hr           : chalks['text.dim']
            , pipLabel     : chalks['text.dim']
            , pipCount     : chalks['text.pipCount']
            , pointLabel   : chalks['board.pointLabel']
            , text         : chalks['text']
            , textBold     : chalks['text'].bold
            , piece : {
                  Red   : chalks['board.piece.red']
                , White : chalks['board.piece.white']
              }
            , colorText : {
                  Red   : chalks['text.piece.red']
                , White : chalks['text.piece.white']
              }
        }
    }
}

module.exports = ThemeHelper