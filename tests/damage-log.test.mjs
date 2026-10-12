import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle} from '../src/engine.js';
import {seedForDay} from '../dist/daily.js';

test('damage logs report HP actually lost and label the remaining HP explicitly', () => {
  const battle = createBattle({seed: seedForDay('2026-10-11')});
  const before = battle.state();
  const after = battle.act({type: 'move', index: 0});
  const newLogs = after.logs.slice(before.logs.length);
  for (const side of ['player', 'opponent']) {
    const oldPokemon = before[side].team[before[side].activeIndex];
    const newPokemon = after[side].team[before[side].activeIndex];
    const lost = oldPokemon.hp - newPokemon.hp;
    assert.ok(lost > 0);
    assert.notEqual(lost, newPokemon.hp, 'This scenario must distinguish lost HP from remaining HP.');
    assert.ok(newLogs.includes(`${oldPokemon.name} perdeu ${lost} PV (${newPokemon.hp}/${newPokemon.maxHp} restantes).`));
  }
});

test('a knockout logs only the HP the Pokémon had left, including its known maximum', () => {
  const battle = createBattle({seed: '2026-10-11'});
  const before = battle.state();
  const after = battle.act({type: 'move', index: 0});
  const pikachu = before.opponent.team[0];
  assert.equal(after.opponent.team[0].hp, 0);
  assert.ok(after.opponent.team[0].fainted);
  assert.ok(after.logs.includes(`Pikachu perdeu ${pikachu.hp} PV (0/${pikachu.maxHp} restantes).`));
  assert.equal(after.logs.filter(log => log.startsWith('Pikachu perdeu ')).length, 1, 'Private/public simulator log copies must not duplicate damage.');
  assert.notEqual(after.opponent.activeIndex, 0, 'A replacement may occur in the same decision without changing the KO amount.');
});

test('switches, healing and later damage preserve separate per-Pokémon HP event histories', () => {
  const battle = createBattle({seed: '2026-10-11'});
  const beforeSwitch = battle.state();
  const afterSwitch = battle.act({type: 'switch', index: 1});
  const miloticBefore = beforeSwitch.player.team[1];
  const miloticSwitched = afterSwitch.player.team[1];
  assert.equal(miloticSwitched.name, 'Milotic');
  assert.ok(miloticSwitched.hp < miloticBefore.hp);
  assert.ok(afterSwitch.logs.slice(beforeSwitch.logs.length).includes(`Milotic perdeu ${miloticBefore.hp - miloticSwitched.hp} PV (${miloticSwitched.hp}/${miloticSwitched.maxHp} restantes).`));

  const recoverIndex = miloticSwitched.moves.findIndex(move => move.id === 'recover');
  assert.ok(recoverIndex >= 0);
  const afterRecovery = battle.act({type: 'move', index: recoverIndex});
  const recoveryLogs = afterRecovery.logs.slice(afterSwitch.logs.length);
  const damage = recoveryLogs.map(log => /^Milotic perdeu (\d+) PV \((\d+)\/(\d+) restantes\)\.$/.exec(log)).find(Boolean);
  const healing = recoveryLogs.map(log => /^Milotic recuperou (\d+) PV \((\d+)\/(\d+) restantes\)\.$/.exec(log)).find(Boolean);
  assert.ok(damage, 'This Recover turn includes a real attack before healing.');
  assert.ok(healing);
  const damagedHp = Number(damage[2]);
  const healedMilotic = afterRecovery.player.team[1];
  assert.equal(Number(damage[1]), miloticSwitched.hp - damagedHp);
  assert.equal(Number(healing[1]), healedMilotic.hp - damagedHp);
  assert.equal(Number(healing[2]), healedMilotic.hp);
  assert.equal(healedMilotic.hp, healedMilotic.maxHp);
  assert.ok(Number(healing[1]) < healedMilotic.maxHp / 2, 'Recover is capped by missing HP, rather than logging its theoretical healing amount.');

  const surfIndex = healedMilotic.moves.findIndex(move => move.id === 'surf');
  const afterAttack = battle.act({type: 'move', index: surfIndex});
  const attackedMilotic = afterAttack.player.team[1];
  const turnLogs = afterAttack.logs.slice(afterRecovery.logs.length);
  assert.ok(attackedMilotic.hp < healedMilotic.hp);
  assert.ok(turnLogs.includes(`Milotic perdeu ${healedMilotic.hp - attackedMilotic.hp} PV (${attackedMilotic.hp}/${attackedMilotic.maxHp} restantes).`));
  const oldPikachu = afterRecovery.opponent.team[0];
  const newPikachu = afterAttack.opponent.team[0];
  assert.ok(newPikachu.hp < oldPikachu.hp);
  assert.ok(turnLogs.includes(`Pikachu perdeu ${oldPikachu.hp - newPikachu.hp} PV (${newPikachu.hp}/${newPikachu.maxHp} restantes).`));
});
