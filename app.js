const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STORAGE_KEY='nest_data_v3', SETTINGS_KEY='nest_settings_v3', MIGRATION_KEY='nest_v5_migrated';
let notes=[],activeId=null,activeFilter='all',saveTimer=null;
let settings={theme:'system',textSize:100,showPreviews:true,compactCards:false,pinnedFirst:true,notifications:true,hideReminderText:false};
const screens={notes:$('#homeScreen'),reminders:$('#remindersScreen'),settings:$('#settingsScreen'),editor:$('#editorScreen')};
const notesList=$('#notesList'),emptyState=$('#emptyState'),titleInput=$('#titleInput'),bodyInput=$('#bodyInput'),checklistEditor=$('#checklistEditor'),checklistItems=$('#checklistItems'),saveState=$('#saveState'),pinBtn=$('#pinBtn');
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`; const nowISO=()=>new Date().toISOString();
let reminderDraft={date:'',hour:9,minute:0,period:'AM'};
let calendarViewDate=new Date();
let timeWheelsBuilt=false;
const WHEEL_ITEM_HEIGHT=44;

function localDateValue(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function dateFromValue(value){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d)}
function makeWelcomeNote(){const t=nowISO();return{id:uid(),title:'Welcome to Nest',body:'',type:'note',items:[],pinned:true,reminderAt:null,createdAt:t,updatedAt:t}}
function defaultNotes(){return[makeWelcomeNote()]}
function migrateStarterNotes(){
  if(localStorage.getItem(MIGRATION_KEY)==='1')return;
  notes=notes.filter(n=>!['Saturday errands 🛍️','Saturday errands','A few things to try ✨'].includes((n.title||'').trim()));
  let welcome=notes.find(n=>['Welcome to Nest 🐥','Welcome to Nest'].includes((n.title||'').trim()));
  if(!welcome){welcome=makeWelcomeNote();notes.unshift(welcome)}
  else{
    welcome.title='Welcome to Nest';welcome.pinned=true;welcome.reminderAt=null;
    if((welcome.body||'').startsWith('A cozy place for thoughts'))welcome.body='';
  }
  localStorage.setItem(MIGRATION_KEY,'1');
}
function buildTimeWheels(){
  if(timeWheelsBuilt)return;
  const make=(id,values,formatter=v=>v)=>{const el=$(id);values.forEach(v=>{const item=document.createElement('div');item.className='wheel-item';item.dataset.value=String(v);item.textContent=formatter(v);el.appendChild(item)});el.addEventListener('scroll',()=>requestAnimationFrame(()=>syncWheelFromScroll(el)))};
  make('#hourWheel',Array.from({length:12},(_,i)=>i+1));
  make('#minuteWheel',Array.from({length:60},(_,i)=>i),v=>String(v).padStart(2,'0'));
  make('#ampmWheel',['AM','PM']);
  timeWheelsBuilt=true;
}
function setWheelValue(el,value){const items=[...el.querySelectorAll('.wheel-item')],idx=Math.max(0,items.findIndex(i=>i.dataset.value===String(value)));el.scrollTop=idx*WHEEL_ITEM_HEIGHT;markWheel(el,idx)}
function markWheel(el,index){const items=[...el.querySelectorAll('.wheel-item')];items.forEach((item,i)=>item.classList.toggle('selected',i===index));if(!items[index])return;const v=items[index].dataset.value;if(el.id==='hourWheel')reminderDraft.hour=Number(v);if(el.id==='minuteWheel')reminderDraft.minute=Number(v);if(el.id==='ampmWheel')reminderDraft.period=v;updateReminderTimePreview()}
function syncWheelFromScroll(el){const items=[...el.querySelectorAll('.wheel-item')];const idx=Math.max(0,Math.min(items.length-1,Math.round(el.scrollTop/WHEEL_ITEM_HEIGHT)));markWheel(el,idx)}
function updateReminderTimePreview(){const preview=$('#reminderTimePreview');if(preview)preview.textContent=`${reminderDraft.hour}:${String(reminderDraft.minute).padStart(2,'0')} ${reminderDraft.period}`}
function updateReminderDateText(){const label=$('#clockDateText');if(!label||!reminderDraft.date)return;const chosen=dateFromValue(reminderDraft.date),today=new Date();today.setHours(0,0,0,0);const diff=Math.round((chosen-today)/86400000);label.textContent=diff===0?'Today':diff===1?'Tomorrow':chosen.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});renderCalendar()}
function setReminderDate(date){reminderDraft.date=localDateValue(date);calendarViewDate=new Date(date.getFullYear(),date.getMonth(),1);updateReminderDateText()}
function renderCalendar(){
  const grid=$('#calendarGrid'),label=$('#calendarMonthLabel');if(!grid||!label)return;
  const year=calendarViewDate.getFullYear(),month=calendarViewDate.getMonth();
  label.textContent=new Date(year,month,1).toLocaleDateString([],{month:'long',year:'numeric'});
  grid.innerHTML='';
  const firstDay=new Date(year,month,1).getDay(),daysInMonth=new Date(year,month+1,0).getDate();
  for(let i=0;i<firstDay;i++){const blank=document.createElement('span');blank.className='calendar-blank';grid.appendChild(blank)}
  const today=localDateValue(new Date());
  for(let day=1;day<=daysInMonth;day++){
    const d=new Date(year,month,day),value=localDateValue(d),btn=document.createElement('button');
    btn.type='button';btn.className='calendar-day';btn.textContent=day;btn.dataset.date=value;
    if(value===today)btn.classList.add('today');
    if(value===reminderDraft.date)btn.classList.add('selected');
    btn.onclick=()=>{setReminderDate(d);$('#calendarPanel').hidden=true;$('#reminderDateBtn').classList.remove('open')};
    grid.appendChild(btn);
  }
}
function toggleCalendar(){const panel=$('#calendarPanel'),opening=panel.hidden;if(opening&&reminderDraft.date){const d=dateFromValue(reminderDraft.date);calendarViewDate=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar()}panel.hidden=!opening;$('#reminderDateBtn').classList.toggle('open',opening)}
function changeCalendarMonth(delta){calendarViewDate=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()+delta,1);renderCalendar()}
function escapeHTML(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function load(){try{const raw=localStorage.getItem(STORAGE_KEY);notes=raw?(JSON.parse(raw).notes||[]):defaultNotes()}catch{notes=defaultNotes()}migrateStarterNotes();try{settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{}save();applySettings();updateGreeting();renderNotes();renderReminders();syncSettingsUI()}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify({notes}));localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}
function activeNote(){return notes.find(n=>n.id===activeId)}
function showScreen(name){Object.values(screens).forEach(s=>s.classList.remove('active'));screens[name].classList.add('active');$('#tabbar').classList.toggle('editor-hidden',name==='editor');$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));if(name==='notes')renderNotes();if(name==='reminders')renderReminders()}
function updateGreeting(){const h=new Date().getHours();$('#greeting').textContent=h<12?'Good morning 🌤️':h<17?'Good afternoon ☀️':'Good evening 🌙';$('#todayLabel').textContent=new Date().toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'}).toUpperCase()}
function noteText(n){return n.type==='list'?n.items.map(i=>`${i.done?'✓':'○'} ${i.text}`).filter(x=>x.trim()!=='✓'&&x.trim()!=='○').join(' · '):(n.body||'')}
function look(n){const text=`${n.title} ${noteText(n)}`.toLowerCase();if(n.type==='list')return{emoji:'✅',tone:'green'};if(n.reminderAt)return{emoji:'🔔',tone:'blue'};if(/birthday|party|gift/.test(text))return{emoji:'🎉',tone:'pink'};if(/idea|think/.test(text))return{emoji:'💡',tone:'blue'};if(/doctor|appointment/.test(text))return{emoji:'🌼',tone:'green'};return{emoji:n.pinned?'📌':'📝',tone:n.pinned?'pink':'warm'}}
function formatDate(iso){const d=new Date(iso),today=new Date();if(d.toDateString()===today.toDateString())return`Today · ${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;return d.toLocaleDateString([],{month:'short',day:'numeric'})}
function formatReminder(iso){if(!iso)return'';const d=new Date(iso);return`${d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})} at ${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`}
function emptyActionForFilter(){
  if(activeFilter==='lists')return{label:'＋ Add a checklist',action:()=>createNote('list')};
  if(activeFilter==='reminders')return{label:'＋ Add a reminder',action:()=>createNote('note',{openReminder:true})};
  if(activeFilter==='pinned')return{label:'＋ Add a pinned note',action:()=>createNote('note',{pinned:true})};
  return{label:'＋ Add a note',action:()=>createNote('note')};
}
function renderNotes(){
  const q=$('#searchInput').value.trim().toLowerCase();
  let list=notes.filter(n=>{if(activeFilter==='pinned'&&!n.pinned)return false;if(activeFilter==='lists'&&n.type!=='list')return false;if(activeFilter==='reminders'&&!n.reminderAt)return false;return`${n.title} ${noteText(n)}`.toLowerCase().includes(q)});
  list.sort((a,b)=>(settings.pinnedFirst?Number(b.pinned)-Number(a.pinned):0)||new Date(b.updatedAt)-new Date(a.updatedAt));
  notesList.innerHTML='';notesList.classList.toggle('compact',settings.compactCards);emptyState.hidden=!!list.length;$('#noteSummary').textContent=`${notes.length} ${notes.length===1?'note':'notes'}`;
  const emptyAction=emptyActionForFilter();$('#emptyAddBtn').textContent=emptyAction.label;$('#emptyAddBtn').onclick=emptyAction.action;
  for(const n of list){
    const l=look(n),card=document.createElement('button'),preview=noteText(n),previewHTML=preview?`<span class="note-preview">${escapeHTML(preview)}</span>`:'';
    card.className='note-card'+(settings.showPreviews?'':' hide-preview');card.dataset.tone=l.tone;
    card.innerHTML=`<span class="note-card-icon">${l.emoji}</span><span class="note-card-main"><span class="note-card-top"><h3>${escapeHTML(n.title||'Untitled note')}</h3>${n.pinned?'<span>📌</span>':''}</span>${previewHTML}<span class="note-meta"><span>${formatDate(n.updatedAt)}</span><span class="meta-pills">${n.reminderAt?'<span class="mini-pill">🔔 '+escapeHTML(new Date(n.reminderAt).toLocaleDateString([],{month:'short',day:'numeric'}))+'</span>':''}${n.type==='list'?'<span class="mini-pill">LIST</span>':''}</span></span></span>`;
    card.onclick=()=>openEditor(n.id);notesList.appendChild(card)
  }
}
function renderReminders(){const list=notes.filter(n=>n.reminderAt).sort((a,b)=>new Date(a.reminderAt)-new Date(b.reminderAt));const wrap=$('#remindersList');wrap.innerHTML='';$('#remindersEmpty').hidden=!!list.length;for(const n of list){const d=new Date(n.reminderAt),c=document.createElement('button');c.className='reminder-card';c.innerHTML=`<span class="reminder-date"><small>${d.toLocaleDateString([],{month:'short'}).toUpperCase()}</small><b>${d.getDate()}</b></span><span class="reminder-card-main"><strong>${escapeHTML(n.title||'Untitled note')}</strong><span>${escapeHTML(formatReminder(n.reminderAt))}</span></span><span class="reminder-bell">🔔</span>`;c.onclick=()=>openEditor(n.id);wrap.appendChild(c)}}
function createNote(type='note',options={}){const t=nowISO(),n={id:uid(),title:'',body:'',type,items:type==='list'?[{id:uid(),text:'',done:false}]:[],pinned:!!options.pinned,reminderAt:null,createdAt:t,updatedAt:t};notes.unshift(n);activeId=n.id;save();openEditor(n.id);setTimeout(()=>{titleInput.focus();if(options.openReminder)openReminderSheet()},120)}
function openEditor(id){activeId=id;const n=activeNote();if(!n)return;titleInput.value=n.title||'';bodyInput.value=n.body||'';setEditorType(n.type||'note',false);pinBtn.textContent=n.pinned?'📍':'📌';renderChecklist();renderReminderRow();saveState.textContent='✓ Saved';showScreen('editor')}
function setEditorType(type,persist=true){const n=activeNote();if(!n)return;n.type=type;$('#plainTypeBtn').classList.toggle('active',type==='note');$('#listTypeBtn').classList.toggle('active',type==='list');bodyInput.hidden=type!=='note';checklistEditor.hidden=type!=='list';if(type==='list'&&!n.items.length)n.items.push({id:uid(),text:'',done:false});if(persist)queueSave();renderChecklist()}
function renderChecklist(){const n=activeNote();if(!n||n.type!=='list')return;checklistItems.innerHTML='';n.items.forEach(item=>{const row=document.createElement('div');row.className='check-row';const check=document.createElement('input');check.type='checkbox';check.checked=item.done;check.onchange=()=>{item.done=check.checked;queueSave()};const text=document.createElement('input');text.type='text';text.value=item.text;text.placeholder='Something to remember…';text.oninput=()=>{item.text=text.value;queueSave()};const remove=document.createElement('button');remove.className='remove-item';remove.textContent='×';remove.onclick=()=>{n.items=n.items.filter(i=>i.id!==item.id);renderChecklist();queueSave()};row.append(check,text,remove);checklistItems.appendChild(row)})}
function queueSave(){const n=activeNote();if(!n)return;n.title=titleInput.value;n.body=bodyInput.value;n.updatedAt=nowISO();saveState.textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{save();saveState.textContent='✓ Saved';renderReminders()},180)}
function togglePin(){const n=activeNote();if(!n)return;n.pinned=!n.pinned;pinBtn.textContent=n.pinned?'📍':'📌';queueSave();toast(n.pinned?'Pinned 📌':'Unpinned')}
function deleteActive(){if(!activeId||!confirm('Delete this note?'))return;notes=notes.filter(n=>n.id!==activeId);activeId=null;save();showScreen('notes');toast('Note deleted')}
function renderReminderRow(){const n=activeNote();if(!n)return;$('#reminderRowTitle').textContent=n.reminderAt?'Reminder set':'Add reminder';$('#reminderRowSub').textContent=n.reminderAt?formatReminder(n.reminderAt):'Get a notification later'}
function openReminderSheet(){
  const n=activeNote();if(!n)return;buildTimeWheels();
  const d=n.reminderAt?new Date(n.reminderAt):new Date(Date.now()+3600000);d.setSeconds(0,0);const h24=d.getHours();
  reminderDraft.date=localDateValue(d);reminderDraft.hour=h24%12||12;reminderDraft.minute=d.getMinutes();reminderDraft.period=h24>=12?'PM':'AM';
  calendarViewDate=new Date(d.getFullYear(),d.getMonth(),1);updateReminderDateText();$('#calendarPanel').hidden=true;$('#reminderDateBtn').classList.remove('open');
  $('#removeReminderBtn').style.display=n.reminderAt?'block':'none';$('#sheetBackdrop').hidden=false;$('#reminderSheet').hidden=false;
  requestAnimationFrame(()=>{setWheelValue($('#hourWheel'),reminderDraft.hour);setWheelValue($('#minuteWheel'),reminderDraft.minute);setWheelValue($('#ampmWheel'),reminderDraft.period);updateReminderTimePreview()});
}
function closeReminderSheet(){$('#sheetBackdrop').hidden=true;$('#reminderSheet').hidden=true;$('#calendarPanel').hidden=true;$('#reminderDateBtn').classList.remove('open')}
function saveReminder(){const n=activeNote(),dateValue=reminderDraft.date;if(!n||!dateValue)return;const [y,m,d]=dateValue.split('-').map(Number);let hour=reminderDraft.hour%12;if(reminderDraft.period==='PM')hour+=12;const chosen=new Date(y,m-1,d,hour,reminderDraft.minute,0,0);n.reminderAt=chosen.toISOString();n.updatedAt=nowISO();save();renderReminderRow();renderReminders();closeReminderSheet();toast('Reminder set 🔔')}
function removeReminder(){const n=activeNote();if(!n)return;n.reminderAt=null;save();renderReminderRow();renderReminders();closeReminderSheet();toast('Reminder removed')}
function setReminderDay(offset){const d=new Date();d.setDate(d.getDate()+offset);setReminderDate(d)}
function setTheme(mode){settings.theme=mode;const actual=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;document.documentElement.dataset.theme=actual;document.querySelector('meta[name="theme-color"]').content=actual==='dark'?'#191714':'#fff8ee';save();syncSettingsUI()}
function applySettings(){setTheme(settings.theme);document.documentElement.style.setProperty('--text-scale',settings.textSize/100);renderNotes()}
function syncSettingsUI(){$$('#themeSegment button').forEach(b=>b.classList.toggle('active',b.dataset.theme===settings.theme));$('#textSizeSlider').value=settings.textSize;$('#textSizeValue').textContent=settings.textSize+'%';$('#textSizeLabel').textContent=settings.textSize<100?'Small':settings.textSize>105?'Large':'Medium';$('#previewToggle').checked=settings.showPreviews;$('#compactToggle').checked=settings.compactCards;$('#pinnedFirstToggle').checked=settings.pinnedFirst;$('#notificationToggle').checked=settings.notifications;$('#hideTextToggle').checked=settings.hideReminderText;const p=((settings.textSize-90)/(120-90))*100;$('#textSizeSlider').style.setProperty('--slider-fill',p+'%')}
function settingChanged(){settings.showPreviews=$('#previewToggle').checked;settings.compactCards=$('#compactToggle').checked;settings.pinnedFirst=$('#pinnedFirstToggle').checked;settings.notifications=$('#notificationToggle').checked;settings.hideReminderText=$('#hideTextToggle').checked;save();renderNotes()}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1600)}
async function exportBackup(){const blob=new Blob([JSON.stringify({app:'Nest',version:5,exportedAt:nowISO(),notes,settings},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nest-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup ready 📦')}
async function importBackup(file){try{const data=JSON.parse(await file.text());if(!Array.isArray(data.notes))throw 0;if(!confirm(`Import ${data.notes.length} notes? This replaces the notes currently in Nest.`))return;notes=data.notes;if(data.settings)settings={...settings,...data.settings};save();applySettings();renderNotes();renderReminders();toast('Backup imported 🐥')}catch{alert('That does not look like a Nest backup.')}}

$('#quickNoteBtn').onclick=()=>createNote('note');$('#quickListBtn').onclick=()=>createNote('list');$('#reminderAddBtn').onclick=()=>createNote('note',{openReminder:true});$('#remindersEmptyAddBtn').onclick=()=>createNote('note',{openReminder:true});
$('#settingsBtn').onclick=()=>showScreen('settings');$('#settingsBackBtn').onclick=()=>showScreen('notes');$('#backBtn').onclick=()=>{queueSave();save();showScreen('notes')};$('#deleteBtn').onclick=deleteActive;pinBtn.onclick=togglePin;titleInput.oninput=queueSave;bodyInput.oninput=queueSave;
$('#plainTypeBtn').onclick=()=>setEditorType('note');$('#listTypeBtn').onclick=()=>setEditorType('list');$('#addChecklistItemBtn').onclick=()=>{const n=activeNote();n.items.push({id:uid(),text:'',done:false});renderChecklist();queueSave()};
$('#searchInput').oninput=renderNotes;$('#filterRow').onclick=e=>{const b=e.target.closest('.chip');if(!b)return;$$('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;renderNotes()};$$('.tab').forEach(t=>t.onclick=()=>showScreen(t.dataset.tab));
$('#reminderRow').onclick=openReminderSheet;$('#closeReminderSheet').onclick=closeReminderSheet;$('#sheetBackdrop').onclick=closeReminderSheet;$('#saveReminderBtn').onclick=saveReminder;$('#removeReminderBtn').onclick=removeReminder;
$('#reminderDateBtn').onclick=toggleCalendar;$('#calendarPrev').onclick=()=>changeCalendarMonth(-1);$('#calendarNext').onclick=()=>changeCalendarMonth(1);$('#todayReminderBtn').onclick=()=>setReminderDay(0);$('#tomorrowReminderBtn').onclick=()=>setReminderDay(1);
$('#themeSegment').onclick=e=>{const b=e.target.closest('button');if(b)setTheme(b.dataset.theme)};$('#textSizeSlider').oninput=e=>{settings.textSize=Number(e.target.value);document.documentElement.style.setProperty('--text-scale',settings.textSize/100);syncSettingsUI();save()};['previewToggle','compactToggle','pinnedFirstToggle','notificationToggle','hideTextToggle'].forEach(id=>$('#'+id).onchange=settingChanged);
$('#exportBtn').onclick=exportBackup;$('#importInput').onchange=e=>{const f=e.target.files?.[0];if(f)importBackup(f);e.target.value=''};matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(settings.theme==='system')setTheme('system')});
// Nest 6: keep the app fixed at phone scale while preserving normal one-finger scrolling.
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});load();
