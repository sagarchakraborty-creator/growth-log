(function(){
const AREAS=[
  {k:'health',label:'Health',c:'var(--health)'},
  {k:'fitness',label:'Fitness',c:'var(--fitness)'},
  {k:'learning',label:'Learning',c:'var(--learning)'},
  {k:'mind',label:'Mind',c:'var(--mind)'}
];
const GOAL_FIELDS=[
  {k:'sleep',label:'Sleep',unit:'hours',step:0.5},
  {k:'water',label:'Water',unit:'glasses',step:1},
  {k:'workout',label:'Active minutes',unit:'min',step:5},
  {k:'steps',label:'Steps',unit:'steps',step:500},
  {k:'learn',label:'Learning',unit:'min',step:5},
  {k:'screen',label:'Screen time cap',unit:'min',step:15}
];
const DEFAULT_CFG={
  goals:{sleep:7.5,water:8,workout:30,steps:8000,learn:30,screen:120},
  habits:[
    {id:'meditate',label:'Meditate 10 minutes'},
    {id:'journal',label:'Journal'},
    {id:'gratitude',label:'Write 3 things I am grateful for'},
    {id:'nosugar',label:'No added sugar'}
  ]
};
const WTYPES=['Rest','Walk','Run','Gym','Yoga','Cycle','Sport'];
const SCALE=['Low','Meh','OK','Good','Great'];
const LS_KEY='growthlog.v1';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return ymd(d)};
const today=()=>ymd(new Date());
const num=v=>typeof v==='number'&&isFinite(v);
const fmtInt=n=>Math.round(n).toLocaleString('en-IN');

let cfg=clone(DEFAULT_CFG);
let days=new Map();
let cur=today();
let draft={};
let pending=null, saveTimer=null;
let view='today';

/* ---------- storage (this phone only) ---------- */
// Each person keeps their own goals, habits and days under their own key
const PEOPLE=[{id:'sagar',name:'Sagar'},{id:'madhumita',name:'Madhumita'}];
let person='sagar';
try{const p=localStorage.getItem(LS_KEY+'.person'); if(PEOPLE.some(x=>x.id===p)) person=p}catch(e){}
const personName=()=>PEOPLE.find(p=>p.id===person).name;
const dataKey=()=>LS_KEY+'.'+person;
function lsRead(){try{return JSON.parse(localStorage.getItem(dataKey())||'null')}catch(e){return null}}
function lsWrite(){
  try{localStorage.setItem(dataKey(),JSON.stringify({cfg,days:Object.fromEntries(days)}));return true}
  catch(e){return false}
}
function mergeCfg(c){
  const out=clone(DEFAULT_CFG);
  if(c&&c.goals) for(const k in out.goals) if(num(c.goals[k])) out.goals[k]=c.goals[k];
  if(c&&Array.isArray(c.habits)) out.habits=c.habits.filter(h=>h&&h.id&&h.label).map(h=>({id:String(h.id),label:String(h.label)}));
  return out;
}
async function writeCfg(){
  if(!lsWrite()) throw new Error('phone storage is full or blocked');
}

function setSave(t,err){const el=$('#saveState');el.textContent=t;el.classList.toggle('err',!!err)}
function scheduleSave(){
  pending={date:cur,data:Object.assign(clone(draft),{date:cur,updatedAt:Date.now()})};
  days.set(cur,pending.data);
  setSave('Saving…');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(flush,400);
  renderRings();
}
function flush(){
  clearTimeout(saveTimer);
  if(!pending) return;
  pending=null;
  if(lsWrite()) setSave('Saved');
  else setSave('Not saved: phone storage is full or blocked',true);
}
window.addEventListener('pagehide',flush);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') flush()});

/* ---------- scoring ---------- */
const cap=x=>Math.max(0,Math.min(1,x));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function scores(d){
  const g=cfg.goals, s={};
  if(!d){AREAS.forEach(a=>s[a.k]=null);return s}
  const h=[]; if(num(d.sleep)) h.push(cap(d.sleep/g.sleep)); if(num(d.water)) h.push(cap(d.water/g.water));
  s.health=avg(h);
  const f=[]; if(num(d.wmin)) f.push(cap(d.wmin/g.workout)); if(num(d.steps)) f.push(cap(d.steps/g.steps));
  s.fitness=f.length?Math.max(...f):null;
  s.learning=num(d.learn)?cap(d.learn/g.learn):null;
  const m=[];
  if(d.habits&&cfg.habits.length){const done=cfg.habits.filter(x=>d.habits[x.id]).length;m.push(done/cfg.habits.length)}
  if(num(d.screen)) m.push(d.screen<=g.screen?1:cap(1-(d.screen-g.screen)/g.screen));
  s.mind=avg(m);
  return s;
}
function overall(d){const s=scores(d);return avg(AREAS.map(a=>s[a.k]).filter(v=>v!==null))}
const hit=v=>v!==null&&v>=0.999;

/* ---------- today view ---------- */
function buildStatic(){
  $$('.chips.scale').forEach(el=>{
    el.innerHTML=SCALE.map((l,i)=>`<button type="button" class="chip" data-value="${i+1}" aria-pressed="false" title="${l}">${i+1} · ${l}</button>`).join('');
  });
  $('#wtypes').innerHTML=WTYPES.map(w=>`<button type="button" class="chip" data-value="${w}" aria-pressed="false">${w}</button>`).join('');
}
function buildHabits(){
  $('#habitList').innerHTML=cfg.habits.length?cfg.habits.map(h=>`<label class="habit" data-h="${esc(h.id)}"><input type="checkbox" id="hb-${esc(h.id)}"><span>${esc(h.label)}</span></label>`).join('')
    :'<p class="hint" style="margin:0">No habits yet. Add some in Setup.</p>';
}
function syncControls(){
  const d=draft, g=cfg.goals;
  $$('.stepper').forEach(st=>{
    const v=d[st.dataset.field];
    st.querySelector('output').textContent=num(v)?(st.dataset.step<1?v.toFixed(1):v):'—';
  });
  $$('[data-goal]').forEach(el=>{const k=el.dataset.goal;el.textContent=(k==='screen'?'cap ':'goal ')+g[k]});
  $$('.chips[data-field]').forEach(ch=>{
    const v=d[ch.dataset.field];
    ch.querySelectorAll('.chip').forEach(b=>b.setAttribute('aria-pressed',String(v!=null&&String(v)===b.dataset.value)));
  });
  $$('[data-text]').forEach(inp=>{
    if(inp===document.activeElement) return;
    const v=d[inp.dataset.text]; inp.value=v==null?'':v;
  });
  $$('#habitList .habit').forEach(l=>{
    const on=!!(d.habits&&d.habits[l.dataset.h]);
    l.querySelector('input').checked=on; l.classList.toggle('on',on);
  });
}
function ringSvg(p,c){
  const r=24,C=2*Math.PI*r,v=p==null?0:p;
  return `<svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true" style="--c:${c}"><circle class="rbg" cx="30" cy="30" r="${r}"/><circle class="rfg" cx="30" cy="30" r="${r}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-v)).toFixed(1)}" transform="rotate(-90 30 30)"/><text class="pct" x="30" y="34.5" text-anchor="middle">${p==null?'–':Math.round(v*100)+'%'}</text></svg>`;
}
function renderRings(){
  const d=draft,g=cfg.goals,s=scores(d);
  const done=d.habits?cfg.habits.filter(h=>d.habits[h.id]).length:0;
  const detail={
    health:`${num(d.sleep)?d.sleep:'–'} h sleep · ${num(d.water)?d.water:'–'}/${g.water} water`,
    fitness:`${num(d.wmin)?d.wmin:0}/${g.workout} min · ${num(d.steps)?fmtInt(d.steps):'–'} steps`,
    learning:`${num(d.learn)?d.learn:0}/${g.learn} min${d.topic?' · '+esc(d.topic):''}`,
    mind:`${done}/${cfg.habits.length} habits${num(d.screen)?' · '+d.screen+' min screen':''}`
  };
  $('#rings').innerHTML=AREAS.map(a=>`<div class="ring">${ringSvg(s[a.k],a.c)}<div style="min-width:0"><b>${a.label}</b><small>${detail[a.k]}</small></div></div>`).join('');
}
function renderDay(){
  const d=parse(cur), t=today();
  const rel=cur===t?'Today':cur===addDays(t,-1)?'Yesterday':d.toLocaleDateString('en-IN',{weekday:'long'});
  $('#dayLabel').textContent=rel;
  $('#daySub').textContent=d.toLocaleDateString('en-IN',{weekday:rel==='Today'||rel==='Yesterday'?'long':undefined,day:'numeric',month:'long',year:'numeric'});
  $('#next').disabled=cur>=t;
  $('#goToday').hidden=cur===t;
  syncControls(); renderRings();
}
function openDay(date){
  flush();
  cur=date>today()?today():date;
  draft=clone(days.get(cur)||{});
  delete draft.date; delete draft.updatedAt;
  setSave(days.has(cur)?'Saved':'Nothing logged yet');
  renderDay();
}

function wireToday(){
  $('#prev').onclick=()=>openDay(addDays(cur,-1));
  $('#next').onclick=()=>openDay(addDays(cur,1));
  $('#goToday').onclick=()=>openDay(today());
  $$('.stepper').forEach(st=>st.addEventListener('click',e=>{
    const b=e.target.closest('button[data-d]'); if(!b) return;
    const f=st.dataset.field, step=+st.dataset.step, max=+st.dataset.max;
    let v=draft[f];
    if(!num(v)) v=b.dataset.d>0?+st.dataset.start:0;
    else v=Math.min(max,Math.max(0,Math.round((v+step*b.dataset.d)*10)/10));
    draft[f]=v; syncControls(); scheduleSave();
  }));
  $$('.chips[data-field]').forEach(ch=>ch.addEventListener('click',e=>{
    const b=e.target.closest('.chip'); if(!b) return;
    const f=ch.dataset.field, raw=b.dataset.value, v=ch.classList.contains('scale')?+raw:raw;
    if(draft[f]===v) delete draft[f]; else draft[f]=v;
    if(f==='wtype'&&v==='Rest'&&!num(draft.wmin)) draft.wmin=0;
    syncControls(); scheduleSave();
  }));
  $$('[data-text]').forEach(inp=>inp.addEventListener('input',()=>{
    const k=inp.dataset.text, raw=inp.value.trim();
    if(inp.type==='number'){const n=parseFloat(raw); if(raw===''||!isFinite(n)) delete draft[k]; else draft[k]=n;}
    else { if(raw==='') delete draft[k]; else draft[k]=inp.value; }
    scheduleSave();
  }));
  $('#habitList').addEventListener('change',e=>{
    const l=e.target.closest('.habit'); if(!l) return;
    draft.habits=Object.assign({},draft.habits);
    if(e.target.checked) draft.habits[l.dataset.h]=true; else delete draft.habits[l.dataset.h];
    l.classList.toggle('on',e.target.checked); scheduleSave();
  });
}

/* ---------- trends ---------- */
function streakFor(k){
  const t=today(), sc=d=>scores(days.get(d))[k];
  let start=hit(sc(t))?t:addDays(t,-1), n=0;
  while(hit(sc(start))&&n<1000){n++;start=addDays(start,-1)}
  let best=0,run=0;
  for(let i=364;i>=0;i--){const d=addDays(t,-i); if(hit(sc(d))){run++;best=Math.max(best,run)} else run=0;}
  let week=0; for(let i=0;i<7;i++) if(hit(sc(addDays(t,-i)))) week++;
  return {n,best,week};
}
function pip(v,c){
  const cls=v===null?'none':hit(v)?'full':v>0?'part':'none';
  return `<span class="pip ${cls}" style="--c:${c}" title="${v===null?'not logged':Math.round(v*100)+'%'}"></span>`;
}
function series(field,n){const t=today(),out=[];for(let i=n-1;i>=0;i--){const d=addDays(t,-i),r=days.get(d);out.push({d,v:r&&num(r[field])?r[field]:null})}return out}
function lineChart(pts,goal,color,dec){
  const W=300,H=120,L=34,R=10,T=10,B=22;
  const vals=pts.filter(p=>p.v!==null).map(p=>p.v);
  if(!vals.length) return '<p class="hint" style="margin:12px 0">No entries in the last 30 days.</p>';
  let lo=Math.min(...vals,goal??Infinity), hi=Math.max(...vals,goal??-Infinity);
  if(hi-lo<1){lo-=0.5;hi+=0.5} const padv=(hi-lo)*0.12; lo-=padv; hi+=padv;
  const x=i=>L+i*(W-L-R)/(pts.length-1), y=v=>T+(hi-v)*(H-T-B)/(hi-lo);
  let path='',pen=false,last=null;
  pts.forEach((p,i)=>{if(p.v===null){pen=false;return} path+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1);pen=true;last={i,v:p.v}});
  const dots=pts.map((p,i)=>p.v===null?'':`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="1.8" style="fill:${color}"/>`).join('');
  const fmt=v=>v.toFixed(dec);
  const lbl=d=>parse(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  return `<svg viewBox="0 0 ${W} ${H}" role="img">
    <text class="ax" x="${L-5}" y="${y(hi-padv)+3}" text-anchor="end">${fmt(hi-padv)}</text><text class="ax" x="${L-5}" y="${y(lo+padv)+3}" text-anchor="end">${fmt(lo+padv)}</text>
    ${goal!=null?`<line class="goalln" x1="${L}" x2="${W-R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="ax" x="${W-R}" y="${y(goal)-3}" text-anchor="end">goal ${goal}</text>`:''}
    <path d="${path}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    ${last?`<circle cx="${x(last.i)}" cy="${y(last.v)}" r="4" style="fill:${color};stroke:var(--surface)" stroke-width="2"/>`:''}
    <text class="ax" x="${L}" y="${H-6}">${lbl(pts[0].d)}</text><text class="ax" x="${W-R}" y="${H-6}" text-anchor="end">${lbl(pts[pts.length-1].d)}</text>
  </svg>`;
}
function barChart(pts,goal,color){
  const W=300,H=120,L=34,R=10,T=10,B=22;
  const vals=pts.map(p=>p.v||0); const hi=Math.max(goal,...vals)*1.1||1;
  const bw=(W-L-R)/pts.length, y=v=>T+(hi-v)*(H-T-B)/hi;
  const bars=pts.map((p,i)=>p.v?`<rect x="${(L+i*bw+bw*0.18).toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${(bw*0.64).toFixed(1)}" height="${(H-B-y(p.v)).toFixed(1)}" rx="2" style="fill:${color}" opacity="${p.v>=goal?1:.55}"><title>${p.d}: ${p.v} min</title></rect>`:'').join('');
  const lbl=d=>parse(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  return `<svg viewBox="0 0 ${W} ${H}" role="img">
    <line class="grid" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/>
    <text class="ax" x="${L-5}" y="${H-B+3}" text-anchor="end">0</text>
    <line class="goalln" x1="${L}" x2="${W-R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="ax" x="${L-5}" y="${y(goal)+3}" text-anchor="end">${goal}</text>
    ${bars}
    <text class="ax" x="${L}" y="${H-6}">${lbl(pts[0].d)}</text><text class="ax" x="${W-R}" y="${H-6}" text-anchor="end">${lbl(pts[pts.length-1].d)}</text>
  </svg>`;
}
function heatColor(v){
  if(v===null) return 'var(--sunk)';
  const p=Math.round(20+v*80);
  return `color-mix(in srgb, var(--mind) ${p}%, var(--sunk))`;
}
function renderTrends(){
  const body=$('#trendsBody');
  if(!days.size){
    body.innerHTML=`<div class="empty"><b>Your trends start with your first check-in</b>Log a day on the Today tab. Streaks, the 12-week map and charts for sleep, weight, activity and learning fill in here as you go.</div>`;
    return;
  }
  const t=today();
  const st=AREAS.map(a=>({...a,...streakFor(a.k)}));
  let rows='';
  for(let i=0;i<7;i++){
    const d=addDays(t,-i), r=days.get(d), s=scores(r), o=overall(r);
    rows+=`<tr class="click" data-date="${d}"><td>${parse(d).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</td>${AREAS.map(a=>`<td>${pip(s[a.k],a.c)}</td>`).join('')}<td class="mono">${o===null?'–':Math.round(o*100)+'%'}</td></tr>`;
  }
  const t0=parse(t), dow=(t0.getDay()+6)%7, start=addDays(t,-(dow+77));
  let cells='';
  for(let i=0;i<84;i++){
    const d=addDays(start,i), fut=d>t, o=fut?null:overall(days.get(d));
    cells+=`<button type="button" class="cell${fut?' future':''}${d===t?' today':''}" data-date="${d}" style="background:${heatColor(o)}" title="${d}${o===null?' · not logged':' · '+Math.round(o*100)+'%'}" aria-label="${d}"${fut?' tabindex="-1"':''}></button>`;
  }
  const logged=[...days.keys()].filter(d=>d>=addDays(t,-29)).length;
  body.innerHTML=`
    <h2 class="sec-h">Streaks <span class="hint" style="font-family:var(--f-body)">· days in a row with the goal met</span></h2>
    <div class="streaks">${st.map(a=>`<div class="streak" style="--c:${a.c}"><div class="hint" style="font-weight:700;color:var(--ink)">${a.label}</div><div class="big">${a.n}<small>${a.n===1?'day':'days'}</small></div><div class="meta">Best ${a.best} · this week ${a.week}/7</div></div>`).join('')}</div>
    <h2 class="sec-h">Last 7 days</h2>
    <div class="panel scroll"><table class="week"><thead><tr><th>Day</th>${AREAS.map(a=>`<th>${a.label}</th>`).join('')}<th>Overall</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="legend"><span class="pip full" style="--c:var(--ink)"></span>&nbsp;goal met&nbsp;&nbsp;<span class="pip part" style="--c:var(--ink)"></span>&nbsp;started&nbsp;&nbsp;<span class="pip none" style="--c:var(--ink)"></span>&nbsp;not logged · tap a row to edit that day</div></div>
    <h2 class="sec-h">12 weeks <span class="hint" style="font-family:var(--f-body)">· ${logged} of the last 30 days logged</span></h2>
    <div class="panel scroll"><div class="heatwrap"><div class="heat-days"><span>M</span><span></span><span>W</span><span></span><span>F</span><span></span><span>S</span></div><div class="heat">${cells}</div></div>
      <div class="legend">Less ${[null,0.2,0.5,0.8,1].map(v=>`<i style="background:${heatColor(v)}"></i>`).join('')} More · colour shows the day's overall score</div></div>
    <h2 class="sec-h">Charts</h2>
    <div class="charts">
      <div class="panel chart"><h3>Sleep<span>hours · 30 days</span></h3>${lineChart(series('sleep',30),cfg.goals.sleep,'var(--health)',1)}</div>
      <div class="panel chart"><h3>Weight<span>kg · 30 days</span></h3>${lineChart(series('weight',30),null,'var(--health)',1)}</div>
      <div class="panel chart"><h3>Active minutes<span>14 days</span></h3>${barChart(series('wmin',14),cfg.goals.workout,'var(--fitness)')}</div>
      <div class="panel chart"><h3>Learning minutes<span>14 days</span></h3>${barChart(series('learn',14),cfg.goals.learn,'var(--learning)')}</div>
    </div>`;
}
$('#trendsBody').addEventListener('click',e=>{
  const el=e.target.closest('[data-date]'); if(!el||el.classList.contains('future')) return;
  showView('today'); openDay(el.dataset.date);
});

/* ---------- setup ---------- */
let setupHabits=[];
function renderSetup(){
  $('#goalFields').innerHTML=GOAL_FIELDS.map(f=>`<div class="field"><label for="g-${f.k}">${f.label} (${f.unit})</label><input class="txt num" id="g-${f.k}" type="number" min="0" step="${f.step}" value="${cfg.goals[f.k]}"></div>`).join('');
  setupHabits=clone(cfg.habits); renderHabitEdit(); $('#setupState').textContent='';
}
function renderHabitEdit(){
  $('#habitEdit').innerHTML=setupHabits.map((h,i)=>`<div class="hrow"><input class="txt" id="he-${esc(h.id)}" data-i="${i}" type="text" maxlength="60" value="${esc(h.label)}" aria-label="Habit name"><button class="btn sec" type="button" data-rm="${i}" aria-label="Remove ${esc(h.label)}">Remove</button></div>`).join('')||'<p class="hint" style="margin:0">No habits. Add one below.</p>';
}
$('#habitEdit').addEventListener('input',e=>{const i=e.target.dataset.i;if(i!=null) setupHabits[i].label=e.target.value});
$('#habitEdit').addEventListener('click',e=>{const i=e.target.dataset.rm;if(i!=null){setupHabits.splice(+i,1);renderHabitEdit()}});
function addHabit(){const v=$('#newHabit').value.trim();if(!v) return;setupHabits.push({id:'h'+Date.now().toString(36),label:v});$('#newHabit').value='';renderHabitEdit()}
$('#addHabit').onclick=addHabit;
$('#newHabit').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addHabit()}});
$('#saveSetup').onclick=async()=>{
  const goals={};
  for(const f of GOAL_FIELDS){const n=parseFloat($('#g-'+f.k).value); if(!isFinite(n)||n<=0){$('#setupState').textContent=f.label+' needs a number above 0.';return} goals[f.k]=n}
  cfg={goals,habits:setupHabits.map(h=>({id:h.id,label:h.label.trim()})).filter(h=>h.label)};
  $('#setupState').textContent='Saving…';
  try{await writeCfg();$('#setupState').textContent='Saved. Goals and habits updated.'}
  catch(e){$('#setupState').textContent='Not saved: '+(e&&e.message||'try again')}
  buildHabits(); syncControls(); renderRings();
};

/* ---------- views ---------- */
function showView(v){
  view=v;
  $$('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.view===v)));
  $('#v-today').style.display=v==='today'?'flex':'none';
  $('#v-trends').hidden=v!=='trends'; $('#v-setup').hidden=v!=='setup';
  if(v==='trends') renderTrends();
  if(v==='setup') renderSetup();
  try{localStorage.setItem(LS_KEY+'.view',v)}catch(e){}
}
$$('.tab').forEach(t=>t.onclick=()=>showView(t.dataset.view));

/* ---------- backup ---------- */
function downloadFile(filename,text,type){
  const blob=new Blob([text],{type});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function csvCell(v){const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
$('#exportJson').onclick=()=>{
  flush();
  downloadFile(`growth-log-${person}-backup-${today()}.json`,JSON.stringify({app:'growth-log',person,exported:new Date().toISOString(),cfg,days:Object.fromEntries(days)},null,1),'application/json');
  $('#backupState').textContent=`${personName()}'s backup of ${days.size} ${days.size===1?'day':'days'} downloaded.`;
};
$('#exportCsv').onclick=()=>{
  flush();
  const cols=['date','sleep_h','water_glasses','mood_1to5','energy_1to5','weight_kg','workout','active_min','steps','learn_min','topic','takeaway','screen_min',...cfg.habits.map(h=>h.label),'note'];
  const rows=[...days.keys()].sort().map(d=>{const r=days.get(d);return [d,r.sleep,r.water,r.mood,r.energy,r.weight,r.wtype,r.wmin,r.steps,r.learn,r.topic,r.takeaway,r.screen,...cfg.habits.map(h=>r.habits&&r.habits[h.id]?'yes':''),r.note]});
  downloadFile(`growth-log-${person}-days-${today()}.csv`,[cols,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');
  $('#backupState').textContent=`${rows.length} ${rows.length===1?'day':'days'} exported as CSV.`;
};
$('#importFile').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const s=JSON.parse(await f.text());
    if(!s||typeof s.days!=='object') throw new Error('this is not a Growth Log backup');
    const owner=PEOPLE.find(p=>p.id===s.person);
    if(owner&&owner.id!==person) throw new Error(`this is ${owner.name}'s backup. Switch to ${owner.name} at the top first`);
    cfg=mergeCfg(s.cfg); days=new Map(Object.entries(s.days));
    if(!lsWrite()) throw new Error('phone storage is full or blocked');
    buildHabits(); openDay(cur); renderSetup();
    $('#backupState').textContent=`Imported ${days.size} ${days.size===1?'day':'days'}.`;
  }catch(err){ $('#backupState').textContent='Import failed: '+err.message+'.' }
});

/* ---------- people ---------- */
function loadPerson(){
  const s=lsRead();
  cfg=mergeCfg(s&&s.cfg); days=new Map(Object.entries((s&&s.days)||{}));
}
function renderWho(){
  $$('#who .chip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.person===person)));
  document.title=`Growth Log · ${personName()}`;
}
function switchPerson(id){
  if(id===person) return;
  flush();
  person=id;
  try{localStorage.setItem(LS_KEY+'.person',id)}catch(e){}
  loadPerson(); buildHabits(); openDay(today()); renderWho();
  if(view==='trends') renderTrends();
  if(view==='setup'){ renderSetup(); $('#backupState').textContent=''; }
}
$('#who').innerHTML=PEOPLE.map(p=>`<button type="button" class="chip" data-person="${p.id}" aria-pressed="false">${p.name}</button>`).join('');
$('#who').addEventListener('click',e=>{const b=e.target.closest('[data-person]'); if(b) switchPerson(b.dataset.person)});

/* ---------- boot ---------- */
(function boot(){
  loadPerson(); renderWho();
  buildStatic(); buildHabits(); wireToday(); openDay(today());
  const views=['today','trends','setup'];
  const hashView=views.includes(location.hash.slice(1))?location.hash.slice(1):null;
  let saved=null; try{saved=localStorage.getItem(LS_KEY+'.view')}catch(e){}
  showView(hashView||(views.includes(saved)?saved:'today'));
  // Left open overnight: move to the new day when the app comes back
  let lastToday=today();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible') return;
    const t=today(); if(t!==lastToday){ if(cur===lastToday) openDay(t); lastToday=t; if(view==='trends') renderTrends(); }
  });
})();

/* ---------- PWA plumbing ---------- */
const APP_VERSION='2026.10.20-2';
$('#versionLabel').textContent='Growth Log · version '+APP_VERSION;

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        nw&&nw.addEventListener('statechange',()=>{ if(nw.state==='installed'&&navigator.serviceWorker.controller) showUpdateBar(reg) });
      });
      if(reg.waiting&&navigator.serviceWorker.controller) showUpdateBar(reg);
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') reg.update().catch(()=>{}) });
    }catch(err){ console.warn('Service worker registration failed:',err) }
  });
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(refreshing) return; refreshing=true; flush(); location.reload() });
}
function showUpdateBar(reg){
  $('#updateBar').hidden=false;
  $('#reloadBtn').onclick=()=>reg.waiting&&reg.waiting.postMessage({type:'SKIP_WAITING'});
}

let deferredPrompt=null;
const installBtn=$('#installBtn');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});
installBtn.addEventListener('click',async()=>{
  if(!deferredPrompt) return;
  installBtn.hidden=true; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null;
});
window.addEventListener('appinstalled',()=>{installBtn.hidden=true});

const syncOnline=()=>{$('#offlineBar').hidden=navigator.onLine};
window.addEventListener('online',syncOnline); window.addEventListener('offline',syncOnline); syncOnline();
})();
