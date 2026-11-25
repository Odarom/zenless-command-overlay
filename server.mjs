import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir,readFile,writeFile,rename,stat,unlink,readdir } from 'node:fs/promises';
import { randomUUID,randomBytes } from 'node:crypto';
import { resolve,join,extname,basename,sep } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { findTools,probe,fingerprint,run } from './lib/media.mjs';
import { exportOverlay } from './lib/exporter.mjs';
import { validateProject,fpsValue } from './shared/model.mjs';
import { mediaPath,describeLinkedVideo,pickLocalVideo } from './lib/local-media.mjs';
import { version,checkUpdate,downloadUpdate } from './lib/update.mjs';
const appRoot=import.meta.dirname;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska'};
const validId=id=>/^[a-f\d-]{36}$/i.test(id);
async function jsonFile(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}}
async function atomic(path,data){const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(data,null,2));await rename(temp,path);}
function browserOpen(url){const child=spawn(process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open',process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url],{windowsHide:true,detached:true,stdio:'ignore',shell:false});child.on('error',()=>{});child.unref();}
export async function createApp({root=appRoot,port=49641,pickVideo=pickLocalVideo,onRestart=null}={}) {
  const dataRoot=join(root,'data'),uploadRoot=join(dataRoot,'uploads');await mkdir(uploadRoot,{recursive:true});
  const tools=findTools(root),token=randomBytes(24).toString('hex'),jobs=new Map(),media=new Map(),proxyBusy=new Set();let origin,pickerBusy=false,updating=false;
  for(const name of await readdir(uploadRoot)){if(!name.endsWith('.json'))continue;const record=await jsonFile(join(uploadRoot,name),null);if(record&&validId(record.id)){try{await stat(mediaPath(record,uploadRoot));media.set(record.id,record);}catch{}}}
  const catalog=JSON.parse(await readFile(join(root,'public/catalog.json'),'utf8'));
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  async function body(req,max=12_000_000){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('tooLarge');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  async function file(req,res,path,{download=false}={}) {
    const info=await stat(path),headers={'Content-Type':mime[extname(path)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(download)headers['Content-Disposition']=`attachment; filename="${basename(path).replace(/[^\w.-]/g,'_')}"`;
    const range=req.headers.range&&/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(range){const start=Number(range[1]),end=Math.min(info.size-1,range[2]?Number(range[2]):info.size-1);if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});createReadStream(path,{start,end}).pipe(res);}
    else {res.writeHead(200,{...headers,'Content-Length':info.size});createReadStream(path).pipe(res);}
  }
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.headers.host!==new URL(origin).host){send(res,403,{error:'forbidden'});return;}
      const url=new URL(req.url,origin),path=decodeURIComponent(url.pathname),method=req.method;
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
      if(method==='POST'&&(req.headers['x-overlay-token']!==token||req.headers.origin&&req.headers.origin!==origin)){send(res,403,{error:'forbidden'});return;}
      if(method==='GET'&&path==='/api/health'){send(res,200,{app:'zenless-command-overlay',version});return;}
      if(method==='POST'&&updating){send(res,409,{error:'updateBusy'});return;}
      if(method==='POST'&&path==='/api/update/check'){const {asset,...info}=await checkUpdate();send(res,200,{...info,installable:info.installable&&!!onRestart});return;}
      if(method==='POST'&&path==='/api/update/install'){
        if(!onRestart||pickerBusy||proxyBusy.size||[...jobs.values()].some(j=>j.status==='running'))throw new Error('updateBusy');
        updating=true;try{const value=await body(req);const result=await downloadUpdate(root,value.version);res.once('finish',()=>onRestart());send(res,200,result);}catch(error){updating=false;throw error;}return;
      }
      if(method==='GET'&&path==='/api/bootstrap'){
        send(res,200,{version,token,catalog,tools:{ffmpeg:!!tools.ffmpeg,ffprobe:!!tools.ffprobe,browser:!!tools.browser},preferences:await jsonFile(join(dataRoot,'preferences.json'),{}),autosave:await jsonFile(join(dataRoot,'autosave.json'),null),media:[...media.values()].map(({path,...m})=>m)});return;
      }
      if(method==='POST'&&path==='/api/autosave'){
        const value=await body(req),project=validateProject(value.project);await atomic(join(dataRoot,'autosave.json'),{project,mediaId:validId(value.mediaId||'')?value.mediaId:null,selected:typeof value.selected==='string'?value.selected:null,frame:Number.isSafeInteger(value.frame)?value.frame:0});send(res,200,{saved:true});return;
      }
      if(method==='POST'&&path==='/api/preferences'){
        const value=await body(req);if(!['ko','en','ja','zh-CN'].includes(value.language)||!Array.isArray(value.parties)||value.parties.length>50||!Array.isArray(value.customCharacters)||value.customCharacters.length>100)throw new Error('invalidProject');
        validateProject({version:1,title:'',video:null,fps:{n:60,d:1},characters:[...catalog,...value.customCharacters],party:[],events:[],style:{x:.025,y:.4,scale:1,gap:16,background:.68,holdColor:'#c8f461',previousOpacity:.4,nextOpacity:.4},keys:{basic:'KeyA',dodge:'KeyS',switch:'KeyD',ex:'KeyW',special:'KeyE',ultimate:'KeyQ',chain:'KeyZ'},holdThreshold:280});
        if(!value.parties.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&p.name.length<=100&&Array.isArray(p.members)&&p.members.length<=3&&new Set(p.members).size===p.members.length&&p.members.every(id=>[...catalog,...value.customCharacters].some(c=>c.id===id))))throw new Error('invalidProject');
        await atomic(join(dataRoot,'preferences.json'),value);send(res,200,{saved:true});return;
      }
      if(method==='POST'&&path==='/api/media/pick'){
        if(!tools.ffprobe)throw new Error('missingTools');
        if(pickerBusy)throw new Error('pickerBusy');pickerBusy=true;
        try {
          const selected=await pickVideo();if(!selected){send(res,200,{cancelled:true});return;}
          const description=await describeLinkedVideo(selected,tools.ffprobe),existing=[...media.values()].find(m=>m.storage==='linked'&&m.path===description.path&&m.fingerprint===description.fingerprint);
          const record={id:existing?.id||randomUUID(),...description,...(existing?.proxy?{proxy:existing.proxy}:{})};
          await atomic(join(uploadRoot,record.id+'.json'),record);media.set(record.id,record);send(res,200,{...record,path:undefined});
        } finally {pickerBusy=false;}return;
      }
      if(method==='POST'&&path==='/api/previews/clear'){
        if(proxyBusy.size)throw new Error('previewBusy');
        let deleted=0,bytes=0,failed=0;const removed=new Set();
        for(const name of await readdir(uploadRoot)){
          if(!/^[a-f\d-]{36}\.proxy\.mp4$/i.test(name))continue;
          try{const target=join(uploadRoot,name),info=await stat(target);await unlink(target);removed.add(name);deleted++;bytes+=info.size;}catch(error){if(error.code!=='ENOENT')failed++;}
        }
        for(const entry of media.values())if(entry.proxy&&removed.has(entry.proxy)){delete entry.proxy;await atomic(join(uploadRoot,entry.id+'.json'),entry);}
        send(res,200,{deleted,bytes,failed});return;
      }
      const mediaRoute=/^\/api\/media\/([a-f\d-]{36})(?:\/(raw|proxy))?$/.exec(path);
      if(mediaRoute){const entry=media.get(mediaRoute[1]);if(!entry)throw new Error('videoMissing');
        if(method==='GET'&&mediaRoute[2]==='raw'){await file(req,res,url.searchParams.get('preview')==='1'&&entry.proxy?join(uploadRoot,entry.proxy):mediaPath(entry,uploadRoot));return;}
        if(method==='GET'&&!mediaRoute[2]){send(res,200,{...entry,path:undefined});return;}
        if(method==='POST'&&mediaRoute[2]==='proxy'){
          if(!tools.ffmpeg)throw new Error('missingTools');if(proxyBusy.size)throw new Error('previewBusy');const proxy=entry.id+'.proxy.mp4';proxyBusy.add(entry.id);
          try{await run(tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-i',mediaPath(entry,uploadRoot),'-map','0:v:0','-map','0:a:0?','-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-fps_mode','passthrough','-c:a','aac','-movflags','+faststart','-y',join(uploadRoot,proxy)]);
          entry.proxy=proxy;await atomic(join(uploadRoot,entry.id+'.json'),entry);send(res,200,{ready:true});}finally{proxyBusy.delete(entry.id);}return;
        }
      }
      if(method==='POST'&&path==='/api/exports'){
        const value=await body(req),project=validateProject(value.project);
        if(!project.video||!project.events.length)throw new Error('nothingToExport');
        if(!['mov','png'].includes(value.format))throw new Error('invalidProject');
        if([...jobs.values()].some(j=>j.status==='running'))throw new Error('exportBusy');
        if(!tools.ffmpeg||!tools.browser)throw new Error('missingTools');
        const totalFrames=Math.ceil(project.video.duration*fpsValue(project.fps));
        const job={id:randomUUID(),project,format:value.format,crop:value.crop!==false,totalFrames,doneFrames:0,progress:0,status:'running',controller:new AbortController()};jobs.set(job.id,job);
        job.task=exportOverlay(job,{appRoot:root,origin,tools,signal:job.controller.signal}).catch(error=>{job.status='failed';job.error=error.message;});
        send(res,202,{id:job.id});return;
      }
      const exportRoute=/^\/api\/exports\/([a-f\d-]{36})(?:\/(file|cancel|open))?$/.exec(path);
      if(exportRoute){const job=jobs.get(exportRoute[1]);if(!job)throw new Error('exportMissing');
        if(method==='GET'&&!exportRoute[2]){send(res,200,{id:job.id,status:job.status,progress:job.progress,totalFrames:job.totalFrames,doneFrames:job.doneFrames,error:job.error,output:job.output,format:job.format,dimensions:job.dimensions});return;}
        if(method==='GET'&&exportRoute[2]==='file'&&job.status==='complete'&&job.format==='mov'){await file(req,res,join(root,'output',job.id,'overlay.mov'),{download:true});return;}
        if(method==='POST'&&exportRoute[2]==='cancel'){job.controller.abort();send(res,200,{cancelled:true});return;}
        if(method==='POST'&&exportRoute[2]==='open'){
          if(process.platform==='win32'){const explorer=spawn('explorer.exe',[join(root,'output',job.id)],{windowsHide:true,shell:false,stdio:'ignore'});explorer.on('error',()=>{});explorer.unref();}send(res,200,{opened:true});return;
        }
      }
      const renderRoute=/^\/api\/render-job\/([a-f\d-]{36})$/.exec(path);
      if(method==='GET'&&renderRoute){const job=jobs.get(renderRoute[1]);if(!job)throw new Error('exportMissing');send(res,200,{project:job.project,crop:job.crop});return;}
      if(method==='GET'){
        let base=join(root,'public'),relative=path==='/'?'index.html':path.slice(1);
        if(path.startsWith('/shared/')){base=join(root,'shared');relative=path.slice(8);}
        const target=resolve(base,relative);if(!target.startsWith(resolve(base)+sep)||relative.includes('..'))throw new Error('forbidden');
        await file(req,res,target);return;
      }
      send(res,404,{error:'notFound'});
    }catch(error){if(res.headersSent){res.destroy();return;}const codes=['invalidProject','unsupportedVideo','missingTools','tooLarge','nothingToExport','exportBusy'];send(res,error.code==='ENOENT'?404:codes.includes(error.message)?400:500,{error:error.message?.slice(0,1200)||'failed'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  return {server,origin,tools,jobs,close:async()=>{for(const job of jobs.values())if(job.status==='running')job.controller.abort();await Promise.allSettled([...jobs.values()].map(j=>j.task));await new Promise(r=>{server.close(r);server.closeIdleConnections();});}};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const port=Number(process.env.OVERLAY_PORT||49641);
  try{const app=await createApp({port,onRestart:async()=>{app.server.closeAllConnections();await app.close();const child=spawn(process.execPath,[join(appRoot,'server.mjs')],{cwd:appRoot,env:{...process.env,OVERLAY_PORT:String(port)},stdio:'inherit',windowsHide:true});child.on('error',error=>{console.error(error.message);process.exit(1);});child.on('exit',code=>process.exit(code||0));}});console.log(`Command Overlay v${version}: ${app.origin}`);console.log('OVERLAY_READY '+app.origin);if(process.argv.includes('--open'))browserOpen(app.origin);process.on('SIGTERM',()=>{app.close().finally(()=>process.exit());});}
  catch(error){if(error.code==='EADDRINUSE'){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if((await r.json()).app==='zenless-command-overlay'){browserOpen(`http://127.0.0.1:${port}`);process.exit(0);}}catch{}}console.error(error.message);process.exitCode=1;}
}
