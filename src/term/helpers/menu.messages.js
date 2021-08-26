class Messages {

    constructor(menu) {
        this.menu = menu
    }

    login(key) {

        const {__} = this

        switch (key) {

            case 'changePassword':
                return __('Password changed')

            case 'confirmAccount':
                return __('Account confirmed')

            case 'createAccount':
                return __('Account created')

            case 'forgotPassword':
                return __('Password reset')

            case 'newConfirmKey':
                return __('New confirmation key requested. Check your email.')

            case 'testCredentials':
                return __('Testing credentials')

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

module.exports = Messages