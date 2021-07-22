# Coordinator Events

```
* * * *    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
* * * *    ┃ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ┃
* * * *    ┃ ┃                                                                             ┃ ┃
* * * *    ┃ ┃    Coordinator Events (emitted on players)                                  ┃ ┃
* * * *    ┃ ┃                                                                             ┃ ┃
* * * *    ┃ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ┃
* * * *    ┣━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ matchCanceled   ┃  Emitted when cancelMatch() is called on the coordinator.     ┃
* * * *    ┃                 ┃  The match is first canceled with match.cancel(). The error   ┃
* * * *    ┃                 ┃  passed to cancelMatch() may or may not be thrown by either   ┃
* * * *    ┃                 ┃  runMatch() or runGame(). NB that if match.cancel() is        ┃
* * * *    ┃                 ┃  called independently, this event will not be propagated      ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                                                                                 ┃
* * * *    ┃      ┏ * ━ * ━ * ━ * ━ * ━ * ━ *   N. B.   * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ┓      ┃
* * * *    ┃      *                                                                   *      ┃
* * * *    ┃      ┃  matchCanceled might be emitted at any point during the match     ┃      ┃
* * * *    ┃      *                                                                   *      ┃
* * * *    ┃      ┗ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ━ * ┛      ┃
* * * *    ┃                                                                                 ┃
* * * *    ┣━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ matchStart      ┃  Before any action on a new match.                            ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ beforeNextGame  ┃  Before match.nextGame() is called                            ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ gameStart       ┃  Before game.firstTurn() is called                            ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ firstRoll       ┃  After game.firstTurn() is called, which automatically rolls. ┃
* * * *    ┃                 ┃  In this case, the next event will be afterRoll.              ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ turnStart       ┃  After game.nextTurn() is called, before rolling or option.   ┃
* * * *    ┃                 ┃  this is not emitted for the first turn.                      ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ beforeOption    ┃  Before the player has the option to roll or double.          ┃
* * * *    ┃                 ┃  This is only emitted if the player whose turn it is          ┃
* * * *    ┃                 ┃  could double, so it is skipped if:                           ┃
* * * *    ┃                 ┃      - it is the first turn of the game                       ┃
* * * *    ┃                 ┃      - the player already owns the cube                       ┃
* * * *    ┃                 ┃      - it is a crawford game                                  ┃
* * * *    ┃                 ┃      - the cube is at its max value                           ┃
* * * *    ┃                 ┃      - the cube is disabled                                   ┃
* * * *    ┃                 ┃  The event is emitted on both players, but only the turn's    ┃
* * * *    ┃                 ┃  player will have its turnOption() method called, where       ┃
* * * *    ┃                 ┃  the player will either roll the turn, or setDoubleOffered    ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ afterOption     ┃  After the turn's player's turnOption() call is finished.     ┃
* * * *    ┃                 ┃  At this point the turn will either be rolled, or have        ┃
* * * *    ┃                 ┃  isDoubleOffered. So the next event will either be afterRoll  ┃
* * * *    ┃                 ┃  or doubleOffered.                                            ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ doubleOffered   ┃  When a double was offereed after turnOption(), before the    ┃
* * * *    ┃                 ┃  turn's opponent player's decideDouble() method is called.    ┃
* * * *    ┃                 ┃  In this case, the next event will either be doubleDeclined,  ┃
* * * *    ┃                 ┃  or doubleAccepted.                                           ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ doubleDeclined  ┃  After the turn's opponent player's decideDouble() and the    ┃
* * * *    ┃                 ┃  turn has isDoubleDeclined. In this case, the next event      ┃
* * * *    ┃                 ┃  will be turnEnd, followed by gameEnd.                        ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ doubleAccepted  ┃  After the turn's opponent player's decideDouble() and the    ┃
* * * *    ┃                 ┃  turn does not have isDoubleDeclined. In this case the turn   ┃
* * * *    ┃                 ┃  is immediately rolled, and the next event is afterRoll       ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ afterRoll       ┃  After a turn is rolled, including the first turn. For the    ┃
* * * *    ┃                 ┃  first turn, this is emitted immediately after firstRoll.     ┃
* * * *    ┃                 ┃  In cases where the turn's player may not double, this comes  ┃
* * * *    ┃                 ┃  after turnStart. In cases where the turn's player chose      ┃
* * * *    ┃                 ┃  not to double, this follows afterOption. If the player       ┃
* * * *    ┃                 ┃  doubled, then it follow doubleAccepted. The turn's player's  ┃
* * * *    ┃                 ┃  playRoll() method is then called.                            ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ turnEnd         ┃  When the turn is finished. Though this is typically after    ┃
* * * *    ┃                 ┃  are completed, it is emitted after every turn, including     ┃
* * * *    ┃                 ┃  when a double is declined, or the player cannot move. If     ┃
* * * *    ┃                 ┃  this turn is canceled, this event is not emitted. If the     ┃
* * * *    ┃                 ┃  game is finished, the next event is gameEnd, otherwise it    ┃
* * * *    ┃                 ┃  is turnStart.                                                ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ gameEnd         ┃  After the game is finished, i.e. has a winner. This is not   ┃
* * * *    ┃                 ┃  emitted when the game is canceled. The next event is either  ┃
* * * *    ┃                 ┃  matchEnd, or beforeNextGame.                                 ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┣━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
* * * *    ┃                 ┃                                                               ┃
* * * *    ┃ matchEnd        ┃  After the match is finished, i.e. has a winner. This is not  ┃
* * * *    ┃                 ┃  emitted when the match is canceled.                          ┃
* * * *    ┃                 ┃                                                               ┃
* * * *    ┗━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

```