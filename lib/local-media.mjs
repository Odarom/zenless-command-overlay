import { join,resolve,sep,isAbsolute,basename } from 'node:path';
import { stat,realpath } from 'node:fs/promises';
import { run,probe,fingerprint } from './media.mjs';

export function mediaPath(entry,uploadRoot) {
  if(entry.storage==='linked') {
    if(!isAbsolute(entry.path))throw new Error('videoMissing');
    return entry.path;
  }
  const path=resolve(uploadRoot,entry.path);
  if(!path.startsWith(resolve(uploadRoot)+sep))throw new Error('videoMissing');
  return path;
}
export async function describeLinkedVideo(path,ffprobe) {
  const target=await realpath(path),info=await stat(target);
  if(!info.isFile())throw new Error('unsupportedVideo');
  return {name:basename(target),size:info.size,...await probe(target,ffprobe),fingerprint:await fingerprint(target,info.size),storage:'linked',path:target};
}
export async function pickLocalVideo() {
  if(process.platform!=='win32')throw new Error('pickerUnavailable');
  // No user text is interpolated into this script. The selected path is returned as data.
  const script=`[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$taskOwner = New-Object System.Windows.Forms.Form
$taskOwner.TopMost = $true
$taskOwner.ShowInTaskbar = $false
$taskOwner.Opacity = 0
$taskPicker = New-Object System.Windows.Forms.OpenFileDialog
$taskPicker.Filter = 'Video|*.mp4;*.m4v;*.mov;*.webm;*.mkv;*.avi|All files|*.*'
$taskPicker.CheckFileExists = $true
try {
  if ($taskPicker.ShowDialog($taskOwner) -eq [System.Windows.Forms.DialogResult]::OK) {
    ConvertTo-Json -Compress -InputObject $taskPicker.FileName
  } else { 'null' }
} finally { $taskPicker.Dispose(); $taskOwner.Dispose() }`;
  const executable=join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=await run(executable,['-NoProfile','-STA','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]);
  return JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());
}
