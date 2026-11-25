import { createHash,randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,rm,stat,lstat,copyFile } from 'node:fs/promises';
import { join,dirname,resolve,sep } from 'node:path';

export const repository='Odarom/zenless-command-overlay';
export const version='1.3.0';
const assetName='zenless-command-overlay-update.json';
const maxBytes=24*1024*1024;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const parts=v=>/^\d+\.\d+\.\d+$/.test(v)?v.split('.').map(Number):null;
export function newer(candidate,current=version){const a=parts(candidate),b=parts(current);if(!a||!b)return false;return a[0]>b[0]||a[0]===b[0]&&(a[1]>b[1]||a[1]===b[1]&&a[2]>b[2]);}
export function allowedFile(path){return typeof path==='string'&&/^(?:package\.json|server\.mjs|Start\.cmd|README(?:-(?:ko|en|ja|zh-CN))?\.md|ASSETS\.md|\.gitignore|(?:lib|shared|test)\/[a-z][\w.-]*\.mjs|public\/(?:[a-z][\w.-]*\.(?:mjs|html|css|json)|assets\/sources\.json|assets\/(?:portraits|commands)\/[A-Za-z0-9_][\w-]*\.(?:png|webp)))$/.test(path);}
export async function checkUpdate({request=fetch}={}){
 const response=await request(`https://api.github.com/repos/${repository}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Zenless-Command-Overlay'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('updateUnavailable');const release=await response.json(),latest=String(release.tag_name||'').replace(/^v/,'');
 if(!parts(latest)||release.draft||release.prerelease)throw new Error('updateUnavailable');
 const url=`https://github.com/${repository}/releases/tag/v${latest}`,asset=release.assets?.find(a=>a.name===assetName&&a.size>0&&a.size<=maxBytes&&/^sha256:[a-f0-9]{64}$/.test(a.digest||'')&&a.browser_download_url===`${url.replace('/tag/','/download/')}/${assetName}`);
 return {latest,available:newer(latest),url,installable:!!asset,asset:asset?{url:asset.browser_download_url,digest:asset.digest.slice(7),size:asset.size}:null};
}
export async function installBundle(root,bundle,targetVersion){
 if(bundle.version!==targetVersion||!newer(bundle.version)||!Array.isArray(bundle.files)||bundle.files.length>500)throw new Error('invalidUpdate');
 const files=new Map();let size=0;
 for(const item of bundle.files){if(!allowedFile(item.path)||files.has(item.path.toLowerCase())||typeof item.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.base64))throw new Error('invalidUpdate');const bytes=Buffer.from(item.base64,'base64');size+=bytes.length;if(size>maxBytes||sha256(bytes)!==item.sha256)throw new Error('invalidUpdate');files.set(item.path.toLowerCase(),{path:item.path,bytes});}
 for(const path of ['server.mjs','package.json','start.cmd','public/index.html','public/app.mjs','lib/update.mjs','public/catalog.json','shared/model.mjs'])if(!files.has(path))throw new Error('invalidUpdate');
 if(JSON.parse(files.get('package.json').bytes).version!==targetVersion)throw new Error('invalidUpdate');
 const base=resolve(root),backup=join(base,'runtime','update-backup-'+randomUUID()),changes=[];
 // Check existing parents before writing; do not follow link/junction entries during update.
 for(const {path} of files.values()){let current=base;for(const component of path.split('/')){current=join(current,component);try{if((await lstat(current)).isSymbolicLink())throw new Error('invalidUpdate');}catch(e){if(e.code!=='ENOENT')throw e;}}}
 await mkdir(backup,{recursive:true});
 try{
  for(const {path,bytes} of files.values()){const target=resolve(base,path);if(!target.startsWith(base+sep))throw new Error('invalidUpdate');let existed=true;try{if(!(await stat(target)).isFile())throw new Error('invalidUpdate');}catch(e){if(e.code!=='ENOENT')throw e;existed=false;}
   const saved=join(backup,path);if(existed){await mkdir(dirname(saved),{recursive:true});await copyFile(target,saved);}await mkdir(dirname(target),{recursive:true});const temporary=target+'.update-'+randomUUID();try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,target);}finally{await rm(temporary,{force:true});}changes.push({target,saved,existed});
  }
 }catch(error){for(const change of changes.reverse()){if(change.existed)await copyFile(change.saved,change.target);else await rm(change.target,{force:true});}throw error;}
 return {version:targetVersion,files:changes.length};
}
export async function downloadUpdate(root,targetVersion){const release=await checkUpdate();if(!release.available||!release.installable||release.latest!==targetVersion)throw new Error('updateUnavailable');const response=await fetch(release.asset.url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('updateUnavailable');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes||size>release.asset.size)throw new Error('invalidUpdate');chunks.push(Buffer.from(chunk));}const bytes=Buffer.concat(chunks);if(size!==release.asset.size||sha256(bytes)!==release.asset.digest)throw new Error('invalidUpdate');return installBundle(root,JSON.parse(bytes.toString('utf8')),targetVersion);}
