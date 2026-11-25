import { spawn,spawnSync } from 'node:child_process';
import { existsSync,readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,dirname,join } from 'node:path';
export function findTools(appRoot) {
  const parent=resolve(appRoot,'..');let manifest={};
  try{manifest=JSON.parse(readFileSync(join(parent,'.tools/video/tools.json'),'utf8'));}catch{}
  const locate=name=>{const r=spawnSync(process.platform==='win32'?'where.exe':'which',[name],{encoding:'utf8',windowsHide:true});return r.status===0?r.stdout.trim().split(/\r?\n/)[0]:null;};
  const candidate=[process.env.OVERLAY_FFMPEG,join(appRoot,'tools/ffmpeg.exe'),manifest.ffmpeg&&resolve(parent,manifest.ffmpeg),locate('ffmpeg')].find(p=>p&&existsSync(p));
  const ffprobe=[process.env.OVERLAY_FFPROBE,candidate&&join(dirname(candidate),process.platform==='win32'?'ffprobe.exe':'ffprobe'),locate('ffprobe')].find(p=>p&&existsSync(p));
  const browser=[process.env.OVERLAY_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe',locate('chromium'),locate('google-chrome')].find(p=>p&&existsSync(p));
  return {ffmpeg:candidate||null,ffprobe:ffprobe||null,browser:browser||null};
}
export function run(executable,args,{signal}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{windowsHide:true,shell:false,signal});let stdout='',stderr='';
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>8_000_000)child.kill();});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000);});
    child.on('error',reject);child.on('close',code=>code===0?resolve({stdout,stderr}):reject(new Error(stderr||'mediaFailed')));
  });
}
export async function probe(path,ffprobe) {
  if(!ffprobe)throw new Error('missingTools');
  const {stdout}=await run(ffprobe,['-v','error','-show_format','-show_streams','-of','json',path]);
  const data=JSON.parse(stdout),video=data.streams?.find(s=>s.codec_type==='video');
  const duration=Number(video?.duration||data.format?.duration),width=Number(video?.width),height=Number(video?.height);
  if(!video||!Number.isFinite(duration)||duration<=0||duration>86400||width<16||width>7680||height<16||height>4320)throw new Error('unsupportedVideo');
  const parse=value=>{const [n,d]=String(value).split('/').map(Number);return Number.isSafeInteger(n)&&Number.isSafeInteger(d)&&n>0&&d>0&&n/d>=1&&n/d<=240?{n,d}:null;};
  const avg=parse(video.avg_frame_rate),native=parse(video.r_frame_rate),fps=avg||native||{n:60,d:1};
  const vfr=!!(avg&&native&&Math.abs(avg.n/avg.d-native.n/native.d)>.02);
  return {duration,width,height,fps,vfr,codec:video.codec_name};
}
export async function fingerprint(path,size) {
  const handle=await open(path,'r');
  try{const length=Math.min(size,1048576),a=Buffer.alloc(length),b=Buffer.alloc(length);await handle.read(a,0,length,0);await handle.read(b,0,length,Math.max(0,size-length));return createHash('sha256').update(String(size)).update(a).update(b).digest('hex');}
  finally{await handle.close();}
}
