const TestUtil = require('../util')
const {
    expect,
    getError,
    getErrorAsync,
    requireSrc
} = TestUtil

const Logger = requireSrc('lib/logger')

describe('#error', () => {

    // coverage only

    it('should call with Error param', () => {
        const logger = new Logger
        logger.loglevel =  -1
        logger.error(new Error('test'))
    })

    it('should call with Error param without name prop', () => {
        const logger = new Logger
        const err = new Error
        err.name = null
        logger.loglevel =  -1
        logger.error(err)
    })

    it('should call with string param', () => {
        const logger = new Logger
        logger.loglevel =  -1
        logger.error('test')
    })
})

describe('#format', () => {

    it('should return string with type and msg', () => {
        const str = Logger.format({type: 'info', msg: 'test'})
        expect(str.toLowerCase()).to.contain('info')
        expect(str).to.contain('test')
    })
})

describe('#getStdout', () => {

    it('should return process.stdout if not set', () => {
        const logger = new Logger
        const result = logger.getStdout()
        expect(result).to.equal(process.stdout)
    })

    it('should return what is set', () => {
        const logger = new Logger
        logger.stdout = 1
        const result = logger.getStdout()
        expect(result).to.equal(1)
    })
})

describe('#writeStdout', () => {
    it('should call write method on logger.stdout with str as argument', () => {
        const logger = new Logger
        var s
        logger.stdout = {write: str => s = str}
        logger.writeStdout('foo')
        expect(s).to.equal('foo')
    })
})