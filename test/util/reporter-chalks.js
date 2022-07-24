/**
 * gameon - Test reporter default chalks.
 *
 * Copyright (C) 2020-2022 Doug Owings
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
export default function chalks(chalk) {
    return {
        diff: {
            unified: {
                added     : chalk.green,
                removed   : chalk.red,
            },
            inline: {
                added     : chalk.bgGreen.black,
                removed   : chalk.bgRed.black,
                number    : chalk.reset,
                separator : chalk.grey,
            },
        },
        error: {
            title   : chalk.reset,
            message : chalk.red,
            stack   : chalk.grey,
        },
        stats: {
            passes   : chalk.green,
            pending  : chalk.cyan,
            failures : chalk.red,
            duration : chalk.grey,
        },
        suite: {
            title : chalk.reset,
            root  : {
                title: chalk.reset,
            },
        },
        test: {
            pass: {
                title  : chalk.grey,
                symbol : chalk.green,
            },
            fail: {
                title: chalk.red,
            },
            pending: {
                title: chalk.cyan,
            },
            speed: {
                fast   : chalk.grey,
                medium : chalk.yellow,
                slow   : chalk.red,
            },
        },
        warn: {
            message: chalk.yellow,
        },
    }
}