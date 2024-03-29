/**
 * gameon - test board states
 *
 * Copyright (C) 2020-2021 Doug Owings
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const States = {

    // ------------------
    // Legal Boards
    // ------------------
    Initial           : '0|0|2:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0',
    InitialShort      : '0|0|2:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0',
    InitialShorter    : '0|0|2:W|0|0|0|0|5:R|0|3:R|0|0|0|5:W|5:R|0|0|0|3:W|0|5:W|0|0|0|0|2:R|0|0',
    RedHasWon         : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|14|15',
    EngagedWithBar    : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|14|14',
    WhiteBackgammon1  : '0|0|14:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:R|15|0',
    WhiteBackgammon2  : '0|1|14:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|0',
    WhiteGammon1      : '0|0|15:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|0',
    RedGammon1        : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15:W|0|15',
    WhiteNoGammon1    : '0|1|12:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:R|15|1',
    WhiteRunner2Pips  : '0|0|1:W|0:|1:W|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0',
    EitherOneMoveWin  : '0|0|1:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|14|14',
    Either65Win       : '0|0|0:|0:|0:|0:|1:R|1:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|0:|0:|0:|0:|13|13',
    RedWinWith66      : '0|0|2:W|0:|0:|0:|0:|4:R|0:|0:|0:|0:|0:|5:W|0:|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|0:|0|11',
    WhiteTakes61      : '0|0|2:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|4:W|5:R|0:|0:|0:|2:W|2:W|5:W|0:|0:|0:|0:|2:R|0|0',
    WhiteWin          : '0|0|1:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|14',
    RedWin            : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|14|15',
    // one piece on each inside point, should take 2 home for 5,3
    Bearoff1Start     : '0|0|15:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|1:W|1:W|1:W|1:W|9|0',
    Bearoff1Best      : '0|0|15:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|1:W|0:|1:W|1:W|11|0',
    // still engaged, should not discount taking 5 point on 4,1 roll over keeping spread out
    Bearoff3Start     : '0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|1:W|1:W|1:W|0|0|2:R|12|13',
    Bearoff3End1      : '0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|2:W|0|0|0|2:R|13|13',
    Bearoff3End2      : '0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|1:W|0|1:W|0|0|2:R|13|13',
    // should take the 4 from point 7 then bear off with a 6 (test for may not bear off)
    Bearoff4Start     : '0|0|15:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|0:|0:|0:|0:|13:W|0|0',
    Bearoff4Best      : '0|0|15:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|13:W|1|0',
    Bearoff4Bad       : '0|0|15:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|14:W|0|0',
    // one blot, indirect shot from bar, everyone else home
    BlotsIndBar1      : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|0:|0:|0:|0:|14|14',
    // each has three blots at various positions
    BlotsMany1        : '0|0|1:W|0:|1:W|0:|0:|5:R|0:|3:R|1:R|0:|0:|4:W|4:R|0:|1:W|0:|3:W|1:R|5:W|0:|0:|0:|0:|1:R|0|0',
    // there are single pieces but disengaged
    BlotsDisengaged   : '0|0|1:R|1:R|1:W|1:W|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|13|13',
    // there are blots, but all greater than 11 distance
    BlotsOutOfRange   : '0|0|1:W|1:W|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:R|1:R|13|13',
    // observed cases
    BlotsMinSkip1     : '0|0|3:R|5:R|1:R|2:W|2:R|2:R|0:|0:|1:W|0:|0:|0:|1:W|1:W|0:|1:W|0:|0:|0:|0:|0:|3:W|2:W|4:W|0|2',
    BlotsMinSkip2     : '0|0|3:R|5:R|1:R|1:W|2:R|2:R|0:|1:W|1:W|0:|0:|0:|1:W|1:W|0:|1:W|0:|1:W|0:|0:|0:|2:W|2:W|4:W|0|2',
    BlotsMinSkip3     : '0|0|2:W|1:R|1:R|0:|0:|5:R|1:R|5:R|0:|0:|0:|1:R|1:R|0:|1:W|0:|2:W|3:W|4:W|0:|0:|3:W|0:|0:|0|0',
    BlotsMaxSkip1     : '0|1|2:R|0:|1:W|3:R|0:|3:R|2:R|2:R|0:|0:|2:R|1:W|1:W|0:|0:|2:W|0:|2:W|2:W|0:|2:W|2:W|2:W|0:|0|0',
    BlotsMaxSkip2     : '0|2|0:|0:|0:|0:|2:R|8:R|2:R|0:|1:W|1:W|0:|1:W|0:|0:|0:|0:|0:|1:W|2:W|2:W|2:W|2:W|3:W|1:R|0|0',
    // some known valid cases
    WhiteOneOnBar     : '1|0|1:W|0:|0:|0:|0:|5:R|0:|3:R|0:|0:|0:|5:W|5:R|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0',
    // white rolls 5,1 should not be allowed to move p7:1
    WhitePrune1       : '0|0|8:R|3:R|0:|0:|0:|0:|0:|0:|0:|0:|1:R|0:|0:|0:|0:|0:|0:|1:W|8:W|1:R|3:W|3:W|0:|2:R|0|0',
    // with 2,4 white has to come in on the 4, maxDepth = 1, but highestFace = 4
    WhitePruneFace4   : '1|0|0:|0:|2:R|0:|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:W|0:|12|11',
    WhiteAllow16      : '0|0|0:|0:|2:R|0:|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|0:|0:|0:|14|11',
    WhiteWinDoubles   : '0|0|0:|0:|2:R|0:|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|0:|0:|0:|0:|0:|13|11',
    WhiteWin362       : '0|0|0:|0:|2:R|0:|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|0:|0:|13|11',
    // with 2,4 white has to come in on the 4
    WhiteCornerCase24 : '1|0|0:|0:|2:R|0:|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|13|11',
    RedHasWinner12    : '0|0|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|3:W|3:W|1:W|8|13',
    // white has lots of moves with 1,2
    WhiteManyMoves12  : '0|0|0:|0:|1:R|2:R|0:|5:R|2:W|3:R|2:R|0:|0:|0:|2:R|1:W|0:|2:W|2:W|2:W|3:W|2:W|0:|0:|0:|1:W|0|0',
    // white can't move from bar with any roll
    WhiteCantMove     : '2|0|2:R|2:R|2:R|2:R|2:R|3:R|0:|0:|0:|0:|0:|5:W|0:|0:|0:|0:|3:W|0:|5:W|0:|0:|0:|0:|2:R|0|0',

    // ------------------
    // Not Legal Boards
    // ------------------
    Blank             : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0',
    BlankShort        : '0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0',
    BothHaveWon       : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|15',
    BothAllOnBar      : '15|15|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0',
    // with 2,6 white has to move its rearmost piece(i:14) 2 then 6. it cannot move its middle piece(i:17) 2 first
    WhiteCornerCase26 : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|1:W|0:|0:|2:R|0:|0:|2:R|0|0',
    // with 1,6 white must take the 6, even though the 6 point is un-occupied
    WhiteCornerCase16 : '0|0|1:W|2:R|0:|0:|0:|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|0:|0:|0:|0:|0|0',
    // should hit on come-in roll 3
    RedHitComeIn3     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:W|1:R|2:R|1:W|0:|2:W|0|0',
    // should allow bearoff with the 5
    RedBearoff51      : '0|0|0:|1:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|14',
    // should allow bearoff with the 5
    RedBearoff51easy  : '0|0|0:|1:R|1:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|14',
    // either can hit with 1,1
    EitherHitWith11   : '0|0|1:W|1:R|1:W|1:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:R|1:W|1:R|0|0',
    // moving back piece maintains best position for 2,1
    OccupyCase1Start  : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|0:|0:|2:W|0:|0:|0:|1:R|0|0',
    OccupyCase1Best   : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|2:W|0:|0:|0:|1:R|0|0',
    OccupyCase1Bad    : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|0:|0:|1:W|0:|0:|1:W|1:R|0|0',
    // squaring up on 4 point leaves no blots for 2,1
    SafetyCase1Start  : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|1:W|0:|0:|1:R|0|0',
    SafetyCase1Best   : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|3:W|0:|0:|1:R|0|0',
    SafetyCase1Med    : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:W|0:|0:|1:W|1:R|0|0',
    SafetyCase1Bad    : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|1:W|0:|1:W|1:R|0|0',
    // hitting 2 is better than 1, which is better than 0, for 2,1
    HittingCase1Start : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|1:W|0:|1:R|1:R|0|0',
    HittingCase1Best  : '0|2|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|0:|0:|0:|1:W|0|0',
    HittingCase1Med   : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|1:W|0:|1:W|1:R|0|0',
    HittingCase1Bad   : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|1:W|1:W|1:R|1:R|0|0',
    // 5-point prime for white
    White5PointPrime1 : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|3:W|2:W|2:W|2:W|4:W|0:|0:|0:|0|0',
    // two 3-point primes for red, with lonely point and one blot
    RedTwo3Primes1    : '0|0|0:|0:|2:R|2:R|2:R|1:R|2:R|2:R|2:R|0:|2:R|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0',
    // white should take 8-point for a 3-point prime for 2,1
    PrimeCase1Start   : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|1:W|2:W|2:W|0:|0:|0:|0:|0:|0|0',
    PrimeCase1Best    : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:W|2:W|2:W|0:|0:|0:|0:|0:|0|0',
    PrimeCase1Med     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|2:W|3:W|0:|0:|0:|0:|0:|0|0',
    PrimeCase1Bad     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|1:W|2:W|1:W|0:|0:|1:W|0:|0:|0|0',
    // can't go home, should spread to 1 and 3 points for 1,3
    Bearoff2Start     : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:W|0:|0:|0:|2:W|0:|11|0',
    Bearoff2Best      : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:W|0:|0:|1:W|1:W|1:W|11|0',
    // corner case, one piece on board
    OneWhitePiece     : '0|0|1:W|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0',
}
export default States
