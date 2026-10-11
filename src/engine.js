import {Battle, Dex, Teams} from '@pkmn/sim';

// Battle rules, damage, abilities, status and PP belong to Pokémon Showdown's
// Gen 3 simulator. This file only generates teams, chooses Red's actions and
// adapts simulator state into a small browser-friendly API.
const dex = Dex.forGen(3);
const VERSION = 'liga-do-dia-v1';
const BALANCED_EVS = {hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84};
const PERFECT_IVS = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};

// All species and moves are available by Generation 3. Moves are intentionally
// curated instead of sampled from the whole learnset to avoid unusable teams.
const POOL = [
  ['Venusaur', 'Overgrow', 'Modest', ['Giga Drain', 'Sludge Bomb', 'Sleep Powder', 'Leech Seed']],
  ['Charizard', 'Blaze', 'Mild', ['Flamethrower', 'Dragon Claw', 'Earthquake', 'Aerial Ace']],
  ['Blastoise', 'Torrent', 'Modest', ['Surf', 'Ice Beam', 'Toxic', 'Protect']],
  ['Pidgeot', 'Keen Eye', 'Adamant', ['Return', 'Aerial Ace', 'Steel Wing', 'Quick Attack']],
  ['Nidoqueen', 'Poison Point', 'Brave', ['Earthquake', 'Sludge Bomb', 'Ice Beam', 'Thunderbolt']],
  ['Nidoking', 'Poison Point', 'Brave', ['Earthquake', 'Megahorn', 'Ice Beam', 'Thunderbolt']],
  ['Arcanine', 'Intimidate', 'Mild', ['Flamethrower', 'Extreme Speed', 'Crunch', 'Iron Tail']],
  ['Alakazam', 'Synchronize', 'Timid', ['Psychic', 'Fire Punch', 'Thunder Punch', 'Recover']],
  ['Machamp', 'Guts', 'Adamant', ['Cross Chop', 'Rock Slide', 'Earthquake', 'Bulk Up']],
  ['Gengar', 'Levitate', 'Timid', ['Thunderbolt', 'Ice Punch', 'Giga Drain', 'Hypnosis']],
  ['Rhydon', 'Rock Head', 'Adamant', ['Earthquake', 'Rock Slide', 'Megahorn', 'Double-Edge']],
  ['Starmie', 'Natural Cure', 'Timid', ['Surf', 'Psychic', 'Thunderbolt', 'Recover']],
  ['Gyarados', 'Intimidate', 'Adamant', ['Return', 'Earthquake', 'Dragon Dance', 'Surf']],
  ['Lapras', 'Water Absorb', 'Modest', ['Surf', 'Ice Beam', 'Thunderbolt', 'Confuse Ray']],
  ['Jolteon', 'Volt Absorb', 'Timid', ['Thunderbolt', 'Bite', 'Thunder Wave', 'Quick Attack']],
  ['Flareon', 'Flash Fire', 'Brave', ['Flamethrower', 'Shadow Ball', 'Return', 'Quick Attack']],
  ['Snorlax', 'Thick Fat', 'Adamant', ['Body Slam', 'Shadow Ball', 'Earthquake', 'Rest']],
  ['Dragonite', 'Inner Focus', 'Mild', ['Dragon Claw', 'Earthquake', 'Thunderbolt', 'Aerial Ace']],
  ['Meganium', 'Overgrow', 'Modest', ['Giga Drain', 'Body Slam', 'Leech Seed', 'Light Screen']],
  ['Typhlosion', 'Blaze', 'Mild', ['Flamethrower', 'Thunder Punch', 'Earthquake', 'Quick Attack']],
  ['Feraligatr', 'Torrent', 'Brave', ['Surf', 'Earthquake', 'Ice Beam', 'Brick Break']],
  ['Crobat', 'Inner Focus', 'Adamant', ['Sludge Bomb', 'Aerial Ace', 'Shadow Ball', 'Confuse Ray']],
  ['Ampharos', 'Static', 'Modest', ['Thunderbolt', 'Fire Punch', 'Thunder Wave', 'Light Screen']],
  ['Espeon', 'Synchronize', 'Timid', ['Psychic', 'Bite', 'Morning Sun', 'Reflect']],
  ['Umbreon', 'Synchronize', 'Calm', ['Bite', 'Toxic', 'Moonlight', 'Confuse Ray']],
  ['Heracross', 'Guts', 'Adamant', ['Megahorn', 'Brick Break', 'Rock Slide', 'Swords Dance']],
  ['Houndoom', 'Flash Fire', 'Modest', ['Flamethrower', 'Crunch', 'Sunny Day', 'Solar Beam']],
  ['Kingdra', 'Swift Swim', 'Modest', ['Surf', 'Ice Beam', 'Dragon Breath', 'Toxic']],
  ['Tyranitar', 'Sand Stream', 'Brave', ['Rock Slide', 'Earthquake', 'Crunch', 'Dragon Dance']],
  ['Sceptile', 'Overgrow', 'Timid', ['Leaf Blade', 'Dragon Claw', 'Crunch', 'Brick Break']],
  ['Blaziken', 'Blaze', 'Mild', ['Flamethrower', 'Sky Uppercut', 'Rock Slide', 'Bulk Up']],
  ['Swampert', 'Torrent', 'Relaxed', ['Surf', 'Earthquake', 'Ice Beam', 'Protect']],
  ['Gardevoir', 'Trace', 'Modest', ['Psychic', 'Thunderbolt', 'Hypnosis', 'Calm Mind']],
  ['Aggron', 'Rock Head', 'Adamant', ['Iron Tail', 'Rock Slide', 'Earthquake', 'Double-Edge']],
  ['Flygon', 'Levitate', 'Brave', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Flamethrower']],
  ['Milotic', 'Marvel Scale', 'Bold', ['Surf', 'Ice Beam', 'Recover', 'Toxic']],
  ['Salamence', 'Intimidate', 'Mild', ['Dragon Claw', 'Earthquake', 'Flamethrower', 'Aerial Ace']],
  ['Metagross', 'Clear Body', 'Adamant', ['Meteor Mash', 'Earthquake', 'Rock Slide', 'Psychic']],
];

const RED = [
  ['Pikachu', 'Static', 'Modest', ['Thunderbolt', 'Surf', 'Thunder Wave', 'Quick Attack'], 'Light Ball'],
  ['Espeon', 'Synchronize', 'Timid', ['Psychic', 'Bite', 'Morning Sun', 'Reflect'], 'Leftovers'],
  ['Snorlax', 'Thick Fat', 'Adamant', ['Body Slam', 'Shadow Ball', 'Rest', 'Sleep Talk'], 'Leftovers'],
  ['Venusaur', 'Overgrow', 'Modest', ['Giga Drain', 'Sludge Bomb', 'Sleep Powder', 'Leech Seed'], 'Leftovers'],
  ['Charizard', 'Blaze', 'Mild', ['Flamethrower', 'Dragon Claw', 'Earthquake', 'Aerial Ace'], 'Lum Berry'],
  ['Blastoise', 'Torrent', 'Modest', ['Surf', 'Ice Beam', 'Toxic', 'Protect'], 'Leftovers'],
];


function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomGenerator(seed) {
  let value = hash(seed) || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function setFromEntry(entry) {
  const [species, ability, nature, moves, item = 'Lum Berry'] = entry;
  return {
    name: species, species, ability, nature, moves: [...moves], item,
    level: 100, evs: {...BALANCED_EVS}, ivs: {...PERFECT_IVS},
    gender: species === 'Nidoqueen' ? 'F' : species === 'Nidoking' ? 'M' : undefined,
  };
}

export function generateTeam(seed) {
  const random = randomGenerator(`${VERSION}:team:${seed}`);
  const entries = [...POOL];
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries.slice(0, 6).map(setFromEntry);
}

function moveInfo(id, extra = {}) {
  const move = dex.moves.get(id);
  return {
    id: move.id, name: move.name,
    officialName: move.name, type: move.type, category: move.category,
    ...extra,
  };
}

export function generatePreview(seed) {
  return {team: generateTeam(seed).map(set => {
    const species = dex.species.get(set.species);
    return {
      id: species.num, name: species.name, types: [...species.types], level: 100,
      ability: set.ability, item: set.item, moves: set.moves.map(move => moveInfo(move)),
    };
  })};
}

export const POKEMON_IDS = Object.freeze([...new Set([...POOL, ...RED].map(entry => dex.species.get(entry[0]).num))]);

function expectedPower(battle, user, target, id) {
  const move = battle.dex.moves.get(id);
  if (move.category === 'Status' || !target || target.fainted) return 0;
  if (!battle.dex.getImmunity(move.type, target)) return 0;
  if (move.type === 'Ground' && target.hasAbility('Levitate')) return 0;
  if (move.type === 'Electric' && target.hasAbility('Volt Absorb')) return 0;
  if (move.type === 'Water' && target.hasAbility('Water Absorb')) return 0;
  if (move.type === 'Fire' && target.hasAbility('Flash Fire')) return 0;
  const category = move.category;
  const attack = category === 'Physical' ? 'atk' : 'spa';
  const defense = category === 'Physical' ? 'def' : 'spd';
  const effectiveness = 2 ** battle.dex.getEffectiveness(move, target);
  const stab = user.hasType(move.type) ? 1.5 : 1;
  const accuracy = typeof move.accuracy === 'number' ? move.accuracy / 100 : 1;
  return (move.basePower || 60) * effectiveness * stab * accuracy *
    user.getStat(attack) / Math.max(1, target.getStat(defense));
}

function aiChoice(battle, random) {
  const side = battle.p2;
  const target = battle.p1.active[0];
  const user = side.active[0];
  if (side.requestState === 'switch') {
    const available = side.pokemon.map((pokemon, index) => ({pokemon, index})).filter(({pokemon}) => !pokemon.fainted && !pokemon.isActive);
    available.sort((a, b) => {
      const best = pokemon => Math.max(...pokemon.moveSlots.map(move => expectedPower(battle, pokemon, target, move.id)));
      return best(b.pokemon) - best(a.pokemon);
    });
    return `switch ${available[0].index + 1}`;
  }
  const moves = side.activeRequest?.active?.[0]?.moves || [];
  const usable = moves.map((move, index) => ({...move, index})).filter(move => !move.disabled && move.pp !== 0);
  if (!usable.length) return 'move 1'; // Simulator request exposes Struggle when all PP is exhausted.
  const candidates = usable.map(slot => {
    const move = battle.dex.moves.get(slot.id);
    let score = expectedPower(battle, user, target, move.id);
    if (move.category === 'Status') {
      const ratio = user.hp / user.maxhp;
      if (['recover', 'moonlight', 'morningsun'].includes(move.id) && ratio < 0.5) score = 170;
      if (move.id === 'rest' && ratio < 0.3 && !user.status) score = 170;
      if (move.id === 'sleeptalk' && user.status === 'slp') score = 230;
      if (['sleeppowder', 'hypnosis'].includes(move.id) && !target.status) score = 85;
      if (move.id === 'toxic' && !target.status && !target.hasType('Poison') && !target.hasType('Steel')) score = 55;
      if (move.id === 'thunderwave' && !target.status && !target.hasType('Ground')) score = 60;
      if (move.id === 'leechseed' && !target.volatiles.leechseed && !target.hasType('Grass')) score = 60;
      if (move.id === 'reflect' && !side.sideConditions.reflect) score = 38;
      if (move.id === 'protect' && !user.volatiles.stall) score = 12;
    }
    return {index: slot.index, score: score * (0.95 + random() * 0.1)};
  });
  candidates.sort((a, b) => b.score - a.score);
  return `move ${candidates[0].index + 1}`;
}

const STATUS_NAMES = {brn: 'queimado', par: 'paralisado', slp: 'adormeceu', psn: 'envenenado', tox: 'gravemente envenenado', frz: 'congelado'};
const STAT_NAMES = {atk: 'Ataque', def: 'Defesa', spa: 'Ataque Especial', spd: 'Defesa Especial', spe: 'Velocidade', accuracy: 'Precisão', evasion: 'Evasão'};
const pokemonName = ident => ident?.includes(': ') ? ident.split(': ').slice(1).join(': ') : ident;

function eventToText(line, names) {
  const [, event, subject, value, extra] = line.split('|');
  const name = pokemonName(subject);
  switch (event) {
  case 'switch': case 'drag': return `${subject.startsWith('p1') ? names.player : names.opponent} enviou ${name}.`;
  case 'move': return `${name} usou ${moveInfo(value).name}.`;
  case '-damage': return `${name} sofreu dano (${value.replace(/ (?:brn|par|slp|psn|tox|frz|fnt)$/, '')} PV).`;
  case '-heal': return `${name} recuperou PV.`;
  case '-supereffective': return 'Foi supereficaz!';
  case '-resisted': return 'O ataque foi pouco eficaz.';
  case '-immune': return `${name} não foi afetado.`;
  case '-crit': return 'Acerto crítico!';
  case '-miss': return `${pokemonName(value) || name} evitou o ataque.`;
  case '-status': return value === 'slp' ? `${name} adormeceu.` : `${name} ficou ${STATUS_NAMES[value] || value}.`;
  case '-curestatus': return value === 'slp' ? `${name} acordou.` : `${name} se recuperou da condição de status.`;
  case 'cant': return `${name} não conseguiu agir${value === 'slp' ? ': está dormindo' : value === 'par' ? ': paralisia' : value === 'frz' ? ': está congelado' : ''}.`;
  case 'faint': return `${name} desmaiou!`;
  case '-boost': return `${STAT_NAMES[value] || value} de ${name} aumentou${Number(extra) > 1 ? ' muito' : ''}.`;
  case '-unboost': return `${STAT_NAMES[value] || value} de ${name} diminuiu${Number(extra) > 1 ? ' muito' : ''}.`;
  case '-start': return `${name}: ${value === 'confusion' ? 'ficou confuso' : value === 'move: Leech Seed' ? 'foi atingido por Leech Seed' : value}.`;
  case '-end': return value === 'confusion' ? `${name} deixou de ficar confuso.` : '';
  case '-fail': return 'O movimento falhou.';
  case '-activate': return `${name}: ${value}.`;
  case '-weather': return value === 'Sandstorm' ? 'Uma tempestade de areia começou.' : value === 'SunnyDay' ? 'O sol ficou forte.' : value === 'none' ? 'O clima voltou ao normal.' : '';
  case '-sidestart': return `${name}: ${value}.`;
  case '-enditem': return `${name} consumiu ${value}.`;
  case '-ability': return `${name} ativou ${value}.`;
  case 'turn': return `Turno ${subject}.`;
  case 'win': return `${subject} venceu a batalha!`;
  case 'tie': return 'A batalha terminou empatada.';
  default: return '';
  }
}

export function createBattle({seed, playerName = 'Guerra', boss = 'red'} = {}) {
  if (boss !== 'red') throw new Error('Este desafio enfrenta Red.');
  const seedText = String(seed ?? 'treino');
  const safePlayerName = String(playerName || 'Guerra').replace(/[|\n\r]/g, '').slice(0, 24) || 'Guerra';
  const opponentName = safePlayerName === 'Red' ? 'Red · Rival' : 'Red';
  const battle = new Battle({
    formatid: 'gen3customgame',
    seed: [0, 1, 2, 3].map(index => hash(`${VERSION}:battle:${index}:${seedText}`) & 65535),
    p1: {name: safePlayerName, team: Teams.pack(generateTeam(seedText))},
    p2: {name: opponentName, team: Teams.pack(RED.map(setFromEntry))},
  });
  const originalTeams = {p1: [...battle.p1.pokemon], p2: [...battle.p2.pokemon]};
  const random = randomGenerator(`${VERSION}:ai:${seedText}`);
  const logs = [];
  let logCursor = 0;

  function collectLogs() {
    while (logCursor < battle.log.length) {
      let line = battle.log[logCursor++];
      // Simulator includes private and public HP versions after |split|. Keep
      // the exact HP version and discard its duplicate public version.
      if (line.startsWith('|split|')) {
        line = battle.log[logCursor++];
        logCursor++;
      }
      const message = eventToText(line, {player: safePlayerName, opponent: opponentName});
      if (message) logs.push(message);
    }
  }

  function sideState(side) {
    const team = originalTeams[side.id];
    const active = side.active[0];
    return {
      name: side.name,
      activeIndex: team.indexOf(active),
      trapped: Boolean(side.activeRequest?.active?.[0]?.trapped),
      team: team.map(pokemon => {
        const requestedMoves = pokemon === active && side.requestState === 'move' ? side.activeRequest.active[0].moves : null;
        const slots = requestedMoves || pokemon.moveSlots;
        return {
          id: pokemon.species.num, name: pokemon.species.name, types: [...pokemon.getTypes()],
          level: pokemon.level, hp: pokemon.hp, maxHp: pokemon.maxhp,
          status: pokemon.status, fainted: pokemon.fainted, ability: dex.abilities.get(pokemon.ability).name,
          item: dex.items.get(pokemon.item).name || '', boosts: {...pokemon.boosts},
          moves: slots.map(slot => moveInfo(slot.id, {
            pp: slot.pp ?? 1, maxPp: slot.maxpp ?? 1, disabled: Boolean(slot.disabled),
          })),
        };
      }),
    };
  }

  function state() {
    collectLogs();
    return {
      seed: seedText, generation: 3, turn: battle.turn,
      phase: battle.ended ? 'finished' : battle.p1.requestState === 'switch' ? 'switch' : 'choose',
      winner: battle.ended ? battle.winner === safePlayerName ? 'player' : battle.winner === opponentName ? 'opponent' : null : null,
      player: sideState(battle.p1), opponent: sideState(battle.p2),
      logs: [...logs],
    };
  }

  function settleOpponent() {
    // A KO can request an opponent-only replacement before the next player
    // decision. Resolve those immediately; stop once the player must act.
    for (let count = 0; count < 16 && !battle.ended; count++) {
      if (!battle.p2.requestState || battle.p2.isChoiceDone()) break;
      const choice = aiChoice(battle, random);
      if (!battle.choose('p2', choice)) {
        if (!battle.choose('p2', 'default')) throw new Error('Não foi possível resolver a jogada de Red.');
      }
      if (battle.p1.requestState && !battle.p1.isChoiceDone()) break;
    }
  }

  function act(action) {
    if (battle.ended) return state();
    if (!action || !Number.isInteger(action.index) || action.index < 0) throw new Error('Escolha uma ação válida.');
    let command;
    if (action.type === 'switch') {
      const pokemon = originalTeams.p1[action.index];
      if (!pokemon || pokemon.fainted || pokemon.isActive) throw new Error('Escolha um Pokémon disponível da equipe.');
      command = `switch ${battle.p1.pokemon.indexOf(pokemon) + 1}`;
    } else if (action.type === 'move') {
      if (battle.p1.requestState !== 'move') throw new Error('Escolha um Pokémon para continuar.');
      const move = battle.p1.activeRequest.active[0].moves[action.index];
      if (!move || move.disabled || move.pp === 0) throw new Error('Este movimento não está disponível.');
      command = `move ${action.index + 1}`;
    } else {
      throw new Error('Ação desconhecida.');
    }
    if (!battle.choose('p1', command)) throw new Error('Essa ação não é permitida agora.');
    settleOpponent();
    return state();
  }

  collectLogs();
  return {state, act};
}
