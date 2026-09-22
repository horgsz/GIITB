import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

const names = ['A', 'B', 'C'];
const MISS = { scored: false, reason: 'missedBucket' } as const;
const IN = { scored: true } as const;

// -- Solo: each make scores one point, then immediately starts another endless round -----
{
  const g = new Game(['Solo']);
  g.startRound();
  assert.equal(g.isSolo, true);
  assert.equal(g.applyThrow(MISS), null, 'a solo miss keeps the same shot alive');
  assert.equal(g.currentPlayer.name, 'Solo');
  assert.equal(g.players[0].score, 0);

  for (let expected = 1; expected <= 5; expected++) {
    const outcome = g.applyThrow(IN);
    assert.ok(outcome, 'a solo make completes that scoring round');
    assert.equal(g.players[0].score, expected);
    assert.equal(g.placer.name, 'Solo');
    g.startRound();
  }
  assert.equal(g.players[0].score, 5, 'solo score keeps accumulating without an end game');
  console.log('OK  solo mode tallies points indefinitely');
}

// -- Rule: everyone throws from the same spot, looping, until somebody makes it ----------
{
  const g = new Game([...names]);
  g.startRound();
  assert.equal(g.placer.name, 'A');
  assert.equal(g.currentPlayer.name, 'A');

  assert.equal(g.applyThrow(MISS), null, 'a miss must not end the round');
  assert.equal(g.currentPlayer.name, 'B', 'next player throws from the same spot');
  assert.equal(g.applyThrow(MISS), null);
  assert.equal(g.currentPlayer.name, 'C');
  assert.equal(g.applyThrow(MISS), null);

  // Full lap with no makes: back to A, still the same spot, lap counter advanced.
  assert.equal(g.currentPlayer.name, 'A', 'wraps around for another lap');
  assert.equal(g.lap, 2);
  assert.equal(g.placer.name, 'A', 'placement does not change until someone makes it');
  console.log('OK  loops from the same spot until someone is in');
}

// -- Rule: once someone is in, everyone else gets exactly one steal attempt --------------
{
  const g = new Game([...names]);
  g.startRound();
  g.applyThrow(MISS);                       // A misses
  assert.equal(g.applyThrow(IN), null);     // B makes it
  assert.equal(g.pointHolder?.name, 'B');
  assert.equal(g.isStealPhase, true);

  assert.equal(g.currentPlayer.name, 'C', 'steal order follows the maker');
  assert.equal(g.applyThrow(MISS), null);
  assert.equal(g.pointHolder?.name, 'B', 'a missed steal leaves the point alone');

  assert.equal(g.currentPlayer.name, 'A');
  const outcome = g.applyThrow(MISS);
  assert.ok(outcome, 'round ends once every player has had a steal attempt');
  assert.equal(outcome.pointHolder.name, 'B');
  assert.equal(g.players.find((p) => p.name === 'B').score, 1);
  assert.equal(g.placer.name, 'B', 'the point holder places next round');
  console.log('OK  steal pass runs once per player, then the round ends');
}

// -- Rule: the LAST player to make it keeps the point ------------------------------------
{
  const g = new Game([...names]);
  g.startRound();
  assert.equal(g.applyThrow(IN), null);     // A makes it
  assert.equal(g.pointHolder?.name, 'A');
  assert.equal(g.applyThrow(IN), null);     // B steals
  assert.equal(g.pointHolder?.name, 'B');
  const outcome = g.applyThrow(IN);         // C steals last
  assert.ok(outcome);
  assert.equal(outcome.pointHolder.name, 'C', 'last maker keeps the point');
  assert.equal(g.players.find((p) => p.name === 'C').score, 1);
  assert.equal(g.players.find((p) => p.name === 'A').score, 0, 'earlier makers get nothing');
  assert.equal(g.players.find((p) => p.name === 'B').score, 0);
  assert.equal(g.placer.name, 'C');
  console.log('OK  last player to make it steals and keeps the point');
}

// -- Rule: exactly one point per round, scoreboard is endless ----------------------------
{
  const g = new Game([...names]);
  for (let round = 0; round < 5; round++) {
    g.startRound();
    let guard = 0;
    let outcome = null;
    while (!outcome && guard++ < 50) {
      outcome = g.applyThrow(guard % 2 === 0 ? IN : MISS);
    }
    assert.ok(outcome, 'round must terminate');
  }
  const total = g.players.reduce((a, p) => a + p.score, 0);
  assert.equal(total, 5, 'exactly one point awarded per round');
  console.log('OK  exactly one point per round over 5 rounds');
}

// -- Two-player edge case ----------------------------------------------------------------
{
  const g = new Game(['A', 'B']);
  g.startRound();
  assert.equal(g.applyThrow(IN), null);         // A in, B gets one steal attempt
  assert.equal(g.currentPlayer.name, 'B');
  const outcome = g.applyThrow(IN);             // B steals
  assert.ok(outcome);
  assert.equal(outcome.pointHolder.name, 'B');
  console.log('OK  two-player round resolves correctly');
}

console.log('\nall rule checks passed');
