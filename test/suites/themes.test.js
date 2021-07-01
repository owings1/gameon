/**
 * gameon - test suite - term classes
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
    getErrorAsync,
    parseKey,
    requireSrc,
    MockPrompter,
    noop,
    tmpDir
} = TestUtil

const fs   = require('fs')
const fse  = require('fs-extra')
const path = require('path')

const {resolve} = path

describe('ThemeHelper', () => {

    const ThemeHelper = requireSrc('term/themes')

    beforeEach(() => {
        ThemeHelper.clearCustom()
    })

    afterEach(() => {
        ThemeHelper.clearCustom()
    })

    describe('extends', () => {

        it('child should inherit from parent', () => {
            const parentConfig = {
                styles: {
                    'text.background' : 'blue'
                }
            }
            const childConfig = {
                extends: ['MyParent'],
                styles : {
                    'text.color' : 'orange'
                }
            }
            ThemeHelper.register('MyParent', parentConfig)
            ThemeHelper.register('MyChild', childConfig)
            const styles = ThemeHelper.getStyles('MyChild')
            expect(styles['text.background']).to.equal('blue')
        })

        it('child should overwrite parent', () => {
            const parentConfig = {
                styles: {
                    'text.color' : 'green'
                }
            }
            const childConfig = {
                extends: ['MyParent'],
                styles : {
                    'text.color' : 'orange'
                }
            }
            ThemeHelper.register('MyParent', parentConfig)
            ThemeHelper.register('MyChild', childConfig)
            const styles = ThemeHelper.getStyles('MyChild')
            expect(styles['text.color']).to.equal('orange')
        })

        it('should inherit from grandparent (recursion)', () => {
            const gpConfig = {
                styles : {
                    'text.background' : 'cyan'
                }
            }
            const parentConfig = {
                extends: ['MyGrandparent'],
                styles: {
                    'text.color' : 'green'
                }
            }
            const childConfig = {
                extends: ['MyParent'],
                styles : {
                    'text.color' : 'orange'
                }
            }
            ThemeHelper.register('MyGrandparent', gpConfig)
            ThemeHelper.register('MyParent', parentConfig)
            ThemeHelper.register('MyChild', childConfig)
            const styles = ThemeHelper.getStyles('MyChild')
            expect(styles['text.color']).to.equal('orange')
            expect(styles['text.background']).to.equal('cyan')
        })

        it('should inherit from grandparent (multi-extends)', () => {
            const gpConfig = {
                styles : {
                    'text.background' : 'cyan'
                }
            }
            const parentConfig = {
                styles: {
                    'text.color' : 'green'
                }
            }
            const childConfig = {
                extends: ['MyParent', 'MyGrandparent'],
                styles : {
                    'text.color' : 'orange'
                }
            }
            ThemeHelper.register('MyGrandparent', gpConfig)
            ThemeHelper.register('MyParent', parentConfig)
            ThemeHelper.register('MyChild', childConfig)
            const styles = ThemeHelper.getStyles('MyChild')
            expect(styles['text.color']).to.equal('orange')
            expect(styles['text.background']).to.equal('cyan')
        })

        it('parent should override grandparent (multi-extends)', () => {
            const gpConfig = {
                styles : {
                    'text.background' : 'cyan',
                    'text.color'      : 'blue'
                }
            }
            const parentConfig = {
                styles: {
                    'text.background' : 'green'
                }
            }
            const childConfig = {
                extends: ['MyParent', 'MyGrandparent'],
                styles : {
                    'text.color' : 'orange'
                }
            }
            ThemeHelper.register('MyGrandparent', gpConfig)
            ThemeHelper.register('MyParent', parentConfig)
            ThemeHelper.register('MyChild', childConfig)
            const styles = ThemeHelper.getStyles('MyChild')
            expect(styles['text.color']).to.equal('orange')
            expect(styles['text.background']).to.equal('green')
        })

        it('should throw MaxDepthExceededError on 11', () => {
            ThemeHelper.register('Anc0', {styles: {'text.color': 'blue'}})
            for (var i = 0; i < 11; ++i) {
                ThemeHelper.register('Anc' + (i+1), {extends: ['Anc' + i]})
            }
            const err = getError(() => ThemeHelper.register('Foo', {extends: ['Anc' + i]}))
            expect(err.name).to.equal('MaxDepthExceededError')
        })
    })

    describe('#getConfig', () => {
        it('should throw ThemeNotFoundError for non-existent', () => {
            const err = getError(() => ThemeHelper.getConfig('NoExist'))
            expect(err.name).to.equal('ThemeNotFoundError')
        })
    })

    describe('#getDefaultInstance', () => {
        it('should return default instance', () => {
            const theme = ThemeHelper.getDefaultInstance()
            expect(theme.constructor.name).to.equal('Theme')
        })
    })

    describe('#getInstance', () => {

        it('should return default instance', () => {
            const theme = ThemeHelper.getInstance('Default')
            expect(theme.constructor.name).to.equal('Theme')
        })

        it('should accept theme object', () => {
            const theme = ThemeHelper.getInstance('Default')
            const res = ThemeHelper.getInstance(theme)
            expect(res).to.equal(theme)
        })
    })

    describe('#list', () => {
        it('should return custom theme and Default', () => {
            ThemeHelper.register('MyCustom', {})
            const result = ThemeHelper.list()
            expect(result).to.contain('Default')
            expect(result).to.contain('MyCustom')
        })
    })

    describe('#loadDirectory', () => {

        const realNewDependencyHelper = ThemeHelper._newDependencyHelper

        var dir

        beforeEach(() => {
            dir = tmpDir()
        })

        afterEach(async () => {
            await fse.remove(dir)
            ThemeHelper._newDependencyHelper = realNewDependencyHelper
        })

        async function writeTheme(name, config) {
            const file = resolve(dir, name + '.json')
            await fse.writeJson(file, config, {spaces: 2})
            return file
        }

        async function writeThemeRaw(name, data) {
            const file = resolve(dir, name + '.json')
            fs.writeFileSync(file, data)
            return file
        }

        it('should load two custom themes', async () => {
            await writeTheme('custom1', {extends: ['Default']})
            await writeTheme('custom2', {extends: ['Default']})
            const res = await ThemeHelper.loadDirectory(dir)
            res.errors.forEach(info => {
                console.log(info)
                console.error(info.error)
            })
            expect(res.loaded).to.jsonEqual(['custom1', 'custom2'])
            expect(res.errors).to.have.length(0)
        })

        it('should load custom1 but have json error for custom2 with bad json', async () => {
            await writeTheme('custom1', {extends: ['Default']})
            const file2 = await writeThemeRaw('custom2', 'asdf')
            const res = await ThemeHelper.loadDirectory(dir)
            expect(res.loaded).to.jsonEqual(['custom1'])
            expect(res.errors).to.have.length(1)
            expect(res.errors[0].file).to.equal(file2)
            expect(res.errors[0].error.message).to.contain('JSON')
        })

        it('should load custom1 but have dependency error for custom2 with unresolved dependency', async () => {
            await writeTheme('custom1', {extends: ['Default']})
            await writeTheme('custom2', {extends: ['unknown']})
            const res = await ThemeHelper.loadDirectory(dir)
            expect(res.loaded).to.jsonEqual(['custom1'])
            expect(res.errors).to.have.length(1)
            expect(res.errors[0].error.isDependencyError).to.equal(true)
        })

        it('should have error for bad style', async () => {
            await writeTheme('custom1', {styles: {'asdf.asdf': 'asdf'}})
            const res = await ThemeHelper.loadDirectory(dir)
            expect(res.errors).to.have.length(1)
            expect(res.errors[0].error.isStyleError).to.equal(true)
        })

        it('should throw when dependency helper throws non dependency error', async () => {
            const exp = new Error
            // override
            ThemeHelper._newDependencyHelper = (...args) => {
                const helper = realNewDependencyHelper(...args)
                helper.resolve = () => {throw exp}
                return helper
            }
            await writeTheme('custom1', {extends: ['Default']})
            await writeTheme('custom2', {extends: ['custom1']})
            const res = await getErrorAsync(() => ThemeHelper.loadDirectory(dir))
            expect(res).to.equal(exp)
        })
    })

    describe('#listCustom', () => {
        it('should return custom theme only', () => {
            ThemeHelper.register('MyCustom', {})
            const result = ThemeHelper.listCustom()
            expect(result).to.contain('MyCustom')
            expect(result).to.have.length(1)
        })
    })

    describe('#register', () => {

        it('should throw ThemeExistsError for built in', () => {
            const err = getError(() => ThemeHelper.register('Default', {}))
            expect(err.name).to.equal('ThemeExistsError')
        })
    })

    describe('#update', () => {

        it('should update existing theme', () => {
            const config1 = {styles: {'text.color': 'red'}}
            ThemeHelper.register('Test1', config1)
            const config2 = {styles: {'text.color': 'blue'}}
            ThemeHelper.update('Test1', config2)
            const result = ThemeHelper.getConfig('Test1')
            expect(result.styles['text.color']).to.equal('blue')
        })

        it('should throw ThemeExistsError for built in', () => {
            const err = getError(() => ThemeHelper.update('Default', {}))
            expect(err.name).to.equal('ThemeExistsError')
        })
    })

    describe('#validateConfig', () => {

        it('should pass for valid hex value for color', () => {
            const config = {
                styles: {'text.color': '#ffffff'}
            }
            ThemeHelper.validateConfig(config)
        })

        it('should pass for valid hex value for background', () => {
            const config = {
                styles: {'text.background': '#ffffff'}
            }
            ThemeHelper.validateConfig(config)
        })

        it('should pass for valid built in for background', () => {
            const config = {
                styles: {'text.background': 'red bright'}
            }
            ThemeHelper.validateConfig(config)
        })

        it('should pass for valid keyword for background', () => {
            const config = {
                styles: {'text.background': 'orange'}
            }
            ThemeHelper.validateConfig(config)
        })

        it('should throw ThemeError for text.color = ###', () => {
            const config = {
                styles: {'text.color': '###'}
            }
            const err = getError(() => ThemeHelper.validateConfig(config))
            expect(err.isThemeError).to.equal(true)
        })
    })

    describe('#validateStyle', () => {
        it('should throw StyleError for unknown key', () => {
            const err = getError(() => ThemeHelper.validateStyle('foo'))
            expect(err.name).to.equal('StyleError')
        })
    })

    describe('Theme', () => {

        const ThemeConfig = requireSrc('term/res/themes.config')

        describe('minimal', () => {

            var theme

            beforeEach(() => {
                ThemeHelper.update('test_minimal', {styles: {}})
                theme = ThemeHelper.getInstance('test_minimal')
            })

            describe('#get', () => {

                ThemeConfig.Keys.forEach(key => {

                    it('should get ' + key + ' and call', () => {
                        const res = theme.get(key)('a')
                        expect(res).to.contain('a')
                    })
                })
            })
        })
    })
})