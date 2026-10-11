import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDayKey,
  seedForDay,
  readStats,
  beginDaily,
  completeDaily,
  recoverAbandoned,
  abandonDaily,
  msUntilNextDay,
  formatCountdown,
} from '../dist/daily.js';

const KEY = 'liga-do-dia:v1';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function finish(storage, day, result) {
  beginDaily(day, storage);
  return completeDaily(day, result, storage);
}

test('day keys use local calendar fields and seeds are deterministic uint32 values', () => {
  assert.equal(getDayKey(new Date(2026, 9, 11, 23, 59)), '2026-10-11');
  assert.equal(getDayKey(new Date(2027, 0, 1)), '2027-01-01');
  assert.equal(seedForDay('2026-10-11'), seedForDay('2026-10-11'));
  assert.notEqual(seedForDay('2026-10-11'), seedForDay('2026-10-12'));
  assert.ok(Number.isInteger(seedForDay('2026-10-11')));
  assert.ok(seedForDay('2026-10-11') >= 0 && seedForDay('2026-10-11') <= 0xffffffff);
  assert.throws(() => seedForDay('2026-02-30'), { code: 'INVALID_DAY' });
  assert.throws(() => getDayKey(new Date(NaN)), { code: 'INVALID_DAY' });
});

test('fresh stats are empty; an attempt is durable before any result', () => {
  const storage = memoryStorage();
  assert.deepEqual(readStats(storage, '2026-10-11'), {
    wins: 0, losses: 0, battles: 0, winStreak: 0, bestStreak: 0,
    playedToday: false, todayResult: null, todayPending: false, history: [],
  });
  const stats = beginDaily('2026-10-11', storage);
  assert.equal(JSON.parse(storage.getItem(KEY)).pending, '2026-10-11');
  assert.equal(stats.playedToday, true);
  assert.equal(stats.todayPending, true);
  assert.equal(stats.battles, 0);
  assert.throws(() => beginDaily('2026-10-11', storage), { code: 'DAILY_ALREADY_PLAYED' });
});

test('wins, losses and consecutive streaks are counted once', () => {
  const storage = memoryStorage();
  finish(storage, '2026-10-11', 'win');
  let stats = finish(storage, '2026-10-12', 'win');
  assert.equal(stats.winStreak, 2);
  assert.equal(stats.bestStreak, 2);
  stats = finish(storage, '2026-10-13', 'loss');
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.battles, 3);
  assert.equal(stats.winStreak, 0);
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.todayResult, 'loss');
  assert.equal(stats.todayPending, false);
  assert.deepEqual(completeDaily('2026-10-13', 'win', storage), stats);
  assert.deepEqual(abandonDaily('2026-10-13', storage), stats);
  assert.throws(() => beginDaily('2026-10-13', storage), { code: 'DAILY_ALREADY_PLAYED' });
});

test('a missed day breaks the active streak without inventing a battle or erasing the best', () => {
  const storage = memoryStorage();
  finish(storage, '2026-10-11', 'win');
  finish(storage, '2026-10-12', 'win');
  assert.equal(readStats(storage, '2026-10-13').winStreak, 2);
  const missed = readStats(storage, '2026-10-14');
  assert.equal(missed.winStreak, 0);
  assert.equal(missed.battles, 2);
  assert.equal(missed.bestStreak, 2);
  const resumed = finish(storage, '2026-10-14', 'win');
  assert.equal(resumed.winStreak, 1);
  assert.equal(resumed.bestStreak, 2);
});

test('reloading a pending daily attempt records exactly one loss and blocks a second attempt', () => {
  const storage = memoryStorage();
  beginDaily('2026-10-11', storage);
  const recovered = recoverAbandoned('2026-10-11', storage);
  assert.equal(recovered.losses, 1);
  assert.equal(recovered.todayResult, 'loss');
  assert.equal(recovered.todayPending, false);
  assert.deepEqual(recoverAbandoned('2026-10-11', storage), recovered);
  assert.throws(() => beginDaily('2026-10-11', storage), { code: 'DAILY_ALREADY_PLAYED' });
  assert.deepEqual(completeDaily('2026-10-11', 'win', storage), recovered);
});

test('an earlier abandoned day is settled, while a future pending day is left intact', () => {
  const storage = memoryStorage();
  beginDaily('2026-10-11', storage);
  const recovered = recoverAbandoned('2026-10-12', storage);
  assert.equal(recovered.losses, 1);
  assert.equal(recovered.playedToday, false);
  assert.deepEqual(recovered.history, [{ day: '2026-10-11', result: 'loss' }]);
  beginDaily('2026-10-13', storage);
  assert.equal(recoverAbandoned('2026-10-12', storage).losses, 1);
  assert.equal(JSON.parse(storage.getItem(KEY)).pending, '2026-10-13');
});

test('starting a new day also settles a pending previous day atomically', () => {
  const storage = memoryStorage();
  beginDaily('2026-10-11', storage);
  const started = beginDaily('2026-10-12', storage);
  assert.equal(started.losses, 1);
  assert.equal(started.todayPending, true);
  assert.deepEqual(started.history, [{ day: '2026-10-11', result: 'loss' }]);
  const completed = completeDaily('2026-10-12', 'win', storage);
  assert.equal(completed.winStreak, 1);
  assert.equal(completed.battles, 2);
});

test('explicit abandonment consumes the attempt and resets the streak', () => {
  const storage = memoryStorage();
  finish(storage, '2026-10-11', 'win');
  beginDaily('2026-10-12', storage);
  const abandoned = abandonDaily('2026-10-12', storage);
  assert.equal(abandoned.winStreak, 0);
  assert.equal(abandoned.losses, 1);
  assert.equal(abandoned.todayResult, 'loss');
});

test('month, leap-year and year boundaries remain consecutive days', () => {
  const cases = [
    ['2026-10-31', '2026-11-01'],
    ['2026-12-31', '2027-01-01'],
    ['2028-02-28', '2028-02-29'],
    ['2028-02-29', '2028-03-01'],
  ];
  for (const [first, second] of cases) {
    const storage = memoryStorage();
    finish(storage, first, 'win');
    assert.equal(finish(storage, second, 'win').winStreak, 2);
  }
});

test('history is bounded while totals and best streak remain all-time', () => {
  const storage = memoryStorage();
  const date = new Date(2026, 0, 1, 12);
  for (let i = 0; i < 100; i += 1) {
    finish(storage, getDayKey(date), 'win');
    date.setDate(date.getDate() + 1);
  }
  date.setDate(date.getDate() - 1);
  const stats = readStats(storage, getDayKey(date));
  assert.equal(stats.history.length, 90);
  assert.equal(stats.wins, 100);
  assert.equal(stats.battles, 100);
  assert.equal(stats.bestStreak, 100);
  assert.equal(stats.winStreak, 100);
  assert.throws(() => beginDaily('2026-01-01', storage), { code: 'DAILY_ALREADY_PLAYED' });
});

test('invalid JSON, malformed state and impossible calendar dates recover safely', () => {
  const corrupt = [
    '{broken', 'null', '[]', '{"version":999}',
    JSON.stringify({ version: 1, wins: -1, losses: 0, winStreak: 0, bestStreak: 0, history: [], pending: null }),
    JSON.stringify({ version: 1, wins: 0, losses: 0, winStreak: 0, bestStreak: 0, history: [], pending: '2026-02-30' }),
    JSON.stringify({ version: 1, wins: 1, losses: 0, winStreak: 1, bestStreak: 1, history: [{ day: '2026-10-11', result: 'win' }, { day: '2026-10-11', result: 'win' }], pending: null }),
  ];
  for (const value of corrupt) {
    const storage = memoryStorage({ [KEY]: value });
    assert.equal(readStats(storage, '2026-10-11').battles, 0);
    assert.equal(finish(storage, '2026-10-11', 'win').wins, 1);
  }
});

test('storage failures are explicit and a failed claim does not start an attempt', () => {
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() {} };
  assert.throws(() => readStats(unavailable, '2026-10-11'), { code: 'STORAGE_UNAVAILABLE' });
  assert.throws(() => beginDaily('2026-10-11', unavailable), { code: 'STORAGE_UNAVAILABLE' });
  assert.throws(() => readStats(null, '2026-10-11'), { code: 'STORAGE_UNAVAILABLE' });
  const readOnly = memoryStorage();
  readOnly.setItem = () => { throw new Error('quota'); };
  assert.throws(() => beginDaily('2026-10-11', readOnly), { code: 'STORAGE_UNAVAILABLE' });
  assert.equal(readStats(readOnly, '2026-10-11').playedToday, false);
});

test('a failed result write preserves the pending attempt for later recovery', () => {
  const storage = memoryStorage();
  beginDaily('2026-10-11', storage);
  const save = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => completeDaily('2026-10-11', 'win', storage), { code: 'STORAGE_UNAVAILABLE' });
  assert.equal(readStats(storage, '2026-10-11').todayPending, true);
  storage.setItem = save;
  assert.equal(recoverAbandoned('2026-10-11', storage).losses, 1);
});

test('results need a claimed attempt, and invalid inputs do not write anything', () => {
  const storage = memoryStorage();
  assert.throws(() => completeDaily('2026-10-11', 'win', storage), { code: 'DAILY_NOT_STARTED' });
  assert.throws(() => beginDaily('2026-02-30', storage), { code: 'INVALID_DAY' });
  assert.throws(() => completeDaily('2026-10-11', 'draw', storage), { code: 'INVALID_RESULT' });
  assert.equal(storage.getItem(KEY), null);
});

test('reading stats never alters storage, so free battles need no persistence call', () => {
  const storage = memoryStorage();
  finish(storage, '2026-10-11', 'win');
  const before = storage.getItem(KEY);
  const stats = readStats(storage, '2026-10-11');
  stats.history[0].result = 'loss';
  for (let i = 0; i < 20; i += 1) readStats(storage, '2026-10-11');
  assert.equal(storage.getItem(KEY), before);
  assert.equal(readStats(storage, '2026-10-11').wins, 1);
});

test('countdown reaches the next local midnight and crosses months correctly', () => {
  const nearMidnight = new Date(2026, 9, 31, 23, 59, 59, 500);
  assert.equal(msUntilNextDay(nearMidnight), 500);
  assert.equal(getDayKey(new Date(nearMidnight.getTime() + msUntilNextDay(nearMidnight))), '2026-11-01');
  assert.equal(formatCountdown(500), '00:00:01');
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(3_661_000), '01:01:01');
  assert.equal(formatCountdown(86_400_000), '24:00:00');
  assert.equal(formatCountdown(-100), '00:00:00');
  assert.equal(formatCountdown(NaN), '00:00:00');
});
