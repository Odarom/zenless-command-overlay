import { COMMANDS,commandIcon,connectorSymbol,groupEvents,sortedEvents,fpsValue } from './model.mjs';
import { buildTransitions,sampleTransitions,interpolateRows } from './animation.mjs';
const font = '"Malgun Gothic","Yu Gothic",Arial,sans-serif';
const connectorWidth=38;
const plans=new WeakMap();
export function invalidatePaint(project){plans.delete(project);}
export async function loadImages(project) {
  const sources=new Set([...COMMANDS.map(c=>'/assets/commands/'+c.icon),commandIcon({command:'switch',switchVariant:'yellow'}),...project.characters.map(c=>c.portrait)]);
  const images=new Map();
  await Promise.all([...sources].map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images.set(src,image);resolve();};image.onerror=()=>reject(new Error('imageLoadFailed'));image.src=src;})));
  await document.fonts.ready;
  return images;
}
function lines(ctx,text,width) {
  const result=[];let line='';
  for(const char of Array.from(text)) { if(char==='\n'){result.push(line);line='';continue;}if(line&&ctx.measureText(line+char).width>width){result.push(line);line=char;}else line+=char; }
  if(line)result.push(line);return result;
}
function timelineFor(ctx,project,measure){
  const {width,height}=ctx.canvas,cached=plans.get(project);
  if(cached&&cached.width===width&&cached.height===height)return cached.plan;
  const groups=groupEvents(project.events),events=sortedEvents(project.events),at=new Map(),groupIndex=new Map();
  groups.forEach((g,i)=>g.events.forEach(e=>groupIndex.set(e.id,i)));events.forEach(e=>at.set(e.frame,e));
  const unit=height/1080*project.style.scale,center=height*project.style.y,gap=project.style.gap*unit;
  const layoutAt=frame=>{
    const active=at.get(frame),index=active?groupIndex.get(active.id):-1;
    const current=groups[index]?measure(groups[index],1):null,previous=groups[index-1]?measure(groups[index-1],0):null,next=groups[index+1]?measure(groups[index+1],0):null,top=center-(current?.height||74*unit)/2;
    return [previous&&{group:previous.group,emphasis:0,y:top-gap-previous.height,opacity:project.style.previousOpacity,weights:{}},current&&{group:current.group,emphasis:1,y:top,opacity:1,weights:{[active.id]:1}},next&&{group:next.group,emphasis:0,y:top+(current?.height||74*unit)+gap,opacity:project.style.nextOpacity,weights:{}}].filter(Boolean).map(row=>({...row,id:row.group.events[0].id}));
  };
  const duration=project.style.animation?project.style.transitionMs/1000*fpsValue(project.fps):0,plan=buildTransitions([...at.keys()],layoutAt,duration,24*unit);
  const extent=[...plan.initial];
  for(const entry of plan.entries){if(duration)extent.push(...interpolateRows(entry.from,entry.to,0,plan.travel),...interpolateRows(entry.from,entry.to,1,plan.travel));else extent.push(...entry.to);}
  const boxes=extent.map(pose=>{const row=measure(pose.group,pose.emphasis),x=width*project.style.x,shrink=Math.min(1,(width-x-12*unit)/row.width);return {x,y:pose.y,right:x+row.width*shrink,bottom:pose.y+row.height*shrink};});
  plan.envelope=boxes.length?{x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))}:null;
  plan.overflow=boxes.some(b=>b.y<0||b.bottom>height);plans.set(project,{width,height,plan});return plan;
}
export function paint(ctx,project,frame,images) {
  const {width,height}=ctx.canvas;ctx.clearRect(0,0,width,height);
  const style=project.style,unit=height/1080*style.scale,hits=[];
  const measure=(group,emphasis)=>{
    const u=unit*(.84+.16*emphasis),icon=34+16*emphasis,portrait=36+10*emphasis;
    ctx.font=`600 ${19*u}px ${font}`;
    const actions=group.events.map(e=>{
      const textLines=lines(ctx,e.note,135*u),textWidth=Math.max(0,...textLines.map(s=>ctx.measureText(s).width),e.hold?ctx.measureText('Hold').width:0);
      const textHeight=(textLines.length+(e.hold?1:0))*24*u;
      return {event:e,textLines,textWidth,textHeight,width:icon*u+(textWidth?8*u+textWidth:0),height:Math.max(icon*u,textHeight)};
    });
    const rowHeight=Math.max(portrait*u,...actions.map(a=>a.height))+24*u;
    const rowWidth=24*u+portrait*u+14*u+actions.reduce((n,a)=>n+a.width,0)+(actions.length-1)*connectorWidth*u;
    return {group,emphasis,u,icon,portrait,actions,width:rowWidth,height:rowHeight};
  };
  const plan=timelineFor(ctx,project,measure),rows=sampleTransitions(plan,frame).map(pose=>({...measure(pose.group,pose.emphasis),...pose})).sort((a,b)=>a.y-b.y);
  for(const row of rows) {
    const x=width*style.x,maxWidth=width-x-12*unit,shrink=Math.min(1,maxWidth/row.width),u=row.u;
    ctx.save();ctx.globalAlpha=row.opacity;ctx.translate(x,row.y);ctx.scale(shrink,shrink);
    ctx.fillStyle=`rgba(17,19,22,${style.background})`;ctx.beginPath();ctx.roundRect(0,0,row.width,row.height,10*u);ctx.fill();
    let cursor=12*u;
    const character=project.characters.find(c=>c.id===row.group.characterId),portrait=images.get(character?.portrait);
    if(portrait){ctx.save();ctx.beginPath();ctx.arc(cursor+row.portrait*u/2,row.height/2,row.portrait*u/2,0,Math.PI*2);ctx.clip();ctx.drawImage(portrait,cursor,(row.height-row.portrait*u)/2,row.portrait*u,row.portrait*u);ctx.restore();}
    cursor+=row.portrait*u+14*u;
    row.actions.forEach((a,i)=>{
      if(i){ctx.save();ctx.font=`400 ${18*u}px ${font}`;ctx.fillStyle=a.event.connector==='plus'?'rgba(168,204,216,.85)':'rgba(245,245,247,.4)';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(connectorSymbol(a.event),cursor+connectorWidth*u/2,row.height/2);ctx.restore();cursor+=connectorWidth*u;}
      const def=COMMANDS.find(c=>c.id===a.event.command),image=images.get(commandIcon(a.event)),weight=row.weights[a.event.id]||0,baseAlpha=.85-.37*row.emphasis;
      ctx.save();ctx.globalAlpha*=baseAlpha+(1-baseAlpha)*weight;
      if(def.grayscale)ctx.filter='grayscale(1)';
      if(image)ctx.drawImage(image,cursor,(row.height-row.icon*u)/2,row.icon*u,row.icon*u);
      ctx.restore();
      if(weight>0){ctx.strokeStyle=`rgba(255,255,255,${.85*weight})`;ctx.lineWidth=1.5*u;ctx.beginPath();ctx.arc(cursor+row.icon*u/2,row.height/2,row.icon*u/2+4*u,0,Math.PI*2);ctx.stroke();}
      let textY=(row.height-a.textHeight)/2;const textX=cursor+row.icon*u+8*u;
      ctx.textBaseline='top';ctx.font=`600 ${19*u}px ${font}`;
      if(a.event.hold){ctx.fillStyle=style.holdColor;ctx.fillText('Hold',textX,textY);textY+=24*u;}
      ctx.fillStyle='#f5f5f7';for(const line of a.textLines){ctx.fillText(line,textX,textY);textY+=24*u;}
      hits.push({id:a.event.id,x:x+cursor*shrink,y:row.y,width:a.width*shrink,height:row.height*shrink});cursor+=a.width;
    });
    ctx.restore();
  }
  const boxes=rows.map(row=>{const x=width*style.x,shrink=Math.min(1,(width-x-12*unit)/row.width);return {x,y:row.y,right:x+row.width*shrink,bottom:row.y+row.height*shrink};});
  hits.bounds=boxes.length?{x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))}:null;
  hits.overflow=boxes.some(b=>b.y<0||b.bottom>height);
  hits.motionBounds=plan.envelope;hits.motionOverflow=plan.overflow;
  return hits;
}
