import * as store from './store.js';


/* ---------- helpers ---------- */
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pad(n){return n<10?'0'+n:''+n}
function fmt(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parse(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2])}
function addDays(s,n){var d=parse(s);d.setDate(d.getDate()+n);return fmt(d)}
function todayStr(){return fmt(new Date())}
function dow(s){return (parse(s).getDay()+6)%7}
function mondayOf(s){return addDays(s,-dow(s))}
var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var DAYS_L=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function longDate(s){var d=parse(s);return DAYS_L[dow(s)]+' '+d.getDate()+' '+MON[d.getMonth()]}
function shortDate(s){var d=parse(s);return d.getDate()+' '+MON[d.getMonth()]}
function monthName(k){var p=k.split('-');return MON[+p[1]-1]+' '+p[0]}
function pct(v){return Math.round(v*100)+'%'}
function rid(){return Math.random().toString(36).slice(2,8)}
function find(a,id){for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null}
function cl(o){return Object.assign({},o)}
function rel(d){var n=Math.round((parse(d)-parse(todayStr()))/864e5);return n===0?'Today':n===1?'Tomorrow':n===-1?'Yesterday':n>0?'In '+n+' days':(-n)+' days ago'}

/* ---------- theme ---------- */
var TH_KEY='day-ledger-theme';
var ICO='style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"';
var SUN='<svg viewBox="0 0 24 24" aria-hidden="true" '+ICO+'><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>';
var MOON='<svg viewBox="0 0 24 24" aria-hidden="true" '+ICO+'><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
function effTheme(){
  var a=document.documentElement.getAttribute('data-theme');if(a==='dark'||a==='light')return a;
  return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
function paintTheme(){var b=$('#theme');if(!b)return;var t=effTheme();b.innerHTML=t==='dark'?SUN:MOON;b.setAttribute('aria-label',t==='dark'?'Switch to light theme':'Switch to dark theme')}
function initTheme(){
  try{var s=localStorage.getItem(TH_KEY);if(s==='dark'||s==='light')document.documentElement.setAttribute('data-theme',s)}catch(e){}
  paintTheme();
  try{window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paintTheme)}catch(e){}
}
function toggleTheme(){var n=effTheme()==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem(TH_KEY,n)}catch(e){}paintTheme()}

/* ---------- state ---------- */
var STARTERS=['Plan the day','Exercise','Deep-work block','Read for 30 minutes','Review the day'];
var REASONS=['Ran out of time','Low energy','Blocked','Priorities changed','Distracted','Forgot'];
var S={tasks:[],logs:{}};
var ui={tab:'today',date:todayStr(),ws:mondayOf(todayStr()),sel:null,range:8,ready:false,name:'',confirm:null,
  user:null,email:'',authMode:'in',blocked:false,prefs:null,push:{supported:false,perm:'default',here:false,busy:false}};

/* ---------- persistence ---------- */
var dirty={},writing={},timer=null,saving=false,fails=0,unsubData=null,lastSynced=true;
function monthKey(date){return 'log-'+date.slice(0,7)}
function monthDays(k){var p=k.slice(4),o={};Object.keys(S.logs).forEach(function(d){if(d.slice(0,7)===p)o[d]=S.logs[d]});return o}
function clean(o){return JSON.parse(JSON.stringify(o))}
function setStatus(t,bad){var el=$('#status');el.textContent=t;el.className='status'+(bad?' bad':'')}
function toast(t){var el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){el.hidden=true},6000)}
function touch(key){dirty[key]=1;setStatus('Saving…');clearTimeout(timer);timer=setTimeout(flush,500)}
function flush(){
  if(saving){timer=setTimeout(flush,300);return}
  var keys=Object.keys(dirty);if(!keys.length)return;
  dirty={};saving=true;keys.forEach(function(k){writing[k]=1});
  var synced=true;
  var job=keys.reduce(function(p,k){return p.then(function(){
    return store.saveDoc(k,k==='tasks'?{items:clean(S.tasks)}:{days:clean(monthDays(k))}).then(function(r){if(!r.synced)synced=false});
  })},Promise.resolve());
  job.then(function(){
    fails=0;setStatus(synced?'Saved':'Saved on this device. Syncs when you are back online.');
  },function(e){
    keys.forEach(function(k){dirty[k]=1});fails++;
    if(e&&e.code==='permission-denied'){ui.blocked=true;render()}
    else if(fails<3){setStatus('Not saved yet. Retrying…',true);clearTimeout(timer);timer=setTimeout(flush,4000)}
    else{setStatus('Not saved. Check your connection and make another change to retry.',true)}
  }).then(function(){keys.forEach(function(k){delete writing[k]});saving=false});
}
function typing(){var a=document.activeElement;return !!(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT'))}
function onSnap(docs){
  docs.forEach(function(d){
    var k=d.id;if(dirty[k]||writing[k])return;
    var v=clean(d.data||{});
    if(k==='tasks'){S.tasks=Array.isArray(v.items)?v.items:[]}
    else if(k.indexOf('log-')===0){
      var p=k.slice(4);
      Object.keys(S.logs).forEach(function(x){if(x.slice(0,7)===p)delete S.logs[x]});
      var days=v.days||{};Object.keys(days).forEach(function(x){S.logs[x]=days[x]});
    }
  });
  ui.ready=true;ui.blocked=false;
  setStatus(Object.keys(dirty).length||saving?'Saving…':'Saved');
  if(!typing())render();
}
function onSnapErr(e){
  ui.ready=true;
  if(e&&e.code==='permission-denied'){ui.blocked=true}
  setStatus(ui.blocked?'This email is not on the allowed list.':'Cannot reach your data. Check your connection.',true);
  render();
}

/* ---------- sign-in ---------- */
function showView(which){
  $('#auth').hidden=which!=='auth';$('#cfg').hidden=which!=='cfg';$('.shell').hidden=which!=='app';
}
function resetState(){
  S.tasks=[];S.logs={};dirty={};ui.ready=false;ui.blocked=false;ui.date=todayStr();ui.ws=mondayOf(todayStr());
  ui.tab='today';ui.sel=null;ui.prefs=null;ui.confirm=null;ui.push={supported:false,perm:'default',here:false,busy:false};
}
function authErr(t,ok){var el=$('#auth-err');el.textContent=t||'';el.hidden=!t;el.className='autherr'+(ok?' ok':'')}
function renderAuth(){
  var up=ui.authMode==='up';
  $('#auth-sub').textContent=up?'Create your own account. Your list stays private to you.':'Sign in to see your days.';
  $('#auth-go').textContent=up?'Create account':'Sign in';
  $('#auth-toggle').textContent=up?'I already have an account':'Create an account';
  $('#auth-pw').setAttribute('autocomplete',up?'new-password':'current-password');
}
function authMsg(e){
  var c=(e&&e.code)||'';
  return ({'auth/invalid-email':'That email address does not look right.','auth/invalid-credential':'The email or password is wrong.',
    'auth/wrong-password':'The email or password is wrong.','auth/user-not-found':'No account with that email. Create one instead.',
    'auth/email-already-in-use':'That email already has an account. Try signing in.','auth/weak-password':'Use at least 6 characters for the password.',
    'auth/too-many-requests':'Too many tries. Wait a few minutes and try again.','auth/network-request-failed':'No connection. Check your internet and try again.'})[c]||'Something went wrong. Please try again.';
}
async function doAuth(){
  var email=$('#auth-email').value.trim(),pw=$('#auth-pw').value;
  if(!email||!pw){authErr('Enter your email and password.');return}
  var go=$('#auth-go');go.disabled=true;authErr('');
  try{if(ui.authMode==='up')await store.signUp(email,pw);else await store.signIn(email,pw)}
  catch(e){authErr(authMsg(e))}
  go.disabled=false;
}
async function doReset(){
  var email=$('#auth-email').value.trim();
  if(!email){authErr('Type your email first, then tap Forgot password.');return}
  try{await store.resetPassword(email);authErr('If that email has an account, a reset link is on its way.',true)}
  catch(e){authErr(authMsg(e))}
}
function start(){
  if(!store.configured()){showView('cfg');return}
  store.onUser(function(u){
    if(unsubData){unsubData();unsubData=null}
    if(!u){ui.user=null;ui.email='';resetState();showView('auth');renderAuth();return}
    ui.user=u;ui.email=u.email||'';ui.name=ui.email;resetState();showView('app');setStatus('Loading…');render();
    unsubData=store.listen(onSnap,onSnapErr);
    loadPrefs();
  });
}

/* ---------- reminders ---------- */
var DEFAULT_PREFS={morning:{on:false,time:'08:00'},evening:{on:false,time:'21:00'},tokens:[]};
function tzNow(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}}
function normPrefs(p){
  var o=Object.assign({},DEFAULT_PREFS,p||{});
  o.morning=Object.assign({},DEFAULT_PREFS.morning,o.morning||{});
  o.evening=Object.assign({},DEFAULT_PREFS.evening,o.evening||{});
  o.tokens=Array.isArray(o.tokens)?o.tokens:[];
  return o;
}
async function loadPrefs(){
  try{
    var p=await store.loadPrefs();
    ui.prefs=normPrefs(p);
    var tz=tzNow();if(p&&ui.prefs.tz!==tz){ui.prefs.tz=tz;store.savePrefs({tz:tz}).catch(function(){})}
    if(!ui.prefs.tz)ui.prefs.tz=tz;
    ui.push.supported=await store.pushSupported();ui.push.perm=store.pushPermission();
    var t=store.myToken();ui.push.here=!!t&&ui.prefs.tokens.indexOf(t)>=0;
    if(ui.push.here)store.onForeground(function(m){var n=(m&&m.notification)||{};toast((n.title?n.title+': ':'')+(n.body||''))});
  }catch(e){ui.prefs=normPrefs(null);ui.prefs.tz=tzNow()}
  if(ui.tab==='tasks'&&!typing())render();
}
var pt=null;
function persistPrefs(){
  clearTimeout(pt);
  pt=setTimeout(function(){
    store.savePrefs({email:ui.email,tz:ui.prefs.tz||tzNow(),morning:ui.prefs.morning,evening:ui.prefs.evening})
      .then(function(){setStatus('Reminder settings saved')},function(){setStatus('Could not save reminder settings.',true)});
  },500);
}
async function turnOnPush(){
  if(ui.push.busy)return;ui.push.busy=true;setStatus('Waiting for permission…');
  try{
    await store.enablePush(ui.email);
    var p=normPrefs(await store.loadPrefs());
    var first=!p.morning.on&&!p.evening.on;
    if(first){p.morning.on=true;p.evening.on=true}
    p.tz=tzNow();ui.prefs=p;
    await store.savePrefs({email:ui.email,tz:p.tz,morning:p.morning,evening:p.evening});
    ui.push.here=true;ui.push.perm='granted';setStatus('Reminders are on for this device');
    store.onForeground(function(m){var n=(m&&m.notification)||{};toast((n.title?n.title+': ':'')+(n.body||''))});
  }catch(e){
    var m=e&&e.message;ui.push.perm=store.pushPermission();
    if(m==='denied')setStatus('Notifications are blocked. Allow them in your browser or phone settings, then try again.',true);
    else if(m==='unsupported')setStatus('This browser cannot show notifications.',true);
    else setStatus('Could not turn on reminders. Check your connection and try again.',true);
  }
  ui.push.busy=false;render();
}
async function turnOffPush(){
  try{await store.disablePush();ui.push.here=false;var t=ui.prefs.tokens;ui.prefs.tokens=t.filter(function(x){return x!==store.myToken()});setStatus('Reminders are off for this device')}
  catch(e){setStatus('Could not turn off reminders.',true)}
  render();
}
async function testPush(){
  try{await store.testNotification();setStatus('Test sent. Look for the notification.')}
  catch(e){setStatus('Could not show a test notification.',true)}
}

/* ---------- day model ---------- */
function viewLog(date){
  var st=S.logs[date],T=todayStr();
  if(st&&(st.closed||date<T))return {items:st.items,closed:!!st.closed,stored:true};
  var base=st?st.items:[],out=[],have={};
  base.forEach(function(i){
    if(i.tid){
      var t=find(S.tasks,i.tid);
      if(!i.done&&!i.reason){if(!t||!t.active)return;i=Object.assign({},i,{title:t.title,kind:t.kind})}
      have[i.tid]=1;
    }
    out.push(i);
  });
  S.tasks.forEach(function(t){if(t.active&&!have[t.id])out.push({id:t.id,tid:t.id,title:t.title,kind:t.kind,done:false,reason:''})});
  return {items:out,closed:false,stored:!!st};
}
function ensureLog(date){
  var L=S.logs[date];
  if(!L){var v=viewLog(date);L=S.logs[date]={items:v.items.map(cl),closed:false};return L}
  if(!L.closed&&date>=todayStr()){L.items=viewLog(date).items.map(cl)}
  return L;
}
function toggle(date,id){var L=ensureLog(date),it=find(L.items,id);if(!it)return;it.done=!it.done;if(it.done)it.reason='';touch(monthKey(date));render()}
function setReason(date,id,txt){var L=ensureLog(date),it=find(L.items,id);if(!it)return;it.reason=txt;touch(monthKey(date))}
function addOneOff(date,title,kind){var L=ensureLog(date);L.items.push({id:'o_'+rid(),tid:null,title:title,kind:kind,done:false,reason:'',pushed:0});touch(monthKey(date));render()}
function carry(date,id){
  var L=ensureLog(date),it=find(L.items,id);if(!it||it.carried)return;
  var nd=addDays(date,1),N=ensureLog(nd);
  N.items.push({id:'o_'+rid(),tid:null,title:it.title,kind:it.kind,done:false,reason:'',pushed:(it.pushed||0)+1});
  it.carried=true;touch(monthKey(date));touch(monthKey(nd));render();
}
function setClosed(date,flag){var L=ensureLog(date);L.closed=flag;touch(monthKey(date));render()}
function addStd(title,kind){S.tasks.push({id:'t'+rid(),title:title,kind:kind,active:true});touch('tasks');render()}

/* ---------- statistics ---------- */
var _demo=null;
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function demoLogs(){
  if(_demo)return _demo;
  var r=mulberry(7),T=todayStr(),o={};
  var names=[['Plan the day','task'],['Exercise','task'],['Deep-work block','goal'],['Read for 30 minutes','task'],['Review the day','task']];
  for(var k=70;k>=1;k--){
    var d=addDays(T,-k),w=dow(d),n=w>=5?3:5,items=[];
    var p=0.5+0.006*(70-k)-(w===4?0.22:0)-(w>=5?0.05:0);
    for(var j=0;j<n;j++){
      var done=r()<p;
      items.push({id:'d'+j,tid:'d'+j,title:names[j][0],kind:names[j][1],done:done,reason:done?'':(r()<0.75?REASONS[Math.floor(r()*REASONS.length)]:'')});
    }
    o[d]={items:items,closed:true};
  }
  _demo=o;return o;
}
function hasReal(){return Object.keys(S.logs).some(function(d){var L=S.logs[d];return L.closed||L.items.some(function(i){return i.done})})}
function src(){return hasReal()?S.logs:demoLogs()}
function dayStat(date,L){
  if(!L||!L.items.length)return null;
  var dn=L.items.filter(function(i){return i.done}).length;
  return {date:date,total:L.items.length,done:dn,rate:dn/L.items.length,count:!!(L.closed||date<todayStr())};
}
function weekly(n,logs){
  var start=addDays(mondayOf(todayStr()),-7*(n-1)),out=[];
  for(var w=0;w<n;w++){
    var ws=addDays(start,7*w),tot=0,dn=0,days=0;
    for(var k=0;k<7;k++){var d=addDays(ws,k),s=dayStat(d,logs[d]);if(s&&s.count){tot+=s.total;dn+=s.done;days++}}
    out.push({ws:ws,total:tot,done:dn,days:days,v:tot?dn/tot:null});
  }
  return out;
}
function rangeDays(n){var T=todayStr(),s=addDays(mondayOf(T),-7*(n-1)),out=[],d=s;while(d<=T){out.push(d);d=addDays(d,1)}return out}
function byWeekday(n,logs){
  var b=[[],[],[],[],[],[],[]];
  rangeDays(n).forEach(function(d){var s=dayStat(d,logs[d]);if(s&&s.count)b[dow(d)].push(s.rate)});
  return b.map(function(a){return {cnt:a.length,v:a.length?a.reduce(function(x,y){return x+y},0)/a.length:null}});
}
function reasonsAndSlips(n,logs){
  var rs={},sl={};
  rangeDays(n).forEach(function(d){
    var L=logs[d],s=dayStat(d,L);if(!s||!s.count)return;
    L.items.forEach(function(i){
      var key=i.title.trim().toLowerCase(),e=sl[key]||(sl[key]={t:i.title,seen:0,miss:0,pushed:0});
      e.seen++;
      if(!i.done){
        e.miss++;if(i.pushed)e.pushed=Math.max(e.pushed,i.pushed);
        var r=(i.reason||'').trim();
        if(r){var rk=r.toLowerCase(),x=rs[rk]||(rs[rk]={t:r,n:0});x.n++}
      }
    });
  });
  var rl=Object.keys(rs).map(function(k){return rs[k]}).sort(function(a,b){return b.n-a.n}).slice(0,6);
  var sll=Object.keys(sl).map(function(k){return sl[k]}).filter(function(e){return e.miss>=2}).sort(function(a,b){return b.miss-a.miss||b.miss/b.seen-a.miss/a.seen}).slice(0,5);
  return {reasons:rl,slips:sll};
}
function months(logs){
  var m={};
  Object.keys(logs).forEach(function(d){
    var s=dayStat(d,logs[d]);if(!s||!s.count)return;
    var k=d.slice(0,7),e=m[k]||(m[k]={k:k,days:0,total:0,done:0});e.days++;e.total+=s.total;e.done+=s.done;
  });
  return Object.keys(m).sort().reverse().slice(0,12).map(function(k){return m[k]});
}
function agg(a){var t=0,d=0;a.forEach(function(w){t+=w.total;d+=w.done});return {t:t,v:t?d/t:null}}
function insight(wk,dw,rs){
  if(!wk.some(function(w){return w.total>0}))return 'Wrap up a day or two and your first numbers will appear here.';
  var a=agg(wk.slice(-4)),b=agg(wk.slice(-8,-4)),s;
  if(!a.t)s='No finished days in the last 4 weeks.';
  else{
    s='Last 4 weeks: '+pct(a.v)+' done';
    if(b.t){var diff=Math.round((a.v-b.v)*100);s+=diff===0?', level with the 4 weeks before.':diff>0?', up '+diff+' points on the 4 weeks before.':', down '+(-diff)+' points on the 4 weeks before.'}
    else s+='.';
  }
  var lo=-1,hi=-1;
  dw.forEach(function(x,i){if(x.cnt>=2){if(lo<0||x.v<dw[lo].v)lo=i;if(hi<0||x.v>dw[hi].v)hi=i}});
  if(lo>=0&&dw[hi].v-dw[lo].v>=0.1)s+=' '+DAYS_L[lo]+' is your weakest day ('+pct(dw[lo].v)+').';
  if(rs.length)s+=' Most common reason: '+rs[0].t.toLowerCase()+'.';
  return s;
}

/* ---------- chart drawing ---------- */
function place(tip,box,x,y){
  var w=tip.offsetWidth,bw=box.clientWidth,l=x+12;
  if(l+w>bw-4)l=x-w-12;if(l<4)l=4;
  var t=y-tip.offsetHeight-10;if(t<0)t=y+14;
  tip.style.left=l+'px';tip.style.top=t+'px';
}
function wireTips(box){
  var tip=$('.tip',box);
  $$('[data-tip]',box).forEach(function(n){
    function show(ev){var r=box.getBoundingClientRect();tip.textContent=n.getAttribute('data-tip');tip.hidden=false;place(tip,box,ev.clientX-r.left,ev.clientY-r.top)}
    n.addEventListener('pointerenter',show);n.addEventListener('pointermove',show);
    n.addEventListener('pointerleave',function(){tip.hidden=true});
  });
}
function drawBars(box,items,o){
  var W=Math.max(280,box.clientWidth||340),H=210,L=36,R=6,T=22,B=40,iw=W-L-R,ih=H-T-B,n=items.length,sl=iw/n,bw=Math.min(32,sl*.46);
  var y=function(v){return T+ih*(1-v)},base=y(0),lowI=-1;
  if(o.low){
    var mn=2,mx=-1,cnt=0;
    items.forEach(function(it,i){if(it.v!=null){cnt++;if(it.v<mn){mn=it.v;lowI=i}if(it.v>mx)mx=it.v}});
    if(cnt<3||mx-mn<0.1)lowI=-1;
  }
  var s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.aria)+'">';
  [0,.5,1].forEach(function(g){s+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(g)+'" y2="'+y(g)+'"/><text x="'+(L-6)+'" y="'+(y(g)+4)+'" text-anchor="end">'+Math.round(g*100)+'%</text>'});
  items.forEach(function(it,i){
    var cx=L+sl*i+sl/2,x=cx-bw/2;
    if(it.sel)s+='<rect class="selbg" x="'+(cx-sl/2+2)+'" y="'+(T-18)+'" width="'+(sl-4)+'" height="'+(H-T+16)+'" rx="8"/>';
    if(it.v==null||it.v===0){
      s+='<line class="none" x1="'+(cx-8)+'" x2="'+(cx+8)+'" y1="'+(base-1)+'" y2="'+(base-1)+'"/>';
      if(it.v===0)s+='<text class="val" x="'+cx+'" y="'+(base-8)+'" text-anchor="middle">0%</text>';
    }else{
      var top=y(it.v),h=base-top,r=Math.min(4,h/2);
      s+='<path class="bar'+(it.prog?' prog':'')+(i===lowI?' low':'')+'" d="M'+x+' '+base+'V'+(top+r)+'Q'+x+' '+top+' '+(x+r)+' '+top+'H'+(x+bw-r)+'Q'+(x+bw)+' '+top+' '+(x+bw)+' '+(top+r)+'V'+base+'Z"/>';
      s+='<text class="val" x="'+cx+'" y="'+(top-6)+'" text-anchor="middle">'+pct(it.v)+'</text>';
    }
    s+='<text class="xl" x="'+cx+'" y="'+(H-22)+'" text-anchor="middle">'+esc(it.label)+'</text><text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle">'+esc(it.sub)+'</text>';
    s+='<rect class="hit" x="'+(cx-sl/2)+'" y="0" width="'+sl+'" height="'+H+'" data-tip="'+esc(it.tip)+'"'+(it.key?' data-a="sel" data-date="'+it.key+'"':'')+'/>';
  });
  box.innerHTML=s+'</svg><div class="tip" hidden></div>';
  wireTips(box);
}
function drawLine(box,pts,o){
  var W=Math.max(280,box.clientWidth||340),H=200,L=36,R=14,T=14,B=28,iw=W-L-R,ih=H-T-B,n=pts.length;
  var X=function(i){return n===1?L+iw/2:L+iw*i/(n-1)},Y=function(v){return T+ih*(1-v)};
  var segs=[],cur=null,last=-1;
  pts.forEach(function(p,i){if(p.v==null){cur=null;return}if(!cur){cur=[];segs.push(cur)}cur.push(i);last=i});
  var s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.aria)+'">';
  [0,.5,1].forEach(function(g){s+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(g)+'" y2="'+Y(g)+'"/><text x="'+(L-6)+'" y="'+(Y(g)+4)+'" text-anchor="end">'+Math.round(g*100)+'%</text>'});
  segs.forEach(function(sg){
    if(sg.length===1){s+='<circle class="dot" cx="'+X(sg[0])+'" cy="'+Y(pts[sg[0]].v)+'" r="3.5"/>';return}
    var d=sg.map(function(i,j){return (j?'L':'M')+X(i)+' '+Y(pts[i].v)}).join('');
    s+='<path class="area" d="'+d+'L'+X(sg[sg.length-1])+' '+Y(0)+'L'+X(sg[0])+' '+Y(0)+'Z"/><path class="lnk" d="'+d+'"/>';
  });
  var k=Math.min(n,W<420?3:(n<=8?4:5)),idx=[];
  for(var t=0;t<k;t++)idx.push(k===1?0:Math.round(t*(n-1)/(k-1)));
  idx.forEach(function(i,j){s+='<text x="'+X(i)+'" y="'+(H-8)+'" text-anchor="'+(j===0?'start':j===idx.length-1?'end':'middle')+'">'+esc(shortDate(pts[i].ws))+'</text>'});
  if(last>=0)s+='<circle class="dot" cx="'+X(last)+'" cy="'+Y(pts[last].v)+'" r="4.5"/>';
  s+='<line class="cross off" y1="'+T+'" y2="'+Y(0)+'"/><circle class="dot off" id="hov" r="4.5"/>';
  s+='<rect class="ov" x="'+L+'" y="'+T+'" width="'+iw+'" height="'+(ih+6)+'"/>';
  box.innerHTML=s+'</svg><div class="tip" hidden></div>';
  var tip=$('.tip',box),cr=$('.cross',box),hv=$('#hov',box),ov=$('.ov',box);
  function mv(ev){
    var r=box.getBoundingClientRect(),px=ev.clientX-r.left,i=Math.round((px-L)/iw*(n-1));
    i=Math.max(0,Math.min(n-1,i));if(n===1)i=0;
    cr.setAttribute('x1',X(i));cr.setAttribute('x2',X(i));cr.classList.remove('off');
    if(pts[i].v!=null){hv.setAttribute('cx',X(i));hv.setAttribute('cy',Y(pts[i].v));hv.classList.remove('off')}else hv.classList.add('off');
    tip.textContent=pts[i].tip;tip.hidden=false;place(tip,box,X(i),Y(pts[i].v==null?0:pts[i].v));
  }
  function lv(){cr.classList.add('off');hv.classList.add('off');tip.hidden=true}
  ov.addEventListener('pointermove',mv);ov.addEventListener('pointerdown',mv);ov.addEventListener('pointerleave',lv);
}
function tbl(head,rows){
  return '<div class="tscroll"><table><thead><tr>'+head.map(function(h){return '<th>'+esc(h)+'</th>'}).join('')+'</tr></thead><tbody>'+
    rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+esc(c)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>';
}

/* ---------- views ---------- */
var ICON_L='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
var ICON_R='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
var ICON_CHK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var DEMO_NOTE='<p class="demo">Sample data, so you can see how this looks. Your own days replace it as soon as you tick something and wrap up a day.</p>';
function loading(el){el.innerHTML='<p class="lede">Loading your days…</p>'}
function ring(r){
  var c=2*Math.PI*34;
  return '<div class="ring" role="img" aria-label="'+Math.round(r*100)+' percent done"><svg viewBox="0 0 84 84" aria-hidden="true"><circle class="rg" cx="42" cy="42" r="34"/><circle class="rv" cx="42" cy="42" r="34" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+(c*(1-r)).toFixed(1)+'" transform="rotate(-90 42 42)"/></svg><span class="pct">'+Math.round(r*100)+'%</span></div>';
}
function rowHTML(i,closed,date){
  var miss=closed&&!i.done,tags='';
  if(!i.tid)tags+='<span class="tag">One-off</span>';
  if(i.pushed)tags+='<span class="tag">Carried over '+i.pushed+(i.pushed===1?' time':' times')+'</span>';
  var h='<li class="row'+(i.done?' done':'')+(miss?' miss':'')+'"><button class="chk" role="checkbox" aria-checked="'+(i.done?'true':'false')+'" aria-label="'+esc(i.title)+'" data-a="toggle" data-id="'+esc(i.id)+'"><span>'+ICON_CHK+'</span></button><div class="rbody"><div class="rtitle">'+esc(i.title)+'</div>'+(tags?'<div class="tags">'+tags+'</div>':'');
  if(miss){
    h+='<div class="why"><div class="chips" role="group" aria-label="Quick reasons">'+REASONS.map(function(r){return '<button class="chip" aria-pressed="'+(i.reason===r?'true':'false')+'" data-a="chip" data-id="'+esc(i.id)+'" data-t="'+esc(r)+'">'+esc(r)+'</button>'}).join('')+'</div>'+
      '<input class="txt" type="text" maxlength="140" placeholder="Why did this slip?" aria-label="Reason for '+esc(i.title)+'" value="'+esc(i.reason||'')+'" data-role="reason" data-id="'+esc(i.id)+'">';
    if(!i.tid){h+=i.carried?'<p class="muted">Carried to the next day.</p>':'<div><button class="btn sm" data-a="carry" data-id="'+esc(i.id)+'">Carry to next day</button></div>'}
    h+='</div>';
  }
  return h+'</div></li>';
}
function listHTML(label,items,closed,date){
  if(!items.length)return '';
  return '<h3 class="sect">'+label+'</h3><ul class="list">'+items.map(function(i){return rowHTML(i,closed,date)}).join('')+'</ul>';
}
function rToday(){
  var el=$('#v-today');if(!ui.ready){loading(el);return}
  var t0=$('#add-title',el),k0=$('#add-kind',el),keepT=t0?t0.value:'',keepK=k0?k0.value:'task';
  var date=ui.date,T=todayStr(),L=viewLog(date),n=L.items.length,done=L.items.filter(function(i){return i.done}).length,r=n?done/n:0;
  var h='<div class="datenav"><button class="iconbtn" data-a="day" data-n="-1" aria-label="Previous day">'+ICON_L+'</button><div class="dtitle"><h2>'+esc(longDate(date))+'</h2><p class="dsub">'+rel(date)+'</p></div><button class="iconbtn" data-a="day" data-n="1" aria-label="Next day">'+ICON_R+'</button></div>';
  if(date!==T)h+='<div><button class="btn sm" data-a="today">Back to today</button></div>';
  if(n){
    var hint=L.closed?(done===n?'Everything done. Day closed.':'Day wrapped up. Note why the rest slipped.'):(L.stored||date>=T?'Tick things off as you go. Wrap up the day to note what slipped.':'Nothing logged for this day yet. Tick what you did and it will count.');
    h+='<div class="card summary">'+ring(r)+'<div class="sumtxt"><p class="big">'+done+' of '+n+' done</p><p class="muted">'+hint+'</p>'+
      (L.closed?'<button class="btn sm" data-a="reopen">Reopen day</button>':'<button class="btn pri" data-a="wrap">Wrap up day</button>')+'</div></div>';
    h+=listHTML('Goals',L.items.filter(function(i){return i.kind==='goal'}),L.closed,date);
    h+=listHTML('Tasks',L.items.filter(function(i){return i.kind!=='goal'}),L.closed,date);
  }else if(!S.tasks.length){
    h+='<div class="card empty"><h3>Start with what you do most days</h3><p class="muted">Pick a few standing tasks. They show up on every day, so you only tick them. Suggestions, change them any time:</p><div class="chips">'+
      STARTERS.map(function(s){return '<button class="chip" data-a="starter" data-t="'+esc(s)+'">'+esc(s)+'</button>'}).join('')+'</div><div><button class="btn sm" data-a="tab" data-tab="tasks">Set up standing tasks</button></div></div>';
  }else{
    h+='<div class="card empty"><h3>Nothing planned for this day</h3><p class="muted">Your standing tasks are all paused. Add a one-off below, or turn some back on under Tasks.</p></div>';
  }
  h+='<form id="add-form" class="addform"><label class="sr" for="add-title">Add for this day</label><input class="txt" id="add-title" type="text" maxlength="120" placeholder="Add something for this day only" autocomplete="off"><label class="sr" for="add-kind">Type</label><select class="sel" id="add-kind"><option value="task">Task</option><option value="goal">Goal</option></select><button class="btn pri" type="submit">Add</button></form>';
  el.innerHTML=h;
  var t1=$('#add-title',el),k1=$('#add-kind',el);t1.value=keepT;k1.value=keepK;
}
function dayDetail(date,logs){
  var L=logs[date];
  if(!L||!L.items.length)return '<div class="card"><h3>'+esc(longDate(date))+'</h3><p class="muted hsub">Nothing logged for this day.</p><button class="btn sm" data-a="open" data-date="'+date+'">Open day</button></div>';
  var items=L.items.slice().sort(function(a,b){return (a.done?1:0)-(b.done?1:0)});
  return '<div class="card"><h3>'+esc(longDate(date))+'</h3><ul class="mini">'+items.map(function(i){
    return '<li><span class="stt '+(i.done?'ok':'no')+'">'+(i.done?'Done':'Missed')+'</span><div>'+esc(i.title)+(!i.done&&i.reason?'<small>'+esc(i.reason)+'</small>':'')+'</div></li>';
  }).join('')+'</ul><p style="margin:12px 0 0"><button class="btn sm" data-a="open" data-date="'+date+'">Open day</button></p></div>';
}
function rWeek(){
  var el=$('#v-week');if(!ui.ready){loading(el);return}
  var logs=src(),demo=!hasReal(),ws=ui.ws,thisWs=mondayOf(todayStr()),days=[],tot=0,dn=0;
  for(var k=0;k<7;k++){var d=addDays(ws,k),st=dayStat(d,logs[d]);days.push({date:d,st:st});if(st&&st.count){tot+=st.total;dn+=st.done}}
  var items=days.map(function(x,i){var st=x.st;return {v:st?st.rate:null,sub:''+parse(x.date).getDate(),label:DAYS[i],key:x.date,sel:ui.sel===x.date,prog:!!(st&&!st.count),
    tip:longDate(x.date)+': '+(st?st.done+' of '+st.total+' done ('+pct(st.rate)+')'+(st.count?'':', in progress'):'nothing logged')}});
  var h='<h2 class="vh">Week</h2>'+(demo?DEMO_NOTE:'');
  h+='<div class="stepper"><button class="iconbtn" data-a="wk" data-n="-1" aria-label="Previous week">'+ICON_L+'</button><div class="mid">'+esc(shortDate(ws)+' – '+shortDate(addDays(ws,6)))+'</div><button class="iconbtn" data-a="wk" data-n="1" aria-label="Next week"'+(ws>=thisWs?' disabled':'')+'>'+ICON_R+'</button></div>';
  h+='<p class="lede">'+(tot?pct(dn/tot)+' done · '+dn+' of '+tot+' items on finished days.':'No finished days in this week yet.')+'</p>';
  h+='<div class="card"><h3>Completion by day</h3><p class="muted hsub">Tap a bar to see that day. Faded bars are days still in progress.</p><div class="chart" id="wk-chart"></div>'+
    '<details><summary>Table view</summary>'+tbl(['Day','Done','Items','Rate'],days.map(function(x){return [longDate(x.date),x.st?x.st.done:'–',x.st?x.st.total:'–',x.st?pct(x.st.rate):'–']}))+'</details></div>';
  if(ui.sel&&ui.sel>=ws&&ui.sel<=addDays(ws,6))h+=dayDetail(ui.sel,logs);
  el.innerHTML=h;
  drawBars($('#wk-chart',el),items,{aria:'Completion rate for each day of the week',low:false});
}
function rTrends(){
  var el=$('#v-trends');if(!ui.ready){loading(el);return}
  var logs=src(),demo=!hasReal(),n=ui.range;
  var wk=weekly(n,logs),dw=byWeekday(n,logs),x=reasonsAndSlips(n,logs),mo=months(logs);
  var h='<h2 class="vh">Trends</h2>'+(demo?DEMO_NOTE:'');
  h+='<div class="seg" role="group" aria-label="Range">'+[[8,'8 weeks'],[26,'6 months'],[52,'1 year']].map(function(r){return '<button aria-pressed="'+(n===r[0]?'true':'false')+'" data-a="range" data-n="'+r[0]+'">'+r[1]+'</button>'}).join('')+'</div>';
  h+='<p class="lede">'+esc(insight(wk,dw,x.reasons))+'</p>';
  if(hasPdf())h+='<div><button class="btn sm" data-a="pdf-trends">Download as PDF</button></div>';
  h+='<div class="card"><h3>Completion by week</h3><p class="muted hsub">Share of items done. Drag across the line for each week.</p><div class="chart" id="tr-line"></div><details><summary>Table view</summary>'+
    tbl(['Week of','Days','Done','Items','Rate'],wk.map(function(w){return [shortDate(w.ws),w.days,w.done,w.total,w.v==null?'–':pct(w.v)]}).reverse())+'</details></div>';
  h+='<div class="card"><h3>Which days run weakest</h3><p class="muted hsub">Average completion by weekday over this range. The lowest day is marked in orange.</p><div class="chart" id="tr-dow"></div></div>';
  h+='<div class="card"><h3>Why things slip</h3><p class="muted hsub">Reasons you gave for unfinished items.</p>';
  if(x.reasons.length){var mxr=x.reasons[0].n;h+='<ul class="hbars">'+x.reasons.map(function(r){return '<li><div class="hl"><span>'+esc(r.t)+'</span><b>'+r.n+'</b></div><div class="trk"><i style="width:'+Math.max(4,r.n/mxr*100)+'%"></i></div></li>'}).join('')+'</ul>'}
  else h+='<p class="muted">No reasons yet. Wrap up a day and note why anything slipped.</p>';
  h+='</div>';
  h+='<div class="card"><h3>Keeps slipping</h3><p class="muted hsub">Items missed on two or more days.</p>';
  if(x.slips.length){h+='<ul class="hbars">'+x.slips.map(function(s){return '<li><div class="hl"><span>'+esc(s.t)+(s.pushed?' <small class="muted">· carried over '+s.pushed+'×</small>':'')+'</span><b>'+s.miss+' of '+s.seen+' days</b></div><div class="trk"><i style="width:'+Math.max(4,s.miss/s.seen*100)+'%"></i></div></li>'}).join('')+'</ul>'}
  else h+='<p class="muted">Nothing is repeating yet. That is a good sign.</p>';
  h+='</div>';
  h+='<div class="card"><h3>By month</h3><p class="muted hsub">Finished days only.</p>'+(mo.length?tbl(['Month','Days','Done','Items','Rate'],mo.map(function(m){return [monthName(m.k),m.days,m.done,m.total,pct(m.done/m.total)]})):'<p class="muted">Months appear after your first wrapped-up day.</p>')+'</div>';
  el.innerHTML=h;
  drawLine($('#tr-line',el),wk.map(function(w){return {ws:w.ws,v:w.v,tip:'Week of '+shortDate(w.ws)+': '+(w.v==null?'no finished days':pct(w.v)+' ('+w.done+' of '+w.total+')')}}),{aria:'Weekly completion rate over time'});
  drawBars($('#tr-dow',el),dw.map(function(d,i){return {v:d.v,label:DAYS[i],sub:d.cnt+(d.cnt===1?' day':' days'),key:null,sel:false,prog:false,tip:DAYS_L[i]+': '+(d.v==null?'no data':pct(d.v)+' average over '+d.cnt+' days')}}),{aria:'Average completion by weekday',low:true});
}
function rTasks(){
  var el=$('#v-tasks');if(!ui.ready){loading(el);return}
  var h='<h2 class="vh">Setup</h2>';
  h+='<h3 class="sect">Standing tasks</h3><p class="lede">These appear on every day. Change them here and open days update. Days you already logged keep their old wording.</p>';
  h+='<form id="std-form" class="addform"><label class="sr" for="std-title">New standing task</label><input class="txt" id="std-title" type="text" maxlength="120" placeholder="New standing task or goal" autocomplete="off"><label class="sr" for="std-kind">Type</label><select class="sel" id="std-kind"><option value="task">Task</option><option value="goal">Goal</option></select><button class="btn pri" type="submit">Add</button></form>';
  if(S.tasks.length){
    h+='<ul class="std">'+S.tasks.map(function(t){
      var cf=ui.confirm===t.id;
      return '<li class="'+(t.active?'':'off-row')+'"><input class="txt" type="text" maxlength="120" value="'+esc(t.title)+'" aria-label="Task name" data-role="std-title" data-id="'+esc(t.id)+'"><div class="ctl">'+
        '<select class="sel" aria-label="Type" data-role="std-kind" data-id="'+esc(t.id)+'"><option value="task"'+(t.kind!=='goal'?' selected':'')+'>Task</option><option value="goal"'+(t.kind==='goal'?' selected':'')+'>Goal</option></select>'+
        '<button class="btn sm" data-a="std-active" data-id="'+esc(t.id)+'" aria-pressed="'+(t.active?'true':'false')+'">'+(t.active?'Active':'Paused')+'</button><span class="grow"></span>'+
        (cf?'<button class="btn sm warn" data-a="std-del" data-id="'+esc(t.id)+'">Delete for good</button><button class="btn sm" data-a="std-cancel">Cancel</button>':'<button class="btn sm" data-a="std-ask" data-id="'+esc(t.id)+'">Delete</button>')+'</div></li>';
    }).join('')+'</ul>';
  }else h+='<p class="muted">No standing tasks yet. Add your first above.</p>';

  h+='<h3 class="sect">Reminders</h3><div class="card"><h3>Notifications on this device</h3><p class="muted hsub">Your reminders are yours alone. Your partner sets up her own on her phone.</p>';
  var P=ui.prefs;
  if(!P){h+='<p class="muted">Loading…</p>'}
  else if(!ui.push.supported){h+='<p class="muted">This browser cannot show notifications. On an iPhone, tap Share, then Add to Home Screen, and open Day Ledger from there.</p>'}
  else if(ui.push.perm==='denied'&&!ui.push.here){h+='<p class="muted">Notifications are blocked for this site. Allow them in your browser or phone settings, then come back and turn reminders on.</p>'}
  else if(!ui.push.here){
    h+='<button class="btn pri" data-a="push-on"'+(ui.push.busy?' disabled':'')+'>Turn on reminders</button><p class="muted" style="margin-top:10px">On an iPhone, first tap Share, then Add to Home Screen, and open Day Ledger from the home screen.</p>';
  }else{
    [['morning','Morning plan'],['evening','Evening wrap-up']].forEach(function(r){
      var c=P[r[0]];
      h+='<div class="prefrow"><label class="chkrow"><input type="checkbox" data-role="pref-on" data-k="'+r[0]+'"'+(c.on?' checked':'')+'><span>'+r[1]+'</span></label><span class="grow"></span><label class="sr" for="t-'+r[0]+'">'+r[1]+' time</label><input class="txt timein" id="t-'+r[0]+'" type="time" value="'+esc(c.time)+'" data-role="pref-time" data-k="'+r[0]+'"></div>';
    });
    h+='<p class="muted" style="margin:6px 0 12px">Time zone: '+esc(P.tz||tzNow())+'. The evening reminder is skipped if you have already wrapped up the day.</p>'+
      '<div class="ctl"><button class="btn sm" data-a="push-test">Send a test here</button><button class="btn sm" data-a="push-off">Turn off on this device</button></div>';
  }
  h+='</div>';

  h+='<h3 class="sect">Account</h3><div class="card"><h3>Your data</h3><p class="muted hsub">Signed in as '+esc(ui.email)+'. Your entries are saved to your account and sync between your devices. Other people who use this app cannot see them.</p>'+
    '<div class="ctl">'+(hasPdf()?'<button class="btn sm" data-a="pdf-tasks">Download tasks as PDF</button>':'')+'<button class="btn sm" data-a="backup">Download a backup</button><button class="btn sm" data-a="signout">Sign out</button></div></div>';
  el.innerHTML=h;
}
function render(){
  $$('.tab').forEach(function(b){b.setAttribute('aria-current',b.getAttribute('data-tab')===ui.tab?'page':'false')});
  ['today','week','trends','tasks'].forEach(function(t){$('#v-'+t).hidden=t!==ui.tab});
  if(ui.blocked){
    $('#v-'+ui.tab).innerHTML='<div class="card empty"><h3>This email is not allowed</h3><p class="muted">'+esc(ui.email)+' is not on the allowed list. Ask the owner to add it to firestore.rules and redeploy, or sign out and use another account.</p><div><button class="btn sm" data-a="signout">Sign out</button></div></div>';
    return;
  }
  ({today:rToday,week:rWeek,trends:rTrends,tasks:rTasks})[ui.tab]();
}

/* ---------- PDF export ---------- */
function hasPdf(){return !!(window.jspdf&&window.jspdf.jsPDF)}
function lat(s){return String(s).replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g,'?')}
var INK=[23,33,28],MUT=[95,109,101],ACC=[15,107,92],MISS=[180,72,31],GRD=[220,226,221];
function pdfStart(title,sub,note){
  var d=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),o={d:d,y:18,M:16,W:210};
  d.setFont('helvetica','bold');d.setFontSize(20);d.setTextColor(INK[0],INK[1],INK[2]);d.text(lat(title),o.M,o.y);
  o.y+=7;d.setFont('helvetica','normal');d.setFontSize(10);d.setTextColor(MUT[0],MUT[1],MUT[2]);d.text(lat(sub),o.M,o.y);
  if(note){o.y+=5;d.setTextColor(MISS[0],MISS[1],MISS[2]);d.text(lat(note),o.M,o.y)}
  o.y+=4;d.setDrawColor(GRD[0],GRD[1],GRD[2]);d.setLineWidth(.3);d.line(o.M,o.y,o.W-o.M,o.y);o.y+=9;
  return o;
}
function need(o,h){if(o.y+h>284){o.d.addPage();o.y=18}}
function pHead(o,t){need(o,18);var d=o.d;d.setFont('helvetica','bold');d.setFontSize(12);d.setTextColor(INK[0],INK[1],INK[2]);d.text(lat(t),o.M,o.y);o.y+=7}
function pPara(o,t,sz,col){
  var d=o.d,c=col||[44,58,50];d.setFont('helvetica','normal');d.setFontSize(sz||10);d.setTextColor(c[0],c[1],c[2]);
  d.splitTextToSize(lat(t),o.W-2*o.M).forEach(function(l){need(o,6);d.text(l,o.M,o.y);o.y+=5});o.y+=4;
}
function pTable(o,head,rows,wd){
  var d=o.d;need(o,16);
  function line(cells,bold,col){
    var x=o.M;d.setFont('helvetica',bold?'bold':'normal');d.setFontSize(9);d.setTextColor(col[0],col[1],col[2]);
    cells.forEach(function(c,i){d.text(lat(c),x,o.y);x+=wd[i]});
    o.y+=2;d.setDrawColor(GRD[0],GRD[1],GRD[2]);d.setLineWidth(.2);d.line(o.M,o.y,o.W-o.M,o.y);o.y+=5;
  }
  line(head,true,MUT);
  rows.forEach(function(r){if(o.y>280){d.addPage();o.y=18;line(head,true,MUT)}line(r,false,INK)});
  o.y+=5;
}
function pGrid(o,x0,w,y0,h){
  var d=o.d;d.setLineWidth(.2);d.setFont('helvetica','normal');d.setFontSize(8);d.setTextColor(MUT[0],MUT[1],MUT[2]);
  [0,.5,1].forEach(function(g){var yy=y0+h*(1-g);d.setDrawColor(GRD[0],GRD[1],GRD[2]);d.line(x0,yy,x0+w,yy);d.text(Math.round(g*100)+'%',x0-2,yy+1,{align:'right'})});
}
function pLine(o,pts){
  var d=o.d,x0=o.M+10,w=o.W-2*o.M-12,h=44,n=pts.length;need(o,h+18);var y0=o.y+3;
  pGrid(o,x0,w,y0,h);
  var X=function(i){return n===1?x0+w/2:x0+w*i/(n-1)},Y=function(v){return y0+h*(1-v)},prev=-1,last=-1;
  d.setDrawColor(ACC[0],ACC[1],ACC[2]);d.setLineWidth(.7);
  pts.forEach(function(p,i){if(p.v==null){prev=-1;return}if(prev>=0)d.line(X(prev),Y(pts[prev].v),X(i),Y(p.v));prev=i;last=i});
  if(last>=0){d.setFillColor(ACC[0],ACC[1],ACC[2]);d.circle(X(last),Y(pts[last].v),1.3,'F')}
  d.setFont('helvetica','normal');d.setFontSize(8);d.setTextColor(MUT[0],MUT[1],MUT[2]);
  var k=Math.min(n,n<=8?4:5);
  for(var t=0;t<k;t++){var i=k===1?0:Math.round(t*(n-1)/(k-1));d.text(lat(shortDate(pts[i].ws)),X(i),y0+h+5,{align:t===0?'left':t===k-1?'right':'center'})}
  o.y=y0+h+13;
}
function pBars(o,items){
  var d=o.d,x0=o.M+10,w=o.W-2*o.M-12,h=40,n=items.length,sl=w/n,bw=Math.min(14,sl*.5);need(o,h+20);var y0=o.y+6;
  pGrid(o,x0,w,y0,h);
  var mn=2,mx=-1,cnt=0,lo=-1;
  items.forEach(function(it,i){if(it.v!=null){cnt++;if(it.v<mn){mn=it.v;lo=i}if(it.v>mx)mx=it.v}});
  if(cnt<3||mx-mn<.1)lo=-1;
  items.forEach(function(it,i){
    var cx=x0+sl*i+sl/2;
    if(it.v!=null){
      var bh=Math.max(it.v*h,.4),c=i===lo?MISS:ACC;d.setFillColor(c[0],c[1],c[2]);d.rect(cx-bw/2,y0+h-bh,bw,bh,'F');
      d.setFontSize(8);d.setTextColor(INK[0],INK[1],INK[2]);d.text(pct(it.v),cx,y0+h-bh-1.5,{align:'center'});
    }
    d.setFontSize(8);d.setTextColor(MUT[0],MUT[1],MUT[2]);d.text(lat(it.label),cx,y0+h+5,{align:'center'});
  });
  o.y=y0+h+13;
}
function pBarList(o,rows){
  var d=o.d,w=o.W-2*o.M;
  rows.forEach(function(r){
    need(o,11);d.setFont('helvetica','normal');d.setFontSize(10);d.setTextColor(INK[0],INK[1],INK[2]);d.text(lat(r.t).slice(0,70),o.M,o.y);
    d.setFont('helvetica','bold');d.text(lat(r.right),o.W-o.M,o.y,{align:'right'});
    d.setFillColor(GRD[0],GRD[1],GRD[2]);d.rect(o.M,o.y+2,w,1.6,'F');d.setFillColor(ACC[0],ACC[1],ACC[2]);d.rect(o.M,o.y+2,Math.max(1.5,w*r.f),1.6,'F');o.y+=10;
  });
  o.y+=3;
}
function pdfFinish(o){
  var d=o.d,N=d.getNumberOfPages();
  for(var i=1;i<=N;i++){d.setPage(i);d.setFont('helvetica','normal');d.setFontSize(8);d.setTextColor(MUT[0],MUT[1],MUT[2]);d.text('Day Ledger · page '+i+' of '+N,o.W/2,291,{align:'center'})}
  return d;
}
function pdfTrends(){
  var logs=src(),demo=!hasReal(),n=ui.range,T=todayStr();
  var wk=weekly(n,logs),dw=byWeekday(n,logs),x=reasonsAndSlips(n,logs),mo=months(logs);
  var rl={8:'last 8 weeks',26:'last 6 months',52:'last year'}[n];
  var o=pdfStart('Day Ledger · Trends',(ui.name?ui.name+' · ':'')+rl+' · created '+shortDate(T)+' '+parse(T).getFullYear(),demo?'Sample data, not real entries.':'');
  pPara(o,insight(wk,dw,x.reasons),11);
  pHead(o,'Completion by week');pLine(o,wk);
  pHead(o,'Average completion by weekday');pBars(o,dw.map(function(v,i){return {v:v.v,label:DAYS[i]}}));
  pHead(o,'Why things slip');
  if(x.reasons.length){var top=x.reasons[0].n;pBarList(o,x.reasons.map(function(r){return {t:r.t,right:''+r.n,f:r.n/top}}))}
  else pPara(o,'No reasons recorded in this range.',10,MUT);
  pHead(o,'Keeps slipping');
  if(x.slips.length)pBarList(o,x.slips.map(function(s){return {t:s.t+(s.pushed?' (carried over '+s.pushed+'x)':''),right:s.miss+' of '+s.seen+' days',f:s.miss/s.seen}}));
  else pPara(o,'Nothing missed on two or more days.',10,MUT);
  pHead(o,'By month');
  if(mo.length)pTable(o,['Month','Days','Done','Items','Rate'],mo.map(function(m){return [monthName(m.k),''+m.days,''+m.done,''+m.total,pct(m.done/m.total)]}),[50,25,25,25,25]);
  else pPara(o,'No finished days yet.',10,MUT);
  if(n<=26){pHead(o,'Week by week');pTable(o,['Week of','Days','Done','Items','Rate'],wk.slice().reverse().map(function(w){return [shortDate(w.ws),''+w.days,''+w.done,''+w.total,w.v==null?'-':pct(w.v)]}),[50,25,25,25,25])}
  return pdfFinish(o);
}
function pdfTasks(){
  var T=todayStr(),o=pdfStart('Day Ledger · Standing tasks',(ui.name?ui.name+' · ':'')+'created '+shortDate(T)+' '+parse(T).getFullYear(),'');
  var goals=S.tasks.filter(function(t){return t.kind==='goal'}),tasks=S.tasks.filter(function(t){return t.kind!=='goal'});
  pPara(o,S.tasks.length?S.tasks.length+' standing items, '+S.tasks.filter(function(t){return t.active}).length+' active.':'No standing tasks yet.',11);
  [['Goals',goals],['Tasks',tasks]].forEach(function(g){
    if(!g[1].length)return;pHead(o,g[0]);
    pTable(o,['Name','Status'],g[1].map(function(t){return [t.title.slice(0,80),t.active?'Active':'Paused']}),[140,30]);
  });
  return pdfFinish(o);
}
function saveBlob(blob,name){
  try{
    var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(u)},4000);setStatus('Downloaded '+name);
  }catch(e){setStatus('Could not create the file.',true)}
}
function savePdf(d,name){saveBlob(d.output('blob'),name)}
function exportPdf(kind){
  if(!hasPdf()){setStatus('PDF export is not available here.',true);return}
  var d;try{d=kind==='trends'?pdfTrends():pdfTasks()}catch(e){setStatus('Could not build the PDF.',true);return}
  savePdf(d,'day-ledger-'+kind+'-'+todayStr()+'.pdf');
}
function backup(){
  saveBlob(new Blob([JSON.stringify({exported:todayStr(),tasks:S.tasks,logs:S.logs},null,2)],{type:'application/json'}),'day-ledger-backup-'+todayStr()+'.json');
}

/* ---------- events ---------- */
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-a]');if(!b)return;
  var a=b.getAttribute('data-a'),id=b.getAttribute('data-id'),nn=+b.getAttribute('data-n');
  if(a==='tab'){ui.tab=b.getAttribute('data-tab');render();window.scrollTo(0,0)}
  else if(a==='toggle')toggle(ui.date,id);
  else if(a==='chip'){var L=ensureLog(ui.date),it=find(L.items,id);if(it){setReason(ui.date,id,it.reason===b.getAttribute('data-t')?'':b.getAttribute('data-t'));render()}}
  else if(a==='carry')carry(ui.date,id);
  else if(a==='wrap'){setClosed(ui.date,true)}
  else if(a==='reopen')setClosed(ui.date,false);
  else if(a==='day'){ui.date=addDays(ui.date,nn);render()}
  else if(a==='today'){ui.date=todayStr();render()}
  else if(a==='starter'){addStd(b.getAttribute('data-t'),'task')}
  else if(a==='wk'){ui.ws=addDays(ui.ws,7*nn);ui.sel=null;render()}
  else if(a==='sel'){ui.sel=b.getAttribute('data-date');render()}
  else if(a==='open'){ui.date=b.getAttribute('data-date');ui.tab='today';render();window.scrollTo(0,0)}
  else if(a==='range'){ui.range=nn;render()}
  else if(a==='std-active'){var t=find(S.tasks,id);if(t){t.active=!t.active;touch('tasks');render()}}
  else if(a==='std-ask'){ui.confirm=id;render()}
  else if(a==='std-cancel'){ui.confirm=null;render()}
  else if(a==='std-del'){S.tasks=S.tasks.filter(function(t){return t.id!==id});ui.confirm=null;touch('tasks');render()}
  else if(a==='theme')toggleTheme();
  else if(a==='pdf-trends')exportPdf('trends');
  else if(a==='pdf-tasks')exportPdf('tasks');
  else if(a==='backup')backup();
  else if(a==='signout'){store.logOut()}
  else if(a==='push-on')turnOnPush();
  else if(a==='push-off')turnOffPush();
  else if(a==='push-test')testPush();
  else if(a==='auth-toggle'){ui.authMode=ui.authMode==='in'?'up':'in';authErr('');renderAuth()}
  else if(a==='auth-reset')doReset();
});
document.addEventListener('submit',function(e){
  e.preventDefault();
  var f=e.target;
  if(f.id==='auth-form'){doAuth()}
  else if(f.id==='add-form'){var t=$('#add-title').value.trim();if(!t)return;addOneOff(ui.date,t,$('#add-kind').value);var i=$('#add-title');if(i){i.value='';i.focus()}}
  else if(f.id==='std-form'){var s=$('#std-title').value.trim();if(!s)return;addStd(s,$('#std-kind').value);var j=$('#std-title');if(j){j.value='';j.focus()}}
});
document.addEventListener('input',function(e){
  var t=e.target,r=t.getAttribute&&t.getAttribute('data-role');if(!r)return;
  if(r==='reason')setReason(ui.date,t.getAttribute('data-id'),t.value);
  else if(r==='std-title'){var s=find(S.tasks,t.getAttribute('data-id'));if(s){s.title=t.value;touch('tasks')}}
});
document.addEventListener('change',function(e){
  var t=e.target,r=t.getAttribute&&t.getAttribute('data-role');if(!r)return;
  if(r==='pref-on'&&ui.prefs){ui.prefs[t.getAttribute('data-k')].on=t.checked;persistPrefs();return}
  if(r==='pref-time'&&ui.prefs){if(/^\d\d:\d\d$/.test(t.value)){ui.prefs[t.getAttribute('data-k')].time=t.value;persistPrefs()}return}
  var s=find(S.tasks,t.getAttribute('data-id'));if(!s)return;
  if(r==='std-kind'){s.kind=t.value;touch('tasks')}
  else if(r==='std-title'&&!t.value.trim()){s.title='Untitled task';t.value=s.title;touch('tasks')}
});
var lastW=window.innerWidth,rt=null;
window.addEventListener('resize',function(){
  clearTimeout(rt);
  rt=setTimeout(function(){if(window.innerWidth!==lastW){lastW=window.innerWidth;if(ui.tab==='week'||ui.tab==='trends')render()}},150);
});

initTheme();
start();
