// 高校野球対応スコアブック v2
const LS_GAME = 'baseball-score-v2';
const LS_TEAMS = 'baseball-teams-v1';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const HIT = ['単打','二塁打','三塁打','本塁打'];
const OUTS = ['三振','ゴロアウト','フライアウト','併殺打','振り逃げ'];
const SAC = ['犠打','犠飛'];
const POS = { '1':'投','2':'捕','3':'一','4':'二','5':'三','6':'遊','7':'左','8':'中','9':'右','DH':'DH','-':'-' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

// ---------- チーム ----------
function loadTeams() {
  try { return JSON.parse(localStorage.getItem(LS_TEAMS) || '[]'); }
  catch { return []; }
}
function saveTeams(t) { localStorage.setItem(LS_TEAMS, JSON.stringify(t)); }
let teams = loadTeams();
let editingTeamId = teams[0]?.id || null;

// ---------- 試合 ----------
function defaultGame() {
  return {
    meta: { awayTeamId:'', homeTeamId:'', away:'ビジター', home:'ホーム', tournament:'', date: new Date().toISOString().slice(0,10), place:'', inningsCount:7, memo:'' },
    innings: Array.from({length:9}, () => ({ top:{runs:0,hits:0,err:0}, bottom:{runs:0,hits:0,err:0} })),
    current: { inning:1, half:'top' },
    count: { B:0, S:0, O:0 },
    bases: [false,false,false],
    orders: { away:[], home:[] },   // {playerId,name,number,position}
    bench: { away:[], home:[] },
    pitchers: { away:'', home:'' }, // playerId
    battingIndex: { away:0, home:0 },
    history: [], // {id,type,inning,half,batting,fielding,batterId,batter,pitcherId,pitcher,result,rbi,runs,pitches,sb,earned,memo,outs,ts}
    mode:'detail', viewingTeam:'away', statTeam:'away',
  };
}
function loadGame() {
  try {
    const raw = localStorage.getItem(LS_GAME);
    if (!raw) {
      const old = localStorage.getItem('baseball-score-v1');
      if (old) { const g = migrateV1(JSON.parse(old)); localStorage.setItem(LS_GAME, JSON.stringify(g)); return g; }
      return defaultGame();
    }
    return { ...defaultGame(), ...JSON.parse(raw) };
  } catch { return defaultGame(); }
}
function migrateV1(o) {
  const g = defaultGame();
  g.meta = { ...g.meta, away:o.meta.away, home:o.meta.home, date:o.meta.date, place:o.meta.place, inningsCount:o.meta.inningsCount, memo:o.meta.memo };
  g.innings = o.innings; g.current = o.current; g.count = o.count; g.bases = o.bases;
  g.history = (o.history||[]).map(h => ({ ...h, type:'pa', batting: h.half==='top'?'away':'home', fielding: h.half==='top'?'home':'away', pitches:1, sb:0, earned:true }));
  for (const t of ['away','home']) {
    g.orders[t] = (o.orders?.[t]||[]).map(p => ({ playerId:uid(), name:p.name, number:'', position:'-' }));
  }
  return g;
}
let state = loadGame();
function save() { localStorage.setItem(LS_GAME, JSON.stringify(state)); }

let pending = null; // {result,rbi,runs,pitches,sb}
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- 共通 ----------
const halfLabel = () => `${state.current.inning}${state.current.half==='top'?'表':'裏'}`;
const batTeam = () => state.current.half==='top' ? 'away' : 'home';
const fldTeam = () => batTeam()==='away' ? 'home' : 'away';
const halfData = () => state.innings[state.current.inning-1][state.current.half];
function totalRuns(t) { let s=0; for(let i=0;i<state.meta.inningsCount;i++) s += t==='away'?state.innings[i].top.runs:state.innings[i].bottom.runs; return s; }
function teamName(t) { return t==='away'?state.meta.away:state.meta.home; }
function orderPlayer(t, i) { const o = state.orders[t]; return o.length ? o[i % o.length] : null; }
function currentBatter() { const t = batTeam(); return orderPlayer(t, state.battingIndex[t]); }
function currentPitcher() {
  const t = fldTeam();
  return state.orders[t].concat(state.bench[t]).find(p => p.playerId===state.pitchers[t]) || null;
}
function fmtIP(outs) { return `${Math.floor(outs/3)}${outs%3?` ${outs%3}/3`:''}`; }

// ---------- 描画 ----------
function render() {
  $('#hdrAway').textContent = state.meta.away;
  $('#hdrHome').textContent = state.meta.home;
  $('#hdrScore').textContent = `${totalRuns('away')} - ${totalRuns('home')}`;
  $('#hdrInning').textContent = halfLabel();
  $('#hdrCount').textContent = `B ${state.count.B} - S ${state.count.S} - O ${state.count.O}`;
  $('#hdrBases').textContent = state.bases.map(b=>b?'◆':'◇').join('');
  const cp = currentPitcher();
  $('#hdrPitcher').textContent = `投: ${cp?cp.name:'-'}`;
  $('#cB').textContent = state.count.B; $('#cS').textContent = state.count.S; $('#cO').textContent = state.count.O;
  $$('#diamond .base').forEach(el => el.classList.toggle('on', !!state.bases[Number(el.dataset.base)]));
  $('#inningLabel').textContent = halfLabel();
  $('#easyInningLabel').textContent = halfLabel();
  $('#easyRuns').textContent = halfData().runs;
  const cb = currentBatter();
  $('#currentBatter').textContent = cb ? `${(state.battingIndex[batTeam()]%Math.max(state.orders[batTeam()].length,1))+1}番 ${cb.name}` : '選手未登録';
  $('#currentPitcher').textContent = cp ? cp.name : '未設定';
  $('#modeEasy').classList.toggle('active', state.mode==='easy');
  $('#modeDetail').classList.toggle('active', state.mode==='detail');
  $('#detailArea').classList.toggle('hidden', state.mode!=='detail');
  $('#easyArea').classList.toggle('hidden', state.mode!=='easy');
  $('#modeHint').textContent = state.mode==='easy' ? 'かんたん: 得点の＋/−だけ。' : 'ランナー→結果ボタンの順でタップ。投手・交代・盗塁も記録可。3アウトで自動交代。';
  renderBoard(); renderBat(); renderPitch(); renderOrders(); renderTeams(); renderLog(); renderSettings();
  save();
}

function renderBoard() {
  const n = state.meta.inningsCount;
  const head = $('#scoreHead');
  head.innerHTML = '<th>チーム</th>' + Array.from({length:n},(_,i)=>`<th>${i+1}</th>`).join('') + '<th>R</th><th>H</th><th>E</th>';
  const row = (el, t, half) => {
    el.innerHTML = `<th>${esc(teamName(t))}</th>`;
    let h=0,e=0;
    for(let i=0;i<n;i++){ const d=state.innings[i][half]; h+=d.hits; e+=d.err; el.innerHTML+=`<td>${d.runs}</td>`; }
    el.innerHTML += `<td><strong>${totalRuns(t)}</strong></td><td>${h}</td><td>${e}</td>`;
  };
  row($('#rowAway'),'away','top'); row($('#rowHome'),'home','bottom');
  $('#summary').innerHTML = `<span class="hint">${esc(state.meta.tournament||'')} ${esc(state.meta.date||'')} ${esc(state.meta.place||'')} ${esc(state.meta.memo||'')} ／ 記録 ${state.history.length}件</span>`;
}

// 打撃集計
function battingStats(t) {
  const map = {};
  const ensure = (p) => map[p.playerId] ||= { player:p, PA:0,AB:0,H:0,B2:0,B3:0,HR:0,RBI:0,R:0,SO:0,BB:0,SAC:0,SB:0 };
  state.orders[t].concat(state.bench[t]).forEach(ensure);
  state.history.forEach(h => {
    if (h.batting!==t) return;
    if (h.type==='steal') { if(h.result==='盗塁成功'){ ensure({playerId:h.batterId,name:h.batter}); map[h.batterId].SB++; } return; }
    if (h.type!=='pa') return;
    const key = h.batterId || h.batter;
    ensure({playerId:key, name:h.batter});
    const s = map[key]; s.PA++;
    if (['単打','二塁打','三塁打','本塁打'].includes(h.result)) { s.H++; s.AB++; if(h.result==='二塁打')s.B2++; if(h.result==='三塁打')s.B3++; if(h.result==='本塁打')s.HR++; }
    else if (['三振','ゴロアウト','フライアウト','併殺打','振り逃げ'].includes(h.result)) s.AB++;
    else if (['四球','死球'].includes(h.result)) s.BB++;
    else if (['犠打','犠飛'].includes(h.result)) s.SAC++;
    else s.AB++;
    s.RBI += h.rbi||0; s.R += h.batterScored?1:0;
    if (h.result==='三振') s.SO++;
    s.SB += h.sb||0;
  });
  return Object.values(map);
}
function renderBat() {
  $$('.stat-tab').forEach(b=>b.classList.toggle('active', b.dataset.stat===state.statTeam));
  const body = $('#batBody'); body.innerHTML='';
  battingStats(state.statTeam).forEach(({player: p, ...s}) => {
    const avg = s.AB? (s.H/s.AB).toFixed(3).replace(/^0/,'') : '.---';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${orderIndex(state.statTeam,p.playerId)}</td><td>${esc(p.name)}${p.number?`(${p.number})`:''}</td><td>${POS[p.position]||'-'}</td><td>${s.PA}</td><td>${s.AB}</td><td>${s.H}</td><td>${s.B2}</td><td>${s.B3}</td><td>${s.HR}</td><td>${s.RBI}</td><td>${s.R}</td><td>${s.SO}</td><td>${s.BB}</td><td>${s.SAC}</td><td>${s.SB}</td><td>${avg}</td>`;
    body.appendChild(tr);
  });
  if(!body.children.length) body.innerHTML = '<tr><td colspan="16">出場選手がいません</td></tr>';
}
function orderIndex(t, pid) {
  const i = state.orders[t].findIndex(p=>p.playerId===pid);
  return i>=0 ? i+1 : '控';
}

// 投手集計
function pitchingStats() {
  const map = {};
  const ensure = (t,p) => { const k=t+':'+p.playerId; map[k] ||= { team:t, player:p, outs:0,pitches:0,H:0,SO:0,BB:0,R:0,ER:0 }; return map[k]; };
  state.orders.away.concat(state.bench.away).forEach(p=>ensure('away',p));
  state.orders.home.concat(state.bench.home).forEach(p=>ensure('home',p));
  state.history.forEach(h => {
    if(h.type!=='pa'&&h.type!=='steal') return;
    const t = h.fielding; if(!t) return;
    const pid = h.pitcherId; if(!pid) return;
    const s = ensure(t, {playerId:pid, name:h.pitcher||'?'});
    s.pitches += h.pitches||0;
    if(h.type==='pa'){
      s.outs += h.outs||0;
      if(HIT.includes(h.result)) s.H++;
      if(h.result==='三振') s.SO++;
      if(['四球','死球'].includes(h.result)) s.BB++;
      s.R += h.runs||0;
      if(h.earned) s.ER += h.runs||0;
    }
  });
  return Object.values(map).filter(s=>s.pitches>0||s.outs>0);
}
function renderPitch() {
  const body = $('#pitchBody'); body.innerHTML='';
  pitchingStats().forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(teamName(s.team))}</td><td>${esc(s.player.name)}</td><td>${fmtIP(s.outs)}</td><td>${s.pitches}</td><td>${s.H}</td><td>${s.SO}</td><td>${s.BB}</td><td>${s.R}</td><td>${s.ER}</td>`;
    body.appendChild(tr);
  });
  if(!body.children.length) body.innerHTML = '<tr><td colspan="9">投手記録がありません</td></tr>';
}

// 出場・控え
function renderOrders() {
  const t = state.viewingTeam;
  $$('#lineupTabs .team-tab').forEach(b=>b.classList.toggle('active', b.dataset.team===t));
  const list = $('#orderList'); list.innerHTML='';
  const batIdx = t===batTeam() ? state.battingIndex[t]%Math.max(state.orders[t].length,1) : -1;
  state.orders[t].forEach((p,i)=>{
    const li = document.createElement('li');
    if(i===batIdx) li.classList.add('current');
    li.innerHTML = `<strong>${i+1}</strong><span style="flex:1">${p.number?`#${p.number} `:''}${esc(p.name)} <small>[${POS[p.position]||'-'}]</small></span>
      <button data-a="pos">守備</button><button data-a="bat">打</button><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button>`;
    li.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
      const a=btn.dataset.a;
      if(a==='del'){ state.bench[t].push(p); state.orders[t].splice(i,1); }
      if(a==='up'&&i>0) [state.orders[t][i-1],state.orders[t][i]]=[state.orders[t][i],state.orders[t][i-1]];
      if(a==='down'&&i<state.orders[t].length-1) [state.orders[t][i+1],state.orders[t][i]]=[state.orders[t][i],state.orders[t][i+1]];
      if(a==='bat'&&t===batTeam()) state.battingIndex[t]=i;
      if(a==='pos'){ p.position = nextPos(p.position); }
      render();
    });
    list.appendChild(li);
  });
  if(!state.orders[t].length) list.innerHTML='<li>スタメンがいません。控えから追加してください。</li>';
  const bl = $('#benchList'); bl.innerHTML='';
  state.bench[t].forEach((p,i)=>{
    const li=document.createElement('li');
    li.innerHTML=`<span style="flex:1">${p.number?`#${p.number} `:''}${esc(p.name)} <small>${esc(p.grade||'')} [${POS[p.position]||'-'}]</small></span><button>昇格</button>`;
    li.querySelector('button').onclick=()=>{ if(state.orders[t].length<9){ state.orders[t].push(p); state.bench[t].splice(i,1); } else alert('スタメンは9人までです'); render(); };
    bl.appendChild(li);
  });
  if(!state.bench[t].length) bl.innerHTML='<li>控えがいません。</li>';
  const sel = $('#benchSelect'); sel.innerHTML='';
  state.bench[t].forEach((p,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`${p.number?`#${p.number} `:''}${p.name}`; sel.appendChild(o); });
}
function nextPos(cur){ const keys=Object.keys(POS); return keys[(keys.indexOf(cur)+1)%keys.length]; }

// チーム一覧・名簿
function renderTeams() {
  const wrap = $('#teamList'); wrap.innerHTML='';
  teams.forEach(tm=>{
    const div=document.createElement('div');
    div.className='team-item'+(tm.id===editingTeamId?' editing':'');
    div.innerHTML=`<strong>${esc(tm.name)}</strong><small>${tm.players.length}名</small>
      <button data-a="edit">名簿</button><button data-a="del">削除</button>`;
    div.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      if(b.dataset.a==='edit'){ editingTeamId=tm.id; render(); }
      if(b.dataset.a==='del'){ if(confirm(`${tm.name}を削除しますか？`)){ teams=teams.filter(x=>x.id!==tm.id); if(editingTeamId===tm.id) editingTeamId=teams[0]?.id||null; saveTeams(teams); render(); } }
    });
    div.onclick=(e)=>{ if(e.target.tagName!=='BUTTON'){ editingTeamId=tm.id; render(); } };
    wrap.appendChild(div);
  });
  if(!teams.length) wrap.innerHTML='<p class="hint">チームを登録すると、背番号・学年つきの名簿を試合に呼び出せます。</p>';
  const tm = teams.find(x=>x.id===editingTeamId);
  $('#rosterTitle').textContent = tm? `名簿: ${tm.name}` : '名簿';
  const rl = $('#rosterList'); rl.innerHTML='';
  (tm?.players||[]).forEach((p,i)=>{
    const li=document.createElement('li');
    li.innerHTML=`<strong>#${esc(p.number||'-')}</strong><span style="flex:1">${esc(p.name)} <small>${esc(p.grade||'')} [${POS[p.position]||'-'}]</small></span><button>✕</button>`;
    li.querySelector('button').onclick=()=>{ tm.players.splice(i,1); saveTeams(teams); render(); };
    rl.appendChild(li);
  });
  if(tm&&!tm.players.length) rl.innerHTML='<li>名簿が空です。下のフォームから追加してください。</li>';
}

function renderLog() {
  const list=$('#logList'); list.innerHTML='';
  $('#logCount').textContent=`(${state.history.length}件)`;
  [...state.history].reverse().forEach(h=>{
    const li=document.createElement('li');
    const label = h.type==='pa' ? `${esc(h.batter||'')} ${esc(h.result)}${h.rbi?` ${h.rbi}点`:''} 投:${esc(h.pitcher||'-')}`
      : h.type==='sub' ? `🔄 ${esc(h.memo)}`
      : h.type==='steal' ? `🏃 ${esc(h.batter||'')} ${esc(h.result)}`
      : `📝 ${esc(h.memo||h.result||'')}`;
    li.innerHTML=`<span><strong>${h.inning}${h.half==='top'?'表':'裏'}</strong> ${label}${h.memo&&h.type==='pa'?` <small>${esc(h.memo)}</small>`:''}</span>`;
    const b=document.createElement('button'); b.textContent='取消';
    b.onclick=()=>undoEntry(h.id); li.appendChild(b); list.appendChild(li);
  });
  if(!state.history.length) list.innerHTML='<li>まだ記録がありません。</li>';
}

function renderSettings() {
  if(document.activeElement?.tagName==='INPUT'||document.activeElement?.tagName==='SELECT') return;
  const mk=(sel,val)=>{ const el=$(sel); el.innerHTML='<option value="">-- 未選択 --</option>'+teams.map(t=>`<option value="${t.id}" ${t.id===val?'selected':''}>${esc(t.name)}</option>`).join(''); };
  mk('#setAwayTeam',state.meta.awayTeamId); mk('#setHomeTeam',state.meta.homeTeamId);
  $('#setTournament').value=state.meta.tournament||'';
  $('#setDate').value=state.meta.date; $('#setPlace').value=state.meta.place;
  $('#setInnings').value=String(state.meta.inningsCount); $('#setMemo').value=state.meta.memo;
}

// ---------- タブ ----------
$$('.tabbar button').forEach(b=>b.onclick=()=>{
  $$('.tabbar button').forEach(x=>x.classList.remove('active'));
  $$('.tab-panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); document.getElementById(b.dataset.tab).classList.add('active');
});
$$('.stat-tab').forEach(b=>b.onclick=()=>{ state.statTeam=b.dataset.stat; render(); });
$$('#lineupTabs .team-tab').forEach(b=>b.onclick=()=>{ state.viewingTeam=b.dataset.team; render(); });
$('#modeEasy').onclick=()=>{state.mode='easy';render();};
$('#modeDetail').onclick=()=>{state.mode='detail';render();};
$$('#diamond .base').forEach(el=>el.onclick=()=>{ state.bases[Number(el.dataset.base)]=!state.bases[Number(el.dataset.base)]; render(); });
$$('[data-count]').forEach(b=>b.onclick=()=>{
  const k=b.dataset.count[0], op=b.dataset.count[1];
  if(op==='+'){
    if(k==='B') state.count.B=Math.min(3,state.count.B+1);
    if(k==='S') state.count.S=Math.min(2,state.count.S+1);
    if(k==='O'){ state.count.O=Math.min(3,state.count.O+1); if(state.count.O>=3) setTimeout(()=>changeHalf(true),250); }
  } else state.count[k]=Math.max(0,state.count[k]-1);
  render();
});
$('#btnNewBatterReset').onclick=()=>{ resetCB(); render(); };
$('#btnNextBatter').onclick=()=>{ advance(); state.count.B=0; state.count.S=0; render(); };
function resetCB(){ state.count={B:0,S:0,O:0}; state.bases=[false,false,false]; }
function advance(){ const t=batTeam(); if(state.orders[t].length) state.battingIndex[t]=(state.battingIndex[t]+1)%state.orders[t].length; }

// ---------- 打席 ----------
$$('.res').forEach(b=>b.onclick=()=>openPA(b.dataset.result));
function openPA(result){
  pending={ result, rbi: result==='本塁打'?1:0, runs: result==='本塁打'?1:0, pitches:1, sb:0 };
  $('#modalTitle').textContent=result;
  const bt=batTeam(), ft=fldTeam();
  const bsel=$('#mBatter'); bsel.innerHTML='';
  state.orders[bt].forEach((p,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`${i+1}番 ${p.number?`#${p.number} `:''}${p.name}`; if(i===state.battingIndex[bt]%state.orders[bt].length) o.selected=true; bsel.appendChild(o); });
  const psel=$('#mPitcher'); psel.innerHTML='';
  state.orders[ft].concat(state.bench[ft]).forEach(p=>{ const o=document.createElement('option'); o.value=p.playerId; o.textContent=`${p.number?`#${p.number} `:''}${p.name}`; if(p.playerId===state.pitchers[ft]) o.selected=true; psel.appendChild(o); });
  $('#mRbi').textContent=pending.rbi; $('#mRun').textContent=pending.runs; $('#mPit').textContent=pending.pitches; $('#mSb').textContent=pending.sb;
  $('#mBatterScored').checked = result==='本塁打';
  $('#mEarned').checked = true;
  $('#mMemo').value='';
  $('#modal').classList.remove('hidden');
}
const step=(id,key,min,max)=>{ $(id+'Minus').onclick=()=>{ pending[key]=Math.max(min,pending[key]-1); $(id).textContent=pending[key]; }; $(id+'Plus').onclick=()=>{ pending[key]=Math.min(max,pending[key]+1); $(id).textContent=pending[key]; }; };
step('#mRbi','rbi',0,4); step('#mRun','runs',0,4); step('#mPit','pitches',1,30); step('#mSb','sb',0,3);
$('#mCancel').onclick=()=>$('#modal').classList.add('hidden');
$('#mOk').onclick=()=>{
  const bt=batTeam(), ft=fldTeam();
  const bIdx=Number($('#mBatter').value||0);
  const batter=state.orders[bt][bIdx]||currentBatter()||{playerId:'',name:''};
  const pid=$('#mPitcher').value;
  const allP=state.orders[ft].concat(state.bench[ft]);
  const pitcher=allP.find(p=>p.playerId===pid)||currentPitcher()||{playerId:pid,name:''};
  if(pid) state.pitchers[ft]=pid;
  recordPA({ batter, pitcher, ...pending, batterScored:$('#mBatterScored').checked, earned:$('#mEarned').checked, memo:$('#mMemo').value.trim() });
  $('#modal').classList.add('hidden');
};

function recordPA({batter,pitcher,result,rbi,runs,pitches,sb,batterScored,earned,memo}){
  const {inning,half}=state.current;
  const d=halfData();
  // 暴投・捕逸・ボークは進塁のみでも得点加算
  d.runs += runs;
  if(HIT.includes(result)) d.hits+=1;
  if(result==='失策') d.err+=1;
  let outs=0;
  if(OUTS.includes(result)) outs = result==='併殺打'?2:1;
  if(SAC.includes(result)) outs=1;
  state.history.push({ id:uid(), type:'pa', inning, half, batting:batTeam(), fielding:fldTeam(),
    batterId:batter.playerId||'', batter:batter.name||'', pitcherId:pitcher.playerId||'', pitcher:pitcher.name||'',
    result, rbi, runs, pitches, sb, batterScored, earned, memo, outs, ts:new Date().toISOString() });
  if(outs){ state.count.O+=outs; state.count.B=0; state.count.S=0; if(state.count.O>=3){ changeHalf(true); return; } }
  else { state.count.B=0; state.count.S=0; }
  advance(); render();
}

function changeHalf(auto){
  resetCB();
  if(state.current.half==='top') state.current.half='bottom';
  else { state.current.half='top'; state.current.inning=Math.min(9,state.current.inning+1); }
  if(auto) alert(`${halfLabel()} に交代しました`);
  render();
}
$('#btnNextHalf').onclick=()=>changeHalf(false);
$('#btnPrevHalf').onclick=()=>{ resetCB(); if(state.current.half==='bottom') state.current.half='top'; else if(state.current.inning>1){ state.current.inning--; state.current.half='bottom'; } render(); };

// かんたん
$('#easyPlus').onclick=()=>{ halfData().runs++; render(); };
$('#easyMinus').onclick=()=>{ halfData().runs=Math.max(0,halfData().runs-1); render(); };
$('#easyAddLog').onclick=()=>{ state.history.push({id:uid(),type:'memo',inning:state.current.inning,half:state.current.half,batting:batTeam(),fielding:fldTeam(),result:'メモ',memo:$('#easyMemo').value.trim(),runs:0,rbi:0,outs:0,ts:new Date().toISOString()}); $('#easyMemo').value=''; render(); };
$('#easyChange').onclick=()=>changeHalf(false);
$('#easyNextInning').onclick=()=>{ resetCB(); state.current.inning=Math.min(9,state.current.inning+1); state.current.half='top'; render(); };

// ---------- 交代 ----------
$('#btnSub').onclick=()=>{
  $('#sTeam').value=batTeam()==='away'&&fldTeam()==='home' ? fldTeam() : fldTeam();
  fillSub(); $('#subModal').classList.remove('hidden');
};
function fillSub(){
  const t=$('#sTeam').value;
  const all=state.orders[t].concat(state.bench[t]);
  $('#sOut').innerHTML=state.orders[t].map((p,i)=>`<option value="${i}">${i+1}番 ${p.number?`#${p.number} `:''}${esc(p.name)}</option>`).join('');
  $('#sIn').innerHTML=state.bench[t].map((p,i)=>`<option value="${i}">${p.number?`#${p.number} `:''}${esc(p.name)}</option>`).join('')||'<option value="">控えなし</option>';
  void all;
}
$('#sTeam').onchange=fillSub;
$('#sCancel').onclick=()=>$('#subModal').classList.add('hidden');
$('#sOk').onclick=()=>{
  const t=$('#sTeam').value, type=$('#sType').value;
  const oi=Number($('#sOut').value), ii=Number($('#sIn').value);
  const outP=state.orders[t][oi], inP=state.bench[t][ii];
  if(!outP||!inP){ alert('控え選手が必要です'); return; }
  if(type==='投手交代'){ inP.position='1'; state.pitchers[t]=inP.playerId; }
  if(type==='代打'&&t===batTeam()){ state.orders[t][oi]=inP; state.bench[t][ii]=outP; state.battingIndex[t]=oi; }
  else { // 守備・代走・投手はそのまま入替
    if(type==='投手交代'||type==='守備交代'){ inP.position=outP.position; }
    state.orders[t][oi]=inP; state.bench[t][ii]=outP;
  }
  state.history.push({id:uid(),type:'sub',inning:state.current.inning,half:state.current.half,batting:batTeam(),fielding:t,result:type,memo:`${type}: ${outP.name}→${inP.name} (${teamName(t)})`,runs:0,rbi:0,outs:0,ts:new Date().toISOString()});
  $('#subModal').classList.add('hidden'); render();
};

// ---------- 走塁 ----------
$('#btnSteal').onclick=()=>{
  const bt=batTeam(), ft=fldTeam();
  $('#rRunner').innerHTML=state.orders[bt].map((p,i)=>`<option value="${p.playerId}">${i+1}番 ${esc(p.name)}</option>`).join('');
  $('#rPitcher').innerHTML=state.orders[ft].concat(state.bench[ft]).map(p=>`<option value="${p.playerId}" ${p.playerId===state.pitchers[ft]?'selected':''}>${esc(p.name)}</option>`).join('');
  $('#runModal').classList.remove('hidden');
};
$('#rCancel').onclick=()=>$('#runModal').classList.add('hidden');
$('#rOk').onclick=()=>{
  const bt=batTeam(), ft=fldTeam();
  const pid=$('#rRunner').value;
  const runner=state.orders[bt].concat(state.bench[bt]).find(p=>p.playerId===pid)||{name:''};
  const ptid=$('#rPitcher').value;
  const pitcher=state.orders[ft].concat(state.bench[ft]).find(p=>p.playerId===ptid)||{name:''};
  const result=$('#rResult').value;
  const runs = result.includes('得点')?1:0;
  if(runs) halfData().runs+=runs;
  let outs = result==='盗塁失敗'?1:0;
  if(outs){ state.count.O+=outs; if(state.count.O>=3){ state.history.push({id:uid(),type:'steal',inning:state.current.inning,half:state.current.half,batting:bt,fielding:ft,batterId:pid,batter:runner.name,pitcherId:ptid,pitcher:pitcher.name,result,runs,pitches:0,ts:new Date().toISOString()}); changeHalf(true); $('#runModal').classList.add('hidden'); return; } }
  state.history.push({id:uid(),type:'steal',inning:state.current.inning,half:state.current.half,batting:bt,fielding:ft,batterId:pid,batter:runner.name,pitcherId:ptid,pitcher:pitcher.name,result,runs,pitches:1,ts:new Date().toISOString()});
  $('#runModal').classList.add('hidden'); render();
};

// ---------- 選手タブ ----------
$('#btnAddFromBench').onclick=()=>{
  const t=state.viewingTeam, i=Number($('#benchSelect').value);
  if(state.bench[t][i]&&state.orders[t].length<9){ state.orders[t].push(state.bench[t][i]); state.bench[t].splice(i,1); render(); }
};

// ---------- チーム登録 ----------
$('#btnAddTeam').onclick=()=>{
  const v=$('#newTeamName').value.trim(); if(!v) return;
  const tm={id:uid(),name:v,players:[]};
  teams.push(tm); editingTeamId=tm.id; $('#newTeamName').value=''; saveTeams(teams); render();
};
$('#btnAddRoster').onclick=()=>{
  const tm=teams.find(x=>x.id===editingTeamId); if(!tm){ alert('先にチームを選択してください'); return; }
  const name=$('#pName').value.trim(); if(!name) return;
  tm.players.push({id:uid(),number:$('#pNumber').value.trim(),name,grade:$('#pGrade').value,position:$('#pPos').value});
  tm.players.sort((a,b)=>Number(a.number||99)-Number(b.number||99));
  $('#pNumber').value=''; $('#pName').value=''; saveTeams(teams); render();
};

// ---------- 設定 ----------
$('#btnApplyMeta').onclick=()=>{
  const a=teams.find(t=>t.id===$('#setAwayTeam').value), h=teams.find(t=>t.id===$('#setHomeTeam').value);
  state.meta.awayTeamId=$('#setAwayTeam').value; state.meta.homeTeamId=$('#setHomeTeam').value;
  if(a) state.meta.away=a.name; if(h) state.meta.home=h.name;
  state.meta.tournament=$('#setTournament').value.trim();
  state.meta.date=$('#setDate').value; state.meta.place=$('#setPlace').value.trim();
  state.meta.inningsCount=Number($('#setInnings').value); state.meta.memo=$('#setMemo').value.trim();
  render(); alert('設定を適用しました');
};
$('#btnLoadRoster').onclick=()=>{
  const pull=(tid)=>{
    const tm=teams.find(t=>t.id===tid); if(!tm) return null;
    const nine=tm.players.slice(0,9).map(p=>({...p,playerId:p.id}));
    const rest=tm.players.slice(9).map(p=>({...p,playerId:p.id}));
    return {nine,rest};
  };
  const a=pull(state.meta.awayTeamId), h=pull(state.meta.homeTeamId);
  if(a){ state.orders.away=a.nine; state.bench.away=a.rest; const p=a.nine.find(x=>x.position==='1'); if(p) state.pitchers.away=p.playerId; }
  if(h){ state.orders.home=h.nine; state.bench.home=h.rest; const p=h.nine.find(x=>x.position==='1'); if(p) state.pitchers.home=p.playerId; }
  if(!a&&!h){ alert('先にチームを選択して「設定を適用」してください'); return; }
  render(); alert('名簿を反映しました（先頭9人がスタメン）');
};
$('#btnReset').onclick=()=>{
  if(!confirm('試合データをリセットしますか？（履歴も消えます）')) return;
  const meta=state.meta; state=defaultGame(); state.meta=meta; render();
};

// ---------- Undo ----------
function undoEntry(id){
  const i=state.history.findIndex(h=>h.id===id); if(i<0) return;
  const [h]=state.history.splice(i,1);
  if(h.inning&&h.half){ const d=state.innings[h.inning-1][h.half==='top'?'top':'bottom']; d.runs=Math.max(0,d.runs-(h.runs||h.rbi||0)); if(HIT.includes(h.result)) d.hits=Math.max(0,d.hits-1); if(h.result==='失策') d.err=Math.max(0,d.err-1); }
  render();
}
$('#btnUndoTop').onclick=()=>{
  const h=state.history[state.history.length-1];
  if(!h){ alert('もどせる記録がありません'); return; }
  undoEntry(h.id);
};

// ---------- 出力 ----------
function download(name,text,type='application/json'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
$('#btnExportJson').onclick=()=>download(`game-${state.meta.date||'match'}.json`,JSON.stringify(state,null,2));
$('#btnImportJson').onclick=()=>$('#fileImport').click();
$('#fileImport').onchange=(e)=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const s=JSON.parse(r.result); if(!s.meta||!s.innings) throw 0; state={...defaultGame(),...s}; render(); alert('試合を読み込みました'); }catch{ alert('形式が正しくありません'); } };
  r.readAsText(f); e.target.value='';
};
$('#btnExportTeams').onclick=()=>download('teams.json',JSON.stringify(teams,null,2));
$('#btnImportTeams').onclick=()=>$('#fileImportTeams').click();
$('#fileImportTeams').onchange=(e)=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const t=JSON.parse(r.result); if(!Array.isArray(t)) throw 0; teams=t; editingTeamId=teams[0]?.id||null; saveTeams(teams); render(); alert('チームを読み込みました'); }catch{ alert('形式が正しくありません'); } };
  r.readAsText(f); e.target.value='';
};
$('#btnExportCsv').onclick=()=>{
  const n=state.meta.inningsCount;
  let csv=`大会,${state.meta.tournament},日付,${state.meta.date},球場,${state.meta.place}\n`;
  csv+=`チーム,${Array.from({length:n},(_,i)=>`${i+1}回`).join(',')},R,H,E\n`;
  const he=(t,half)=>{ let h=0,e=0; for(let i=0;i<n;i++){ h+=state.innings[i][half].hits; e+=state.innings[i][half].err; } return [h,e]; };
  csv+=`${state.meta.away},${Array.from({length:n},(_,i)=>state.innings[i].top.runs).join(',')},${totalRuns('away')},${he(0,'top')[0]},${he(0,'top')[1]}\n`;
  csv+=`${state.meta.home},${Array.from({length:n},(_,i)=>state.innings[i].bottom.runs).join(',')},${totalRuns('home')},${he(0,'bottom')[0]},${he(0,'bottom')[1]}\n\n`;
  for(const t of ['away','home']){
    csv+=`【${teamName(t)} 打撃】打順,選手,背番号,守備,打席,打数,安,2B,3B,HR,打点,得点,三振,四死,犠,盗,打率\n`;
    battingStats(t).forEach(({player:p,...s})=>{ const avg=s.AB?(s.H/s.AB).toFixed(3):''; csv+=`${orderIndex(t,p.playerId)},${p.name},${p.number||''},${p.position||''},${s.PA},${s.AB},${s.H},${s.B2},${s.B3},${s.HR},${s.RBI},${s.R},${s.SO},${s.BB},${s.SAC},${s.SB},${avg}\n`; });
    csv+=`\n【${teamName(t)} 投手】投手,回,球数,被安,奪三,四死,失点,自責\n`;
    pitchingStats().filter(s=>s.team===t).forEach(s=>{ csv+=`${s.player.name},${fmtIP(s.outs)},${s.pitches},${s.H},${s.SO},${s.BB},${s.R},${s.ER}\n`; });
    csv+=`\n`;
  }
  csv+=`回,表裏,種別,攻撃,打者/走者,投手,結果,打点,得点,球数,メモ\n`;
  state.history.forEach(h=>csv+=`${h.inning},${h.half==='top'?'表':'裏'},${h.type},${h.batting==='away'?state.meta.away:state.meta.home},${h.batter||''},${h.pitcher||''},${h.result||''},${h.rbi||0},${h.runs||0},${h.pitches||0},"${(h.memo||'').replace(/"/g,'""')}"\n`);
  download(`score-${state.meta.date||'game'}.csv`,'\uFEFF'+csv,'text/csv');
};
$('#btnCopy').onclick=async()=>{
  const txt=`${state.meta.tournament?`【${state.meta.tournament}】`:''}${state.meta.away} ${totalRuns('away')} - ${totalRuns('home')} ${state.meta.home} (${halfLabel()}時点)\n${state.meta.date} ${state.meta.place}`;
  try{ await navigator.clipboard.writeText(txt); alert('コピーしました'); }catch{ prompt('コピーしてください',txt); }
};

render();
