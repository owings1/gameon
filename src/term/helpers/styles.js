/**
 * gameon - chalk style helper
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
const {ucfirst}    = require('../../lib/util')
const {StyleError} = require('../../lib/errors')

const chalk = require('chalk')

class StyleHelper {

    // Examples:
    //
    //    isBackground=false:
    //          '#ffffff bold' --> ['hex', '#ffffff', 'bold']
    //          'blue dim'     --> ['keyword', 'blue', 'dim']
    //
    //    isBackground=true:
    //          'orange'         -->  ['bgKeyword', 'orange']
    //          'red bright'     -->  ['bgRedBright']
    //          '#ffffff'        -->  ['bgHex', '#ffffff']
    //          '#ffffff bright' -->  ['bgHex', '#ffffff']
    //
    static buildDefFromStyle(value, isBackground) {

        if (value == 'default') {
            return []
        }

        const [color, mod] = value.split(' ')
        const isHex        = StyleHelper.isValidHexColor(color)

        if (isBackground) {
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
    static buildChalkListFromDefs(fgDef, bgDef) {

        var theChalk = chalk

        var fgChalk
        var bgChalk

        if (bgDef) {
            if (bgDef.length) {
                if (bgDef.length == 1) {
                    // native chalk method, e.g. bgRed or bgRedBright
                    theChalk = theChalk[bgDef[0]]
                } else {
                    // hex or keyword construct
                    theChalk = theChalk[bgDef[0]](bgDef[1])
                }
            }
            bgChalk = theChalk
        }
        if (fgDef) {
            if (fgDef.length) {
                // always a hex or keyword construct
                theChalk = theChalk[fgDef[0]](fgDef[1])
                if (fgDef[2]) {
                    // modifier property, e.g. bold or dim
                    theChalk = theChalk[fgDef[2]]
                }
            }
            fgChalk = theChalk
        }

        return [theChalk, fgChalk, bgChalk]
    }

    // get single chalk callable from def
    static buildChalkFromDef(def, isBackground) {
        const args = []
        if (isBackground) {
            args[1] = def
        } else {
            args[0] = def
        }
        return StyleHelper.buildChalkListFromDefs(...args)[0]
    }

    // get single chalk callable from style
    static buildChalkFromStyle(style, isBackground) {
        const def = StyleHelper.buildDefFromStyle(style, isBackground)
        return StyleHelper.buildChalkFromDef(def, isBackground)
    }

    static getChalk(style, isBackground) {
        try {
            const theChalk = StyleHelper.buildChalkFromStyle(style, isBackground)
            theChalk('')
            return theChalk
        } catch (err) {
            throw new StyleError(`Unchalkable style: '${style}': ${err.message}`, err)
        }
    }

    static isValidHexColor(value) {
        if (value[0] != '#') {
            return false
        }
        return !isNaN(parseInt('0x' + value.substring(1)))
    }
}

module.exports = StyleHelper