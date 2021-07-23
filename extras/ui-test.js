const {inquirer} = require('../src/term/inquirer')
const prompter = inquirer.createPromptModule()


async function main() {
    prompter.prompt({name: 'test'})
//    await new Promise(resolve => setTimeout(resolve, 5000))
}

setTimeout(() => {
    //prompter.ui.onError(new Error('test error')).catch(console.error)
    
    setTimeout(() => {
        console.log(prompter.ui.rl.listenerCount('line'))
        console.log(prompter.ui.eventNames())
    }, 1000)
    prompter.ui.close()
}, 1000)

main()