import assert from 'node:assert/strict';

export async function checkDisplay(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(() => localStorage.getItem('doubleknit.currentProject'));
  const geometry = face => page.locator(`[aria-labelledby="title-${face}"] .cell`).first().evaluate(el => {
    const { width, height } = el.getBoundingClientRect(); return { width, height };
  });
  const apply = async (stitches, rows, guideSize = '10') => {
    await page.getByLabel('Gauge stitches per 10 cm', { exact: true }).fill(stitches);
    await page.getByLabel('Gauge rows per 10 cm', { exact: true }).fill(rows);
    await page.getByLabel('Guide size (1–200)', { exact: true }).fill(guideSize);
    await button('Apply display settings').click();
  };
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('heading', { name: 'Two faces. One pattern.' }).waitFor();
    assert.deepEqual(await geometry('A'), { width: 24, height: 24 });
    assert.equal(await page.locator('.guide-overlay').count(), 0);
    await page.getByLabel('Use gauge proportions on A/B').check();
    for (const [stitches, rows, width, height, clamped] of [
      ['20', '30', 36, 24, false], ['40', '10', 24, 48, true], ['10', '40', 48, 24, true],
    ]) {
      await apply(stitches, rows);
      for (const face of ['A', 'B']) assert.deepEqual(await geometry(face), { width, height });
      assert.deepEqual(await geometry('C'), { width: 24, height: 24 });
      assert.equal(await page.getByText(/ratio is clamped/).count(), Number(clamped));
    }
    const beforeInvalid = await saved();
    for (const [stitches, rows, size, field] of [
      ['', '30', '10', 'stitches'], ['0', '30', '10', 'stitches'], ['Infinity', '30', '10', 'stitches'],
      ['20', '-1', '10', 'rows'], ['20', '30', '1.5', 'guideSize'], ['20', '30', '201', 'guideSize'],
    ]) {
      await apply(stitches, rows, size);
      assert.equal(await saved(), beforeInvalid);
      assert.deepEqual(await geometry('A'), { width: 48, height: 24 });
      assert.equal(await page.locator('#display-' + field).getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#display-' + field).evaluate(el => el === document.activeElement), true);
    }
    await apply('20', '30');
    await page.getByLabel('Show guide frames').check();
    await page.locator('#width').fill('23'); await page.locator('#height').fill('12');
    await button('Apply dimensions').click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="title-C"] .cell').length === 23 * 12);
    for (const [face, positions] of [['A', [0, 108, 468, 828]], ['B', [0, 360, 720, 828]], ['C', [0, 72, 312, 552]]]) {
      assert.deepEqual(await page.locator(`[aria-labelledby="title-${face}"] .vertical`).evaluateAll(els =>
        els.map(el => parseFloat(el.style.left))), positions);
      assert.deepEqual(await page.locator(`[aria-labelledby="title-${face}"] .horizontal`).evaluateAll(els =>
        els.map(el => parseFloat(el.style.top))), [0, 48, 288]);
      const aligned = await page.locator(`[aria-labelledby="title-${face}"] .chart-content`).evaluate(el => {
        const cell = el.querySelector('.cell').getBoundingClientRect();
        const frame = el.querySelector('.guide-overlay').getBoundingClientRect();
        return cell.x === frame.x && cell.y === frame.y;
      });
      assert.equal(aligned, true);
    }
    const display = JSON.parse(await saved()).display;
    await page.locator('#project-name').fill('Display'); await button('Save named snapshot').click();
    await page.reload();
    assert.equal(await page.getByLabel('Gauge rows per 10 cm', { exact: true }).inputValue(), '30');
    assert.deepEqual(await geometry('A'), { width: 36, height: 24 });
    const oldCells = JSON.parse(await saved()).a;
    await page.getByLabel('Use gauge proportions on A/B').uncheck();
    assert.deepEqual(await geometry('A'), { width: 24, height: 24 });
    assert.deepEqual(JSON.parse(await saved()).a, oldCells);
    const cell = page.locator('[aria-labelledby="title-A"] [data-x="0"][data-y="0"]');
    await cell.tap();
    assert.equal(JSON.parse(await saved()).a[0][0], 1);
    await button('Reset pattern').click(); await button('Cancel').click();
    assert.equal(JSON.parse(await saved()).display.guides, true);
    await button('Reset pattern').click(); await button('Confirm').click();
    assert.equal(await page.getByLabel('Show guide frames').isChecked(), false);
    assert.equal(await page.getByLabel('Gauge rows per 10 cm', { exact: true }).inputValue(), '20');
    await page.getByLabel('Named saves', { exact: true }).selectOption({ label: 'Display' });
    await button('Load snapshot').click(); await button('Confirm').click();
    assert.deepEqual(JSON.parse(await saved()).display, display);
    assert.deepEqual(await geometry('A'), { width: 36, height: 24 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/doubleknit-display.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS gauge/clamps, invalid display transactions, mirrored partial guides, touch, reload, reset and snapshots');
  } finally { await context.close(); }
}
