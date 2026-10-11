import {createBattle, generatePreview} from './engine.js';
import {getDayKey, seedForDay, readStats, beginDaily, completeDaily, recoverAbandoned, abandonDaily, msUntilNextDay, formatCountdown} from './daily.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeNames={Normal:'Normal',Fire:'Fogo',Water:'Água',Grass:'Planta',Electric:'Elétrico',Ice:'Gelo',Fighting:'Lutador',Poison:'Veneno',Ground:'Terra',Flying:'Voador',Psychic:'Psíquico',Bug:'Inseto',Rock:'Pedra',Ghost:'Fantasma',Dragon:'Dragão',Dark:'Sombrio',Steel:'Aço'};
const statusNames={brn:'Queimado',par:'Paralisado',psn:'Envenenado',tox:'Intoxicado',slp:'Dormindo',frz:'Congelado'};
let mode='daily',today=getDayKey(),freeSeed=randomSeed(),preview=[],game=null,view=null,startedDay=null,storage=null,storageReady=true,stats,lastResult=null,busy=false,feedbackTimer;
try {storage=window.localStorage;stats=recoverAbandoned(today,storage);} catch {storageReady=false;stats={wins:0,losses:0,battles:0,winStreak:0,bestStreak:0,playedToday:false,todayResult:null,todayPending:false,history:[]};}
function randomSeed(){if(globalThis.crypto?.getRandomValues)return crypto.getRandomValues(new Uint32Array(1))[0];return Math.floor(Math.random()*4294967296);}
function chip(type){return `<span class="type-chip type-${escape(String(type).toLowerCase())}">${escape(typeNames[type]||type)}</span>`;}
function sprite(id,back=false){return `./assets/pokemon/${Number(id)}${back?'-back':''}.png`;}
function notify(message){$('feedback').textContent=message;$('feedback').classList.remove('hidden');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>$('feedback').classList.add('hidden'),6000);}
function dateLabel(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'});}
function showDialog(title,html){$('dialog-title').textContent=title;$('dialog-content').innerHTML=html;$('dialog').showModal();}
function refreshStats(){if(storageReady){try{stats=readStats(storage,today);}catch{storageReady=false;notify('Não foi possível salvar neste navegador. O modo livre continua disponível.');}}renderStats();}
function renderStats(){
  $('wins').textContent=stats.wins;$('streak').textContent=stats.winStreak;$('battles').textContent=stats.battles;$('rate').textContent=stats.battles?`${Math.round(stats.wins/stats.battles*100)}%`:'—';
  $('week-caption').textContent=stats.battles?`${stats.wins} ${stats.wins===1?'vitória':'vitórias'}`:'comece hoje';
  const anchor=new Date(`${today}T12:00:00`),days=[];
  for(let offset=6;offset>=0;offset--){const d=new Date(anchor);d.setDate(d.getDate()-offset);const key=getDayKey(d),result=stats.history.find(entry=>entry.day===key)?.result;days.push(`<div class="day-dot ${result==='win'?'won':result==='loss'?'lost':''} ${key===today?'current':''}" title="${dateLabel(key)}: ${result==='win'?'vitória':result==='loss'?'derrota':'não jogado'}"><i>${result==='win'?'✓':result==='loss'?'×':'·'}</i><span>${d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','').slice(0,3)}</span></div>`);}
  $('week').innerHTML=days.join('');$('date-label').textContent=dateLabel(today);
}
function resetToLobby(){game=null;view=null;lastResult=null;busy=false;startedDay=null;$('stage').classList.remove('in-battle');$('player-sprite').classList.add('hidden');$('player-sprite').classList.remove('sprite-attack','sprite-entry','sprite-hit');$('opponent-sprite').classList.remove('sprite-hit');$('player-card').classList.add('hidden');$('battle-panel').classList.add('hidden');$('result-panel').classList.add('hidden');$('lobby-panel').classList.remove('hidden');$('opponent-sprite').src=sprite(25);$('opponent-sprite').alt='Pikachu, Pokémon do Red';$('opponent-name').textContent='Pikachu';$('opponent-hp').style.width='100%';$('opponent-hp').style.background='#4d9e65';$('opponent-status').textContent='';$('opponent-party').textContent='● ● ● ● ● ●';$('turn-badge').textContent='SEU RIVAL';$('team-instruction').classList.add('hidden');renderLobby();}
function renderLobby(){
  $('daily-tab').classList.toggle('active',mode==='daily');$('free-tab').classList.toggle('active',mode==='free');$('daily-tab').setAttribute('aria-selected',mode==='daily');$('free-tab').setAttribute('aria-selected',mode==='free');
  $('mode-label').textContent=mode==='daily'?'UMA TENTATIVA · NÍVEL 100':'SEM LIMITE · NÍVEL 100';$('team-eyebrow').textContent=mode==='daily'?'EQUIPE DO DIA':'EQUIPE DE TREINO';$('team-title').textContent='Conheça seu time';$('team-hint').classList.remove('hidden');$('reroll').classList.toggle('hidden',mode!=='free');
  const seed=mode==='daily'?seedForDay(today):freeSeed;preview=generatePreview(seed).team;renderTeam(preview);
  const locked=mode==='daily'&&stats.playedToday;
  $('lobby-tag').textContent=mode==='daily'?'O DESAFIO DE HOJE':'TREINE SEM PRESSÃO';
  $('lobby-title').textContent=locked?(stats.todayResult==='win'?'O Red já foi vencido hoje!':'Seu desafio de hoje terminou.'):'Consegue vencer o Red?';
  $('lobby-description').textContent=locked?'Enquanto espera a próxima equipe, você pode treinar no modo livre.':mode==='daily'?'Sua equipe já está pronta. Estude os golpes e entre na arena.':'Um time novo, quantas batalhas quiser. Seu histórico diário não muda.';
  $('start-button').disabled=mode==='daily'&&(!storageReady||locked);
  $('start-button').textContent=locked?`Próximo time em ${formatCountdown(msUntilNextDay())}`:mode==='daily'&&!storageReady?'Armazenamento indisponível':'Entrar na arena ↗';
}
function renderTeam(team){
  const playing=!!game&&view?.phase!=='finished';
  $('team-grid').innerHTML=team.map((pokemon,index)=>{
    const active=playing&&index===view.player.activeIndex;const disabled=playing&&(busy||pokemon.fainted||active||view.player.trapped);
    const hp=pokemon.maxHp?Math.max(0,pokemon.hp/pokemon.maxHp*100):null;
    return `<button class="team-card ${active?'active':''} ${pokemon.fainted?'fainted':''}" data-pokemon="${index}" ${disabled?'disabled':''} aria-label="${escape(pokemon.name)}${playing?', trocar Pokémon':', ver detalhes'}"><img src="${sprite(pokemon.id)}" alt="" width="64" height="64">${active?'<span class="team-active-label">ATIVO</span>':''}<strong>${escape(pokemon.name)}</strong><div class="type-chips">${pokemon.types.map(chip).join('')}</div>${hp!==null?`<div class="team-hp"><div style="width:${hp}%"></div></div>`:''}</button>`;
  }).join('');
  $('team-grid').querySelectorAll('[data-pokemon]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.pokemon);if(playing)doAction({type:'switch',index});else showPokemon(team[index]);}));
}
function showPokemon(pokemon){showDialog(pokemon.name,`<div class="dialog-body"><img class="detail-sprite" src="${sprite(pokemon.id)}" alt="${escape(pokemon.name)}"><p><strong>Nível 100</strong><br>${pokemon.types.map(chip).join(' ')}${pokemon.ability?`<br>Habilidade: ${escape(pokemon.ability)}`:''}${pokemon.item?`<br>Item: ${escape(pokemon.item)}`:''}</p><div style="clear:both"></div>${pokemon.moves.map(move=>`<div class="move-detail"><span>${escape(move.name)}</span>${chip(move.type)}</div>`).join('')}<p>Na geração III, a categoria física ou especial do dano depende do tipo do golpe.</p></div>`);}
function startGame(){
  if(game)return;
  let candidate;try{candidate=createBattle({seed:mode==='daily'?seedForDay(today):freeSeed,playerName:'Guerra',boss:'red'});}catch(error){notify('A batalha não pôde iniciar. Tente novamente.');console.error(error);return;}
  if(mode==='daily'){try{beginDaily(today,storage);startedDay=today;refreshStats();}catch(error){if(error.code==='STORAGE_UNAVAILABLE')storageReady=false;notify(error.code==='DAILY_ALREADY_PLAYED'?'Você já jogou o desafio de hoje. Experimente o modo livre.':'Para o desafio diário, permita o armazenamento neste navegador.');renderLobby();return;}}
  game=candidate;view=game.state();$('lobby-panel').classList.add('hidden');$('result-panel').classList.add('hidden');$('battle-panel').classList.remove('hidden');$('stage').classList.add('in-battle');$('player-sprite').classList.remove('hidden');$('player-card').classList.remove('hidden');$('reroll').classList.add('hidden');$('team-hint').classList.add('hidden');$('team-title').textContent='Sua equipe';renderBattle();
}
function setCombat(side,pokemon){
  $(`${side}-name`).textContent=pokemon.name;$(`${side}-sprite`).src=sprite(pokemon.id,side==='player');$(`${side}-sprite`).alt=pokemon.name;
  const percent=Math.max(0,pokemon.hp/pokemon.maxHp*100);$(`${side}-hp`).style.width=`${percent}%`;$(`${side}-hp`).style.background=percent>50?'#4d9e65':percent>20?'#d5a344':'#ce6653';$(`${side}-status`).textContent=statusNames[pokemon.status]||'';
  if(side==='player')$('player-health').textContent=`${pokemon.hp} / ${pokemon.maxHp}`;
}
function renderBattle(){
  setCombat('player',view.player.team[view.player.activeIndex]);setCombat('opponent',view.opponent.team[view.opponent.activeIndex]);
  $('opponent-party').textContent=view.opponent.team.map(p=>p.fainted?'○':'●').join(' ');$('turn-badge').textContent=`TURNO ${view.turn}`;
  $('battle-log').innerHTML=view.logs.slice(-25).map(line=>`<p>${escape(line)}</p>`).join('');$('battle-log').scrollTop=$('battle-log').scrollHeight;
  $('team-instruction').classList.remove('hidden');$('team-instruction').textContent=view.phase==='switch'?'Seu Pokémon foi derrotado. Selecione outro da equipe para continuar.':view.player.trapped?'Seu Pokémon está preso e não pode ser trocado agora.':'Selecione outro Pokémon para trocar. A troca usa seu turno.';
  $('action-title').textContent=view.phase==='switch'?'Escolha o próximo Pokémon':`O que ${view.player.team[view.player.activeIndex].name} vai fazer?`;
  const moves=view.player.team[view.player.activeIndex].moves;
  $('moves').innerHTML=view.phase==='switch'?'':moves.map((move,index)=>`<button class="move-button" data-move="${index}" ${busy||move.disabled||move.pp===0?'disabled':''}><span><strong>${escape(move.name)}</strong>${chip(move.type)}</span><span class="move-pp">${move.pp} / ${move.maxPp ?? move.maxPP ?? move.pp} PP</span></button>`).join('');
  $('moves').querySelectorAll('[data-move]').forEach(button=>button.addEventListener('click',()=>doAction({type:'move',index:Number(button.dataset.move)})));
  renderTeam(view.player.team);if(view.phase==='finished')finishGame();
}
async function doAction(action){
  if(!game||busy||view.phase==='finished')return;const currentGame=game;busy=true;const oldPlayer=view.player.team[view.player.activeIndex],oldOpponent=view.opponent.team[view.opponent.activeIndex];renderBattle();
  try{const next=currentGame.act(action);$('player-sprite').classList.add(action.type==='move'?'sprite-attack':'sprite-entry');await new Promise(resolve=>setTimeout(resolve,250));if(game!==currentGame)return;view=next;
    if(view.opponent.team[view.opponent.activeIndex].hp<oldOpponent.hp)$('opponent-sprite').classList.add('sprite-hit');if(view.player.team[view.player.activeIndex].hp<oldPlayer.hp)$('player-sprite').classList.add('sprite-hit');
  }catch(error){notify(error.message||'Essa ação não está disponível.');console.error(error);}finally{if(game===currentGame){busy=false;renderBattle();setTimeout(()=>{if(game===currentGame){$('player-sprite').classList.remove('sprite-attack','sprite-entry','sprite-hit');$('opponent-sprite').classList.remove('sprite-hit');}},650);}}
}
function finishGame(){
  if(lastResult)return;const win=view.winner==='player';lastResult={win,mode,day:startedDay||today,turn:view.turn,team:view.player.team};
  if(mode==='daily'){try{completeDaily(startedDay,win?'win':'loss',storage);refreshStats();}catch{notify('A batalha terminou, mas o resultado não pôde ser salvo.');}}
  $('battle-panel').classList.add('hidden');$('result-panel').classList.remove('hidden');$('team-instruction').classList.add('hidden');renderResult();
}
function renderResult(){if(!lastResult)return;$('result-tag').textContent=lastResult.mode==='daily'?'DESAFIO DIÁRIO CONCLUÍDO':'TREINO CONCLUÍDO';$('result-title').textContent=lastResult.win?'Você venceu o Red!':'O Red levou essa.';$('result-description').textContent=lastResult.mode==='daily'?(lastResult.win?'Estratégia que merece uma comemoração. Amanhã tem uma nova equipe.':'Todo confronto ensina. Amanhã, uma nova equipe e outra chance.'):'Quer testar uma estratégia diferente? Sorteie outro time e entre de novo.';$('result-button').textContent=lastResult.mode==='daily'?'Treinar no modo livre':'Jogar novamente';}
function confirmExit(after=()=>resetToLobby()){
  if(!game||view.phase==='finished'){after();return;}
  showDialog('Sair da batalha?',`<div class="dialog-body"><p>${mode==='daily'?'Sua tentativa diária já começou. Sair registra uma derrota no desafio de hoje.':'Este treino será encerrado. Seu histórico diário não será alterado.'}</p></div><div class="dialog-actions"><button class="secondary-button" id="stay">Continuar jogando</button><button class="primary-button" id="confirm-exit">Sair da batalha</button></div>`);
  $('stay').onclick=()=>$('dialog').close();$('confirm-exit').onclick=()=>{if(mode==='daily'){try{abandonDaily(startedDay,storage);refreshStats();}catch{notify('Não foi possível salvar o encerramento da partida.');}}$('dialog').close();after();};
}
function changeMode(next){if(mode===next)return;confirmExit(()=>{mode=next;resetToLobby();});}
function showHistory(){refreshStats();showDialog('Seu histórico diário',stats.history.length?`<table class="history-table"><thead><tr><th>DATA</th><th>RESULTADO</th></tr></thead><tbody>${[...stats.history].reverse().map(entry=>`<tr><td>${dateLabel(entry.day)}</td><td class="history-${entry.result}">${entry.result==='win'?'✓ Vitória':'× Derrota'}</td></tr>`).join('')}</tbody></table><div class="dialog-body"><p>${stats.battles} batalhas · ${stats.wins} vitórias · melhor sequência: ${stats.bestStreak}.<br>Os últimos 90 resultados ficam neste navegador. Partidas livres não entram neste histórico.</p></div>`:'<div class="empty-history">Sua jornada começa na primeira batalha diária.</div>');}
$('daily-tab').addEventListener('click',()=>changeMode('daily'));$('free-tab').addEventListener('click',()=>changeMode('free'));$('start-button').addEventListener('click',startGame);$('reroll').addEventListener('click',()=>{freeSeed=randomSeed();resetToLobby();});$('quit').addEventListener('click',()=>confirmExit());$('history-nav').addEventListener('click',showHistory);$('play-nav').addEventListener('click',()=>document.querySelector('.arena-heading').scrollIntoView({behavior:'smooth',block:'start'}));$('dialog-close').addEventListener('click',()=>$('dialog').close());$('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const rect=$('dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('dialog').close();}});
$('help').addEventListener('click',()=>showDialog('Como jogar',`<div class="dialog-body"><ol><li><strong>Conheça sua equipe.</strong> Todos os Pokémon são nível 100 e têm quatro golpes, habilidade e item. Toque nas cartas antes da batalha para consultar.</li><li><strong>Escolha um golpe ou faça uma troca.</strong> Cada escolha avança o turno. Ao perder um Pokémon, escolha o próximo da equipe.</li><li><strong>Vença os seis Pokémon do Red.</strong> A geração III usa a categoria física ou especial por tipo. Habilidades, condições de status e itens entram na batalha.</li></ol><p><strong>Desafio diário:</strong> um time igual para todos na mesma data local, com uma tentativa. Recarregar ou sair após iniciar conta como derrota. A data muda à meia-noite local.</p><p><strong>Modo livre:</strong> sorteios e partidas ilimitados, sem mudar seu histórico diário.</p><p>Sem conta ou ranking nesta primeira versão. Seus resultados ficam somente neste navegador.</p></div>`));
$('result-button').addEventListener('click',()=>{mode='free';freeSeed=randomSeed();resetToLobby();});
$('share').addEventListener('click',async()=>{if(!lastResult)return;const text=`DailyPoke · ${dateLabel(lastResult.day)}\n${lastResult.mode==='daily'?'Desafio diário':'Modo livre'}: ${lastResult.win?'venci o Red!':'o Red venceu.'}\n${lastResult.team.map(p=>p.fainted?'⬛':'🟩').join('')} · ${lastResult.turn} turnos`;try{await navigator.clipboard.writeText(text);notify('Resultado copiado!');}catch{showDialog('Seu resultado',`<div class="dialog-body"><p>Selecione e copie o texto abaixo:</p><textarea readonly rows="5" style="width:100%;font:inherit;padding:12px">${escape(text)}</textarea></div>`);$('dialog-content').querySelector('textarea').select();}});
document.addEventListener('keydown',event=>{if($('dialog').open||!game||busy||view.phase!=='choose'||event.ctrlKey||event.metaKey||event.altKey)return;const index=Number(event.key)-1;if(index>=0&&index<4){const move=view.player.team[view.player.activeIndex].moves[index];if(move&&!move.disabled&&move.pp>0){event.preventDefault();doAction({type:'move',index});}}});
window.addEventListener('beforeunload',event=>{if(game&&view.phase!=='finished'&&mode==='daily'){event.preventDefault();event.returnValue='';}});
setInterval(()=>{const current=getDayKey();if(current!==today){today=current;refreshStats();if(!game)renderLobby();}if(!game&&mode==='daily'&&stats.playedToday)$('start-button').textContent=`Próximo time em ${formatCountdown(msUntilNextDay())}`;},1000);
renderStats();renderLobby();if(!storageReady)notify('O armazenamento está indisponível. Você ainda pode jogar no modo livre.');
