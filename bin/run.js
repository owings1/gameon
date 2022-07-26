#!/usr/bin/env node
import { run, flush, Errors } from '@oclif/core';

run(void 0, import.meta.url)
.then(flush)
.catch(Errors.handle);

// import oclif from '@oclif/core'
// import flush from '@oclif/core/flush.js'
// import handle from '@oclif/core/handle.js'
// oclif.run().then(flush).catch(handle)
// import oclif from '@oclif/command'
// import flush from '@oclif/command/flush.js'
// import handle from '@oclif/errors/handle.js'
// oclif.run(void 0, import.meta.url).then(flush).catch(handle)
/*
if (process.argv.length > 2) {
    require('@oclif/command').run()
    .then(require('@oclif/command/flush'))
    .catch(require('@oclif/errors/handle'))
} else {
    require('../src/commands/menu').run()
    .catch(require('@oclif/errors/handle'))
}


*/