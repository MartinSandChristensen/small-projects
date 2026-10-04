import assert from 'node:assert/strict';
import { createProject } from '../src/model.js';

export async function checkPlain(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const panel = page.locator('[aria-labelledby="title-A"].chart-panel');
    const cell = (x, y) => panel.locator(`[data-x="${x}"][data-y="${y}"]`);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const edit = async (x, y) => touch ? cell(x, y).tap() : cell(x, y).click();
    try {
      await page.goto(url);
      await button('New').click();
      assert.equal(await page.locator('#new-mode').inputValue(), 'double-faced');
      assert.equal(await button('Cancel').evaluate(el => el === document.activeElement), true);
      await button('Cancel').click();
      assert.equal(await page.getByRole('grid').count(), 0);
      assert.equal(await saved(), null);
      await button('New').click();
      await page.locator('#new-mode').selectOption('plain');
      await button('Confirm').click();
      assert.equal((await saved()).mode, 'plain');
      assert.equal(await button('Reset pattern').isDisabled(), true);
      assert.equal(await page.locator('.chart-panel').count(), 1);
      assert.equal(await page.locator('#display-notation, #jump-row-B, #jump-row-C').count(), 0);
      assert.equal(await panel.locator('.row-guide-right').last().innerText(), '← 1');
      assert.equal(await panel.locator('.chart-row').nth(18).locator('.row-guide').first().innerText(), '2 →');
      await page.locator('#project-name').fill('Keep me');
      await edit(19, 19);
      await button('Save named snapshot').click();
      const named = await page.evaluate(() => localStorage.getItem('doubleknit.namedProjects'));
      await cell(19, 19).focus(); await page.keyboard.press('Shift+ArrowLeft');
      const before = await saved();
      await button('New').click(); await page.locator('#new-mode').selectOption('double-faced');
      await page.keyboard.press('Escape');
      assert.deepEqual(await saved(), before);
      assert.equal(await page.locator('#project-name').inputValue(), 'Keep me');
      assert.equal(await panel.locator('[aria-selected=true]').count(), 2);
      assert.equal(await button('Undo').isEnabled(), true);
      await button('Reset pattern').click(); await button('Confirm').click();
      assert.equal(await button('Reset pattern').isDisabled(), true);
      assert.equal((await saved()).mode, 'plain');
      assert.equal(await page.locator('#project-name').inputValue(), 'Keep me');
      await button('Undo').click(); assert.deepEqual(await saved(), before);
      await button('New').click(); await button('Confirm').click();
      assert.equal((await saved()).mode, 'double-faced');
      assert.equal(await button('Undo').isDisabled(), true);
      assert.equal(await page.locator('#project-name').inputValue(), 'Untitled');
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.namedProjects')), named);
      await page.getByLabel('Named saves', { exact: true }).selectOption({ label: 'Keep me' });
      await button('Load snapshot').click(); await button('Confirm').click();
      assert.equal((await saved()).mode, 'plain');
      assert.equal(await page.locator('.chart-panel').count(), 1);
      await page.reload();
      assert.equal(await page.locator('.chart-panel').count(), 1);
      const download = page.waitForEvent('download');
      await button('Export JSON').click();
      const filePath = await (await download).path();
      const exported = await saved();
      assert.equal(Object.hasOwn(exported, 'b'), false);
      await edit(18, 19);
      await page.locator('input[type=file]').setInputFiles(filePath); await button('Confirm').click();
      assert.deepEqual(await saved(), exported);
      await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...exported, b: exported.a })) });
      assert.match(await page.getByRole('alert').innerText(), /must not store face B/);
      assert.deepEqual(await saved(), exported);
      // A saved, hidden notation remains valid but has no visual effect.
      const large = createProject(199, 199, 'plain');
      large.display = { ...large.display, notation: 'plus', guides: true, proportional: true, rows: 30 };
      large.a = large.a.map((row, y) => row.map((_, x) => (x + y) % 2));
      await page.evaluate(p => localStorage.setItem('doubleknit.currentProject', JSON.stringify(p)), large);
      await page.reload();
      await page.locator('#width').fill('200'); await page.locator('#height').fill('200');
      let start = Date.now(); await button('Apply dimensions').click(); await settle();
      const metrics = { resize: Date.now() - start };
      assert.equal(await panel.locator('.cell').count(), 40000);
      start = Date.now(); await edit(199, 199); await settle(); metrics.edit = Date.now() - start;
      assert.equal((await saved()).a[199][199], 1);
      await cell(199, 199).focus(); await page.keyboard.press('Space');
      assert.equal((await saved()).a[199][199], 0);
      await button('Select area').click();
      await edit(0, 0); await edit(199, 199);
      const preArea = await saved();
      start = Date.now(); await button('Toggle selection').click(); await settle(); metrics.area = Date.now() - start;
      assert.equal((await saved()).a[0][0], 1 - preArea.a[0][0]);
      start = Date.now(); await button('Undo').click(); await settle(); metrics.undo = Date.now() - start;
      assert.deepEqual(await saved(), preArea);
      await page.locator('#jump-row-A').fill('200'); await page.locator('#jump-column-A').fill('1');
      start = Date.now(); await button('Go to stitch').click(); await settle(); metrics.navigation = Date.now() - start;
      assert.equal(await cell(0, 0).evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (!touch) {
        assert.ok(metrics.resize < 3000 && metrics.undo < 3000, JSON.stringify(metrics));
        for (const key of ['edit', 'navigation']) assert.ok(metrics[key] < 1000, JSON.stringify(metrics));
      }
      if (touch) {
        const viewport = panel.locator('.chart-viewport');
        const preScroll = await saved();
        await viewport.scrollIntoViewIfNeeded();
        const bounds = await viewport.boundingBox();
        const client = await context.newCDPSession(page);
        await client.send('Input.synthesizeScrollGesture', {
          x: Math.round(bounds.x + 120), y: Math.round(Math.max(0, bounds.y) + 120),
          xDistance: -100, yDistance: -100, gestureSourceType: 'touch' });
        assert.deepEqual(await saved(), preScroll);
      }
      console.log('PASS Plain creation/cancellation, reset, mode replacements, files, keyboard/touch and 200 × 200', { touch, ...metrics });
      // New and disabled Reset cannot overwrite protected bytes.
      await page.evaluate(() => localStorage.setItem('doubleknit.currentProject', '{broken'));
      await page.reload();
      assert.equal(await button('Reset pattern').isDisabled(), true);
      await button('New').click(); await page.locator('#new-mode').selectOption('plain'); await button('Confirm').click();
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), '{broken');
      assert.equal(await button('Reset pattern').isDisabled(), true);
      await button('Replace unreadable saved data').click(); await button('Confirm').click();
      assert.equal((await saved()).mode, 'plain');
      const savedDefault = await saved();
      await page.evaluate(() => {
        window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
      });
      await edit(19, 19);
      assert.deepEqual(await saved(), savedDefault);
      assert.match(await page.getByRole('alert').innerText(), /Saving failed/);
      await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
      await button('Retry saving').click();
      assert.equal((await saved()).a[19][19], 1);
      await page.screenshot({ path: touch ? '/tmp/doubleknit-plain-touch.png' : '/tmp/doubleknit-plain-desktop.png', fullPage: true });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
}
