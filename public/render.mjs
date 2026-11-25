import { loadImages,paint } from '/shared/painter.mjs';
window.overlayStatus='loading';
try {
  const id=new URL(location.href).searchParams.get('job'),response=await fetch('/api/render-job/'+id);
  if(!response.ok)throw new Error('exportMissing');
  const {project,crop}=await response.json(),images=await loadImages(project),canvas=document.getElementById('output');
  canvas.width=project.video.width;canvas.height=project.video.height;
  const context=canvas.getContext('2d',{alpha:true});
  let bounds={x:0,y:0,width:canvas.width,height:canvas.height};
  if(crop){
    let left=canvas.width,top=canvas.height,right=0,bottom=0;
    const result=paint(context,project,0,images);if(result.motionOverflow)throw new Error('overlayTooLarge');if(result.motionBounds){left=result.motionBounds.x;top=result.motionBounds.y;right=result.motionBounds.right;bottom=result.motionBounds.bottom;}
    const unit=canvas.height/2160,padding=Math.ceil(16*unit),width=Math.min(canvas.width,Math.ceil(Math.max(1024*unit,right-left+padding*2)/2)*2),height=Math.min(canvas.height,Math.ceil(Math.max(512*unit,bottom-top+padding*2)/2)*2);
    bounds={x:Math.max(0,Math.min(canvas.width-width,Math.floor((left-padding)/2)*2)),y:Math.max(0,Math.min(canvas.height-height,Math.floor((top-padding)/2)*2)),width,height};
  }
  const output=document.createElement('canvas');output.width=bounds.width;output.height=bounds.height;const out=output.getContext('2d',{alpha:true});
  window.overlayInfo={width:bounds.width,height:bounds.height,placement:{x:bounds.x,y:bounds.y},cropped:crop};
  window.overlayFrames=(start,count)=>Array.from({length:count},(_,i)=>{paint(context,project,start+i,images);out.clearRect(0,0,output.width,output.height);out.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);return output.toDataURL('image/png').split(',')[1];});
  window.overlayStatus='ready';
}catch(error){window.overlayStatus='error:'+error.message;}
