import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createBattle, generatePreview} from '../src/engine.js';
import * as daily from '../dist/daily.js';

// Exercise the shipped page and its event handlers against the actual simulator
// and persistence module. Only browser services absent from a DOM parser are faked.
const DAY = '2026-10-11';
const STORAGE_KEY = 'liga-do-dia:v1';
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');

function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))};
}

function openPage({storage = memoryStorage(), blocked = false} = {}) {
  const {document, window} = parseHTML(html);
  const timers = new Map();
  let timerId = 0;
  const errors = [];
  const dialog = document.getElementById('dialog');
  dialog.showModal = () => {dialog.open = true;};
  dialog.close = () => {dialog.open = false;};
  document.querySelector('.arena-heading').scrollIntoView = () => {};
  if (blocked) Object.defineProperty(window, 'localStorage', {get: () => {throw new Error('Storage blocked');}, configurable: true});
  else Object.defineProperty(window, 'localStorage', {value: storage, configurable: true});
  const context = vm.createContext({
    window, document, Date, Uint32Array,
    crypto: {getRandomValues: array => {array[0] = 123456; return array;}},
    navigator: {clipboard: {writeText: async () => {}}},
    console: {error: error => errors.push(error)},
    setTimeout: (callback, delay) => {timers.set(++timerId, {callback, delay}); return timerId;},
    clearTimeout: id => timers.delete(id),
    setInterval: () => 0,
    createBattle, generatePreview, ...daily,
    getDayKey: date => date === undefined ? DAY : daily.getDayKey(date),
    msUntilNextDay: () => daily.msUntilNextDay(new Date(`${DAY}T12:00:00`)),
  });
  vm.runInContext(script, context, {filename: 'dist/app.js'});
  const get = id => document.getElementById(id);
  const state = () => vm.runInContext('view', context);
  async function flushActions() {
    for (const [id, timer] of [...timers]) if (timer.delay <= 650) {timers.delete(id); timer.callback();}
    // doAction resumes after its animation promise and installs cleanup timers.
    await Promise.resolve();
    await Promise.resolve();
    for (const [id, timer] of [...timers]) if (timer.delay <= 650) {timers.delete(id); timer.callback();}
  }
  return {document, get, state, context, storage, errors, flushActions};
}

test('the shipped lobby renders the deterministic six-Pokémon daily team and opens move details', () => {
  const page = openPage();
  const cards = [...page.get('team-grid').querySelectorAll('button')];
  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map(card => card.querySelector('strong').textContent), generatePreview(daily.seedForDay(DAY)).team.map(pokemon => pokemon.name));
  assert.equal(page.get('daily-tab').getAttribute('aria-selected'), 'true');
  assert.equal(page.get('start-button').disabled, false);
  assert.equal(page.get('battle-panel').classList.contains('hidden'), true);
  cards[0].click();
  assert.equal(page.get('dialog').open, true);
  assert.equal(page.get('dialog-title').textContent, cards[0].querySelector('strong').textContent);
  assert.equal(page.get('dialog-content').querySelectorAll('.move-detail').length, 4);
});

test('starting the daily battle claims the attempt before rendering combat; a move updates PP and turn', async () => {
  const page = openPage();
  page.get('start-button').click();
  assert.equal(JSON.parse(page.storage.getItem(STORAGE_KEY)).pending, DAY);
  assert.equal(page.get('lobby-panel').classList.contains('hidden'), true);
  assert.equal(page.get('battle-panel').classList.contains('hidden'), false);
  assert.equal(page.get('moves').querySelectorAll('button').length, 4);
  const before = page.state();
  const index = before.player.team[before.player.activeIndex].moves.findIndex(move => move.category !== 'Status');
  page.get('moves').querySelector(`[data-move="${index}"]`).click();
  assert.equal(page.get('moves').querySelector('button').disabled, true, 'Actions are disabled during the animation.');
  await page.flushActions();
  const after = page.state();
  assert.equal(after.turn, before.turn + 1);
  assert.equal(after.player.team[before.player.activeIndex].moves[index].pp, before.player.team[before.player.activeIndex].moves[index].pp - 1);
  assert.equal(page.get('turn-badge').textContent, `TURNO ${after.turn}`);
  assert.ok(page.get('battle-log').querySelectorAll('p').length > 0);
  assert.deepEqual(page.errors, []);
});

test('quitting is cancellable; confirming records one loss and locks the daily challenge', () => {
  const page = openPage();
  page.get('start-button').click();
  page.get('quit').click();
  assert.equal(page.get('dialog').open, true);
  page.get('stay').click();
  assert.equal(page.get('dialog').open, false);
  assert.equal(daily.readStats(page.storage, DAY).battles, 0);
  page.get('quit').click();
  page.get('confirm-exit').click();
  const stats = daily.readStats(page.storage, DAY);
  assert.equal(stats.losses, 1);
  assert.equal(stats.todayResult, 'loss');
  assert.equal(page.get('start-button').disabled, true);
  assert.equal(page.get('battles').textContent, '1');
  assert.equal(page.get('lobby-panel').classList.contains('hidden'), false);
});

test('a complete free battle shows a result and does not write daily statistics', async () => {
  const page = openPage();
  page.get('free-tab').click();
  assert.equal(page.get('free-tab').getAttribute('aria-selected'), 'true');
  assert.equal(page.get('reroll').classList.contains('hidden'), false);
  page.get('start-button').click();
  for (let decisions = 0; page.state().phase !== 'finished' && decisions < 400; decisions++) {
    const state = page.state();
    if (state.phase === 'switch') {
      const index = state.player.team.findIndex((pokemon, index) => !pokemon.fainted && index !== state.player.activeIndex);
      page.get('team-grid').querySelector(`[data-pokemon="${index}"]`).click();
    } else {
      const moves = state.player.team[state.player.activeIndex].moves;
      let index = moves.findIndex(move => move.category !== 'Status' && !move.disabled && move.pp > 0);
      if (index < 0) index = moves.findIndex(move => !move.disabled && move.pp > 0);
      assert.ok(index >= 0);
      page.get('moves').querySelector(`[data-move="${index}"]`).click();
    }
    await page.flushActions();
  }
  assert.equal(page.state().phase, 'finished');
  assert.equal(page.get('result-panel').classList.contains('hidden'), false);
  assert.equal(page.get('result-tag').textContent, 'TREINO CONCLUÍDO');
  assert.equal(page.storage.getItem(STORAGE_KEY), null);
  assert.equal(daily.readStats(page.storage, DAY).battles, 0);
  page.get('result-button').click();
  assert.equal(page.get('lobby-panel').classList.contains('hidden'), false);
  assert.equal(page.get('opponent-name').textContent, 'Pikachu');
  assert.equal(page.get('opponent-hp').style.width, '100%');
  assert.equal(page.get('opponent-status').textContent, '');
  assert.equal(page.get('opponent-party').textContent, '● ● ● ● ● ●');
  assert.deepEqual(page.errors, []);
});

test('blocked browser storage disables daily mode while leaving free battles playable', async () => {
  const page = openPage({blocked: true});
  assert.equal(page.get('start-button').disabled, true);
  assert.match(page.get('feedback').textContent, /modo livre/);
  page.get('free-tab').click();
  assert.equal(page.get('start-button').disabled, false);
  page.get('start-button').click();
  assert.equal(page.get('battle-panel').classList.contains('hidden'), false);
  page.get('moves').querySelector('button').click();
  await page.flushActions();
  assert.equal(page.state().turn, 2);
  assert.deepEqual(page.errors, []);
});

test('opening a page with an unfinished daily attempt recovers it as one loss', () => {
  const storage = memoryStorage();
  daily.beginDaily(DAY, storage);
  const page = openPage({storage});
  assert.equal(daily.readStats(storage, DAY).losses, 1);
  assert.equal(page.get('start-button').disabled, true);
  assert.equal(page.get('battles').textContent, '1');
  assert.match(page.get('lobby-title').textContent, /terminou/);
});

test('storage that can be read but cannot save an attempt disables daily play safely', () => {
  const storage = {getItem: () => null, setItem: () => {throw new Error('Quota exceeded');}};
  const page = openPage({storage});
  assert.equal(page.get('start-button').disabled, false);
  page.get('start-button').click();
  assert.equal(page.state(), null);
  assert.equal(page.get('battle-panel').classList.contains('hidden'), true);
  assert.equal(page.get('start-button').disabled, true);
  assert.match(page.get('feedback').textContent, /armazenamento/);
  page.get('free-tab').click();
  page.get('start-button').click();
  assert.equal(page.get('battle-panel').classList.contains('hidden'), false);
  assert.equal(page.state().turn, 1);
});

test('confirming exit during a move animation leaves the arena in the lobby', async () => {
  const page = openPage();
  page.get('start-button').click();
  page.get('moves').querySelector('button').click();
  page.get('quit').click();
  page.get('confirm-exit').click();
  await page.flushActions();
  assert.equal(vm.runInContext('game', page.context), null);
  assert.equal(page.state(), null);
  assert.equal(page.get('player-sprite').classList.contains('hidden'), true);
  assert.equal(page.get('lobby-panel').classList.contains('hidden'), false);
  assert.equal(daily.readStats(page.storage, DAY).losses, 1);
  assert.deepEqual(page.errors, []);
});

test('an exited battle animation cannot overwrite a newly started free battle', async () => {
  const page = openPage();
  page.get('start-button').click();
  page.get('moves').querySelector('button').click();
  page.get('free-tab').click();
  page.get('confirm-exit').click();
  page.get('start-button').click();
  const newBattle = page.state();
  assert.equal(newBattle.turn, 1);
  await page.flushActions();
  assert.equal(page.state(), newBattle);
  assert.equal(page.get('turn-badge').textContent, 'TURNO 1');
  assert.equal(page.get('battle-panel').classList.contains('hidden'), false);
  assert.equal(daily.readStats(page.storage, DAY).losses, 1);
  assert.deepEqual(page.errors, []);
});
