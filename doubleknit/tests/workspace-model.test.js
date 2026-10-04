import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject, setRelationship, relationship, reverseColour, toggleCell, setRowEdges, clearDesign, isDesignClear, validateProject} from '../src/model.js';
import {createHistory} from '../src/history.js';

test('relationship conversion preserves the visible reverse on unlinking and undo recovers discarded art', () => {
  let p=createProject(5,3);p=toggleCell(p,'b',1,1);p=toggleCell(p,'a',0,3);
  const history=createHistory(p), linked=setRelationship(p,'linked');history.push(linked);
  assert.equal(relationship(linked),'linked');assert.equal(linked.b,undefined);
  assert.deepEqual(history.undo(),p);assert.deepEqual(history.redo(),linked);
  for(const kind of ['plain','linked']){
    const derived=setRelationship(p,kind), independent=setRelationship(derived,'independent');
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)assert.equal(independent.b[y][x],reverseColour(derived,y,x));
    assert.deepEqual(validateProject(independent),independent);
  }
  const asymmetric=setRowEdges(p,{top:0,bottom:0,left:1,right:0});
  assert.throws(()=>setRelationship(asymmetric,'linked'));
  assert.equal(relationship(setRelationship(asymmetric,'plain')),'plain');
});

test('Clear design preserves size, outline, relationship, workflow and display and is undoable',()=>{
  for(const kind of ['plain','linked','independent']){
    let p=setRelationship(createProject(6,4),kind);p={...p,workflow:'in-the-round',display:{...p.display,proportional:true}};
    p=toggleCell(p,'a',0,0);p=setRowEdges(p,{top:0,bottom:0,left:1,right:1});
    if(kind==='independent')p=toggleCell(p,'b',1,1);
    const h=createHistory(p),clear=clearDesign(p);h.push(clear);
    assert.equal(isDesignClear(clear),true);assert.equal(clear.width,6);assert.equal(clear.height,4);
    assert.equal(clear.maskA,p.maskA);assert.equal(clear.display,p.display);assert.equal(clear.workflow,p.workflow);
    assert.equal(relationship(clear),kind);assert.deepEqual(h.undo(),p);assert.equal(clearDesign(clear),clear);
  }
});
