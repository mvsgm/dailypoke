import test from 'node:test';
import assert from 'node:assert/strict';
import {TeamValidator} from '@pkmn/sim';
import {createBattle, generateTeam, generatePreview, POKEMON_IDS} from '../src/engine.js';

function actionFor(state) {
  if (state.phase === 'switch') {
    return {type: 'switch', index: state.player.team.findIndex((pokemon, index) => !pokemon.fainted && index !== state.player.activeIndex)};
  }
  const moves = state.player.team[state.player.activeIndex].moves;
  let index = moves.findIndex(move => move.category !== 'Status' && !move.disabled && move.pp > 0);
  if (index < 0) index = moves.findIndex(move => !move.disabled && move.pp > 0);
  assert.ok(index >= 0, 'A player decision must expose a usable move, including Struggle.');
  return {type: 'move', index};
}

test('a date seed produces six unique, reproducible Pokémon; other seeds change the team', () => {
  const today = generatePreview('2026-10-11');
  assert.deepEqual(today, generatePreview('2026-10-11'));
  assert.notDeepEqual(today, generatePreview('2026-10-12'));
  assert.equal(today.team.length, 6);
  assert.equal(new Set(today.team.map(pokemon => pokemon.id)).size, 6);
  assert.ok(today.team.every(pokemon => pokemon.level === 100 && pokemon.moves.length === 4));
});

test('every generated set is legal under the actual Generation 3 validator', () => {
  const validator = new TeamValidator('gen3ou');
  const sets = new Map();
  for (let i = 0; i < 300 && sets.size < POKEMON_IDS.length - 1; i++) {
    for (const set of generateTeam(`validate${i}`)) sets.set(set.species, set);
  }
  assert.equal(sets.size, 38);
  for (const set of sets.values()) assert.deepEqual(validator.validateSet(set), null, set.species);
});

test('Gen 3 uses special Grass moves and physical Ghost moves', () => {
  const seen = new Map();
  for (let i = 0; i < 300; i++) for (const pokemon of generatePreview(`categories${i}`).team) seen.set(pokemon.name, pokemon);
  assert.equal(seen.get('Sceptile').moves.find(move => move.id === 'leafblade').category, 'Special');
  assert.equal(seen.get('Snorlax').moves.find(move => move.id === 'shadowball').category, 'Physical');
});

test('an actual Gen 3 attack consumes PP, deals super-effective damage and resolves the AI replacement', () => {
  const battle = createBattle({seed: '2026-10-11'});
  const before = battle.state();
  assert.equal(before.player.team[0].name, 'Flygon');
  const after = battle.act({type: 'move', index: 0});
  assert.equal(after.player.team[0].moves[0].pp, before.player.team[0].moves[0].pp - 1);
  assert.ok(after.opponent.team[0].fainted);
  assert.equal(after.opponent.team[0].hp, 0);
  assert.notEqual(after.opponent.activeIndex, 0);
  assert.equal(after.phase, 'choose');
  assert.equal(after.turn, 2);
  assert.ok(after.logs.includes('Foi supereficaz!'));
  // Returned snapshots remain independent when the underlying engine advances.
  assert.equal(before.opponent.team[0].fainted, false);
});

test('team slot indices remain stable across simulator party reordering', () => {
  const battle = createBattle({seed: '2026-10-11'});
  const initialNames = battle.state().player.team.map(pokemon => pokemon.name);
  for (const index of [1, 5, 0]) {
    const next = battle.act({type: 'switch', index});
    assert.equal(next.player.activeIndex, index);
    assert.deepEqual(next.player.team.map(pokemon => pokemon.name), initialNames);
  }
});

test('invalid input is rejected without changing the battle', () => {
  const battle = createBattle({seed: 'invalid-action'});
  const before = battle.state();
  assert.throws(() => battle.act({type: 'move', index: 8}), /disponível/);
  assert.throws(() => battle.act({type: 'switch', index: before.player.activeIndex}), /disponível/);
  assert.deepEqual(battle.state(), before);
});

test('the same daily seed and same decisions reproduce battle RNG and AI exactly', () => {
  const one = createBattle({seed: 'daily-reproducibility'});
  const two = createBattle({seed: 'daily-reproducibility'});
  for (let i = 0; i < 100 && one.state().phase !== 'finished'; i++) {
    const action = actionFor(one.state());
    assert.deepEqual(one.act(action), two.act(action));
  }
});

test('full battles reach a result and never hang after either side faints', () => {
  for (let seed = 0; seed < 16; seed++) {
    const battle = createBattle({seed: `full-battle-${seed}`});
    let state = battle.state();
    let decisions = 0;
    while (state.phase !== 'finished' && decisions++ < 400) {
      state = battle.act(actionFor(state));
      for (const side of [state.player, state.opponent]) {
        for (const pokemon of side.team) assert.ok(pokemon.hp >= 0 && pokemon.hp <= pokemon.maxHp);
      }
      if (state.phase === 'choose') assert.equal(state.player.team[state.player.activeIndex].fainted, false);
    }
    assert.equal(state.phase, 'finished', `Seed ${seed} should finish in a bounded number of decisions.`);
    assert.ok(['player', 'opponent', null].includes(state.winner));
    assert.deepEqual(battle.act({type: 'move', index: 0}), state);
  }
});
