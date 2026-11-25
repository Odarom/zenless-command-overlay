import { COMMANDS,commandIcon,newProject,clone,validateProject,mergeCatalog,groupEvents,sortedEvents,currentAt,splitInfo,splitBefore,mergeInfo,mergePrevious,deleteEvent,fpsValue,timeFrame,frameTime,timecode } from '/shared/model.mjs';
import { paint,loadImages,invalidatePaint } from '/shared/painter.mjs';
import { translate,languages } from './i18n.mjs';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('overlay'),ctx=canvas.getContext('2d'),pending=new Map();
let project,boot,preferences,language='ko',mediaId=null,selected=null,currentCharacter=null,frame=0,images=new Map(),hits=[],recording=true,undo=[],redo=[],jobId=null,saveTimer,messageKey='',imageGeneration=0,uploading=false,exportTimer,usingProxy=false;
const t=key=>translate(language,key),totalFrames=()=>project.video?Math.ceil(project.video.duration*fpsValue(project.fps)):1,selectedEvent=()=>project.events.find(e=>e.id===selected);
const image=(src,portrait=false)=>{const img=document.createElement('img');img.src=src;img.alt='';img.className='mini'+(portrait?' portrait-mini':'');return img;};
const name=c=>c?.names[language]||c?.names.ko||c?.names.en||c?.id||'';
const editable=target=>target?.matches('input:not([type=range]),textarea,select,[contenteditable=true]');
function renderVolume(){const muted=video.muted||video.volume===0;$('mute').textContent=t(muted?'unmute':'mute');$('mute').setAttribute('aria-pressed',String(muted));$('volume').value=Math.round(video.volume*100);$('volume-value').value=Math.round(video.volume*100)+'%';}
function message(key,error=false){messageKey=key;$('message').textContent=t(key);$('message').className=error?'error':'';}
function failure(error){console.error(error);message(error.message&&translate(language,error.message)!==error.message?error.message:'failed',true);}
async function api(path,body){const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Overlay-Token':boot.token},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'failed');return data;}
function snapshot(){return {project:clone(project),selected,frame,mediaId};}
function commit(change,{partial=false}={}){undo.push(snapshot());if(undo.length>100)undo.shift();redo=[];change();invalidatePaint(project);if(partial){renderEditor();renderList();draw();$('undo').disabled=false;$('redo').disabled=true;}else render();autosave();}
function autosave(){clearTimeout(saveTimer);$('save-state').textContent='';saveTimer=setTimeout(()=>saveNow().catch(()=>{$('save-state').textContent=t('saveFailed');}),600);}
let saveQueue=Promise.resolve();
function saveNow(){clearTimeout(saveTimer);const envelope={project:clone(project),mediaId,selected,frame};saveQueue=saveQueue.catch(()=>{}).then(()=>api('/api/autosave',envelope)).then(()=>{$('save-state').textContent=t('autosaved');});return saveQueue;}
async function savePreferences(){preferences.language=language;try{await api('/api/preferences',preferences);}catch(error){failure(error);}}
function applyLanguage(){document.documentElement.lang=language;document.title=t('app')+' v'+boot.version;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-placeholder]').forEach(el=>el.placeholder=t(el.dataset.placeholder));document.querySelectorAll('[data-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.label)));$('language').value=language;$('prev').setAttribute('aria-label',t('previousFrame'));$('next').setAttribute('aria-label',t('nextFrame'));if(messageKey)$('message').textContent=t(messageKey);renderVolume();}
async function refreshImages(){const generation=++imageGeneration;const loaded=await loadImages(project);if(generation===imageGeneration){images=loaded;draw();}}
function render(){
  invalidatePaint(project);
  applyLanguage();
  $('empty').hidden=!!mediaId;$('video-name').textContent=project.video?.name||'';$('seek').max=Math.max(0,totalFrames()-1);
  for(const id of ['play','prev','next','seek','record'])$(id).disabled=!mediaId||uploading;
  $('record').textContent=t(recording?'recordOn':'recordOff');$('record').setAttribute('aria-pressed',String(recording));$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
  $('play').textContent=t(video.paused?'play':'pause');$('export').disabled=!project.video||!project.events.length||!!jobId;
  renderParty();renderKeys();renderEditor();renderList();renderSettings();draw();
  $('tools-state').textContent=t(boot.tools.ffmpeg&&boot.tools.ffprobe&&boot.tools.browser?'toolsReady':'missingTools');
}
function draw(displayProject=project){
  if(!project)return;
  $('time').textContent=timecode(frame,project.fps);$('seek').value=frame;
  if(project.video&&images.size)hits=paint(ctx,displayProject,frame,images);else{ctx.clearRect(0,0,canvas.width,canvas.height);hits=[];}
  drawTimeline();
}
function drawTimeline(){
  const timeline=$('timeline'),rect=timeline.getBoundingClientRect(),dpr=devicePixelRatio||1;
  if(timeline.width!==Math.round(rect.width*dpr)){timeline.width=Math.round(rect.width*dpr);timeline.height=36*dpr;}
  const c=timeline.getContext('2d'),w=timeline.width,h=timeline.height;c.clearRect(0,0,w,h);c.fillStyle='#343a47';c.fillRect(0,h/2,w,2*dpr);
  const max=Math.max(1,totalFrames()-1),bounds=new Set(groupEvents(project.events).map(g=>g.events[0].id));
  for(const e of project.events){const x=e.frame/max*w;c.fillStyle=e.id===selected?'#cef36c':bounds.has(e.id)?'#c7cad3':'#778296';c.fillRect(x-1*dpr,h*(bounds.has(e.id)?.1:.3),2*dpr,h*(bounds.has(e.id)?.8:.4));}
  c.fillStyle='#cef36c';c.fillRect(frame/max*w-1*dpr,0,2*dpr,h);
}
let fitPending=false;
function scheduleFit(){if(fitPending)return;fitPending=true;requestAnimationFrame(()=>{fitPending=false;fitWorkspace();});}
function fitWorkspace(){
  const stage=$('stage'),workspace=document.querySelector('.workspace'),aside=document.querySelector('aside');
  if(innerWidth<=1050||innerHeight<640){stage.style.width='';aside.style.maxHeight='';return;}
  const rect=stage.getBoundingClientRect(),controlsBottom=$('settings').getBoundingClientRect().top;
  const controlsHeight=controlsBottom-rect.bottom;
  const height=Math.max(140,innerHeight-(rect.top+scrollY)-controlsHeight-28);
  const ratio=project?.video?project.video.width/project.video.height:16/9;
  const width=Math.min(workspace.clientWidth,Math.floor(height*ratio));
  if(stage.style.width!==width+'px')stage.style.width=width+'px';
  aside.style.maxHeight=Math.max(300,innerHeight-(document.querySelector('main').getBoundingClientRect().top+scrollY)-24)+'px';
  drawTimeline();
}
function renderParty(){
  if(!project.party.includes(currentCharacter))currentCharacter=project.party[0]||null;
  $('party-slots').replaceChildren();
  for(let slot=0;slot<3;slot++){
    const id=project.party[slot],character=project.characters.find(c=>c.id===id),wrap=document.createElement('span');wrap.className='party-slot';
    const button=document.createElement('button');button.type='button';button.disabled=!character;button.setAttribute('aria-label',`${slot+1} ${name(character)}`);button.setAttribute('aria-pressed',String(id===currentCharacter));if(character)button.append(image(character.portrait,true));button.append(document.createTextNode(slot+1));button.onclick=()=>{finishAll();currentCharacter=id;renderParty();};
    const select=document.createElement('select');select.setAttribute('aria-label',`${t('choose')} ${slot+1}`);const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=t('choose');select.append(placeholder);
    for(const c of project.characters){const option=document.createElement('option');option.value=c.id;option.textContent=name(c);option.disabled=project.party.includes(c.id)&&c.id!==id;select.append(option);}select.value=id||'';
    select.onchange=()=>{finishAll();commit(()=>{const next=[...project.party];if(select.value)next[slot]=select.value;else next.splice(slot,1);project.party=next.filter(Boolean);currentCharacter=select.value||project.party[0]||null;});};wrap.append(button,select);$('party-slots').append(wrap);
  }
  const old=$('party-presets').value;$('party-presets').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=t('loadParty');$('party-presets').append(empty);
  for(const preset of preferences.parties){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;$('party-presets').append(option);}$('party-presets').value=old;
  $('delete-party').disabled=!$('party-presets').value;
}
function renderKeys(){
  $('command-keys').replaceChildren();
  for(const command of COMMANDS){const button=document.createElement('button');button.type='button';button.disabled=!mediaId||!currentCharacter||!recording;button.setAttribute('aria-label',t(command.id));const key=document.createElement('kbd');key.textContent=project.keys[command.id].replace('Key','');const icon=image(commandIcon({command:command.id,switchVariant:project.switchVariant}));if(command.grayscale)icon.style.filter='grayscale(1)';button.append(key,icon,document.createTextNode(t(command.id)));
    button.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();button.focus();button.setPointerCapture(e.pointerId);startInput('pointer'+e.pointerId,command.id);};button.onpointerup=e=>finishInput('pointer'+e.pointerId);button.onpointercancel=e=>finishInput('pointer'+e.pointerId);
    button.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();e.stopPropagation();startInput('button'+command.id,command.id);}};button.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();finishInput('button'+command.id);}};
    $('command-keys').append(button);
  }
}
function selectEvent(id){finishAll();video.pause();selected=id;renderEditor();renderList();drawTimeline();autosave();}
let pickKey='';
function renderEditor(){
  const event=selectedEvent(),info=splitInfo(project.events,selected),merge=mergeInfo(project.events,selected),nextPickKey=language+'|'+selected+'|'+(info.group?.events.map(e=>e.id+':'+e.command+':'+e.switchVariant).join(',')||'');
  $('selection-summary').textContent=event?`${timecode(event.frame,project.fps)} · ${name(project.characters.find(c=>c.id===event.characterId))} · ${t(event.command)}`:t('noSelection');
  if(nextPickKey!==pickKey){pickKey=nextPickKey;$('group-picks').replaceChildren();for(const e of info.group?.events||[]){const button=document.createElement('button');button.type='button';button.dataset.eventId=e.id;button.setAttribute('aria-pressed',String(e.id===selected));button.append(image(commandIcon(e)),document.createTextNode(t(e.command)));button.onclick=()=>selectEvent(e.id);$('group-picks').append(button);}}
  for(const id of ['note','hold','event-frame','event-end','delete','go-selected'])$(id).disabled=!event;
  if(document.activeElement!==$('note'))$('note').value=event?.note||'';$('hold').checked=!!event?.hold;$('event-frame').value=event?.frame??'';$('event-frame').max=totalFrames()-1;$('event-end').value=event?.endFrame??'';$('event-end').max=totalFrames()-1;$('event-end').disabled=!event?.hold;
  $('split').disabled=!info.canSplit;$('merge').disabled=!merge.canMerge;$('split-hint').textContent=event?t(info.canSplit?'splitHint':'splitFirst'):'';
  $('connector').value=event?.connector||'arrow';$('connector').disabled=!event||info.position<=0;
  $('switch-variant-label').hidden=event?.command!=='switch';$('switch-variant').value=event?.switchVariant||'white';
}
function renderList(){
  const list=$('event-list'),scroll=list.scrollTop;list.replaceChildren();$('event-count').textContent=project.events.length;
  if(!project.events.length){list.textContent=t('emptyEvents');return;}
  const boundaries=new Set(groupEvents(project.events).map(g=>g.events[0].id));
  for(const event of sortedEvents(project.events)){const button=document.createElement('button');button.type='button';button.className='event-row'+(boundaries.has(event.id)?' row-boundary':'');button.dataset.eventId=event.id;button.setAttribute('aria-pressed',String(event.id===selected));
    const time=document.createElement('time');time.textContent=timecode(event.frame,project.fps);const character=project.characters.find(c=>c.id===event.characterId),text=document.createElement('span');text.textContent=t(event.command)+(event.hold?' Hold':'')+(event.note?' · '+event.note:'');button.append(time,image(character.portrait,true),image(commandIcon(event)),text);button.onpointerdown=e=>{if(e.button===0){e.preventDefault();$('note').blur();selectEvent(event.id);}};button.onclick=()=>selectEvent(event.id);list.append(button);
  }list.scrollTop=scroll;
}
function renderSettings(){
  $('record-switch-variant').value=project.switchVariant||'white';
  document.querySelectorAll('[data-style]').forEach(input=>{const key=input.dataset.style;input.value=key==='holdColor'?project.style[key]:project.style[key]*100;});$('hold-threshold').value=project.holdThreshold;
  const value=`${project.fps.n}/${project.fps.d}`;if(![...$('fps').options].some(o=>o.value===value)){const o=document.createElement('option');o.value=value;o.textContent=fpsValue(project.fps).toFixed(3);$('fps').append(o);}$('fps').value=value;
  $('animation').checked=project.style.animation;$('transition-ms').value=project.style.transitionMs;$('transition-ms').disabled=!project.style.animation;
  $('key-settings').replaceChildren();for(const command of COMMANDS){const label=document.createElement('label');label.append(document.createTextNode(t(command.id)));const select=document.createElement('select');select.dataset.command=command.id;for(let code=65;code<=90;code++){const option=document.createElement('option');option.value='Key'+String.fromCharCode(code);option.textContent=String.fromCharCode(code);select.append(option);}select.value=project.keys[command.id];select.onchange=()=>{if(Object.entries(project.keys).some(([id,key])=>id!==command.id&&key===select.value)){message('duplicateKey',true);select.value=project.keys[command.id];return;}commit(()=>{project.keys[command.id]=select.value;});};label.append(select);$('key-settings').append(label);}
}
function seekTo(value){finishAll();video.pause();frame=Math.max(0,Math.min(totalFrames()-1,Math.round(value)));if(mediaId)video.currentTime=Math.min(project.video.duration-.0001,frameTime(frame,project.fps)+.00001);draw();$('play').textContent=t('play');autosave();}
function videoFrame(){if(!mediaId||!project?.video)return;frame=Math.min(totalFrames()-1,timeFrame(video.currentTime,project.fps));draw();}
function startInput(identity,command){
  if(pending.has(identity)||!recording||!mediaId||!currentCharacter)return;
  videoFrame();const before=snapshot();undo.push(before);if(undo.length>100)undo.shift();redo=[];
  const event={id:crypto.randomUUID(),order:Math.max(0,...project.events.map(e=>e.order))+1,frame,endFrame:frame,characterId:currentCharacter,command,note:'',hold:false,breakBefore:false,connector:'arrow',switchVariant:command==='switch'?(project.switchVariant||'white'):'white'};project.events.push(event);selected=event.id;
  invalidatePaint(project);const entry={id:event.id,started:performance.now(),timer:setTimeout(()=>{const e=project.events.find(e=>e.id===event.id);if(e){e.hold=true;invalidatePaint(project);renderEditor();draw();}},project.holdThreshold)};pending.set(identity,entry);renderEditor();renderList();draw();$('undo').disabled=false;
}
function finishInput(identity){const entry=pending.get(identity);if(!entry)return;clearTimeout(entry.timer);pending.delete(identity);const event=project.events.find(e=>e.id===entry.id);if(event){videoFrame();event.hold=performance.now()-entry.started>=project.holdThreshold;event.endFrame=Math.max(event.frame,frame);invalidatePaint(project);renderEditor();renderList();draw();autosave();message('added');}}
function finishAll(){for(const key of [...pending.keys()])finishInput(key);}
async function loadVideo(){
  finishAll();video.pause();uploading=true;render();message('uploading');
  try{
    const metadata=await api('/api/media/pick',{});if(metadata.cancelled){message('cancelled');return;}
    if(project.video&&project.events.length&&project.video.fingerprint!==metadata.fingerprint&&!confirm(t('changedVideo')))return;
    const candidate=clone(project);candidate.video={name:metadata.name,size:metadata.size,width:metadata.width,height:metadata.height,duration:metadata.duration,fingerprint:metadata.fingerprint};
    if(!project.video){const rate=fpsValue(metadata.fps),common=[{n:60,d:1},{n:60000,d:1001},{n:50,d:1},{n:30,d:1},{n:30000,d:1001},{n:25,d:1},{n:24,d:1},{n:24000,d:1001}];candidate.fps=common.find(f=>Math.abs(fpsValue(f)-rate)<.005)||{n:Math.round(rate*1000),d:1000};}
    validateProject(candidate);undo=[];redo=[];project=candidate;mediaId=metadata.id;boot.media=boot.media.filter(m=>m.id!==metadata.id);boot.media.push(metadata);frame=0;usingProxy=false;configureVideo();render();await refreshImages();autosave();message(metadata.vfr?'vfr':'videoLoaded');
  }catch(error){failure(error);}finally{uploading=false;render();}
}
function configureVideo(){
  $('proxy-box').hidden=!mediaId;$('proxy-error').hidden=true;$('original').hidden=!usingProxy;
  if(!mediaId){video.removeAttribute('src');video.load();return;}
  video.src='/api/media/'+mediaId+'/raw?preview='+(usingProxy?'1':'0');video.playbackRate=Number($('speed').value);const ratio=Math.min(1,1280/project.video.width,720/project.video.height);canvas.width=Math.round(project.video.width*ratio);canvas.height=Math.round(project.video.height*ratio);$('stage').style.aspectRatio=`${project.video.width}/${project.video.height}`;
  const wanted=frame;video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(project.video.duration-.0001,frameTime(wanted,project.fps));draw();},{once:true});
}
function download(data,filename,type){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function restoreHistory(from,to){finishAll();video.pause();if(!from.length)return;to.push(snapshot());const before=from.pop(),changed=mediaId!==before.mediaId;project=before.project;selected=before.selected;frame=before.frame;mediaId=before.mediaId;if(changed)configureVideo();else if(mediaId)video.currentTime=frameTime(frame,project.fps);await refreshImages();render();autosave();}
function removeSelected(){finishAll();video.pause();const event=selectedEvent();if(!event)return;const order=sortedEvents(project.events),index=order.findIndex(e=>e.id===selected),next=order[index+1]?.id||order[index-1]?.id||null;commit(()=>{deleteEvent(project.events,selected);selected=next;});message('deleted');}
async function beginExport(){
  finishAll();video.pause();if(!project.video||!project.events.length){message('nothingToExport',true);return;}
  if(project.video.duration>300&&!confirm(t('exportLarge')))return;
  try{validateProject(project);await saveNow();const result=await api('/api/exports',{project,format:$('format').value,crop:$('crop').checked});jobId=result.id;$('download-export').hidden=true;$('open-output').hidden=true;$('export-progress').hidden=false;$('cancel-export').hidden=false;render();pollExport();}catch(error){failure(error);}
}
async function pollExport(){
  if(!jobId)return;
  try{const job=await api('/api/exports/'+jobId);$('export-progress').value=job.progress;$('export-state').textContent=t('exportPreparing')+` · ${job.progress}% (${job.doneFrames}/${job.totalFrames})`;
    if(job.status==='running'){exportTimer=setTimeout(pollExport,600);return;}
    const finishedId=jobId;jobId=null;$('cancel-export').hidden=true;$('export').disabled=false;
    if(job.status==='complete'){$('export-state').textContent=t('complete')+(job.dimensions?` ${job.dimensions.width} × ${job.dimensions.height}`:'')+(job.format==='png'?' '+t('pngResult'):'');$('open-output').hidden=false;$('open-output').onclick=()=>api('/api/exports/'+finishedId+'/open',{}).catch(failure);if(job.output){$('download-export').hidden=false;$('download-export').href=job.output;}}
    else{$('export-state').textContent=job.status==='cancelled'?t('cancelled'):t(job.error||'failed');if(job.status==='failed')console.error(job.error);}
  }catch(error){failure(error);jobId=null;$('cancel-export').hidden=true;render();}
}
function bind(){
  let availableUpdate=null,installingUpdate=false;
  const updateDialog=$('update-dialog'),updateStatus=$('update-status'),installButton=$('install-update'),closeUpdate=$('close-update');
  updateDialog.oncancel=e=>{if(installingUpdate)e.preventDefault();};closeUpdate.onclick=()=>{if(!installingUpdate)updateDialog.close();};
  $('check-update').onclick=async()=>{if(installingUpdate)return;availableUpdate=null;installButton.hidden=true;$('release-link').hidden=true;updateStatus.textContent=t('updateChecking');updateDialog.showModal();try{const result=await api('/api/update/check',{});updateStatus.textContent=`v${boot.version} → v${result.latest}\n${t(result.available?'updateAvailable':'updateCurrent')}`;$('release-link').href=result.url;$('release-link').hidden=false;if(result.available&&result.installable){availableUpdate=result.latest;installButton.hidden=false;}}catch(error){updateStatus.textContent=t('updateUnavailable');}};
  installButton.onclick=async()=>{if(!availableUpdate||installingUpdate)return;installingUpdate=true;installButton.disabled=true;closeUpdate.disabled=true;try{finishAll();video.pause();await saveNow();updateStatus.textContent=t('updateInstalling');await api('/api/update/install',{version:availableUpdate});updateStatus.textContent=t('updateRestart');for(let attempt=0;attempt<45;attempt++){await new Promise(resolve=>setTimeout(resolve,1000));try{const r=await fetch('/api/health',{cache:'no-store'});if(r.ok&&(await r.json()).version===availableUpdate){location.reload();return;}}catch{}}updateStatus.textContent=t('updateRestartFailed');}catch(error){updateStatus.textContent=t(['updateBusy','invalidUpdate','updateUnavailable'].includes(error.message)?error.message:'updateUnavailable');}finally{installingUpdate=false;installButton.disabled=false;closeUpdate.disabled=false;}};
  $('open-video').onclick=loadVideo;
  video.volume=typeof preferences.volume==='number'?Math.max(0,Math.min(1,preferences.volume)):.6;video.muted=preferences.muted===true;renderVolume();
  $('volume').oninput=()=>{video.volume=Number($('volume').value)/100;if(video.volume>0)video.muted=false;renderVolume();};$('volume').onchange=()=>{preferences.volume=video.volume;preferences.muted=video.muted;savePreferences();};
  $('mute').onclick=()=>{if(video.volume===0){video.volume=.6;video.muted=false;}else video.muted=!video.muted;renderVolume();preferences.volume=video.volume;preferences.muted=video.muted;savePreferences();};video.addEventListener('volumechange',renderVolume);
  $('play').onclick=()=>{if(!mediaId)return;finishAll();if(video.paused)video.play().catch(failure);else video.pause();};video.onplay=()=>$('play').textContent=t('pause');video.onpause=()=>{$('play').textContent=t('play');autosave();};video.ontimeupdate=videoFrame;video.onseeked=videoFrame;video.onerror=()=>{$('proxy-box').hidden=!mediaId;$('proxy-error').hidden=false;};
  if('requestVideoFrameCallback'in video){const update=()=>{videoFrame();video.requestVideoFrameCallback(update);};video.requestVideoFrameCallback(update);}
  $('prev').onclick=()=>seekTo(frame-1);$('next').onclick=()=>seekTo(frame+1);$('speed').onchange=()=>{finishAll();video.playbackRate=Number($('speed').value);};$('record').onclick=()=>{finishAll();recording=!recording;render();};
  $('seek').oninput=e=>seekTo(Number(e.target.value));
  let dragging=false;function timelineSeek(e){const rect=$('timeline').getBoundingClientRect();seekTo((e.clientX-rect.left)/rect.width*(totalFrames()-1));}$('timeline').onpointerdown=e=>{if(!mediaId)return;dragging=true;$('timeline').setPointerCapture(e.pointerId);timelineSeek(e);};$('timeline').onpointermove=e=>{if(dragging)timelineSeek(e);};$('timeline').onpointerup=()=>dragging=false;$('timeline').onpointercancel=()=>dragging=false;
  canvas.onclick=e=>{const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*canvas.width,y=(e.clientY-rect.top)/rect.height*canvas.height,hit=hits.find(h=>x>=h.x&&x<=h.x+h.width&&y>=h.y&&y<=h.y+h.height);if(hit)selectEvent(hit.id);};
  $('note').onchange=()=>{const event=selectedEvent();if(event)commit(()=>event.note=$('note').value,{partial:true});};$('hold').onchange=()=>{const event=selectedEvent();if(event)commit(()=>event.hold=$('hold').checked,{partial:true});};
  $('connector').onchange=()=>{const event=selectedEvent();if(event&&splitInfo(project.events,event.id).position>0)commit(()=>event.connector=$('connector').value,{partial:true});};
  $('switch-variant').onchange=()=>{const event=selectedEvent();if(event?.command==='switch')commit(()=>event.switchVariant=$('switch-variant').value,{partial:true});};
  $('record-switch-variant').onchange=()=>commit(()=>project.switchVariant=$('record-switch-variant').value);
  $('event-frame').onchange=()=>{const event=selectedEvent(),value=Number($('event-frame').value);if(!event)return;if(!Number.isSafeInteger(value)||value<0||value>=totalFrames()){renderEditor();return;}commit(()=>{const delta=value-event.frame;event.frame=value;event.endFrame=Math.max(value,Math.min(totalFrames()-1,event.endFrame+delta));});};
  $('event-end').onchange=()=>{const event=selectedEvent(),value=Number($('event-end').value);if(!event)return;if(!Number.isSafeInteger(value)||value<event.frame||value>=totalFrames()){renderEditor();return;}commit(()=>event.endFrame=value);};
  $('go-selected').onclick=()=>{const event=selectedEvent();if(event)seekTo(event.frame);};$('delete').onclick=removeSelected;$('undo').onclick=()=>restoreHistory(undo,redo).catch(failure);$('redo').onclick=()=>restoreHistory(redo,undo).catch(failure);
  $('split').onclick=()=>{finishAll();video.pause();if(!splitInfo(project.events,selected).canSplit)return;commit(()=>splitBefore(project.events,selected));message('splitDone');};$('merge').onclick=()=>{finishAll();video.pause();if(!mergeInfo(project.events,selected).canMerge)return;commit(()=>mergePrevious(project.events,selected));message('merged');};
  $('save-project').onclick=()=>{finishAll();try{validateProject(project);download(JSON.stringify(project,null,2),(project.title||project.video?.name.replace(/\.[^.]+$/,'')||'project')+'.zzzoverlay','application/json');message('projectSaved');}catch(error){failure(error);}};
  $('open-project').onclick=()=>$('project-file').click();$('project-file').onchange=async()=>{try{finishAll();video.pause();const file=$('project-file').files[0];if(!file)return;if(file.size>12_000_000)throw new Error('tooLarge');const next=mergeCatalog(validateProject(JSON.parse(await file.text())),boot.catalog),linked=boot.media.find(m=>m.fingerprint===next.video?.fingerprint);project=next;selected=null;mediaId=linked?.id||null;frame=0;undo=[];redo=[];configureVideo();await refreshImages();render();autosave();message(mediaId?'videoLoaded':'projectOpened');}catch(error){failure(error);}finally{$('project-file').value='';}};
  $('new').onclick=async()=>{if(project.events.length&&!confirm(t('newConfirm')))return;finishAll();video.pause();await saveNow().catch(()=>{});project=newProject([...boot.catalog,...preferences.customCharacters]);selected=null;frame=0;mediaId=null;undo=[];redo=[];configureVideo();await refreshImages();render();autosave();};
  $('language').onchange=()=>{language=$('language').value;savePreferences();render();};
  $('save-party').onclick=()=>{if(!project.party.length)return;const partyName=prompt(t('partyName'));if(!partyName?.trim())return;preferences.parties.push({id:crypto.randomUUID(),name:partyName.trim().slice(0,100),members:[...project.party]});savePreferences();renderParty();message('partySaved');};
  $('party-presets').onchange=()=>{const preset=preferences.parties.find(p=>p.id===$('party-presets').value);if(preset)commit(()=>{project.party=preset.members.filter(id=>project.characters.some(c=>c.id===id));currentCharacter=project.party[0]||null;});else $('delete-party').disabled=true;};
  $('delete-party').onclick=()=>{preferences.parties=preferences.parties.filter(p=>p.id!==$('party-presets').value);savePreferences();renderParty();};
  $('add-portrait').onclick=()=>$('portrait-dialog').showModal();$('close-portrait').onclick=()=>$('portrait-dialog').close();$('portrait-form').onsubmit=async e=>{e.preventDefault();try{const file=$('portrait-file').files[0],label=$('portrait-name').value.trim();if(!file||!label)return;if(file.size>2_000_000||!['image/png','image/webp','image/jpeg'].includes(file.type))throw new Error('imageLimit');const portrait=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const character={id:'custom-'+crypto.randomUUID(),names:Object.fromEntries(languages.map(l=>[l,label])),portrait};commit(()=>project.characters.push(character));preferences.customCharacters.push(character);await refreshImages();await savePreferences();$('portrait-dialog').close();$('portrait-form').reset();}catch(error){failure(error);}};
  document.querySelectorAll('[data-style]').forEach(input=>{const key=input.dataset.style,get=()=>key==='holdColor'?input.value:Number(input.value)/100;input.oninput=()=>draw({...project,style:{...project.style,[key]:get()}});input.onchange=()=>commit(()=>project.style[key]=get());});
  $('hold-threshold').onchange=()=>{const value=Number($('hold-threshold').value);if(Number.isSafeInteger(value)&&value>=100&&value<=2000)commit(()=>project.holdThreshold=value);else renderSettings();};
  $('animation').onchange=()=>commit(()=>project.style.animation=$('animation').checked);
  $('transition-ms').onchange=()=>{const value=Number($('transition-ms').value);if(Number.isFinite(value)&&value>=0&&value<=500)commit(()=>project.style.transitionMs=value);else renderSettings();};
  $('fps').onchange=()=>{finishAll();video.pause();const [n,d]=$('fps').value.split('/').map(Number),old=project.fps,next={n,d},max=project.video?Math.ceil(project.video.duration*fpsValue(next))-1:0;commit(()=>{for(const event of project.events){event.frame=Math.min(max,timeFrame(frameTime(event.frame,old),next));event.endFrame=Math.min(max,Math.max(event.frame,timeFrame(frameTime(event.endFrame,old),next)));}frame=Math.min(max,timeFrame(frameTime(frame,old),next));project.fps=next;});};
  $('proxy').onclick=async()=>{if(!mediaId)return;finishAll();video.pause();$('proxy').disabled=true;message('loading');try{await api('/api/media/'+mediaId+'/proxy',{});usingProxy=true;configureVideo();message('videoLoaded');}catch(error){failure(error);}finally{$('proxy').disabled=false;}};
  $('original').onclick=()=>{usingProxy=false;configureVideo();};
  $('clear-previews').onclick=async()=>{finishAll();video.pause();$('clear-previews').disabled=true;if(usingProxy){usingProxy=false;configureVideo();await new Promise(r=>setTimeout(r,250));}try{const result=await api('/api/previews/clear',{});const fresh=await api('/api/bootstrap');boot.media=fresh.media;message(result.failed?'previewDeleteFailed':'previewsCleared',!!result.failed);}catch(error){failure(error);}finally{$('clear-previews').disabled=false;}};
  $('export').onclick=beginExport;$('cancel-export').onclick=()=>{if(jobId)api('/api/exports/'+jobId+'/cancel',{}).catch(failure);};
  window.addEventListener('keydown',e=>{
    if(e.target===$('volume')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.code))return;
    if(editable(e.target)||$('portrait-dialog').open)return;
    if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();restoreHistory(e.shiftKey?redo:undo,e.shiftKey?undo:redo).catch(failure);return;}
    if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
    if(e.code==='Delete'){e.preventDefault();removeSelected();return;}
    if(e.code==='Space'){e.preventDefault();$('play').click();return;}if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();seekTo(frame+(e.code==='ArrowLeft'?-1:1));return;}
    if(/^Digit[123]$/.test(e.code)){finishAll();currentCharacter=project.party[Number(e.code.at(-1))-1]||currentCharacter;renderParty();return;}
    const command=COMMANDS.find(c=>project.keys[c.id]===e.code);if(command){e.preventDefault();startInput('key'+e.code,command.id);}
  });
  window.addEventListener('keyup',e=>finishInput('key'+e.code));window.addEventListener('blur',finishAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)finishAll();});window.addEventListener('resize',scheduleFit);document.addEventListener('fullscreenchange',scheduleFit);
  const observer=new ResizeObserver(scheduleFit);for(const target of ['header','#message','.workspace','.transport','.party-line','#command-keys','#proxy-box'])observer.observe(document.querySelector(target));
}
async function init(){
  boot=await api('/api/bootstrap');preferences={language:'ko',parties:[],customCharacters:[],...boot.preferences};language=languages.includes(preferences.language)?preferences.language:'ko';project=newProject([...boot.catalog,...preferences.customCharacters]);
  if(boot.autosave){try{project=validateProject(boot.autosave.project);selected=project.events.some(e=>e.id===boot.autosave.selected)?boot.autosave.selected:null;frame=Math.min(totalFrames()-1,boot.autosave.frame||0);mediaId=boot.media.some(m=>m.id===boot.autosave.mediaId)?boot.autosave.mediaId:null;}catch(error){console.error(error);}}
  project=mergeCatalog(project,boot.catalog);currentCharacter=project.party[0]||null;bind();configureVideo();await refreshImages();render();if(project.video&&!mediaId)message('relink');
}
init().catch(failure);
