/**
 * gameon - menu command
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
const {flags} = require('@oclif/command')
const Base    = require('../lib/command').UserCommand

class MenuCommand extends Base {

    async run() {
        //console.log(this.menu.sstatus)
        //const {sstatus} = this.menu
        //console.log('defaults', sstatus.defaults)
        //const {width, height, top, bottom, left, right} = sstatus
        //console.log({width, height, top, bottom, left, right})
        //return
        await this.menu.mainMenu()
        await this.menu.clearScreen()
        console.log(this.menu.getPromptOpts())
        
        console.log(this.menu.sstatus)
        const {sstatus} = this.menu
        console.log('defaults', sstatus.defaults)
        const {width, height, top, bottom, left, right} = sstatus
        console.log({width, height, top, bottom, left, right})
    }
}

MenuCommand.description = `Gameon main menu`

MenuCommand.flags = {}

module.exports = MenuCommand
