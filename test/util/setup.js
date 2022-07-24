import {Assertion} from 'chai'

// see https://www.chaijs.com/guide/helpers/ 
Assertion.addMethod('erri', function (type) {
    const obj = this._obj
    // preconditon, whether positive or negative assertion
    new Assertion(obj).to.be.instanceof(Error)

    let name = type
    if (typeof name === 'function') {
        name = type.name
    } else if (name.length - name.lastIndexOf('Error') !== 'Error'.length) {
        // ends with
        name += 'Error'
    }
    const isprop = 'is' + name

    this.assert(
        obj.name === name || obj[isprop] === true,
        "expected #{this} to be a #{exp} but got #{act}",
        "expected #{this} to not be a #{act}",
        name,        // expected,
        obj.name,  // actual,
    )
})
// See https://www.chaijs.com/guide/helpers/
Assertion.addMethod('jsonEqual', function assertJsonEqual(b) {
    const exp = JSON.stringify(this._obj)
    const res = JSON.stringify(b)
    this.assert(
        exp == res
      , "expected #{act} to equal #{exp}"
      , "expected #{exp} to not equal #{act}"
      , res
      , exp
    )
})