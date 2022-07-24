import States from './states.js'
import {Board} from '../src/lib/core.js'
export default Object.fromEntries(Object.entries(States).map(([key, value]) =>
    [key, Board.fromStateString(value).state28()]
))