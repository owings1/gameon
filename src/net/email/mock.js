class MockEmail {

    defaults(env) {
        return {
            
        }
    }

    constructor(opts) {
        this.opts = merge({}, this.defaults(process.env), opts)
        this.lastEmail = null
    }

    async send(params) {
        this.lastEmail = params
    }
}

module.exports = MockEmail