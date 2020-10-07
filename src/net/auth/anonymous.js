const Auth   = require('../auth')

const {NotImplementedError} = Auth.Errors

class AnonymousAuth {

    async createUser(username, user) {
        throw new NotImplementedError
    }

    async readUser(username) {
        throw new NotImplementedError
    }

    async updateUser(username, user) {
        throw new NotImplementedError
    }

    async deleteUser(username) {
        throw new NotImplementedError
    }

    async userExists(username) {
        throw new NotImplementedError
    }

    async listAllUsers(opts) {
        throw new NotImplementedError
    }
}

module.exports = AnonymousAuth