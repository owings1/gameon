/**
 * gameon - Internationalization/i18n helper
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
const lingui  = require('@lingui/core')
const plurals = require('make-plural/plurals')
const {
    objects: {revalue, update, valueHash},
} = require('utils-h')

const path = require('path')

const {
    DefaultLocale,
    LocaleNames,
    LocalesDir,
} = require('../constants.js')
const {ArgumentError} = require('../errors.js')

const Locales = Object.freeze(LocaleNames.slice())
const LocalesHash = valueHash(Locales, null)
const Messages = Object.create(null)

function checkLocale(locale) {
    if (!LocalesHash[locale]) {
        throw new ArgumentError(`Unknown locale: '${locale}'`)
    }
}

function getMessages(locale) {
    if (!Messages[locale]) {
        checkLocale(locale)
        const file = path.resolve(LocalesDir, locale, 'messages.js')
        Messages[locale] = require(file).messages
    }
    return Messages[locale]
}

// Allow setting default locale through explicit method.
let GlobalLocale = DefaultLocale
// Lazy load.
let GlobalInstance = null

const SyCtor = Symbol('ctor')
const SyImpl = Symbol('impl')
const SyLoad = Symbol('load')
const SyLock = Symbol('lock')

const StaticProps = {
    locales: {
        enumerable : true,
        writable   : false,
        value: Locales,
    },
}

class IntlHelper {

    static getGlobalInstance() {
        if (GlobalInstance === null) {
            GlobalInstance = IntlHelper.newInstance(GlobalLocale)
            Object.defineProperty(GlobalInstance, SyLock, {
                value      : true,
                enumerable : false,
                writable   : false,
            })
        }
        return GlobalInstance
    }

    static setGlobalLocale(locale) {
        checkLocale(locale)
        GlobalLocale = locale
        if (GlobalInstance) {
            GlobalInstance.locale = GlobalLocale
        }
        return IntlHelper
    }

    static newInstance(locale = GlobalLocale) {
        return new IntlHelper(SyCtor, locale)
    }

    constructor(checkSym, locale = null) {
        if (checkSym !== SyCtor) {
            throw new TypeError(`${this.constructor.name} is not a constructor`)
        }
        if (locale !== null) {
            checkLocale(locale)
        }
        const priv = Object.fromEntries([
            [SyImpl, lingui.setupI18n({missing: (lang, id) => id})],
            [SyLoad, Object.create(null)],
        ])
        Object.defineProperties(this, {
            ...revalue(priv, value => ({
                enumerable : false,
                writable   : false,
                value,
            })),
            ...revalue(proto, func => ({
                enumerable : true,
                writable   : false,
                value: func.bind(this),
            })),
            locale: {
                enumerable: true,
                get: () => this[SyImpl].locale,
                set: activate.bind(this),
            },
        })
        if (locale !== null) {
            this.locale = locale
        }
    }

    get locales() {
        return IntlHelper.locales
    }
}

Object.defineProperties(IntlHelper, StaticProps)

/**
 * Faux prototype methods, bound in constructor
 */
const proto = {
    __: function translate(...args) {
        return this[SyImpl]._(...args)
    },
    nf: function formatNumber(num, opts = {}) {
        return new Intl.NumberFormat(this.locale, opts).format(num)
    },
}

/**
 * @private
 */
function activate(locale) {
    if (this[SyLock] && locale !== GlobalLocale) {
        throw new ArgumentError(`Cannot change locale for this instance.`)
    }
    load.call(this, locale)
    this[SyImpl].activate(locale)
}

/**
 * @private
 */
function load(locale) {
    const loaded = this[SyLoad]
    if (!loaded[locale]) {
        checkLocale(locale)
        const impl = this[SyImpl]
        impl.loadLocaleData(locale, {plurals: plurals[locale]})
        impl.load(locale, getMessages(locale))
        loaded[locale] = true
    }
}

module.exports = IntlHelper