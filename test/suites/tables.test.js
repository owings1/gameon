/**
 * gameon - test suite - tables
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
const TestUtil = require('../util')
const {
    expect,
    getError,
    requireSrc,
    MockPrompter,
    noop,
    NullOutput
} = TestUtil

const {Table, TableHelper} = requireSrc('term/tables')

describe('TableHelper', () => {

    describe('table1', () => {

        var table

        beforeEach(() => {
            const columns = [
                {
                    name: 'name'
                },
                {
                    name: 'age'
                }
            ]
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {}
            table = new Table(columns, data, opts).build()
        })

        describe('#interactive', () => {

            var helper

            beforeEach(() => {
                helper = new TableHelper
                helper.output = new NullOutput
            })

            it('should quit', async () => {
                helper.prompt = MockPrompter({input: 'quit'})
                await helper.interactive(table)
            })

            it('should build table when not built then quit', async () => {
                table.isBuilt = false
                helper.prompt = MockPrompter({input: 'quit'})
                await helper.interactive(table)
                expect(table.isBuilt).to.equal(true)
            })

            it('should filterRegex /a/i', async () => {
                helper.prompt = MockPrompter([
                    {input: 'filterRegex'},
                    {regex: '/a/i'},
                    {input: 'quit'}
                ])
                const exp = [['a', '12']]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should not filterRegex with empty', async () => {
                helper.prompt = MockPrompter([
                    {input: 'filterRegex'},
                    {regex: ''},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b', '10'],
                    ['b', '9'],
                    ['a', '12']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should filterFixed a', async () => {
                helper.prompt = MockPrompter([
                    {input: 'filterFixed'},
                    {fixed: 'a'},
                    {input: 'quit'}
                ])
                const exp = [['a', '12']]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should not filterFixed with empty', async () => {
                helper.prompt = MockPrompter([
                    {input: 'filterFixed'},
                    {fixed: ''},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b', '10'],
                    ['b', '9'],
                    ['a', '12']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should sort by age asc', async () => {
                helper.prompt = MockPrompter([
                    {input: 'sort'},
                    {column: table.columns.find(it => it.name == 'age'), dir: 'asc'},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b', '9'],
                    ['b', '10'],
                    ['a', '12']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should not prompt for sort with no sortable columns', async () => {
                helper.prompt = MockPrompter([
                    {input: 'sort'},
                    {input: 'quit'}
                ])
                table.columns.forEach(column => column.sortable = false)
                table.build()
                helper.logger.loglevel = 0
                await helper.interactive(table)
            })

            it('should set maxRows 2', async () => {
                helper.prompt = MockPrompter([
                    {input: 'maxRows'},
                    {maxRows: '2'},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b', '10'],
                    ['b', '9']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should not set maxRows for empty', async () => {
                helper.prompt = MockPrompter([
                    {input: 'maxRows'},
                    {maxRows: ''},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b', '10'],
                    ['b', '9'],
                    ['a', '12']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should invalidate bad number', async () => {
                helper.prompt = MockPrompter([
                    {input: 'maxRows'},
                    {maxRows: 'asdf'}
                ])
                const err = await getError(() => helper.interactive(table))
                expect(err.message.toLowerCase()).to.contain('invalid number')
            })

            it('should hide age column', async () => {
                helper.prompt = MockPrompter([
                    {input: 'columns'},
                    {columns: ['name']},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b'],
                    ['b'],
                    ['a']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })

            it('should restore after maxRows', async () => {
                helper.prompt = MockPrompter([
                    {input: 'maxRows'},
                    {maxRows: '2'},
                    {input: 'restore'},
                    {input: 'quit'}
                ])
                const exp = [
                    ['b', '10'],
                    ['b', '9'],
                    ['a', '12']
                ]
                await helper.interactive(table)
                expect(table.rows).to.jsonEqual(exp)
            })
        })
    })

    describe('#prompt', () => {

        it('coverage for prompt', async () => {
            const helper = new TableHelper
            helper._inquirer = {prompt: noop}
            await helper.prompt()
        })
    })
})

describe('Table', () => {

    describe('build coverage', () => {

        it('should build basic table', () => {
            const columns = ['name']
            const data = [{name: 'foo'}]
            const opts = {}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('foo')
        })

        it('should build with footer only', () => {
            const columns = []
            const data = []
            const opts = {footerLines: ['foo']}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('foo')
        })

        it('should build with title only', () => {
            const columns = []
            const data = []
            const opts = {title: 'Just a Title'}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('Just a Title')
        })

        it('should build with title and foot only', () => {
            const columns = []
            const data = []
            const opts = {title: 'Just a Title', footerLines: ['footme']}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('Just a Title').and.to.contain('footme')
        })

        it('should build with no data, columns, title or footers', () => {
            const columns = []
            const data = []
            const opts = {}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.equal('')
        })

        it('shoud build with data and footer', () => {
            const columns = ['name']
            const data = [{name: 'foo'}]
            const table = new Table(columns, data, {footerLines: 'X'}).build()
            expect(table.toString()).to.contain('foo').and.to.contain('X')
        })

        it('shoud build with data, footer, and title', () => {
            const columns = ['name']
            const data = [{name: 'foo'}]
            const opts = {footerLines: 'X', title: 'Example'}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('foo').and.to.contain('X').and.to.contain('Example')
        })

        it('shoud build with data, footer, and title, with innerBorders', () => {
            const columns = ['name']
            const data = [{name: 'foo'}, {name: 'foo'}]
            const opts = {footerLines: 'X', title: 'Example', innerBorders: true}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('foo').and.to.contain('X').and.to.contain('Example')
        })

        it('shoud build with data and longer footer', () => {
            const columns = ['name']
            const data = [{name: 'foo'}, {name: 'foo'}]
            const opts = {footerLines: 'X the hamstring'}
            const table = new Table(columns, data, opts).build()
            expect(table.toString()).to.contain('foo').and.to.contain('X the hamstring')
        })

        it('should throw DuplicateColumnError for duplicate column name', () => {
            const columns = ['name', 'name']
            const data = []
            const opts = {}
            const table = new Table(columns, data, opts)
            const err = getError(() => table.build())
            expect(err.name).to.equal('DuplicateColumnError')
        })

        it('should throw InvalidColumnError when contains ,', () => {
            const columns = ['name,']
            const data = []
            const opts = {}
            const table = new Table(columns, data, opts)
            const err = getError(() => table.build())
            expect(err.name).to.equal('InvalidColumnError')
        })

        it('should throw InvalidColumnError when contains :', () => {
            const columns = ['name:']
            const data = []
            const opts = {}
            const table = new Table(columns, data, opts)
            const err = getError(() => table.build())
            expect(err.name).to.equal('InvalidColumnError')
        })

        it('should not throw InvalidColumnError when contains : and dirSeparator=|', () => {
            const columns = ['name:']
            const data = []
            const opts = {dirSeparator: '|'}
            const table = new Table(columns, data, opts).build()
        })
    })

    describe('#makeColumn', () => {

        it('should throw InvalidColumnError on input 8', () => {
            const err = getError(() => Table.makeColumn(8))
            expect(err.name).to.equal('InvalidColumnError')
        })

        it('should throw InvalidColumnError on empty object', () => {
            const err = getError(() => Table.makeColumn({}))
            expect(err.name).to.equal('InvalidColumnError')
        })

        it('should take default get', () => {
            const getter = () => 'a'
            const input = {name: 'test', get: getter}
            const res = Table.makeColumn(input)
            expect(res.get).to.equal(getter)
        })

        it('should take default format', () => {
            const formatter = () => 'a'
            const input = {name: 'test', format: formatter}
            const res = Table.makeColumn(input)
            expect(res.format).to.equal(formatter)
        })

        it('should take default sorter', () => {
            const sorter = () => 'a'
            const input = {name: 'test', sorter: sorter}
            const res = Table.makeColumn(input)
            expect(res.sorter).to.equal(sorter)
        })

        it('default sorter should sort null first', () => {
            const input = {name: 'test'}
            const column = Table.makeColumn(input)
            const res1 = column.sorter(null, 'a')
            const res2 = column.sorter('a', null)
            expect(res1).to.equal(-1)
            expect(res2).to.equal(1)
        })

        it('default sorter should sort nulls equal', () => {
            const input = {name: 'test'}
            const column = Table.makeColumn(input)
            const res = column.sorter(null, null)
            expect(res).to.equal(0)
        })
    })


    describe('#makeFilterRegexes', () => {

        it('should make filter regex /A/i when opt set after construct', () => {
            const table = new Table
            const regex = new RegExp('A', 'i')
            table.opts.filterRegex = regex
            const res = table.makeFilterRegexes()
            expect(res[0]).to.equal(regex)
        })

        it('should make filter fixed when opt set after construct', () => {
            const table = new Table
            table.opts.filterFixed = 'a'
            const res = table.makeFilterRegexes()
            expect(res[0].toString()).to.equal('/a/i')
        })

        it('should return empty when filterRegex opt is null', () => {
            const table = new Table
            table.opts.filterRegex = null
            const res = table.makeFilterRegexes()
            expect(res).to.jsonEqual([])
        })

        it('should return empty when filterFixed opt is null', () => {
            const table = new Table
            table.opts.filterFixed = null
            const res = table.makeFilterRegexes()
            expect(res).to.jsonEqual([])
        })

        it('should return /A/ with wrapped /', () => {
            const table = new Table
            table.opts.filterRegex = '/A/'
            const res = table.makeFilterRegexes()
            expect(res[0].toString()).to.equal('/A/')
        })

        it('should return /A/ without wrapped /', () => {
            const table = new Table
            table.opts.filterRegex = 'A'
            const res = table.makeFilterRegexes()
            expect(res[0].toString()).to.equal('/A/')
        })

        it('should throw InvalidRegexError for bad regex', () => {
            const table = new Table
            table.opts.filterRegex = '^[0-'
            const err = getError(() => table.makeFilterRegexes())
            expect(err.name).to.equal('InvalidRegexError')
        })

        it('should throw InvalidRegexError for number', () => {
            const table = new Table
            table.opts.filterRegex = 7
            const err = getError(() => table.makeFilterRegexes())
            expect(err.name).to.equal('InvalidRegexError')
        })
    })

    describe('#makeShowColumns', () => {

        it('should use separator', () => {
            const columns = ['name', 'age', 'location']
            const data = []
            const opts = {columns: 'name,age'}
            const table = new Table(columns, data, opts)
            const res = table.buildColumns().makeShowColumns()
            expect(res).to.have.length(2)
            expect(res[0].name).to.equal('name')
            expect(res[1].name).to.equal('age')
        })

        it('should use array', () => {
            const columns = ['name', 'age', 'location']
            const data = []
            const opts = {columns: ['name', 'age']}
            const table = new Table(columns, data, opts)
            const res = table.buildColumns().makeShowColumns()
            expect(res).to.have.length(2)
            expect(res[0].name).to.equal('name')
            expect(res[1].name).to.equal('age')
        })

        it('should return now columns when opt is false', () => {
            const columns = ['name', 'age', 'location']
            const data = []
            const opts = {}
            const table = new Table(columns, data, opts)
            table.opts.columns = false
            const res = table.buildColumns().makeShowColumns()
            expect(res).to.have.length(0)
        })

        it('should throw InvalidColumnError for bad column', () => {
            const columns = ['name', 'age', 'location']
            const data = []
            const opts = {columns: ['name', 'age', 'height']}
            const table = new Table(columns, data, opts)
            table.buildColumns()
            const err = getError(() => table.makeShowColumns())
            expect(err.name).to.equal('InvalidColumnError')
        })
    })

    describe('filtering', () => {

        it('should filter maxRows 2', () => {
            const columns = ['name', 'age']
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {maxRows: 2}
            const exp = [
                ['b', '10'],
                ['b', '9']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should filter regex /A/i', () => {
            const columns = ['name', 'age']
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {filterRegex: '/A/i'}
            const exp = [
                ['a', '12']
            ]
            const table = new Table(['name', 'age'], data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should not filter regex with column isFilter:false', () => {
            const columns = [
                {name: 'name', isFilter: false},
                {name: 'age', isFilter: false}
            ]
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {filterRegex: '/A/i'}
            const exp = [
                ['b', '10'],
                ['b', '9'],
                ['a', '12']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should filter multiple filterFixed', () => {
            const columns = ['name', 'city', 'beer']
            const data = [
                {name: 'Alice', city: 'Dallas' , beer: 'Coors'},
                {name: 'Bob',   city: 'Dallas' , beer: 'Miller'},
                {name: 'Carol', city: 'Houston', beer: 'Miller'}
            ]
            const opts = {filterFixed: ['dallas', 'miller']}
            const exp = [
                ['Bob', 'Dallas', 'Miller']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should filter multiple regex', () => {
            const columns = ['name', 'city', 'beer']
            const data = [
                {name: 'Alice', city: 'Dallas' , beer: 'Coors'},
                {name: 'Bob',   city: 'Dallas' , beer: 'Miller'},
                {name: 'Carol', city: 'Houston', beer: 'Miller'}
            ]
            const opts = {filterRegex: ['/dallas/i', '/miller/i']}
            const exp = [
                ['Bob', 'Dallas', 'Miller']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })
    })

    describe('sorting', () => {

        it('should sort by name,age with string option', () => {
            const columns = ['name', 'age']
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {sortBy: 'name,age'}
            const exp = [
                ['a', '12'],
                ['b', '9'],
                ['b', '10']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should sort by name,age:desc with string option', () => {
            const columns = ['name', 'age']
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {sortBy: 'name,age:desc'}
            const exp = [
                ['a', '12'],
                ['b', '10'],
                ['b', '9']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should trim columns and sort by name,age with string option', () => {
            const columns = ['name', 'age']
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {sortBy: 'name, age'}
            const exp = [
                ['a', '12'],
                ['b', '9'],
                ['b', '10']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should sort by name,age with array option', () => {
            const columns = ['name', 'age']
            const data = [
                {name: 'b', age: 10},
                {name: 'b', age: 9},
                {name: 'a', age: 12}
            ]
            const opts = {sortBy: ['name','age']}
            const exp = [
                ['a', '12'],
                ['b', '9'],
                ['b', '10']
            ]
            const table = new Table(columns, data, opts).build()
            expect(table.rows).to.jsonEqual(exp)
        })

        it('should throw InvalidColumnError for bad column', () => {
            const columns = []
            const data = []
            const opts = {sortBy: 'name'}
            const err = getError(() => new Table(columns, data, opts).build())
            expect(err.name).to.equal('InvalidColumnError')
        })

        it('should not call sort again when unneeded', () => {
            var isCalled = false
            const columns = [
                {
                    name: 'age',
                    sorter: (a, b) => {
                        isCalled = true
                        return a - b
                    }
                }
            ]
            const data = [
                {age: 2},
                {age: 3},
                {age: 4}
            ]
            const opts = {sortBy: 'age'}
            const table = new Table(columns, data, opts).build()
            expect(isCalled).to.equal(true)
            isCalled = false
            table.build()
            expect(isCalled).to.equal(false)
        })

        it('should be ok for sorter that returns null', () => {
            const columns = [
                {
                    name: 'age',
                    sorter: (a, b) => null
                }
            ]
            const data = [
                {age: 2},
                {age: 3},
                {age: 4}
            ]
            const opts = {sortBy: 'age'}
            const table = new Table(columns, data, opts).build()
        })
    })
})