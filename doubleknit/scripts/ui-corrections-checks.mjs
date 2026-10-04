import assert from 'node:assert/strict';
import { createProject } from '../src/model.js';

export async function checkUiCorrections(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch, locale: 'en-GB' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const front = page.locator('[aria-labelledby="title-A"]');
    const cell = (x, y) => front.locator(`[data-x="${x}"][data-y="${y}"]`);
    const source = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
    const tap = locator => touch ? locator.tap() : locator.click();
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    try {
      await page.goto(url);
      await button('New pattern').click();
      await page.locator('.creation-gauge summary').click();
      await page.locator('#new-stitches').fill('20');
      await button('Create pattern').click();
      assert.equal(await page.locator('.confirmation-dialog').evaluate(e => e.open), true);
      await page.locator('#new-rows').fill('30');
      await button('Create pattern').click(); await cell(0, 0).waitFor();
      assert.equal((await source()).display.proportional, true);
      assert.equal((await cell(0, 0).boundingBox()).width, 36);
      await page.locator('.project-title').click(); await page.locator('#header-project-name').fill('Ærø scarf');
      await page.locator('#header-project-name').press('Enter');
      assert.equal(await page.locator('h1').innerText(), 'Ærø scarf');
      await page.locator('.project-title').click(); await page.locator('#header-project-name').fill('Discard');
      await page.locator('#header-project-name').press('Escape'); assert.equal(await page.locator('h1').innerText(), 'Ærø scarf');
      await button('Project').click(); await page.locator('#project-name').fill('Ærø final');
      await page.locator('.project-name-form button').click();
      assert.match(await page.locator('.project-card.active small').innerText(), /20 × 20 stitches/);
      await button('Close panel').click(); await page.reload(); await cell(0, 0).waitFor();
      assert.equal(await page.locator('h1').innerText(), 'Ærø final');
      const lastRow = front.locator('.chart-row').last();
      assert.equal((await lastRow.locator('.row-guide-right').innerText()).trim(), '← 1');
      assert.equal((await lastRow.locator('.row-guide').first().innerText()).trim(), '');
      await button('Reverse').click();
      const reverse = page.locator('[aria-labelledby="title-B"]');
      assert.equal((await reverse.locator('.chart-row').last().locator('.row-guide').first().innerText()).trim(), '1 →');
      await button('Front').click();
      if (!touch) {
        await cell(3, 2).hover(); assert.equal(await front.locator('.cell-coordinate').innerText(), ' (4, 18)');
        await page.locator('.brand').hover(); assert.equal(await front.locator('.cell-coordinate').count(), 0);
      }
      const beforeZoom = await source(); await button('Fit').click(); await settle();
      const size = await cell(0, 0).boundingBox(); assert.ok(size.width <= 36); if (touch) assert.ok(size.width < 36);
      assert.ok(await front.locator('.chart-viewport').evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1));
      await button('Knit').click(); assert.equal((await cell(0, 0).boundingBox()).width, size.width);
      await button('Design').click(); await button('Reset zoom to 100%').click();
      assert.deepEqual(await source(), beforeZoom);
      await button('Shape').click();
      // Fit makes both edges reachable on touch without horizontal scrolling.
      await button('Fit').click();
      if (!touch) { await cell(1, 2).hover(); assert.equal(await front.locator('.shape-preview-cell').count(), 2); assert.deepEqual(await source(), beforeZoom); }
      await tap(cell(1, 2)); await tap(cell(18, 2)); await tap(cell(2, 3));
      await button('Apply shape').click();
      assert.deepEqual((await source()).maskA[2], [2, 18]); assert.deepEqual((await source()).maskA[3], [3, 20]);
      await button('Undo').click(); assert.deepEqual((await source()).maskA[2], [0, 20]);
      await button('Redo').click(); await button('Restore edge').click();
      await tap(cell(0, 2)); await tap(cell(19, 2)); await button('Apply shape').click();
      assert.deepEqual((await source()).maskA[2], [0, 20]);
      await button('Trim edge').click(); await tap(cell(1, 2)); await button('Cancel').click();
      assert.deepEqual((await source()).maskA[2], [0, 20]);
      await button('Pattern').click(); await page.locator('#workflow').selectOption('in-the-round'); await button('Close panel').click();
      assert.equal((await front.locator('.chart-row').nth(0).locator('.row-guide-right').innerText()).trim(), '← 20');
      await page.locator('#language').selectOption('da'); await button('Projekt').click();
      assert.match(await page.locator('.project-card.active small').innerText(), /20 × 20 masker/);
      await page.screenshot({ path: `/tmp/ui-corrections-${touch ? 'phone' : 'desktop'}-da.png` });
      await button('Luk panel').click(); await page.locator('#language').selectOption('en-GB');
      await button('Print / PDF').click(); await page.locator('.pdf-advanced summary').click();
      await page.locator('#pdf-paper').selectOption('a3'); assert.equal(await page.locator('#pdf-overlap').count(), 0);
      await page.locator('#pdf-paper').selectOption('tabloid'); assert.equal(await page.locator('#pdf-overlap').count(), 0);
      const download = page.waitForEvent('download'); await button('Download PDF').click();
      await (await download).saveAs(`/tmp/ui-corrections-${touch ? 'phone' : 'desktop'}-tabloid.pdf`);
      await page.locator('.pdf-dialog').waitFor({ state: 'detached' });
      assert.equal(await button('Print / PDF').evaluate(e => e === document.activeElement), true);
      assert.deepEqual(errors, []);
      console.log(`UI corrections ${touch ? 'touch' : 'desktop'}: rename, gauge, units, guides, hover, zoom, cumulative shape/restore/undo, large paper and PDF close passed`);
    } finally { await context.close(); }
  }
  // Maximum-size fit uses transient geometry, independent of saved source and printing.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'en-GB' });
  await context.addInitScript(project => localStorage.setItem('doubleknit.currentProject', JSON.stringify(project)), createProject(200, 200));
  try {
    const page = await context.newPage(); await page.goto(url);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    for (const mode of ['Design', 'Knit']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const viewport = page.locator('.chart-panel:visible .chart-viewport');
      assert.ok(await viewport.evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1));
    }
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click(); await page.locator('.pdf-advanced summary').click();
    assert.equal(await page.locator('#pdf-overlap').isVisible(), true);
    await page.locator('#pdf-paper').selectOption('a3');
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    await (await download).saveAs('/tmp/ui-corrections-a3-tiled.pdf');
    await page.locator('.pdf-dialog').waitFor({ state: 'detached' });
    console.log('UI corrections: 200 × 200 Fit in Design/Knit and tiled A3 PDF passed');
  } finally { await context.close(); }
}
