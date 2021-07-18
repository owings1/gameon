/**
 * gameon - http test utils
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
const {update} = require('../../src/lib/util')

const fetch = require('node-fetch')
const {URLSearchParams} = require('url')

function getUrlParams(obj) {
    obj = obj || {}
    const params = new URLSearchParams
    for (let k in obj) {
        params.append(k, obj[k])
    }
    return params
}

// https://stackoverflow.com/questions/34815845/how-to-send-cookies-with-node-fetch
function parseCookies (response) {
    const raw = response.headers.raw()['set-cookie']
    return raw.map(entry => entry.split(';')[0]).join(';')
}

const httpFixture = {

    url : function (uri) {
        return this.fixture.baseUrl + uri
    }

  , get : function (uri, opts) {
        opts = {...opts}
        const headers = _getHeaders(opts.headers, this.fixture)
        return fetch(this.url(uri), {
            ...this.fixture.opts
          , ...opts
          , headers
        })
    }

  , post : function (uri, body, opts) {
        opts = {...opts}
        const headers = _getHeaders(opts.headers, this.fixture)
        if (this.fixture.json) {
            body = JSON.stringify(body)
        } else {
            body = getUrlParams(body)
        }
        return fetch(this.url(uri), {
            method: 'POST'
          , ...this.fixture.opts
          , ...opts
          , body
          , headers
        })
    }

  , req : function (...args) {
        const method = this.fixture.method.toLowerCase()
        return this[method](this.fixture.uri, ...args)
    }
}

module.exports = {
    httpFixture
  , getUrlParams
  , parseCookies
}

function _getHeaders (_headers, fixture) {
    const headers = {}
    if (fixture.json) {
        headers['content-type'] = 'application/json'
    }
    update(headers, fixture.headers)
    return update(headers, _headers)
}