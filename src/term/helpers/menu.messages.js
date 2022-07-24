export default class Messages {

    constructor(menu) {
        this.menu = menu
    }

    login(key) {
        const {__} = this
        switch (key) {
            case 'changePassword':
                return __('alerts.passwordChanged')
            case 'confirmAccount':
                return __('alerts.accountConfirmed')
            case 'createAccount':
                return __('alerts.accountCreated')
            case 'forgotPassword':
                return __('alerts.passwordReset')
            case 'newConfirmKey':
                return __('alerts.newConfirmKeyRequestedCheckEmail')
            default:
                return key
        }
    }

    play(choice) {
        const {__} = this
        switch (choice) {
            case 'startOnline':
                return __('menu.choice.startOnlineMatch')
            case 'joinOnline':
                return __('menu.choice.joinOnlineMatch')
            case 'playHumans':
                return __('menu.choice.humanVsHuman')
            case 'playRobot':
                return __('menu.choice.humanVsRobot')
            case 'playRobots':
                return __('menu.choice.robotVsRobot')
            default:
                return choice
        }
    }

    get __() {
        return this.menu.__
    }

    get theme() {
        return this.menu.theme
    }
}
