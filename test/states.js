module.exports = {
    Initial           : '0|0|2:White|0:|0:|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'
  , Blank             : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0'
  , EngagedWithBar    : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|14|14'
  , WhiteBackgammon1  : '0|0|14:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:Red|15|0'
  , WhiteBackgammon2  : '0|1|14:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|0'
  , WhiteGammon1      : '0|0|15:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|0'
  , RedGammon1        : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15:White|0|15'
  , WhiteNoGammon1    : '0|1|12:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:Red|15|1'
  , WhiteRunner2Pips  : '0|0|1:White|0:|1:White|0:|0:|5:Red|0:|3:Red|0:|0:|0:|5:White|5:Red|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|2:Red|0|0'
    // with 2,4 white has to come in on the 4
  , WhiteCornerCase24 : '1|0|0:|0:|2:Red|0:|0:|2:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|0|0'
    // with 2,6 white has to move its rearmost piece(i:14) 2 then 6. it cannot move its middle piece(i:17) 2 first
  , WhiteCornerCase26 : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|1:White|0:|0:|2:Red|0:|0:|2:Red|0|0'
    // with 1,6 white must take the 6, even though the 6 point is un-occupied
  , WhiteCornerCase16 : '0|0|1:White|2:Red|0:|0:|0:|0:|2:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|0:|0:|0:|0:|0|0'
    // should hit on come-in roll 3
  , RedHitComeIn3     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:White|1:Red|2:Red|1:White|0:|2:White|0|0'
    // should allow bearoff with the 5
  , RedBearoff51      : '0|0|0:|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|14'
    // should allow bearoff with the 5
  , RedBearoff51easy  : '0|0|0:|1:Red|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|14'
  , EitherOneMoveWin  : '0|0|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|14|14'
  , Either65Win       : '0|0|0:|0:|0:|0:|1:Red|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|0:|0:|0:|0:|13|13'
  , RedWinWith66      : '0|0|2:White|0:|0:|0:|0:|4:Red|0:|0:|0:|0:|0:|5:White|0:|0:|0:|0:|3:White|0:|5:White|0:|0:|0:|0:|0:|0|11'
  , WhiteTakes61      : '0|0|2:White|0:|0:|0:|0:|5:Red|0:|3:Red|0:|0:|0:|4:White|5:Red|0:|0:|0:|2:White|2:White|5:White|0:|0:|0:|0:|2:Red|0|0'
  , WhiteWin          : '0|0|1:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|15|14'
  , RedWin            : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|14|15'
    // moving back piece maintains best position for 2,1
  , OccupyCase1Start  : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|0:|0:|2:White|0:|0:|0:|1:Red|0|0'
  , OccupyCase1Best   : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|2:White|0:|0:|0:|1:Red|0|0'
  , OccupyCase1Bad    : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|0:|0:|1:White|0:|0:|1:White|1:Red|0|0'
    // squaring up on 4 point leaves no blots for 2,1
  , SafetyCase1Start  : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|1:White|0:|0:|1:Red|0|0'
  , SafetyCase1Best   : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|3:White|0:|0:|1:Red|0|0'
  , SafetyCase1Med    : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:White|0:|0:|1:White|1:Red|0|0'
  , SafetyCase1Bad    : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|1:White|0:|1:White|1:Red|0|0'
    // hitting 2 is better than 1, which is better than 0, for 2,1
  , HittingCase1Start : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|1:White|0:|1:Red|1:Red|0|0'
  , HittingCase1Best  : '0|2|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|0:|0:|0:|1:White|0|0'
  , HittingCase1Med   : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|1:White|0:|1:White|1:Red|0|0'
  , HittingCase1Bad   : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|1:White|1:Red|1:Red|0|0'
    // 5-point prime for white
  , White5PointPrime1 : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|3:White|2:White|2:White|2:White|4:White|0:|0:|0:|0|0'
    // two 3-point primes for red, with lonely point and one blot
  , RedTwo3Primes1    : '0|0|0:|0:|2:Red|2:Red|2:Red|1:Red|2:Red|2:Red|2:Red|0:|2:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0|0'
    // white should take 8-point for a 3-point prime for 2,1
  , PrimeCase1Start   : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|1:White|2:White|2:White|0:|0:|0:|0:|0:|0|0'
  , PrimeCase1Best    : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:White|2:White|2:White|0:|0:|0:|0:|0:|0|0'
  , PrimeCase1Med     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|2:White|3:White|0:|0:|0:|0:|0:|0|0'
  , PrimeCase1Bad     : '0|1|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|1:White|2:White|1:White|0:|0:|1:White|0:|0:|0|0'
    // one piece on each inside point, should take 2 home for 5,3
  , Bearoff1Start     : '0|0|15:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|1:White|1:White|1:White|1:White|1:White|9|0'
  , Bearoff1Best      : '0|0|15:Red|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|1:White|0:|1:White|1:White|11|0'
    // can't go home, should spread to 1 and 3 points for 1,3
  , Bearoff2Start     : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|2:White|0:|0:|0:|2:White|0:|11|0'
  , Bearoff2Best      : '0|0|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|0:|1:White|0:|0:|1:White|1:White|1:White|11|0'
}