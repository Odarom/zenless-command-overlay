const clamp=value=>Math.max(0,Math.min(1,value));
export const ease=value=>1-(1-clamp(value))**3;
const mix=(a,b,t)=>a+(b-a)*t;
export function interpolateRows(from,to,amount,travel=24){
  const t=ease(amount),before=new Map(from.map(row=>[row.id,row])),after=new Map(to.map(row=>[row.id,row])),result=[];
  for(const id of new Set([...before.keys(),...after.keys()])){
    const a=before.get(id),b=after.get(id);
    const start=a||{...b,y:b.y+travel,opacity:0,weights:{}},end=b||{...a,y:a.y-travel,opacity:0,emphasis:0,weights:{}};
    const weights={};for(const key of new Set([...Object.keys(start.weights),...Object.keys(end.weights)]))weights[key]=mix(start.weights[key]||0,end.weights[key]||0,t);
    result.push({id,group:(b||a).group,y:mix(start.y,end.y,t),opacity:mix(start.opacity,end.opacity,t),emphasis:mix(start.emphasis,end.emphasis,t),weights});
  }
  return result;
}
export function buildTransitions(boundaries,layoutAt,duration,travel){
  const initial=layoutAt(-1),entries=[];
  for(const frame of boundaries){
    const last=entries.at(-1),from=last?interpolateRows(last.from,last.to,duration?(frame-last.frame)/duration:1,travel).filter(r=>r.opacity>.00001):initial;
    entries.push({frame,from,to:layoutAt(frame)});
  }
  return {initial,entries,duration,travel};
}
export function sampleTransitions(plan,frame){
  let low=0,high=plan.entries.length-1,index=-1;
  while(low<=high){const middle=(low+high)>>1;if(plan.entries[middle].frame<=frame){index=middle;low=middle+1;}else high=middle-1;}
  if(index<0)return plan.initial;
  const entry=plan.entries[index],progress=plan.duration?(frame-entry.frame)/plan.duration:1;
  return progress>=1?entry.to:interpolateRows(entry.from,entry.to,progress,plan.travel).filter(r=>r.opacity>.00001);
}
