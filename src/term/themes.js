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
const fse    = require('fs-extra')
const globby = require('globby')
const path   = require('path')

const StyleHelper = require('./helpers/styles.js')
const DependencyHelper = require('../lib/util/dependency-helper.js')
const {DefaultThemeName} = require('../lib/constants.js')
const {filenameWithoutExtension} = require('../lib/util.js')
const {
    MaxDepthExceededError,
    StyleError,
    ThemeExistsError,
    ThemeConfigError,
    ThemeNotFoundError,
} = require('../lib/errors.js')
const ThemeConfig = {
    Aliases,
    Categories,
    CategoriesMap,
    DefaultStyles,
    Keys,
    KeysMap,
} = require('./res/themes.config.js')

const MaxExtendsDepth = 10

const Store = {
    All       : {...ThemeConfig.BuiltIn},
    BuiltIn   : {...ThemeConfig.BuiltIn},
    Custom    : {},
    Instances : {},
}

class ThemeHelper {

    static register(name, config) {
        if (Store.All[name]) {
            throw new ThemeExistsError('Theme already exists: ' + name)
        }
        this.validateConfig(config)
        Store.Custom[name] = config
        Store.All[name] = config
    }

    static update(name, config) {
        if (Store.BuiltIn[name]) {
            throw new ThemeExistsError('Cannot update a built-in theme: ' + name)
        }
        this.validateConfig(config)
        Store.Custom[name] = config
        Store.All[name] = config
        delete Store.Instances[name]
    }

    static list() {
        return Object.keys(Store.All)
    }

    static listCustom() {
        return Object.keys(Store.Custom)
    }

    static clearCustom() {
        Object.keys(Store.Custom).forEach(name => {
            delete Store.Custom[name]
            delete Store.All[name]
            delete Store.Instances[name]
        })
    }

    static getInstance(name) {
        if (name instanceof Theme) {
            return name
        }
        if (!Store.Instances[name]) {
            const styles = this.getStyles(name)
            Store.Instances[name] = ThemeBuilder.build(styles, name)
        }
        return Store.Instances[name]
    }

    static getDefaultInstance() {
        return this.getInstance(DefaultThemeName)
    }

    static getSafe(name) {
        if (name instanceof Theme) {
            return name
        }
        if (!Store.All[name]) {
            return this.getDefaultInstance()
        }
        return this.getInstance(name)
    }

    static getSemiSafe(name) {
        if (!name) {
            return this.getDefaultInstance()
        }
        return this.getInstance(name)
    }

    static getConfig(name) {
        if (!Store.All[name]) {
            throw new ThemeNotFoundError('Theme not found: ' + name)
        }
        return Store.All[name]
    }

    static getStyles(name) {
        const config = this.getConfig(name)
        return this.stylesForConfig(config)
    }

    static validateConfig(config) {
        const styles = this.stylesForConfig(config)
        this.validateStyles(styles)
    }

    static stylesForConfig(config) {
        const styles = {...config.styles}
        extendStyles(styles, config.extends)
        return styles
    }

    static validateStyle(key, value) {
        if (!KeysMap[key]) {
            throw new StyleError('Unknown style key: ' + key)
        }
        try {
            StyleHelper.getChalk(value, keyIsBackground(key))
        } catch (err) {
            if (!err.isThemeError) {
                err = new StyleError('Style validation failed for ' + key + ': ' + err.message, err)
            }
            throw err
        }
    }

    static validateStyles(styles) {
        Object.entries(styles).forEach(([key, value]) => {
            this.validateStyle(key, value)
        })
    }

    static async loadDirectory(themesDir) {

        const configs = {}
        const files = await globby(path.join(themesDir, '*.json'))
        const helper = this._newDependencyHelper(this.list())

        const loaded = []
        const errors = []

        for (const file of files) {
            const name = filenameWithoutExtension(file)
            try {
                const config = await fse.readJson(file)
                configs[name] = config
                helper.add(name, config.extends)
            } catch (error) {
                errors.push({name, file, error})
            }
        }

        let order
        try {
            order = helper.resolve()
        } catch (error) {
            if (!error.isDependencyError) {
                throw error
            }
            errors.push({error})
            // load what we can
            order = helper.order
        }

        for (const name of order) {
            try {
                this.update(name, configs[name])
                loaded.push(name)
            } catch (error) {
                errors.push({name, error})
            }
        }

        return {loaded, errors}
    }

    // allow override for testing
    static _newDependencyHelper(...args) {
        return new DependencyHelper(...args)
    }
}

function getStyleType(key) {
    return key.substring(key.lastIndexOf('.') + 1)
}

function getStyleSection(key) {
    return key.substring(0, key.indexOf('.'))
}

function keyIsBackground(key) {
    return getStyleType(key) === 'background'
}

function extendStyles(styles, parents, depth = 0) {
    if (!parents) {
        return
    }
    if (depth > MaxExtendsDepth) {
        throw new MaxDepthExceededError('Too much theme inheritance')
    }
    parents.forEach(name => {
        const config = ThemeHelper.getConfig(name)
        extendStyles(styles, config.extends, depth + 1)
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

class ThemeBuilder {

    static build(_styles, name) {

        const styles = this._buildStyles(_styles)
        const defs   = this._buildDefs(styles)
        const chalks = this._buildChalks(defs)

        return this._create(chalks, name)
    }

    static _buildStyles(_styles) {

        // Minimal defaults.
        const styles = {...DefaultStyles, ..._styles}

        // Default aliases.
        Object.entries(Aliases).forEach(([key, alias]) => {
            if (!styles[key] && styles[alias]) {
                styles[key] = styles[alias]
            }
        })

        return styles
    }

    // Convert values into array definitions to construct chalk callables.
    static _buildDefs(styles) {

        const defs = {}

        Object.entries(styles).forEach(([key, value]) => {
            defs[key] = StyleHelper.buildDefFromStyle(value, keyIsBackground(key))
        })

        return defs
    }

    // Build chalk callables. Each key will have its own, e.g. text.color
    // and text.background, as well as a single chalk callable for each
    // category, e.g. text or board.piece.white, which includes both the
    // foreground and background styles.
    static _buildChalks(defs) {

        const chalks = {}

        Categories.forEach(category => {

            const bgKey = category + '.background'
            const fgKey = category + '.color'

            const bgDef = defs[bgKey]
            const fgDef = defs[fgKey]

            const result = StyleHelper.buildChalkListFromDefs(fgDef, bgDef)

            chalks[category] = result[0]
            chalks[fgKey]    = result[1]
            chalks[bgKey]    = result[2]
        })

        return chalks
    }

    static _create(chalks, name) {
        const theme = new Theme
        theme.name = name
        theme.get = key => chalks[key]
        Categories.forEach(category => {
            const parts = category.split('.')
            let current = theme
            parts.forEach((part, i) => {
                const keyPath = parts.slice(0, i + 1).join('.')
                if (!current[part]) {
                    if (CategoriesMap[keyPath]) {
                        current[part] = chalks[keyPath]
                    } else {
                        current[part] = {}
                    }
                }
                current = current[part]
            })
        })
        return theme
    }
}

class Theme {}

module.exports = ThemeHelper