'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = 'work-rhythm-clean-v1'; // Retain the original storage key for in-place upgrades.
const statuses = ['待排程', '開發中', '進行中', '已完成'];
const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Taipei'});
const currentYear = () => today().slice(0, 4);
const badge = s => `<span class="badge s${esc(s)}">${esc(s)}</span>`;
const fmt = d => d ? d.replaceAll('-', '/') : '未排定';
const sum = a => a.reduce((n,t) => n + (Number(t.points) || 0), 0);
let data, view = 'list', mode = 'all', activeYear, storageFailed = false;
let month = new Date(today().slice(0,7) + '-01T00:00:00');
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').style.display = 'none', 4000);
}
function safeLink(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
function link(url, label) {
  return safeLink(url) ? `<a data-link href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label || '開啟 Jira')} ↗</a>` : esc(label || '—');
}
function yearOptions(selected) {
  return data.years.map(y => `<option value="${y}" ${y === String(selected) ? 'selected' : ''}>${y}</option>`).join('');
}
function sprintOptions(year, all = false, selected = '') {
  const names = [...new Set(data.sprints.filter(s => s.year === year).map(s => s.name))];
  return (all ? '<option value="">所有 Sprint</option>' : '') +
    ['未分配', ...names].map(n => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('');
}
function refreshSelectors() {
  $('#year').innerHTML = yearOptions(activeYear);
  $('#sprint').innerHTML = sprintOptions(activeYear, true, $('#sprint').value);
}
function persist() {
  try {
    const previous = localStorage.getItem(key);
    if (previous && !JSON.parse(previous).schemaVersion && !localStorage.getItem(key + '-before-years')) {
      localStorage.setItem(key + '-before-years', previous);
    }
    localStorage.setItem(key, JSON.stringify(data));
    $('#saved').textContent = '已儲存 · ' + new Date().toLocaleTimeString('zh-TW');
    return true;
  } catch {
    toast('瀏覽器儲存失敗。變更暫留於此頁，請先匯出備份，避免重整後遺失。');
    $('#saved').textContent = '尚未成功儲存，請匯出備份';
    return false;
  }
}
function save() { persist(); render(); }
function selected() {
  return data.tasks.filter(t => t.year === activeYear && (!$('#sprint').value || t.sprint === $('#sprint').value));
}
function filtered() {
  const q = $('#search').value.toLowerCase();
  return selected().filter(t => (!$('#status').value || t.status === $('#status').value) &&
    (mode !== 'open' || t.status !== '已完成') && (mode !== 'undated' || !t.start || !t.end) &&
    (!q || [t.title,t.jira,t.notes,t.jiraUrl].join(' ').toLowerCase().includes(q)));
}
function render() {
  const a = selected(), done = a.filter(t => t.status === '已完成');
  const undated = a.filter(t => t.status !== '已完成' && (!t.start || !t.end));
  $('#stats').innerHTML = [ ['工作總數',a.length,'項工作'], ['進行中',a.filter(t => t.status === '進行中').length,'持續前進'],
    ['待安排日期',undated.length,'未完成工項'], ['已完成',done.length,a.length ? Math.round(done.length/a.length*100)+'% 完成率' : '尚無工項']
  ].map(([l,n,s]) => `<div class="stat"><label>${l}</label><strong>${n}<small>${s}</small></strong></div>`).join('');
  const matches = data.sprints.filter(s => s.year === activeYear && s.name === $('#sprint').value);
  const cap = matches.reduce((n,s) => n+s.capacity,0), points = sum(a);
  $('#sprintTitle').textContent = matches.length ? matches[0].name : activeYear+' 年工作總覽';
  $('#sprintRange').textContent = matches.length ? matches.map(s => s.label).join(' · ') : '所有 Sprint · '+activeYear+' 年度';
  $('#sprintNotes').innerHTML = matches.length ? matches.map((s, segment) => {
    const index = data.sprints.indexOf(s);
    return `<label for="sprint-note-${index}">${matches.length > 1 ? '第 '+(segment+1)+' 段 ' : ''}Sprint 備註 <small>自動儲存</small></label><textarea id="sprint-note-${index}" data-sprint-note="${index}" rows="3" placeholder="例如：11/13 休假一天，容量減少 6 點，調整為 48 點">${esc(s.notes || '')}</textarea>`;
  }).join('') : '<p class="muted">選擇一個 Sprint，即可記錄放假、休假與點數調整原因。</p>';
  document.querySelectorAll('[data-sprint-note]').forEach(input => {
    input.oninput = () => {
      data.sprints[Number(input.dataset.sprintNote)].notes = input.value;
      persist();
    };
  });
  $('#capacityText').innerHTML = `已填工作點數 <strong>${points}${cap ? ' / '+cap : ''} pt</strong>`;
  $('#capacityBar').style.width = (cap ? Math.min(100, points/cap*100) : 0)+'%';
  $('#capacityBar').style.background = cap && points>cap ? '#c39058' : '';
  const list = filtered();
  $('#count').textContent = `${activeYear} 年 · ${list.length} 項工作`;
  $('#hint').textContent = view === 'goals' ? '點選「編輯」維護年度目標' : '點選工項編輯；Jira 連結可直接開啟';
  $('#add').textContent = view === 'goals' ? '＋ 新增年度目標' : '＋ 新增工作';
  $('.toolbar').hidden = view === 'goals';
  if (view === 'list') renderList(list);
  if (view === 'board') renderBoard(list);
  if (view === 'calendar') renderCalendar(list);
  if (view === 'goals') renderGoals();
  $('#welcome').hidden = data.tasks.some(t => t.year === activeYear) || view === 'goals';
  document.querySelectorAll('[data-id]').forEach(el => {
    el.onclick = () => edit(el.dataset.id);
    el.onkeydown = e => { if (e.target === el && e.key === 'Enter') edit(el.dataset.id); };
  });
  document.querySelectorAll('[data-link]').forEach(el => {
    el.onclick = e => e.stopPropagation(); el.onkeydown = e => e.stopPropagation();
  });
  document.querySelectorAll('[data-goal]').forEach(el => el.onclick = () => editGoal(el.dataset.goal));
}
function renderList(a) {
  $('#content').innerHTML = a.length ? `<table><thead><tr><th>工項 / Sprint</th><th>Jira 連結</th><th>狀態</th><th>點數</th><th>工作日期</th><th>文件</th><th></th></tr></thead><tbody>${a.map(t =>
    `<tr data-id="${esc(t.id)}" tabindex="0"><td class="tasktitle">${esc(t.title)}<small>${esc(t.sprint)}</small></td><td class="jira-cell">${link(t.jiraUrl,t.jira)}</td><td>${badge(t.status)}</td><td>${t.points ?? '—'}</td><td class="dates">${fmt(t.start)} → ${fmt(t.end)}</td><td>${link(t.docUrl,t.document)}</td><td>↗</td></tr>`
  ).join('')}</tbody></table>` : '<div class="empty">目前沒有符合條件的工作。可新增工作或調整篩選。</div>';
}
function renderBoard(a) {
  $('#content').innerHTML = `<div class="board">${statuses.map(s => `<div class="column"><h3>${badge(s)} · ${a.filter(t=>t.status===s).length}</h3>${a.filter(t=>t.status===s).map(t =>
    `<div class="card" data-id="${esc(t.id)}" tabindex="0">${esc(t.title)}<small>${link(t.jiraUrl,t.jira)} · ${t.points ?? '—'} pt<br>${fmt(t.start)} → ${fmt(t.end)}</small></div>`
  ).join('')}</div>`).join('')}</div>`;
}
function renderCalendar(a) {
  const y = month.getFullYear(), m = month.getMonth(), offset = (new Date(y,m,1).getDay()+6)%7, last = new Date(y,m+1,0).getDate();
  $('#content').innerHTML = `<div class="calendar"><div class="calhead"><button id="prev">←</button><b>${y} 年 ${m+1} 月</b><button id="next">→</button><button id="now">本月</button></div><div class="week">${['一','二','三','四','五','六','日'].map(d=>`<span>週${d}</span>`).join('')}</div><div class="days">${Array.from({length:Math.ceil((offset+last)/7)*7},(_,i)=>{
    const d=i-offset+1; if(d<1||d>last)return '<div class="day"></div>';
    const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return `<div class="day ${iso===today()?'today':''}">${d}${a.filter(t=>t.start&&t.start<=iso&&(t.end||t.start)>=iso).map(t=>`<div class="event" title="${esc(t.title)}" data-id="${esc(t.id)}">${esc(t.title)}</div>`).join('')}</div>`;
  }).join('')}</div><p class="muted">顯示所選年度工項的日期區間；只有起始日期的工作顯示於起始日。</p></div>`;
  $('#prev').onclick=()=>{month=new Date(y,m-1,1);render();};
  $('#next').onclick=()=>{month=new Date(y,m+1,1);render();};
  $('#now').onclick=()=>{month=new Date(today().slice(0,7)+'-01T00:00:00');render();};
}
function renderGoals() {
  const goals = data.goals.filter(g => g.year === activeYear);
  $('#count').textContent = `${activeYear} 年 · ${goals.length} 項年度目標`;
  $('#content').innerHTML = goals.length ? `<div class="goalgrid">${goals.map(g=>`<article><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p><p>後端：${esc(g.backend||'未填')}<br>前端：${esc(g.frontend||'未填')}</p><small>預計完成／訂版：${esc(g.release||'未填')}</small><div><button data-goal="${esc(g.id)}">編輯</button></div></article>`).join('')}</div>` : '<div class="empty">這個年度尚未建立目標，按右上角「新增年度目標」開始。</div>';
}
function setForm(form, values) {
  form.reset();
  for (const [k,v] of Object.entries(values)) {
    const el=form.elements.namedItem(k); if(el)el.value=v ?? '';
  }
}
function edit(id) {
  const t=data.tasks.find(t=>t.id===id) || {id:'',year:activeYear,sprint:$('#sprint').value||'未分配',status:'待排程'};
  $('#form').elements.year.innerHTML=yearOptions(t.year);
  $('#form').elements.sprint.innerHTML=sprintOptions(t.year,false,t.sprint);
  setForm($('#form'),t);
  $('#modalTitle').textContent=id?'工作詳情':'新增工作';
  $('#delete').hidden=!id;
  $('#source').textContent=t.sourceRow?`匯入來源第 ${t.sourceRow} 列。`:'';
  $('#editor').showModal();
}
function editGoal(id) {
  const g=data.goals.find(g=>g.id===id)||{id:'',year:activeYear};
  $('#goalForm').elements.year.innerHTML=yearOptions(g.year);
  setForm($('#goalForm'),g);
  $('#goalTitle').textContent=id?'編輯年度目標':'新增年度目標';
  $('#deleteGoal').hidden=!id; $('#goalEditor').showModal();
}
// Keep the download anchor in the document and retain the Blob URL long enough
// for browsers that process downloads asynchronously.
function download(name,body,type) {
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.style.display='none';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},60000);
}
function showBackup() {
  $('#backupText').value=JSON.stringify(data,null,2);
  $('#backupStatus').textContent='備份已準備好，請選擇下載或複製。';
  $('#backupEditor').showModal();
}
function csvValue(value) {
  const text=String(value ?? ''); return /^[=+@\-\t\r\n]/.test(text)?"'"+text:text;
}
function normalizeBackup(raw) {
  if(!raw || !Array.isArray(raw.tasks)||!Array.isArray(raw.sprints)||!Array.isArray(raw.goals))throw Error('備份缺少必要欄位');
  const str=v=>v==null?'':String(v);
  const year=v=>{const y=str(v);if(!/^\d{4}$/.test(y)||+y<1900||+y>2200)throw Error('年度格式錯誤');return y;};
  const date=v=>{const s=str(v);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))throw Error('日期格式錯誤');return s;};
  const point=v=>{if(v==null||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('點數格式錯誤');return n;};
  const dates=raw.tasks.map(t=>str(t?.start||t?.end).slice(0,4)).filter(y=>/^\d{4}$/.test(y));
  const counts=dates.reduce((a,y)=>(a[y]=(a[y]||0)+1,a),{});
  const fallback=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||currentYear();
  const years=new Set((raw.years||[]).map(year));
  const ids=new Set();
  const tasks=raw.tasks.map(t=>{
    if(!t||!t.id||typeof t.title!=='string'||!t.title.trim()||!statuses.includes(t.status)||ids.has(str(t.id)))throw Error('工作格式錯誤');
    ids.add(str(t.id));const start=date(t.start),end=date(t.end);if(start&&end&&end<start)throw Error('日期區間錯誤');
    const y=year(t.year||(start||end).slice(0,4)||fallback);years.add(y);
    const result={id:str(t.id),year:y,title:t.title,sprint:str(t.sprint)||'未分配',points:point(t.points),status:t.status,start,end};
    for(const k of ['jira','document','notes','jiraUrl','docUrl'])result[k]=str(t[k]);
    if(Number.isInteger(t.sourceRow)&&t.sourceRow>0)result.sourceRow=t.sourceRow;
    return result;
  });
  const sprints=[];
  for(const s of raw.sprints){
    if(!s||typeof s.name!=='string'||!s.name.trim()||s.name==='未分配')throw Error('Sprint 格式錯誤');
    const inferred=[...new Set(tasks.filter(t=>t.sprint===s.name).map(t=>t.year))];
    const sprintYears=s.year?[year(s.year)]:(inferred.length?inferred:[fallback]);
    for(const y of sprintYears){years.add(y);sprints.push({name:s.name,year:y,capacity:point(s.capacity)??0,label:str(s.label||s.name),notes:str(s.notes)});}
  }
  for(const t of tasks){if(t.sprint!=='未分配'&&!sprints.some(s=>s.year===t.year&&s.name===t.sprint))sprints.push({name:t.sprint,year:t.year,capacity:0,label:t.sprint});}
  const goalIds=new Set();
  const goals=raw.goals.map(g=>{
    if(!g||typeof g.title!=='string'||!g.title.trim())throw Error('目標格式錯誤');
    const id=str(g.id)||crypto.randomUUID();if(goalIds.has(id))throw Error('目標編號重複');goalIds.add(id);
    const y=year(g.year||fallback);years.add(y);
    return {id,year:y,...Object.fromEntries(['title','description','backend','frontend','release'].map(k=>[k,str(g[k])]))};
  });
  if(!years.size)years.add(currentYear());
  return {schemaVersion:2,years:[...years].sort(),tasks,sprints,goals};
}
function init() {
  const seed={schemaVersion:2,years:[currentYear()],tasks:[],sprints:[],goals:[]};
  let raw;
  try {
    raw=localStorage.getItem(key);data=raw?normalizeBackup(JSON.parse(raw)):seed;
  } catch(error) {
    // Do not replace existing data if reading or migration fails.
    data=seed;storageFailed=true;
  }
  activeYear=data.years.includes(currentYear())?currentYear():data.years.at(-1);
  month=new Date(+activeYear,new Date().getMonth(),1);
  refreshSelectors();
  $('#year').onchange=()=>{activeYear=$('#year').value;$('#sprint').innerHTML=sprintOptions(activeYear,true);month=new Date(+activeYear,month.getMonth(),1);render();};
  $('#sprint').onchange=render;$('#status').onchange=render;$('#search').oninput=render;
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));render();});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));
    $('#crumb').textContent={list:'工作總覽',board:'狀態看板',calendar:'排程月曆',goals:'年度目標'}[view];
    $('#heading').textContent={list:'每一項工作，都有自己的節奏。',board:'把進度攤開，下一步更清楚。',calendar:'為重要的工作，安排好時間。',goals:'一年一個方向，持續向目標前進。'}[view];render();
  });
  $('#add').onclick=()=>view==='goals'?editGoal():edit();$('#welcomeAdd').onclick=()=>edit();
  $('#welcomeImport').onclick=()=>$('#import').click();$('#restore').onclick=()=>$('#import').click();
  $('#backup').onclick=showBackup;$('#backupTop').onclick=showBackup;
  $('#downloadBackup').onclick=()=>{
    try{download('工作序-全部年度-'+today()+'.json',$('#backupText').value,'application/json;charset=utf-8');$('#backupStatus').textContent='已送出下載要求。若未出現檔案，請使用「複製備份內容」。';}
    catch{$('#backupStatus').textContent='瀏覽器無法下載，請複製下方 JSON 備份內容。';}
  };
  $('#copyBackup').onclick=async()=>{
    try{await navigator.clipboard.writeText($('#backupText').value);$('#backupStatus').textContent='備份已複製，請貼到文字檔並以 .json 副檔名儲存。';}
    catch{$('#backupText').focus();$('#backupText').select();$('#backupStatus').textContent='已選取全部內容，請按 Ctrl+C（Mac：⌘C）複製，再存成 .json 檔。';}
  };
  $('#import').onchange=async e=>{
    try {
      if(!e.target.files[0])return;
      const file=e.target.files[0];
      toast('正在本機讀取檔案，請稍候…');
      const isExcel=/\.xlsx$/i.test(file.name);
      const next=normalizeBackup(isExcel?await importWorkExcel(file):JSON.parse(await file.text()));
      if(!confirm(`${isExcel?'只讀取「個人工作紀錄-2026」分頁。\n':''}匯入 ${next.years.length} 個年度、${next.tasks.length} 項工作、${next.goals.length} 項目標，取代目前全部年度資料？請先匯出現有備份。`))return;
      localStorage.setItem(key,JSON.stringify(next));location.reload();
    }catch(error){toast('匯入失敗：'+error.message+'。目前資料未更動。');}
    e.target.value='';
  };
  $('#addYear').onclick=()=>{$('#yearForm').reset();$('#yearForm').elements.year.value=String(Math.max(...data.years.map(Number))+1);$('#yearEditor').showModal();};
  $('#yearForm').onsubmit=e=>{
    e.preventDefault();const y=$('#yearForm').elements.year.value;
    if(data.years.includes(y)){toast('此年度已存在，請從上方切換');return;}
    data.years.push(y);data.years.sort();activeYear=y;$('#sprint').value='';refreshSelectors();month=new Date(+y,0,1);save();$('#yearEditor').close();toast('已新增 '+y+' 年度');
  };
  $('#addSprint').onclick=()=>{$('#sprintForm').reset();$('#sprintForm').elements.year.innerHTML=yearOptions(activeYear);$('#sprintEditor').showModal();};
  $('#closeSprint').onclick=()=>$('#sprintEditor').close();
  $('#sprintForm').onsubmit=e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),name=f.name.trim();
    if(!name||name==='未分配'||data.sprints.some(s=>s.year===f.year&&s.name===name)){toast('此年度已有同名 Sprint，請使用不同名稱');return;}
    data.sprints.push({name,year:f.year,capacity:Number(f.capacity),label:[name,f.range,'點數：'+f.capacity].filter(Boolean).join('\n'),notes:f.notes});
    activeYear=f.year;refreshSelectors();$('#sprint').value=name;save();$('#sprintEditor').close();toast('Sprint 已新增');
  };
  $('#form').elements.year.onchange=e=>{$('#form').elements.sprint.innerHTML=sprintOptions(e.target.value);};
  $('#close').onclick=()=>$('#editor').close();
  $('#form').onsubmit=e=>{
    e.preventDefault();const t=Object.fromEntries(new FormData(e.target));t.title=t.title.trim();
    if(!t.title){toast('請輸入工項名稱');return;}
    if(t.start&&t.end&&t.end<t.start){toast('結束日期不能早於起始日期');return;}
    if([t.jiraUrl,t.docUrl].some(url=>url&&!safeLink(url))){toast('連結請使用 http:// 或 https://');return;}
    t.points=t.points===''?null:Number(t.points);t.id=t.id||crypto.randomUUID();
    const old=data.tasks.find(x=>x.id===t.id);if(old)Object.assign(old,t);else data.tasks.push(t);
    if(activeYear!==t.year){activeYear=t.year;refreshSelectors();}
    if($('#sprint').value&&$('#sprint').value!==t.sprint)$('#sprint').value='';
    save();$('#editor').close();toast('工作已更新');
  };
  $('#delete').onclick=()=>{if(!confirm('確定刪除此工作？'))return;data.tasks=data.tasks.filter(t=>t.id!==$('#form').elements.id.value);save();$('#editor').close();};
  $('#goalForm').onsubmit=e=>{
    e.preventDefault();const g=Object.fromEntries(new FormData(e.target));g.title=g.title.trim();if(!g.title){toast('請輸入目標名稱');return;}
    g.id=g.id||crypto.randomUUID();const old=data.goals.find(x=>x.id===g.id);if(old)Object.assign(old,g);else data.goals.push(g);
    activeYear=g.year;refreshSelectors();save();$('#goalEditor').close();toast('年度目標已儲存');
  };
  $('#deleteGoal').onclick=()=>{if(!confirm('確定刪除此年度目標？'))return;data.goals=data.goals.filter(g=>g.id!==$('#goalForm').elements.id.value);save();$('#goalEditor').close();toast('目標已刪除');};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
  $('#csv').onclick=()=>{
    const cols=['year','sprint','points','title','jira','jiraUrl','document','docUrl','start','end','status','notes'];
    const rows=[['年度','Sprint','使用/預估點數','工項','Jira 編號','Jira 連結','文件','文件連結','起始日期','結束日期','狀態','備註'],...filtered().map(t=>cols.map(k=>t[k]??''))];
    download('工作排程-'+activeYear+'.csv','\ufeff'+rows.map(r=>r.map(x=>'"'+csvValue(x).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  render();
  if(storageFailed){
    $('#saved').textContent='現有資料無法讀取，請勿新增或匯入覆蓋；先匯出原始資料';
    for(const id of ['add','welcomeAdd','addSprint','addYear','restore','welcomeImport'])$('#'+id).disabled=true;
    $('#backup').onclick=$('#backupTop').onclick=()=>{
      $('#backupText').value=raw||'';$('#backupStatus').textContent='原始資料讀取異常，請先下載或複製此內容保存。';$('#backupEditor').showModal();
    };
    toast('資料無法讀取，已暫停寫入以保護現有內容。請先匯出備份。');
  }
}
try{init();}catch(error){$('#content').textContent='載入失敗：'+error.message+'。請勿清除網站資料。';}
