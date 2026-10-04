import assert from 'node:assert/strict';
import { createProject } from '../src/model.js';

export async function checkLinked(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const linking = () => page.getByRole('checkbox', { name: 'Identical patterns on both faces', exact: true });
    const panel = face => page.locator(`[aria-labelledby="title-${face}"].chart-panel`);
    const cell = (x, y) => panel('A').locator(`[data-x="${x}"][data-y="${y}"]`);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
    const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const measure = async (locator, value) => locator.evaluate(async (el, value) => {
      const start = performance.now();
      if (value === undefined) el.click();
      else { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      return Math.round(performance.now() - start);
    }, value);
    const edit = async (x, y) => touch ? cell(x, y).tap() : cell(x, y).click();
    const transition = async () => { await linking().click(); await button('Confirm').click(); await settle(); };
    try {
      await page.goto(url);
      const initial = createProject(3, 1);
      initial.a = [[0, 0, 1]]; initial.b = [[0, 0, 0]];
      await page.evaluate(p => localStorage.setItem('doubleknit.currentProject', JSON.stringify(p)), initial);
      await page.reload();
      await page.locator('#project-name').fill('Independent');
      await button('Save named snapshot').click();
      const library = await page.evaluate(() => localStorage.getItem('doubleknit.namedProjects'));
      await edit(0, 0); await edit(1, 0); await button('Undo').click();
      await cell(2, 0).focus(); await page.keyboard.press('Shift+ArrowLeft');
      const before = await saved();
      await linking().click();
      assert.equal(await button('Cancel').evaluate(el => el === document.activeElement), true);
      assert.match(await page.locator('#confirmation-message').innerText(), /B design will be discarded.*cannot be undone.*Undo and redo history will be cleared/);
      await page.keyboard.press('Escape');
      assert.equal(await linking().isChecked(), false);
      assert.deepEqual(await saved(), before);
      assert.equal(await panel('A').locator('[aria-selected=true]').count(), 2);
      assert.equal(await button('Undo').isEnabled(), true);
      assert.equal(await button('Redo').isEnabled(), true);
      await transition();
      assert.equal(await linking().isChecked(), true);
      assert.equal(await panel('B').count(), 0);
      assert.equal(await page.locator('#jump-row-B').count(), 0);
      assert.equal(await page.locator('.chart-panel').count(), 2);
      assert.equal(await page.locator('#display-notation').count(), 1);
      assert.equal(await panel('A').locator('[aria-selected=true]').count(), 0);
      assert.equal(await button('Undo').isDisabled(), true);
      assert.equal(await button('Redo').isDisabled(), true);
      assert.equal(Object.hasOwn(await saved(), 'b'), false);
      assert.equal(await page.locator('#project-name').inputValue(), 'Independent');
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.namedProjects')), library);
      // Turn off retained area-selection mode before a single edit.
      await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
      const linked = await saved();
      await edit(0, 0); await button('Undo').click(); assert.deepEqual(await saved(), linked);
      await linking().click(); await button('Cancel').click(); assert.deepEqual(await saved(), linked);
      await transition();
      assert.deepEqual((await saved()).b, linked.a.map(row => row.map(v => 1 - v)));
      assert.equal(await button('Undo').isDisabled(), true);
      assert.equal(await button('Redo').isDisabled(), true);
      const b = (await saved()).b;
      await edit(0, 0); assert.deepEqual((await saved()).b, b);
      await transition();
      await button('Reset pattern').click(); await button('Confirm').click();
      assert.equal((await saved()).identicalPatterns, true);
      assert.equal(await button('Reset pattern').isDisabled(), true);
      await button('Undo').click();
      await page.locator('#project-name').fill('Linked'); await button('Save named snapshot').click();
      const download = page.waitForEvent('download'); await button('Export JSON').click();
      const path = await (await download).path(), exported = await saved();
      await transition();
      await page.locator('input[type=file]').setInputFiles(path); await button('Confirm').click();
      assert.deepEqual(await saved(), exported);
      assert.equal(await button('Undo').isDisabled(), true);
      await page.reload(); assert.equal(await linking().isChecked(), true);
      await page.getByLabel('Named saves', { exact: true }).selectOption({ label: 'Independent' });
      await button('Load snapshot').click(); await button('Confirm').click();
      assert.equal(await linking().isChecked(), false);
      await page.getByLabel('Named saves', { exact: true }).selectOption({ label: 'Linked' });
      await button('Load snapshot').click(); await button('Confirm').click();
      assert.deepEqual(await saved(), exported);
      await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...exported, b: exported.a })) });
      assert.match(await page.getByRole('alert').innerText(), /must not store face B/);
      assert.deepEqual(await saved(), exported);
      for (const notation of ['triangle', 'plus']) {
        const large = createProject(199, 199, 'double-faced', true);
        large.a = large.a.map((row, y) => row.map((_, x) => (x + y) % 2));
        large.display = { ...large.display, notation, proportional: true, rows: 30, guides: true };
        await page.evaluate(p => localStorage.setItem('doubleknit.currentProject', JSON.stringify(p)), large);
        await page.reload();
        await page.locator('#width').fill('200'); await page.locator('#height').fill('200');
        const metrics = { resize: await measure(button('Apply dimensions')) };
        assert.equal(await panel('A').locator('.cell').count(), 40000);
        assert.equal(await panel('C').locator('.cell').count(), 40000);
        metrics.edit = await measure(cell(199, 199));
        await cell(199, 199).focus(); await page.keyboard.press('Space');
        await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
        await edit(0, 0); await edit(199, 199);
        const preArea = await saved();
        metrics.area = await measure(button('Toggle selection'));
        assert.equal((await saved()).a[0][0], 1 - preArea.a[0][0]);
        metrics.undo = await measure(button('Undo'));
        assert.deepEqual(await saved(), preArea);
        metrics.switching = await measure(page.locator('#display-notation'), notation === 'plus' ? 'triangle' : 'plus');
        await page.locator('#jump-row-A').fill('200'); await page.locator('#jump-column-A').fill('1');
        metrics.navigation = await measure(panel('A').getByRole('button', { name: 'Go to stitch', exact: true }));
        assert.equal(await cell(0, 0).evaluate(el => el === document.activeElement), true);
        const current = await saved();
        // Check C yarn labels at asymmetric edge pairs after all deferred updates.
        for (const [x, y] of [[0, 0], [199, 199], [1, 199]]) {
          const label = await panel('C').locator('.chart-row').nth(y).locator('.cell').nth(x).getAttribute('aria-label');
          assert.ok(label.includes(`A ${current.a[y][x] ? 'pattern colour' : 'base colour'}`), label);
          assert.ok(label.includes(`B ${current.a[y][199 - x] ? 'pattern colour' : 'base colour'}`), label);
        }
        if (!touch) {
          assert.ok(metrics.resize < 3000 && metrics.undo < 3000, JSON.stringify(metrics));
          for (const key of ['edit', 'navigation']) assert.ok(metrics[key] < 1000, JSON.stringify(metrics));
        } else {
          const viewport = panel('A').locator('.chart-viewport'); await viewport.scrollIntoViewIfNeeded();
          const box = await viewport.boundingBox(), client = await context.newCDPSession(page);
          await client.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + 120),
            y: Math.round(Math.max(0, box.y) + 120), xDistance: -100, yDistance: -100, gestureSourceType: 'touch' });
          assert.deepEqual(await saved(), current);
        }
        const file = page.waitForEvent('download'); await button('Export JSON').click();
        const filePath = await (await file).path();
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(filePath);
        assert.ok(bytes.length < 1024 * 1024);
        assert.deepEqual(JSON.parse(bytes).project, current);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        console.log('PASS linked 200 × 200', { touch, notation, ...metrics, fileBytes: bytes.length });
      }
      // A confirmed toggle changes memory even when saving fails; saved B survives until retry.
      await page.evaluate(p => localStorage.setItem('doubleknit.currentProject', JSON.stringify(p)), initial);
      await page.reload();
      await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
      await transition();
      assert.deepEqual(await saved(), initial);
      assert.equal(await panel('B').count(), 0);
      assert.match(await page.getByRole('alert').innerText(), /not saved/);
      await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
      await button('Retry saving').click(); assert.equal(Object.hasOwn(await saved(), 'b'), false);
      await page.screenshot({ path: `/tmp/doubleknit-linked-${touch ? 'touch' : 'desktop'}.png`, fullPage: true });
      await page.evaluate(() => localStorage.setItem('doubleknit.currentProject', '{broken'));
      await page.reload(); await transition();
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), '{broken');
      await button('New').click(); await page.locator('#new-mode').selectOption('plain'); await button('Confirm').click();
      assert.equal(await linking().count(), 0);
      assert.deepEqual(errors, []);
      console.log('PASS linking confirmations, histories, persistence, recovery and hidden controls', { touch });
    } finally { await context.close(); }
  }
}
