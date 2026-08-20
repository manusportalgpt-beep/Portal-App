const apps = [
  { name:'Проводник', icon:'▣', tone:'folder', path:'home' },
  { name:'Настройки', icon:'⚙', tone:'purple', action:'settings' },
  { name:'Браузер', icon:'◉', tone:'blue', url:'https://www.bing.com' },
  { name:'Терминал', icon:'>_', tone:'dark' },
  { name:'Заметки', icon:'✎', tone:'yellow' },
  { name:'Фото', icon:'✦', tone:'pink' },
  { name:'Музыка', icon:'♫', tone:'orange' },
  { name:'Календарь', icon:'□', tone:'red' },
  { name:'Калькулятор', icon:'＋', tone:'green' },
  { name:'Помощь', icon:'?', tone:'gray' }
];
const desktopItems = [
  {name:'Этот компьютер', icon:'▣', tone:'blue', path:'home'},
  {name:'Документы', icon:'▤', tone:'folder', path:'documents'},
  {name:'Загрузки', icon:'↓', tone:'blue', path:'downloads'},
  {name:'Рабочий стол', icon:'▧', tone:'folder', path:'desktop'},
  {name:'Корзина', icon:'⌫', tone:'gray', path:'home'},
  {name:'Windows 12', icon:'⊞', tone:'purple', action:'settings'}
];
const $ = s => document.querySelector(s);
let settings = {theme:'violet', language:'ru', reduceMotion:false, showIcons:true, showClock:true, iconSize:'comfortable', autoHide:false, centerApps:true};

function openOverlay(node){ node.classList.remove('hidden'); node.animate([{opacity:0,transform:'translate(-50%,12px)'},{opacity:1,transform:'translate(-50%,0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'}); }
function closeOverlay(node){ node.classList.add('hidden'); }
function toast(text){ const node=$('#toast'); node.textContent=text; node.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>node.classList.remove('show'),2200); }
function launch(item){
  if(item.action==='settings'){closeOverlay($('#start-menu'));openOverlay($('#settings-panel'));return;}
  if(item.path){window.windows12.shell.openPath(item.path);return;}
  if(item.url){window.windows12.shell.openExternal(item.url);return;}
  toast(`${item.name} готов к запуску в Windows`);
}
function iconMarkup(item, desktop=false){
  return `<button class="${desktop?'desktop-icon':'app-item'}" data-item="${item.name}">${desktop?`<span class="desktop-icon-symbol ${item.tone||''}">${item.icon}</span><span class="desktop-icon-label">${item.name}</span>`:`<span class="app-icon ${item.tone||''}">${item.icon}</span><b>${item.name}</b>`}</button>`;
}
function renderDesktop(){
  const left=desktopItems.slice(0,3), right=desktopItems.slice(3);
  $('#desktop-left').innerHTML=left.map(i=>iconMarkup(i,true)).join('');
  $('#desktop-right').innerHTML=right.map(i=>iconMarkup(i,true)).join('');
  document.querySelectorAll('.desktop-icon').forEach(el=>el.addEventListener('dblclick',()=>launch(desktopItems.find(i=>i.name===el.dataset.item))));
  document.querySelectorAll('.desktop-icon').forEach(el=>el.addEventListener('click',()=>el.classList.add('selected')));
}
function renderApps(filter=''){
  $('#app-grid').innerHTML=apps.filter(a=>a.name.toLowerCase().includes(filter.toLowerCase())).map(iconMarkup).join('');
  $('#app-grid').querySelectorAll('.app-item').forEach(el=>el.addEventListener('click',()=>launch(apps.find(i=>i.name===el.dataset.item))));
}
function renderPinned(){
  $('#task-pinned').innerHTML=apps.slice(0,6).map(item=>`<button class="task-app" title="${item.name}" data-task="${item.name}"><span class="task-icon ${item.tone||''}">${item.icon}</span></button>`).join('');
  $('#task-pinned').querySelectorAll('.task-app').forEach(el=>el.addEventListener('click',()=>launch(apps.find(i=>i.name===el.dataset.task))));
}
function applySettings(){
  document.body.classList.toggle('theme-red',settings.theme==='red');
  document.body.classList.toggle('reduce-motion',settings.reduceMotion);
  document.body.classList.toggle('icons-hidden',settings.showIcons===false);
  document.body.classList.toggle('clock-hidden',settings.showClock===false);
  document.body.classList.toggle('taskbar-autohide',settings.autoHide===true);
  document.body.classList.toggle('taskbar-left',settings.centerApps===false);
  document.body.classList.toggle('icon-compact',settings.iconSize==='compact');
  document.body.classList.toggle('icon-large',settings.iconSize==='large');
  document.querySelectorAll('.theme-option').forEach(el=>el.classList.toggle('active',el.dataset.theme===settings.theme));
  $('#icons-toggle').checked=settings.showIcons!==false; $('#clock-toggle').checked=settings.showClock!==false;
  $('#autohide-toggle').checked=settings.autoHide===true; $('#center-toggle').checked=settings.centerApps!==false; $('#icon-size').value=settings.iconSize||'comfortable';
}
async function persist(patch){settings=await window.windows12.settings.write({...settings,...patch});applySettings();}
function updateClock(){
  const locale=settings.language==='en'?'en-US':'ru-RU', now=new Date();
  $('#clock').textContent=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(now);
  $('#hero-clock').textContent=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(now);
  $('#hero-date').textContent=new Intl.DateTimeFormat(locale,{weekday:'long',day:'numeric',month:'long'}).format(now);
  $('#tray-date').textContent=new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
}

$('#task-start').addEventListener('click',()=>$('#start-menu').classList.contains('hidden')?openOverlay($('#start-menu')):closeOverlay($('#start-menu')));
$('#close-start').addEventListener('click',()=>closeOverlay($('#start-menu')));
$('#open-settings').addEventListener('click',()=>{closeOverlay($('#start-menu'));openOverlay($('#settings-panel'));});
$('#close-settings').addEventListener('click',()=>closeOverlay($('#settings-panel')));
$('#minimize').addEventListener('click',()=>window.windows12.window.minimize());
$('#close').addEventListener('click',()=>window.windows12.window.close());
$('#app-search').addEventListener('input',e=>renderApps(e.target.value));
$('.theme-options').addEventListener('click',e=>{const el=e.target.closest('.theme-option');if(el)persist({theme:el.dataset.theme});});
$('#icons-toggle').addEventListener('change',e=>persist({showIcons:e.target.checked}));
$('#clock-toggle').addEventListener('change',e=>persist({showClock:e.target.checked}));
$('#autohide-toggle').addEventListener('change',e=>persist({autoHide:e.target.checked}));
$('#center-toggle').addEventListener('change',e=>persist({centerApps:e.target.checked}));
$('#icon-size').addEventListener('change',e=>persist({iconSize:e.target.value}));
$('.language-switch').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('.language-switch .active').classList.remove('active');b.classList.add('active');persist({language:b.textContent==='English'?'en':'ru'});updateClock();toast(b.textContent==='English'?'English mode is active':'Русский язык активен');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeOverlay($('#start-menu'));closeOverlay($('#settings-panel'));}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openOverlay($('#start-menu'));$('#app-search').focus();}});
(async function init(){
  settings={...settings,...await window.windows12.settings.read()};
  renderDesktop();renderApps();renderPinned();applySettings();updateClock();setInterval(updateClock,30000);
  if(!localStorage.getItem('windows12-first-run-v2')){$('#onboarding').classList.remove('hidden');setTimeout(()=>{$('#onboarding').classList.add('hidden');localStorage.setItem('windows12-first-run-v2','done');},3300);}
})();
