import assert from 'node:assert/strict';

export async function checkNotation(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const panel = face => page.locator(`.chart-panel[aria-labelledby="title-${face}"]`);
  const cell = (face, x, y) => panel(face).locator(`[data-x="${x}"][data-y="${y}"]`);
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByLabel('Notation', { exact: true }).selectOption('plus');
    assert.equal(await panel('B').locator('.black').count(), 0);
    assert.equal(await panel('C').locator('.pair-plus').count(), 0);
    assert.ok((await saved()).b.every(row => row.every(bit => bit === 1)));
    await page.locator('#width').fill('4'); await page.locator('#height').fill('2');
    await button('Apply dimensions').click();
    // Asymmetric B: mirrored physical pairs cover 01, 00, 11, 10 in each row.
    for (const y of [0, 1]) {
      await cell('A', 2, y).tap(); await cell('A', 3, y).tap();
      await cell('B', 0, y).tap(); await cell('B', 2, y).tap();
    }
    const original = await saved();
    await cell('B', 1, 1).focus();
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal(await panel('B').locator('[aria-selected=true]').count(), 2);
    for (const notation of ['triangle', 'plus', 'triangle', 'plus']) {
      await page.getByLabel('Notation', { exact: true }).selectOption(notation);
      assert.equal(await cell('B', 2, 1).getAttribute('tabindex'), '0');
      assert.equal(await panel('B').locator('[aria-selected=true]').count(), 2);
      assert.deepEqual((await saved()).a, original.a);
      assert.deepEqual((await saved()).b, original.b);
      const cells = panel('C').locator('.cell');
      assert.equal(await cells.count(), 8);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) {
        const c = cells.nth(y * 4 + x);
        const a = x >= 2 ? 1 : 0, b = x % 2 ? 0 : 1;
        assert.equal((await c.getAttribute('class')).includes('pair-plus'), notation === 'plus' && b === 0);
        assert.equal((await c.getAttribute('class')).includes('pair-split'), notation === 'triangle' && a !== b);
        assert.match(await c.getAttribute('aria-label'), y === 1 ? /A .* first, then B/ : /B .* first, then A/);
        assert.equal(await c.getAttribute('tabindex'), null);
        if (notation === 'triangle' && a !== b) {
          assert.match(await c.getAttribute('style'), y === 1 ? /225deg/ : /135deg/);
        }
      }
      assert.match(await cell('B', 0, 0).getAttribute('aria-label'), /pattern colour/);
      await page.getByLabel('Show guide frames').check();
      await page.screenshot({ path: `/tmp/doubleknit-${notation}.png`, fullPage: true });
    }
    await button('Undo').click();
    assert.equal(await page.getByLabel('Notation', { exact: true }).inputValue(), 'triangle');
    await button('Redo').click();
    assert.equal(await page.getByLabel('Notation', { exact: true }).inputValue(), 'plus');
    await panel('B').getByRole('button', { name: 'Select area', exact: true }).click();
    await cell('B', 0, 0).tap();
    await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="title-C"] .pair-plus').length === 3);
    await button('Undo').click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="title-C"] .pair-plus').length === 4);
    // Adjacent plus symbols on white/black backgrounds remain inside their own cells.
    await cell('B', 1, 0).tap();
    await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="title-C"] .pair-plus').length === 5);
    const arms = await panel('C').locator('.pair-plus').evaluateAll(cells => cells.map(el => {
      const style = getComputedStyle(el);
      return { size: style.backgroundSize, position: style.backgroundPosition, repeat: style.backgroundRepeat,
        image: style.backgroundImage, colour: style.color, black: el.classList.contains('black') };
    }));
    for (const arm of arms) {
      assert.equal(arm.size, 'calc(100% - 6px) 3px, 3px calc(100% - 6px)');
      assert.equal(arm.position, '50% 50%, 50% 50%');
      assert.equal(arm.repeat, 'no-repeat, no-repeat');
      assert.equal(arm.colour, arm.black ? 'rgb(255, 255, 255)' : 'rgb(23, 28, 25)');
      assert.equal(arm.image, `linear-gradient(${arm.colour}, ${arm.colour}), linear-gradient(${arm.colour}, ${arm.colour})`);
    }
    await page.screenshot({ path: '/tmp/doubleknit-plus-adjacent.png', fullPage: true });
    await button('Undo').click();
    await page.locator('#jump-column-C').fill('5');
    await panel('C').getByRole('button', { name: 'Go to pair' }).click();
    assert.match(await panel('C').getByRole('alert').innerText(), /column from 1 to 4/);
    await page.locator('#jump-column-C').fill('4');
    await panel('C').getByRole('button', { name: 'Go to pair' }).click();
    assert.equal(await panel('C').locator('.chart-viewport').evaluate(el => el === document.activeElement), true);
    await page.locator('#project-name').fill('Compact');
    await button('Save named snapshot').click();
    const before = await saved();
    const download = page.waitForEvent('download');
    await button('Export JSON').click();
    const filePath = await (await download).path();
    await button('Reset pattern').click(); await button('Confirm').click();
    assert.equal(await page.getByLabel('Notation', { exact: true }).inputValue(), 'triangle');
    await page.locator('input[type=file]').setInputFiles(filePath); await button('Confirm').click();
    assert.deepEqual(await saved(), before);
    await page.reload();
    assert.equal(await page.getByLabel('Notation', { exact: true }).inputValue(), 'plus');
    await page.getByLabel('Notation', { exact: true }).selectOption('triangle');
    await page.getByLabel('Named saves', { exact: true }).selectOption({ label: 'Compact' });
    await button('Load snapshot').click(); await button('Confirm').click();
    assert.deepEqual(await saved(), before);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS compact truth table, directions, source selection, B edits, history, pair navigation, touch, reload, snapshots and downloaded-file round-trip');
  } finally { await context.close(); }
}
