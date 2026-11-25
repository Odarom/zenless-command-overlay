import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransitions,sampleTransitions} from '../shared/animation.mjs';
const pose=(id,y,opacity=1)=>({id,group:{events:[{id}]},y,opacity,emphasis:1,weights:{[id]:1}});
test('row moves upward, fades in and is deterministic when seeking backward',()=>{const plan=buildTransitions([10],frame=>frame<0?[]:[pose('a',100)],10,24);const start=sampleTransitions(plan,10),middle=sampleTransitions(plan,15),end=sampleTransitions(plan,20);assert.equal(start.length,0);assert.ok(middle[0].y>100&&middle[0].y<124);assert.ok(middle[0].opacity>0&&middle[0].opacity<1);assert.equal(end[0].y,100);assert.deepEqual(sampleTransitions(plan,15),middle);});
test('rapid inputs start from the in-progress pose instead of jumping',()=>{const plan=buildTransitions([10,12],frame=>frame<0?[pose('a',200,.4)]:frame===10?[pose('a',100)]:[pose('a',50)],10,24);const justBefore=sampleTransitions(plan,11.999999)[0],at=sampleTransitions(plan,12)[0];assert.ok(Math.abs(justBefore.y-at.y)<.0001);assert.ok(sampleTransitions(plan,13)[0].y<at.y);});
test('disabled animation switches rows immediately',()=>{const plan=buildTransitions([10],frame=>frame<0?[]:[pose('a',100)],0,24);assert.deepEqual(sampleTransitions(plan,10),[pose('a',100)]);});
