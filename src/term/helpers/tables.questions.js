/**
 * gameon - TableHelper questions
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
const {objects: {valueHash}} = require('utils-h')

const {errMessage} = require('../../lib/util.js')

module.exports = {
    interactive: {
        name     : 'input'
      , type     : 'expand'
      , message  : 'Option'
      , pageSize : 8
      , choices  : [
            {
                key   : 'f'
              , name  : 'Filter string'
              , value : 'filterFixed'
            }
          , {
                key   : 'x'
              , name  : 'Filter regex'
              , value : 'filterRegex'
            }
          , {
                key   : 's'
              , name  : 'Sort'
              , value : 'sort'
            }
          , {
                key   : 'c'
              , name  : 'Columns'
              , value : 'columns'
            }
          , {
                key   : 'n'
              , name  : 'Max rows'
              , value : 'maxRows'
            }
          , {
                key   : 'r'
              , name  : 'Restore table'
              , value : 'restore'
            }
          , {
                key   : 'q'
              , name  : 'Quit'
              , value : 'quit'
            }
        ]
    }
  , filterFixed: {
        name     : 'fixed'
      , type     : 'input'
      , message  : 'String'
    }
  , filterRegex: {
        name     : 'regex'
      , type     : 'input'
      , message  : 'Regex'
      , validate : value => !value.length || errMessage(() => new RegExp(value))
    }
  , sort : ({columns}) => [
        {
            name    : 'column'
          , message : 'Column'
          , type    : 'list'
          , when    : columns.find(it => it.sortable)
          , choices : columns.filter(it => it.sortable).map(it => {
                return {name: it.name, value: it}
            })
        }
      , {
            name    : 'dir'
          , message : 'Direction'
          , type    : 'list'
          , default : answers => answers.column.defaultDir
          , choices : ['asc', 'desc']
        }
    ]
  , maxRows : ({opts}) => [
        {
            name     : 'maxRows'
          , type     : 'input'
          , message  : 'Number of rows'
          , default  : opts.maxRows
          , validate : value => !value.length || !isNaN(+value) || 'Invalid number'
        }
    ]
  , columns : ({columns, showColumns}) => {
        const showMap = valueHash(showColumns.map(it => it.name))
        return {
              name    : 'columns'
            , type    : 'checkbox'
            , message : 'Columns'
            , choices : columns.map(({name}) => {
                  return {name, checked: showMap[name]}
              })
        }
    }
}