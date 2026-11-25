import { spawn } from 'node:child_process';
import { mkdir,readFile,rm } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function openRenderer(executable,url,profile,{signal}={}) {
  await mkdir(profile,{recursive:true});
  const processHandle=spawn(executable,['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-sync','--disable-gpu','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,shell:false,stdio:['ignore','ignore','pipe']});
  let browserLog='',closing=false;processHandle.stderr.on('data',chunk=>{browserLog=(browserLog+chunk).slice(-4000);});
  processHandle.on('exit',(code,signal)=>{if(!closing)console.error('Overlay renderer exited:',code,signal,browserLog);});
  let processError;processHandle.on('error',e=>{processError=e;});
  let socket,nextId=1;const pending=new Map();
  async function close(){
    closing=true;
    if(socket?.readyState===1){try{await Promise.race([send('Browser.close'),delay(1500)]);}catch{}socket.close();}
    if(processHandle.exitCode===null)processHandle.kill();
    for(const p of pending.values())p.reject(new Error('cancelled'));pending.clear();
  }
  signal?.addEventListener('abort',close,{once:true});
  function send(method,params={},sessionId) {
    return new Promise((resolve,reject)=>{const id=nextId++,timer=setTimeout(()=>{pending.delete(id);reject(new Error('rendererTimeout'));},45000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  }
  try {
    let endpoint;
    for(let attempt=0;attempt<200;attempt++){signal?.throwIfAborted();if(processError)throw processError;if(processHandle.exitCode!==null)throw new Error('browserFailed');try{const [port,path]=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);endpoint=`ws://127.0.0.1:${port}${path}`;break;}catch{}await delay(100);}
    if(!endpoint)throw new Error('browserFailed');
    socket=new WebSocket(endpoint);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(new Error('browserFailed')),{once:true});});
    socket.addEventListener('message',event=>{const msg=JSON.parse(String(event.data)),entry=pending.get(msg.id);if(entry){pending.delete(msg.id);msg.error?entry.reject(new Error(msg.error.message)):entry.resolve(msg.result);}});
    socket.addEventListener('close',event=>{if(!closing)console.error('Overlay renderer socket closed:',event.code,event.reason,browserLog);for(const p of pending.values())p.reject(new Error('browserFailed'));pending.clear();});
    const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    await send('Page.enable',{},sessionId);await send('Page.navigate',{url},sessionId);
    const evaluate=async expression=>{signal?.throwIfAborted();const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||'renderFailed');return result.result?.value;};
    for(let attempt=0;attempt<300;attempt++){const status=await evaluate('window.overlayStatus || "loading"');if(status==='ready')return {evaluate,close:async()=>{signal?.removeEventListener('abort',close);await close();}};if(status.startsWith('error:'))throw new Error(status.slice(6));await delay(100);}
    throw new Error('rendererTimeout');
  }catch(error){if(error.message==='browserFailed'&&browserLog)console.error('Overlay renderer startup:',browserLog);signal?.removeEventListener('abort',close);await close();throw error;}
}
export async function removeProfile(profile,root) {
  const target=resolve(profile),allowed=resolve(root)+sep;
  if(!target.startsWith(allowed))throw new Error('invalidPath');
  await rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
}
