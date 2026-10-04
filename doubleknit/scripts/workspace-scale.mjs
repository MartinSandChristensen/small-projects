import assert from 'node:assert/strict';
import {createProject,setRowEdges} from '../src/model.js';

export async function checkWorkspaceScale(browser,url) {
 for(const kind of ['plain','independent','linked']) for(const notation of (kind==='plain'?['plus']:['plus','triangle'])) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-GB'});
  let project=createProject(200,200,kind==='plain'?'plain':'double-faced',kind==='linked');
  project.a=project.a.map((row,y)=>row.map((_,x)=>(x+y)%2));
  project=setRowEdges(project,{top:0,bottom:40,left:2,right:2});
  project.display={...project.display,notation,proportional:true,rows:30,guides:true};
  await context.addInitScript(project=>localStorage.setItem('doubleknit.currentProject',JSON.stringify(project)),project);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const front=page.locator('[aria-labelledby="title-A"]');
  const button=name=>page.getByRole('button',{name,exact:true});
  try {
   await page.goto(url);const cell=front.locator('[data-x="199"][data-y="199"]');await cell.waitFor();await cell.focus();await settle();
   let start=Date.now();await page.keyboard.press('Space');await settle();const edit=Date.now()-start;
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('doubleknit.currentProject')));assert.equal(saved.a[199][199],1);
   start=Date.now();await page.keyboard.press('Control+z');await settle();const undo=Date.now()-start;
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('doubleknit.currentProject')).a[199][199]),0);
   assert.ok(edit<1000,`${kind}/${notation} edit ${edit}ms`);assert.ok(undo<1000,`${kind}/${notation} undo ${undo}ms`);
   await button('Knit').click();await settle();
   const working=page.locator(`[aria-labelledby="title-${kind==='plain'?'A':'C'}"]`);
   assert.equal(await working.locator('.cell').count(),40000);
   await working.locator('.chart-navigation-details summary').click();
   await working.locator(`#jump-row-${kind==='plain'?'A':'C'}`).fill('150');
   await working.locator(`#jump-column-${kind==='plain'?'A':'C'}`).fill('100');
   await working.locator('.chart-navigation button').click();
   assert.ok(await working.locator('.chart-viewport').evaluate(e=>e.scrollLeft)>0);
   await button('Design').click();await settle();assert.equal(await front.locator('[role=gridcell][tabindex="0"]').count(),1);
   assert.deepEqual(errors,[]);console.log(`200 × 200 ${kind}/${notation}: edit ${edit} ms; undo ${undo} ms; shaped proportional Knit/navigation passed`);
  } finally {await context.close();}
 }
}
