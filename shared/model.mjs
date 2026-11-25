export const VERSION = 1;
export const COMMANDS = [
  { id:'basic', key:'KeyA', icon:'Icon_Normal.webp' },
  { id:'dodge', key:'KeyS', icon:'Icon_Evade.webp' },
  { id:'switch', key:'KeyD', icon:'Icon_Switch.webp' },
  { id:'ex', key:'KeyW', icon:'Icon_SpecialReady.webp' },
  { id:'special', key:'KeyE', icon:'Icon_SpecialReady.webp', grayscale:true },
  { id:'ultimate', key:'KeyQ', icon:'Icon_UltimateReady.webp' },
  { id:'chain', key:'KeyZ', icon:'Icon_QTE.webp' },
];
export const DEFAULT_STYLE = { x:.025, y:.4, scale:1, gap:16, background:.68, holdColor:'#c8f461', previousOpacity:.4, nextOpacity:.4, animation:true, transitionMs:180 };
export const fpsValue = fps => fps.n / fps.d;
export const frameTime = (frame,fps) => frame * fps.d / fps.n;
export const timeFrame = (seconds,fps) => Math.max(0,Math.round(seconds * fpsValue(fps)));
export const clone = value => structuredClone(value);
export const connectorSymbol = event => event?.connector==='plus'?'+':'→';
export const commandIcon = event => '/assets/commands/'+(event.command==='switch'&&event.switchVariant==='yellow'?'Icon_SwitchYellow.webp':COMMANDS.find(c=>c.id===event.command).icon);
export function newProject(catalog=[]) {
  return { version:VERSION, title:'', video:null, fps:{n:60,d:1}, characters:catalog.map(c=>({...c})), party:catalog.slice(0,3).map(c=>c.id), events:[], switchVariant:'white', style:{...DEFAULT_STYLE}, keys:Object.fromEntries(COMMANDS.map(c=>[c.id,c.key])), holdThreshold:280 };
}
export function sortedEvents(events) { return [...events].sort((a,b)=>a.frame-b.frame||a.order-b.order||a.id.localeCompare(b.id)); }
export function mergeCatalog(project,catalog){
  const known=new Set(project.characters.map(c=>c.id));
  return {...project,characters:[...project.characters,...catalog.filter(c=>!known.has(c.id)).map(clone)]};
}
export function groupEvents(events) {
  const groups=[];
  for(const event of sortedEvents(events)) {
    const last=groups.at(-1);
    if(!last||last.characterId!==event.characterId||last.events.length===3||event.breakBefore) groups.push({ characterId:event.characterId, events:[event] });
    else last.events.push(event);
  }
  return groups;
}
export function currentAt(events,frame) { return sortedEvents(events).filter(e=>e.frame<=frame).at(-1)||null; }
export function splitInfo(events,id) {
  const groups=groupEvents(events), groupIndex=groups.findIndex(g=>g.events.some(e=>e.id===id));
  const group=groups[groupIndex], position=group?.events.findIndex(e=>e.id===id)??-1;
  return { groups, group, groupIndex, position, canSplit:position>0 };
}
function keepBoundaries(groups) { for(const group of groups) group.events[0].breakBefore=true; }
export function splitBefore(events,id) {
  const info=splitInfo(events,id);
  if(!info.canSplit)return false;
  keepBoundaries(info.groups);
  info.group.events[info.position].breakBefore=true;
  return true;
}
export function mergeInfo(events,id) {
  const info=splitInfo(events,id), previous=info.groups[info.groupIndex-1];
  return {...info, previous, canMerge:info.position===0&&!!previous&&previous.characterId===info.group.characterId&&previous.events.length+info.group.events.length<=3};
}
export function mergePrevious(events,id) {
  const info=mergeInfo(events,id);
  if(!info.canMerge)return false;
  keepBoundaries(info.groups);
  info.group.events[0].breakBefore=false;
  return true;
}
export function deleteEvent(events,id) {
  const info=splitInfo(events,id);if(!info.group)return false;
  keepBoundaries(info.groups);
  if(info.position===0&&info.group.events[1])info.group.events[1].breakBefore=true;
  events.splice(events.findIndex(e=>e.id===id),1);
  return true;
}
const finite = (value,min,max) => typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const integer = (value,min,max) => Number.isSafeInteger(value)&&value>=min&&value<=max;
const string = (value,max) => typeof value==='string'&&value.length<=max;
export function validateProject(input) {
  if(!input||input.version!==VERSION||!string(input.title,200))throw new Error('invalidProject');
  const p=clone(input);
  p.switchVariant??='white';if(!['white','yellow'].includes(p.switchVariant))throw new Error('invalidProject');
  if(!p.fps||!integer(p.fps.n,1,240000)||!integer(p.fps.d,1,10000)||!finite(fpsValue(p.fps),1,240))throw new Error('invalidProject');
  if(!Array.isArray(p.characters)||p.characters.length>300||!Array.isArray(p.events)||p.events.length>20000||!Array.isArray(p.party)||p.party.length>3)throw new Error('invalidProject');
  const ids=new Set();
  for(const c of p.characters) {
    if(!string(c.id,80)||!c.id||ids.has(c.id)||!c.names||!Object.values(c.names).every(n=>string(n,100))||!string(c.portrait,3_000_000))throw new Error('invalidProject');
    if(!/^\/assets\/portraits\/[\w.-]+\.(png|webp|jpe?g)$/i.test(c.portrait)&&!/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(c.portrait))throw new Error('invalidProject');
    ids.add(c.id);
  }
  if(new Set(p.party).size!==p.party.length||!p.party.every(id=>ids.has(id)))throw new Error('invalidProject');
  const eventIds=new Set();
  for(const e of p.events) {
    e.connector??='arrow';
    if(!['arrow','plus'].includes(e.connector))throw new Error('invalidProject');
    e.switchVariant??='white';if(!['white','yellow'].includes(e.switchVariant))throw new Error('invalidProject');
    if(!string(e.id,80)||!e.id||eventIds.has(e.id)||!integer(e.frame,0,20_736_000)||!integer(e.endFrame,e.frame,20_736_000)||!integer(e.order,0,1e9)||!ids.has(e.characterId)||!COMMANDS.some(c=>c.id===e.command)||!string(e.note,160)||typeof e.hold!=='boolean'||typeof e.breakBefore!=='boolean')throw new Error('invalidProject');
    eventIds.add(e.id);
  }
  if(p.video!==null) {
    if(!p.video||!string(p.video.name,500)||!finite(p.video.duration,0.01,86400)||!integer(p.video.width,16,7680)||!integer(p.video.height,16,4320))throw new Error('invalidProject');
    p.video={ name:p.video.name, duration:p.video.duration, width:p.video.width, height:p.video.height, size:integer(p.video.size,0,1e13)?p.video.size:0, fingerprint:string(p.video.fingerprint,128)?p.video.fingerprint:'' };
    const frames=Math.ceil(p.video.duration*fpsValue(p.fps));
    if(p.events.some(e=>e.frame>=frames||e.endFrame>=frames))throw new Error('invalidProject');
  }
  p.style={...DEFAULT_STYLE,...p.style};
  for(const [key,min,max] of [['x',0,.8],['y',.1,.85],['scale',.4,2],['gap',0,80],['background',0,1],['previousOpacity',0,1],['nextOpacity',0,1]])if(!finite(p.style[key],min,max))throw new Error('invalidProject');
  if(!/^#[a-f\d]{6}$/i.test(p.style.holdColor))throw new Error('invalidProject');
  if(typeof p.style.animation!=='boolean'||!finite(p.style.transitionMs,0,500))throw new Error('invalidProject');
  if(!integer(p.holdThreshold,100,2000)||!p.keys||!COMMANDS.every(c=>/^Key[A-Z]$/.test(p.keys[c.id]))||new Set(Object.values(p.keys)).size!==COMMANDS.length)throw new Error('invalidProject');
  return p;
}
export function timecode(frame,fps) {
  const rate=fpsValue(fps),seconds=Math.floor(frame/rate),fraction=Math.floor(frame-seconds*rate+1e-6);
  return [Math.floor(seconds/60),seconds%60,fraction].map(v=>String(v).padStart(2,'0')).join(':');
}
