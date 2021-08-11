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
                return __('Start Online Match')

            case 'joinOnline':
                return __('Join Online Match')

            case 'playHumans':
                return __('Human vs Human')

            case 'playRobot':
                return __('Human vs Robot')

            case 'playRobots':
                return __('Robot vs Robot')

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