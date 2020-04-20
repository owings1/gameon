function run() {
    const fs = require('fs')
    const path = require('path')
    const {resolve} = path
    const pjson = JSON.parse(fs.readFileSync(resolve(__dirname, '../package.json')))
    const oclifDir = resolve(__dirname, '..', 'node_modules/@oclif')
    const files = [
        resolve(oclifDir, 'plugin-update/lib/commands/update.js')
      , resolve(oclifDir, 'plugin-help/lib/commands/help.js')
    ]
    console.log('Replacing descriptions')
    files.forEach(file => {
        if (!fs.existsSync(file)) {
            console.error('File not found:', file)
            return
        }
        const content = fs.readFileSync(file, 'utf-8')
        const newContent = content.replace('<%= config.bin %>', pjson.oclif.bin)
        fs.writeFileSync(file, newContent)
    })
}
try {
    run()
} catch (err) {
    console.error(err)
}
