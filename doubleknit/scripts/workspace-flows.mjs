import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {png,rgba} from './raster-fixtures.mjs';
import {createProject} from '../src/model.js';

export async function checkWorkspaceFlows(browser,url) {
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'en-GB'});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const source=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('doubleknit.currentProject')));
  const library=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('doubleknit.namedProjects')));
  const front=page.locator('.chart-panel[aria-labelledby="title-A"]');
  const back=page.locator('.chart-panel[aria-labelledby="title-B"]');
  const cell=(x,y)=>front.locator(`[data-x="${x}"][data-y="${y}"]`);
  const close=()=>button('Close panel').click();
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const active=async()=>{const l=await library();return l.entries.find(e=>e.id===l.activeId);};
  const projectMenu=()=>button('Project').click();
  async function rename(name){await projectMenu();const card=page.locator('.project-card.active');await card.getByRole('button',{name:'Rename',exact:true}).click();await card.getByLabel('Project name').fill(name);await card.getByRole('button',{name:'Rename',exact:true}).click();await close();}
  try {
    await page.goto(url);
    await button('New pattern').first().click();
    await page.locator('[name="new-relationship"][value="independent"]').check();
    await page.locator('#new-width').fill('8');await page.locator('#new-height').fill('6');
    await button('Create pattern').click();await cell(0,0).waitFor();
    assert.equal((await source()).display.notation,'plus');
    await cell(0,0).click();await rename('Winter scarf');
    const firstId=(await active()).id;
    await page.reload();await cell(0,0).waitFor();assert.equal(await page.locator('h1').innerText(),'Winter scarf');
    assert.equal((await active()).project.a[0][0],1);
    await button('Reverse').click();assert.equal(await back.locator('.black').count(),48);
    await button('Knit').click();await button('Pattern').click();
    await page.locator('#display-notation').selectOption('triangle');
    assert.equal(await page.getByLabel('Use a gauge for stitch proportions',{exact:true}).isChecked(),true);
    await page.locator('#display-rows').fill('30');await button('Apply gauge').click();await close();await settle();
    const geometry=await page.locator('[aria-labelledby="title-C"] .cell').first().boundingBox();assert.equal(geometry.width,36);
    await button('Design').click();assert.equal(await back.locator('.black').count(),48,'notation must not invert reverse design');
    await button('Front').click();assert.equal((await cell(0,0).boundingBox()).width,36);
    await button('Print / PDF').click();
    assert.ok(await page.locator('.pdf-paper-preview rect').count()>1);
    const pdfWait=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();
    const pdf=await pdfWait;await pdf.saveAs('/tmp/doubleknit-workspace.pdf');
    assert.equal((await readFile('/tmp/doubleknit-workspace.pdf')).subarray(0,4).toString(),'%PDF');
    await page.locator('.pdf-dialog').waitFor({state:'detached'});
    await projectMenu();const fileWait=page.waitForEvent('download');await button('Save pattern to file').click();
    const file=await fileWait;await file.saveAs('/tmp/doubleknit-workspace.doubleknit.json');
    const exported=JSON.parse(await readFile('/tmp/doubleknit-workspace.doubleknit.json','utf8'));assert.equal(exported.name,'Winter scarf');
    await button('Make a copy').click();assert.notEqual((await active()).id,firstId);await close();
    await cell(1,0).click();assert.equal((await library()).entries.find(e=>e.id===firstId).project.a[0][1],0);
    await projectMenu();await page.locator('.project-card').filter({has:page.getByText('Winter scarf',{exact:true})}).locator('.project-open').click();
    assert.equal((await active()).id,firstId);assert.equal((await source()).a[0][1],0);
    await button('Pattern').click();await page.locator('.pattern-settings details').first().locator('summary').click();
    await page.locator('[name="settings-relationship"][value="linked"]').click();await button('Change reverse').click();await close();
    assert.equal((await source()).identicalPatterns,true);await button('Undo').click();assert.equal((await source()).identicalPatterns,false);
    await button('Pattern').click();await page.locator('#width').fill('7');await button('Apply dimensions').click();
    await button('Confirm').click();await close();assert.equal((await source()).width,7);await button('Undo').click();assert.equal((await source()).width,8);
    await button('Pattern').click();await page.locator('.pattern-settings details').last().locator('summary').click();await page.locator('.pattern-settings').getByRole('button',{name:'Clear design',exact:true}).click();await button('Confirm').click();await close();
    assert.equal((await source()).a[0][0],0);assert.equal((await source()).width,8);await button('Undo').click();assert.equal((await source()).a[0][0],1);
    await projectMenu();await button('New pattern').click();await button('Create pattern').click();assert.equal((await source()).mode,'plain');
    assert.equal((await library()).entries.find(e=>e.id===firstId).name,'Winter scarf');
    await projectMenu();await page.locator('#import-project').setInputFiles('/tmp/doubleknit-workspace.doubleknit.json');
    await cell(0,0).waitFor();assert.equal((await source()).mode,'double-faced');assert.notEqual((await active()).id,firstId);
    const beforeImage=await source();await projectMenu();await button('Start from image').click();
    await page.locator('[name="raster-relationship"][value="plain"]').check();
    await page.locator('#raster-a').setInputFiles({name:'motif.png',mimeType:'image/png',buffer:png(3,2,rgba(['010','101']))});
    await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.locator('.raster-previews canvas').waitFor();
    assert.deepEqual(await source(),beforeImage,'image preview must not replace work');
    await page.locator('#raster-confirm').check();await button('Import pattern').click();
    assert.equal((await source()).width,3);assert.equal((await source()).mode,'plain');
    assert.deepEqual((await source()).a,[[0,1,0],[1,0,1]]);
    await button('Help').click();await page.locator('#language').selectOption('da');
    assert.equal(await page.locator('html').getAttribute('lang'),'da');
    await page.getByRole('button',{name:'Luk panel',exact:true}).click();
    await page.screenshot({path:'/tmp/doubleknit-workspace-danish.png'});
    assert.deepEqual(errors,[]);
    console.log('Workspace flows: creation, project identity/copy/rename/reload, actual colours, unified gauge, JSON/PDF downloads, relationship/resize/clear undo, raster preview/import and Danish passed');
  } finally {await context.close();}

  // Recovery guards are exercised in separate profiles and retain the exact original bytes.
  for(const failure of ['current','library','quota']) {
    const c=await browser.newContext({viewport:{width:1000,height:800},locale:'en-GB'});
    await c.addInitScript(({project,failure})=>{
      localStorage.setItem('doubleknit.currentProject',failure==='current'?'{broken':JSON.stringify(project));
      if(failure==='library')localStorage.setItem('doubleknit.namedProjects','{broken-library');
      if(failure==='quota'){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='doubleknit.namedProjects')throw new DOMException('Quota exceeded','QuotaExceededError');return set.call(this,k,v);};}
    },{project:createProject(3,2),failure});
    const p=await c.newPage();await p.goto(url);await p.locator('[role=grid]').first().waitFor();
    await p.locator('[aria-labelledby="title-A"] [data-x="0"][data-y="0"]').click();
    assert.ok(await p.locator('.storage-warning').count()>0);
    if(failure==='current')assert.equal(await p.evaluate(()=>localStorage.getItem('doubleknit.currentProject')),'{broken');
    if(failure==='library')assert.equal(await p.evaluate(()=>localStorage.getItem('doubleknit.namedProjects')),'{broken-library');
    await p.locator('.panel-menu').getByRole('button',{name:'Project',exact:true}).click();
    assert.equal(await p.getByRole('button',{name:'Save pattern to file',exact:true}).isEnabled(),true);
    await c.close();
  }
  console.log('Workspace recovery: protected current data, corrupt library and quota failures retain editing/file export');
  const tabs=await browser.newContext({viewport:{width:1000,height:800},locale:'en-GB'});
  await tabs.addInitScript(project=>{if(!localStorage.getItem('doubleknit.currentProject'))localStorage.setItem('doubleknit.currentProject',JSON.stringify(project));},createProject(3,2));
  try {
    const a=await tabs.newPage(),b=await tabs.newPage();await a.goto(url);await a.locator('[role=grid]').first().waitFor();
    await b.goto(url);await b.locator('[role=grid]').first().waitFor();
    await b.locator('[aria-labelledby="title-A"] [data-x="0"][data-y="0"]').click();
    const external=await b.evaluate(()=>localStorage.getItem('doubleknit.currentProject'));
    await a.locator('[aria-labelledby="title-A"] [data-x="1"][data-y="0"]').click();
    assert.equal(await a.evaluate(()=>localStorage.getItem('doubleknit.currentProject')),external);
    assert.ok(await a.locator('.storage-warning').count()>0);
  } finally {await tabs.close();}
  console.log('Workspace two-tab conflict preserves the other tab’s draft');

}
