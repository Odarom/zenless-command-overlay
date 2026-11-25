import { spawn } from 'node:child_process';
import { mkdir,writeFile,rename,unlink } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { openRenderer,removeProfile } from './browser.mjs';
import { sortedEvents } from '../shared/model.mjs';
export async function exportOverlay(job,{appRoot,origin,tools,signal}) {
  const {project,format,id}=job,video=project.video,total=job.totalFrames;
  const directory=join(appRoot,'output',id),profileRoot=join(appRoot,'data','render-profiles'),profile=join(profileRoot,id);
  await mkdir(directory,{recursive:true});
  let renderer,encoder,encoderExit,encoderError,stderr='',stage='prepare';
  const temporary=join(directory,'overlay.partial.mov'),output=join(directory,'overlay.mov');
  try {
    if(!tools.browser||!tools.ffmpeg)throw new Error('missingTools');
    if(format==='mov') {
      encoder=spawn(tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-f','image2pipe','-framerate',`${project.fps.n}/${project.fps.d}`,'-c:v','png','-i','pipe:0','-an','-c:v','prores_ks','-threads','4','-profile:v','4','-alpha_bits','16','-pix_fmt','yuva444p10le','-vendor','apl0','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-y',temporary],{windowsHide:true,shell:false,stdio:['pipe','ignore','pipe']});
      encoder.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-6000);});
      encoder.stdin.on('error',error=>{encoderError=error;});
      encoderExit=new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('close',code=>code===0?resolve():reject(new Error(stderr||'encodeFailed')));});encoderExit.catch(()=>{});
    } else await mkdir(join(directory,'frames'),{recursive:true});
    stage='open-renderer';renderer=await openRenderer(tools.browser,`${origin}/render.html?job=${id}`,profile,{signal});stage='read-render-info';
    const renderInfo=await renderer.evaluate('window.overlayInfo');job.dimensions=renderInfo;
    const events=sortedEvents(project.events),animationFrames=project.style.animation?project.style.transitionMs/1000*project.fps.n/project.fps.d:0;let eventIndex=-1,cachedKey,cachedPng;
    for(let frame=0;frame<total;frame++) {
      stage='frame-'+frame;
      signal.throwIfAborted();if(encoderError)throw encoderError;
      while(events[eventIndex+1]?.frame<=frame)eventIndex++;
      const active=events[eventIndex],key=active&&frame<active.frame+animationFrames?'animation:'+frame:active?.id||'before-first';
      if(key!==cachedKey){const [png]=await renderer.evaluate(`window.overlayFrames(${frame},1)`);cachedPng=Buffer.from(png,'base64');cachedKey=key;}
      if(format==='mov'){if(!encoder.stdin.write(cachedPng))await once(encoder.stdin,'drain',{signal});}
      else await writeFile(join(directory,'frames',`overlay_${String(frame).padStart(7,'0')}.png`),cachedPng,{flag:'wx'});
      job.doneFrames=frame+1;job.progress=Math.floor(job.doneFrames/total*100);
      if(frame%64===0)await new Promise(r=>setImmediate(r));
    }
    if(encoder){encoder.stdin.end();await encoderExit;await rename(temporary,output);}
    await writeFile(join(directory,'timing.json'),JSON.stringify({...renderInfo,sourceWidth:video.width,sourceHeight:video.height,fps:project.fps,frames:total,duration:total*project.fps.d/project.fps.n,alpha:'straight',format},null,2));
    job.output=format==='mov'?`/api/exports/${id}/file`:null;job.status='complete';job.progress=100;
  } catch(error) {
    console.error('Overlay export failed at',stage,error.stack);
    job.status=signal.aborted?'cancelled':'failed';job.error=signal.aborted?'cancelled':error.message;
    if(encoder)encoder.kill();await encoderExit?.catch(()=>{});await unlink(temporary).catch(()=>{});
  } finally {await renderer?.close();await removeProfile(profile,profileRoot);}
}
