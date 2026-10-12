import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle, Teams} from '@pkmn/sim';
import {createBattle, generateTeam, generateOpponentTeam} from '../src/engine.js';
import {seedForDay} from '../dist/daily.js';

function matchingPlayerSets() {
  const sets = new Map();
  for (let index = 0; index < 300; index++) {
    for (const set of generateTeam(`equipment-audit-${index}`)) sets.set(set.species, set);
  }
  return sets;
}

test('both teams enter the actual daily battle with equal equipment', () => {
  for (const seed of [seedForDay('2026-10-11'), seedForDay('2026-10-12'), seedForDay('2026-10-13'), 'free-mode-example']) {
    const state = createBattle({seed}).state();
    assert.equal(state.generation, 3);
    const pokemon = [...state.player.team, ...state.opponent.team];
    assert.equal(pokemon.length, 12);
    assert.ok(pokemon.every(member => member.item === 'Lum Berry'));
    assert.ok(pokemon.every(member => member.level === 100));
  }
});

test('player and opponent have the same training budget and IV quality', () => {
  const playerSets = matchingPlayerSets();
  const opponentSets = generateOpponentTeam();
  const playerTraining = [...playerSets.values()][0];
  for (const set of [...playerSets.values(), ...opponentSets]) {
    assert.equal(set.level, playerTraining.level, set.species);
    assert.deepEqual(set.evs, playerTraining.evs, `${set.species}: equal training allocation`);
    assert.deepEqual(set.ivs, playerTraining.ivs, `${set.species}: equal IV quality`);
    assert.equal(Object.values(set.evs).reduce((sum, ev) => sum + ev, 0), 504);
    assert.ok(Object.values(set.ivs).every(iv => iv === 31));
  }
});

test('a shared species has equal battle stats and damage regardless of its side', () => {
  const playerSets = matchingPlayerSets();
  const sharedSets = generateOpponentTeam().filter(set => playerSets.has(set.species));
  assert.equal(sharedSets.length, 5);

  for (const opponentSet of sharedSets) {
    const playerSet = playerSets.get(opponentSet.species);
    const sharedMove = playerSet.moves.find(move => opponentSet.moves.includes(move));
    assert.ok(sharedMove, `${opponentSet.species}: requires a shared move`);

    for (let roll = 0; roll < 16; roll++) {
      const options = {
        formatid: 'gen3customgame', seed: [8, 15, 16, roll],
        p1: {name: 'Player', team: Teams.pack([playerSet])},
        p2: {name: 'Red', team: Teams.pack([opponentSet])},
      };
      const first = new Battle(options);
      const paired = new Battle(options);
      assert.deepEqual(first.p1.active[0].storedStats, first.p2.active[0].storedStats, opponentSet.species);
      assert.equal(first.p1.active[0].maxhp, first.p2.active[0].maxhp, opponentSet.species);
      // Separate battles give both directions exactly the same random roll,
      // including critical-hit RNG. Team identity must not alter damage.
      const dealtByPlayer = first.actions.getDamage(first.p1.active[0], first.p2.active[0], sharedMove, true);
      const dealtByRed = paired.actions.getDamage(paired.p2.active[0], paired.p1.active[0], sharedMove, true);
      assert.equal(dealtByPlayer, dealtByRed, `${opponentSet.species}, seed roll ${roll}`);
    }
  }
});
