const STORAGE_KEY = 'liga-do-dia:v1';
const HISTORY_LIMIT = 90;

function emptyState() {
  return {
    version: 1,
    wins: 0,
    losses: 0,
    winStreak: 0,
    bestStreak: 0,
    history: [],
    pending: null,
  };
}

function dailyError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

function assertDay(day) {
  if (!validDay(day)) throw dailyError('INVALID_DAY', 'A data do desafio é inválida.');
}

function previousDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function assertStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw dailyError('STORAGE_UNAVAILABLE', 'O navegador não permite salvar o desafio diário. Use o modo livre.');
  }
}

function validState(state) {
  if (!state || typeof state !== 'object' || state.version !== 1) return false;
  const counters = ['wins', 'losses', 'winStreak', 'bestStreak'];
  if (counters.some((key) => !Number.isSafeInteger(state[key]) || state[key] < 0)) return false;
  if (!Number.isSafeInteger(state.wins + state.losses)) return false;
  if (state.winStreak > state.bestStreak || state.bestStreak > state.wins) return false;
  if (!Array.isArray(state.history)) return false;
  if (state.pending !== null && !validDay(state.pending)) return false;

  let last = null;
  let historyWins = 0;
  let historyLosses = 0;
  for (const entry of state.history) {
    if (!entry || !validDay(entry.day) || !['win', 'loss'].includes(entry.result)) return false;
    if (last !== null && entry.day <= last) return false;
    last = entry.day;
    if (entry.result === 'win') historyWins += 1;
    else historyLosses += 1;
  }
  if (historyWins > state.wins || historyLosses > state.losses) return false;
  if ((state.wins + state.losses > 0) !== (state.history.length > 0)) return false;
  if (state.pending !== null && last !== null && state.pending <= last) return false;
  if (state.history.at(-1)?.result === 'loss' && state.winStreak !== 0) return false;
  return true;
}

function readState(storage) {
  assertStorage(storage);
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (cause) {
    throw dailyError('STORAGE_UNAVAILABLE', 'Não foi possível ler o histórico diário. Use o modo livre.', cause);
  }
  if (raw == null) return emptyState();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (!validState(parsed)) return emptyState();
  return {
    version: 1,
    wins: parsed.wins,
    losses: parsed.losses,
    winStreak: parsed.winStreak,
    bestStreak: parsed.bestStreak,
    history: parsed.history.slice(-HISTORY_LIMIT).map(({ day, result }) => ({ day, result })),
    pending: parsed.pending,
  };
}

function writeState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (cause) {
    throw dailyError('STORAGE_UNAVAILABLE', 'Não foi possível salvar o desafio diário. Use o modo livre.', cause);
  }
}

function statsFor(state, today) {
  const todayResult = state.history.find((entry) => entry.day === today)?.result ?? null;
  const todayPending = state.pending === today;
  const latestDay = state.history.at(-1)?.day;
  const streakIsCurrent = latestDay === today || latestDay === previousDay(today);
  return {
    wins: state.wins,
    losses: state.losses,
    battles: state.wins + state.losses,
    winStreak: streakIsCurrent ? state.winStreak : 0,
    bestStreak: state.bestStreak,
    playedToday: todayResult !== null || todayPending,
    todayResult,
    todayPending,
    history: state.history.map(({ day, result }) => ({ day, result })),
  };
}

function recordResult(state, day, result) {
  const latestDay = state.history.at(-1)?.day;
  if (result === 'win') {
    state.wins += 1;
    state.winStreak = latestDay === previousDay(day) ? state.winStreak + 1 : 1;
    state.bestStreak = Math.max(state.bestStreak, state.winStreak);
  } else {
    state.losses += 1;
    state.winStreak = 0;
  }
  state.history.push({ day, result });
  state.history = state.history.slice(-HISTORY_LIMIT);
  state.pending = null;
}

/** A daily challenge follows the player's local calendar, including DST. */
export function getDayKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw dailyError('INVALID_DAY', 'A data do desafio é inválida.');
  }
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** FNV-1a: identical day keys generate identical unsigned 32-bit seeds. */
export function seedForDay(dayKey) {
  assertDay(dayKey);
  let seed = 2166136261;
  for (const character of `liga-do-dia:${dayKey}`) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

export function readStats(storage = globalThis.localStorage, today = getDayKey()) {
  assertDay(today);
  return statsFor(readState(storage), today);
}

/** Claim and save the attempt before the UI starts the daily battle. */
export function beginDaily(dayKey, storage = globalThis.localStorage) {
  assertDay(dayKey);
  const state = readState(storage);
  const latestDay = state.history.at(-1)?.day;
  if ((latestDay && dayKey <= latestDay) || (state.pending && dayKey <= state.pending)) {
    throw dailyError('DAILY_ALREADY_PLAYED', 'O desafio deste dia já foi iniciado. Volte amanhã ou jogue no modo livre.');
  }
  // A caller can start tomorrow directly, without silently losing yesterday's attempt.
  if (state.pending) recordResult(state, state.pending, 'loss');
  state.pending = dayKey;
  writeState(storage, state);
  return statsFor(state, dayKey);
}

/** Completing an already recorded day is idempotent: the first result wins. */
export function completeDaily(dayKey, result, storage = globalThis.localStorage) {
  assertDay(dayKey);
  if (!['win', 'loss'].includes(result)) {
    throw dailyError('INVALID_RESULT', 'O resultado do desafio é inválido.');
  }
  const state = readState(storage);
  if (state.history.some((entry) => entry.day === dayKey)) return statsFor(state, dayKey);
  if (state.pending !== dayKey) {
    throw dailyError('DAILY_NOT_STARTED', 'Inicie o desafio diário antes de registrar o resultado.');
  }
  recordResult(state, dayKey, result);
  writeState(storage, state);
  return statsFor(state, dayKey);
}

/** A reload or an abandoned attempt consumes the daily attempt as a loss. */
export function recoverAbandoned(today = getDayKey(), storage = globalThis.localStorage) {
  assertDay(today);
  const state = readState(storage);
  if (state.pending && state.pending <= today) {
    recordResult(state, state.pending, 'loss');
    writeState(storage, state);
  }
  return statsFor(state, today);
}

export function abandonDaily(dayKey, storage = globalThis.localStorage) {
  return completeDaily(dayKey, 'loss', storage);
}

export function msUntilNextDay(date = new Date()) {
  getDayKey(date); // Validate without changing the supplied Date.
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(0, next.getTime() - date.getTime());
}

export function formatCountdown(ms) {
  const total = Math.ceil(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
