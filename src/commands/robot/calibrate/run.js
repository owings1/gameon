/**
 * gameon - robot:calibrate:run command
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
import {Flags} from '@oclif/core'
import {AppCommand as Base} from '../../../lib/command.js'
import {Helper} from '../../../robot/calibrate.js'

export default class CalibrateRunCommand extends Base {

    async init(...args) {
        await super.init(...args)
        this.opts = {
            action    : Helper.E_Action.Run,
            outDir    : this.flags.outdir || this.env.CAL_OUTDIR,
            chunkFile : this.flags.file   || this.env.CAL_FILE,
        }
        this.helper = this.helper || new Helper(this.opts)
    }

    async run() {
        await this.helper.run()
    }
}

CalibrateRunCommand.description = `Run config case chunk for calibrating robot`

CalibrateRunCommand.flags = {
    outdir: Flags.string({
        char        : 'd',
        description : '(required) output directory, will try env CAL_OUTDIR',
    }),
    file: Flags.string({
        char        : 'f',
        description : '(required) input chunk file, will try env CAL_FILE',
    })
}

