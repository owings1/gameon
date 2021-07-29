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
const {
    DefaultLocale,
    LocaleNames,
    LocalesDir,
} = require('../constants')

const {ArgumentError} = require('../errors')

const lingui  = require('@lingui/core')
const path    = require('path')
const plurals = require('make-plural/plurals')

const LocalesHash = Object.fromEntries(LocaleNames.map(name => [name, true]))

const Cache = {messages: {}}

function getMessages (locale) {
    if (!Cache.messages[locale]) {
        if (!LocalesHash[locale]) {
            throw new ArgumentError(`Unknown locale: '${locale}'`)
        }
        const file = path.resolve(LocalesDir, locale, 'messages.js')
        Cache.messages[locale] = require(file).messages
    }
    return Cache.messages[locale]
}

class Intl {

    static getDefaultInstance() {
        return Intl.intl
    }

    constructor(i18n) {
        this._i18n = i18n
        this.__ = this.__.bind(this)
        this._loaded = {}
        this.load(DefaultLocale)
    }

    get locale() {
        return this.i18n.locale
    }

    set locale(locale) {
        this.load(locale).i18n.activate(locale)
    }

    load(locale) {
        if (!this._loaded[locale]) {
            const messages = getMessages(locale)
            this.i18n.loadLocaleData(locale, {plurals: plurals[locale]})
            this.i18n.load(locale, messages)
            this._loaded[locale] = true
        }
        return this
    }

    __(...args) {
        return this.i18n._(...args)
    }

    get locales() {
        return LocaleNames
    }

    get i18n() {
        return this._i18n
    }

    /**
     * Alias for locale
     */
    get lang() {
        return this.locale
    }

    /**
     * Alias for locale
     */
    set lang(lang) {
        this.locale = lang
    }

    /**
     * Alias for locales
     */
    get langs() {
        return this.locales
    }
}

// Default instance.
Object.defineProperty(Intl, 'intl', {
    value: new Intl(lingui.i18n),
})

// Convenience alias to default instance method.
Object.defineProperty(Intl, '__', {
    get: () => Intl.intl.__,
})

//Intl.i18n.on('missing', (...args) => {
  //  console.log('missing', args)
//})

module.exports = Intl
