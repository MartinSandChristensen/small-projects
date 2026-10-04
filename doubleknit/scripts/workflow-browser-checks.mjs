import assert from 'node:assert/strict';
import { createProject, setWorkflow } from '../src/model.js';
import { parseProjectFile } from '../src/projects.js';

export async function checkWorkflow(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const panel = face => page.locator(`.chart-panel[aria-labelledby="title-${face}"]`);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
    const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    async function seed(p) {
      await page.evaluate(p => localStorage.setItem('doubleknit.currentProject', JSON.stringify(p)), p);
      await page.reload(); await panel('A').waitFor(); await settle();
    }
    async function choose(value) { await page.getByRole('combobox', { name: 'Knitting workflow', exact: true }).selectOption(value); await settle(); }
    async function verify(p) {
      const round = p.workflow === 'in-the-round', working = panel(p.mode === 'plain' ? 'A' : 'C');
      const right = await working.locator('.row-guide-right').allTextContents();
      const left = await working.locator('.row-guide:not(.row-guide-right)').allTextContents();
      for (let y = 0; y < p.height; y++) {
        const n = p.height - y, rtl = round || n % 2;
        assert.equal(right[y].trim(), rtl ? `← ${n}` : '');
        assert.equal(left[y].trim(), rtl ? '' : `${n} →`);
      }
      const label = await panel('A').locator('.cell').first().getAttribute('aria-label');
      assert.match(label, round ? /knitting round/ : /knitting row/);
      assert.equal(await page.locator('#jump-row-A').evaluate(el => el.labels[0].textContent.trim()), round ? 'Round' : 'Row');
      if (round) assert.equal(await page.locator('.chart-row').filter({ hasText: '→' }).count(), 0);
      if (p.mode === 'double-faced') {
        const labels = await panel('C').locator('.cell:not(.absent)').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
        if (round) assert.ok(labels.every(label => /Knitting round .* A .* first, then B/.test(label)));
        assert.ok((await panel('C').locator('.absent').allTextContents()).every(s => s === ''));
        const absent = await panel('C').locator('.absent').first().getAttribute('aria-label');
        assert.match(absent, /absent pair$/); assert.doesNotMatch(absent, /first|yarn|white|black/);
        if (round && p.display.notation === 'triangle') {
          const backgrounds = await panel('C').locator('.pair-split').evaluateAll(els => els.map(el => el.style.backgroundImage));
          assert.ok(backgrounds.length); assert.ok(backgrounds.every(s => s.includes('225deg')));
          assert.equal(await page.locator('.legend-samples .cell').count(), 4);
        }
      }
    }
    try {
      await page.goto(url);
      for (const [mode, linked] of [['plain', false], ['double-faced', false], ['double-faced', true]]) {
        for (const notation of mode === 'plain' ? ['triangle'] : ['triangle', 'plus']) {
          const p = createProject(5, 4, mode, linked);
          p.a = [[0, 1, 0, 1, 0], [0, 0, 1, 1, 0], [1, 0, 0, 1, 0], [0, 1, 1, 0, 1]];
          p.maskA = [null, [1, 4], [0, 5], [0, 5]];
          p.display = { ...p.display, notation, guides: true, proportional: true, rows: 30 };
          await seed(p);
          await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
          await panel('A').locator('[data-x="1"][data-y="2"]').click();
          await panel('A').locator('[data-x="2"][data-y="2"]').click();
          const selection = await panel('A').locator('[aria-selected=true]').count();
          const guides = await page.locator('.guide-overlay').evaluateAll(els => els.map(el => el.innerHTML));
          const focus = await panel('A').locator('[tabindex="0"]').getAttribute('data-x');
          await choose('in-the-round');
          const round = await saved(); assert.deepEqual(round, { ...p, workflow: 'in-the-round' });
          assert.equal(await panel('A').locator('[aria-selected=true]').count(), selection);
          assert.equal(await panel('A').locator('[tabindex="0"]').getAttribute('data-x'), focus);
          assert.deepEqual(await page.locator('.guide-overlay').evaluateAll(els => els.map(el => el.innerHTML)), guides);
          await verify(round);
          await button('Undo').click(); await settle(); assert.deepEqual(await saved(), p); await verify(p);
          await button('Redo').click(); await settle(); assert.deepEqual(await saved(), round); await verify(round);
          await choose('flat'); await verify(p); await choose('in-the-round');
          await page.reload(); await panel('A').waitFor(); await settle(); await verify(round);
          await button('Reset pattern').click(); await button('Cancel').click(); assert.deepEqual(await saved(), round);
          await button('Reset pattern').click(); await button('Confirm').click(); await settle();
          assert.equal((await saved()).workflow, 'flat');
          await button('Undo').click(); await settle(); assert.deepEqual(await saved(), round); await verify(round);
          // An actual downloaded file must contain the workflow and preserve hidden notation.
          const downloadPromise = page.waitForEvent('download');
          await button('Export JSON').click(); const download = await downloadPromise;
          const stream = await download.createReadStream(), chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          assert.deepEqual(parseProjectFile(Buffer.concat(chunks).toString()).project, round);
          const target = panel('A').locator('[data-x="1"][data-y="2"]');
          if (touch) await target.tap(); else await target.click();
          await settle();
          const edited = await saved(); assert.equal(edited.a[2][1], 1 - round.a[2][1]);
          await choose('flat'); assert.deepEqual(await saved(), { ...edited, workflow: 'flat' });
          await choose('in-the-round'); assert.deepEqual(await saved(), edited);
          await page.locator('#height').fill('5'); await button('Apply dimensions').click(); await settle();
          assert.equal((await saved()).workflow, 'in-the-round');
          assert.deepEqual((await saved()).a.slice(1), edited.a);
          await page.locator('#shape-first').fill('2'); await page.locator('#shape-last').fill('2');
          await button('Empty rounds').click();
          assert.match(await page.locator('#shape-error').innerText(), /Empty rounds are allowed/);

        }
      }
      // Workflow is the only difference from defaults: Reset must still be available.
      await seed(createProject()); assert.equal(await button('Reset pattern').isDisabled(), true);
      await choose('in-the-round'); assert.equal(await button('Reset pattern').isEnabled(), true);
      await button('New').click(); await button('Confirm').click(); await settle();
      assert.equal((await saved()).workflow, 'flat');
      // The same guarded save boundary protects unreadable bytes on a workflow change.
      await page.evaluate(() => localStorage.setItem('doubleknit.currentProject', '{broken'));
      await page.reload(); await panel('A').waitFor(); await choose('in-the-round');
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), '{broken');
      await button('Undo').click(); await settle();
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), '{broken');
      // Maximum-size cache invalidation and narrow layout, in all source modes.
      for (const [mode, linked] of [['plain', false], ['double-faced', false], ['double-faced', true]]) {
        const p = createProject(200, 200, mode, linked);
        p.maskA = p.maskA.map((_, y) => [y % 80, 200 - y % 80]);
        p.display.guides = true;
        await seed(p);
        const start = await page.evaluate(() => performance.now());
        await choose('in-the-round');
        const elapsed = Math.round(await page.evaluate(() => performance.now()) - start);
        assert.deepEqual(await saved(), setWorkflow(p, 'in-the-round'));
        assert.equal(await panel(mode === 'plain' ? 'A' : 'C').locator('.row-guide-right').filter({ hasText: '←' }).count(), 200);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        console.log('PASS workflow 200 × 200', { touch, mode, linked, switchMs: elapsed });
      }
      await page.screenshot({ path: `/tmp/doubleknit-workflow-${touch ? 'touch' : 'desktop'}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log('PASS workflow directions, caches, legends, selection, guides, history, reset, files and protected storage', { touch });
    } finally { await context.close(); }
  }
}
