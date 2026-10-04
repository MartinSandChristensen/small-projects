import assert from 'node:assert/strict';
import { createProject } from '../src/model.js';

export async function checkWorkspace(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const front = page.locator('.chart-panel[aria-labelledby="title-A"]');
    const cell = (x, y) => front.locator(`[data-x="${x}"][data-y="${y}"]`);
    const tap = locator => touch ? locator.tap() : locator.click();
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
    const seed = createProject(8, 5);
    seed.a[1][0] = 1;
    await context.addInitScript(project => {
      if (!localStorage.getItem('doubleknit.currentProject')) localStorage.setItem('doubleknit.currentProject', JSON.stringify(project));
      localStorage.setItem('doubleknit.language', 'en-GB');
    }, seed);
    try {
      await page.goto(url);
      await cell(0, 0).waitFor();
      const chartTop = await front.locator('.chart-viewport').evaluate(element => element.getBoundingClientRect().top);
      assert.ok(chartTop < (touch ? 650 : 500), `chart starts too far down: ${chartTop}`);
      assert.equal(await front.locator('.chart-navigation-details').getAttribute('open'), null);
      await tap(button('Select'));
      await tap(cell(0, 0)); await tap(cell(1, 1));
      assert.equal(await front.locator('.cell.selected').count(), 4);
      await tap(button('Knit')); await tap(button('Design'));
      assert.equal(await front.locator('.cell.selected').count(), 4, 'workspace switch preserves selection');
      await tap(button('Deselect'));
      await tap(button('Draw'));
      await cell(0, 0).focus();
      await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
      assert.equal(await front.locator('.cell.selected').count(), 4, 'keyboard uses source-coordinate corners');
      await page.keyboard.press('Escape');
      await tap(button('Shape'));
      await tap(cell(1, 1));
      assert.equal(await front.locator('.shape-preview-cell').count(), 2);
      assert.deepEqual((await saved()).maskA[1], [0, 8], 'preview does not mutate project');
      await tap(button('Apply shape')); await settle();
      assert.deepEqual((await saved()).maskA[1], [2, 8]);
      assert.equal((await saved()).a[1][0], 1, 'trim retains hidden colours');
      await tap(button('Undo')); await settle();
      assert.deepEqual((await saved()).maskA[1], [0, 8], 'one undo restores edge');
      await tap(cell(1, 1)); await tap(button('Cancel'));
      assert.equal(await front.locator('.shape-preview-cell').count(), 0);
      assert.deepEqual((await saved()).maskA[1], [0, 8]);
      if (!touch) {
        const large = createProject(200, 200);
        await page.evaluate(project => localStorage.setItem('doubleknit.currentProject', JSON.stringify(project)), large);
        const started = Date.now();
        await page.reload(); await cell(0, 0).waitFor();
        assert.equal(await front.locator('.cell').count(), 40000);
        await cell(0, 0).focus(); await page.keyboard.press('Space'); await settle();
        assert.equal((await saved()).a[0][0], 1);
        console.log(`200 × 200 source chart reload and keyboard edit: ${Date.now() - started} ms`);
      }
      assert.deepEqual(errors, []);
      console.log(`Workspace ${touch ? 'touch' : 'desktop'}: chart placement, selection, keyboard, shape preview/cancel/apply/undo passed`);
    } finally { await context.close(); }
  }
}
