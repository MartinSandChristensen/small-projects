import assert from 'node:assert/strict';

export async function checkEditing(browser, url, devices, notation = 'triangle') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const panel = face => page.locator(`.chart-panel[aria-labelledby="title-${face}"]`);
  const cell = (face, x, y) => panel(face).locator(`[data-x="${x}"][data-y="${y}"]`);
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => page.evaluate(() => localStorage.getItem('doubleknit.currentProject'));
  const confirm = () => button('Confirm').click();
  async function seed(raw) {
    await page.evaluate(raw => localStorage.setItem('doubleknit.currentProject', raw), raw);
    await page.reload();
    await page.locator('#width').waitFor();
  }
  async function matchesC() {
    await page.waitForFunction(() => {
      const p = JSON.parse(localStorage.getItem('doubleknit.currentProject'));
      const cells = [...document.querySelectorAll('[aria-labelledby="title-C"] .cell')];
      return cells.length === p.width * p.height && cells.every((el, i) => {
        const y = Math.floor(i / p.width), x = i % p.width;
        return Number(el.classList.contains('black')) === p.a[y][x]
              && el.classList.contains(p.display.notation === 'plus' ? 'pair-plus' : 'pair-split')
                === (p.display.notation === 'plus' ? p.b[y][p.width - 1 - x] === 0 : p.a[y][x] !== p.b[y][p.width - 1 - x]);
      });
    });
  }
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.locator('#width').waitFor();
    await page.getByLabel('Notation', { exact: true }).selectOption(notation);
    await page.locator('#width').fill('4');
    await page.locator('#height').fill('3');
    await button('Apply dimensions').click();
    await cell('A', 1, 1).click();
    const before = await saved();
    await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
    await cell('A', 2, 2).click();
    await cell('A', 1, 1).click();
    assert.equal(await panel('A').locator('[aria-selected=true]').count(), 4);
    assert.equal(await saved(), before);
    await panel('A').getByRole('button', { name: 'Toggle selection' }).click();
    const area = await saved();
    assert.deepEqual(JSON.parse(area).a, [[0, 0, 0, 0], [0, 0, 1, 0], [0, 1, 1, 0]]);
    await matchesC();
    await button('Undo').click();
    assert.equal(await saved(), before);
    assert.equal(await panel('A').locator('[aria-selected=true]').count(), 0);
    await button('Redo').click();
    assert.equal(await saved(), area);
    await matchesC();
    await cell('A', 1, 1).focus();
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    assert.equal(await panel('A').locator('[aria-selected=true]').count(), 4);
    await page.keyboard.press('Escape');
    assert.equal(await panel('A').locator('[aria-selected=true]').count(), 0);
    await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
    await cell('A', 0, 0).focus();
    await page.keyboard.press('Control+z');
    assert.equal(await saved(), before);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await saved(), area);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Space');
    assert.equal(await button('Redo').isDisabled(), true);
    console.log('PASS rectangular mixed-colour toggle, selection state, Shift+arrows, Escape, history shortcuts and branching');

    const beforeDisplay = await saved();
    await page.getByLabel('Show guide frames', { exact: false }).check();
    const withDisplay = await saved();
    await button('Undo').click();
    assert.equal(await saved(), beforeDisplay);
    await button('Redo').click();
    assert.equal(await saved(), withDisplay);
    await button('Reset pattern').click();
    await button('Cancel').click();
    assert.equal(await saved(), withDisplay);
    await button('Reset pattern').click();
    await confirm();
    await button('Undo').click();
    assert.equal(await saved(), withDisplay);
    assert.equal(await page.locator('#width').inputValue(), '4');
    assert.equal(await page.getByLabel('Show guide frames', { exact: false }).isChecked(), true);
    await matchesC();
    await page.locator('#jump-row-A').fill('1');
    await page.locator('#jump-column-A').fill('4');
    await panel('A').getByRole('button', { name: 'Go to stitch' }).click();
    assert.equal(await cell('A', 3, 2).evaluate(el => el === document.activeElement), true);
    await page.locator('#jump-row-A').fill('0');
    await panel('A').getByRole('button', { name: 'Go to stitch' }).click();
    assert.match(await panel('A').getByRole('alert').innerText(), /row from 1 to 3/);
    assert.equal(await saved(), withDisplay);
    console.log('PASS display and reset history, dimension drafts, direct navigation and invalid coordinates');

    // Reuse the import control with a raw source file to check accepted/cancelled replacement history.
    const upload = page.locator('input[type=file]');
    const file = { name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(before) };
    await upload.setInputFiles(file);
    await button('Cancel').click();
    assert.equal(await button('Undo').isEnabled(), true);
    assert.equal(await saved(), withDisplay);
    await upload.setInputFiles(file);
    await confirm();
    assert.equal(await button('Undo').isDisabled(), true);
    assert.equal(await button('Redo').isDisabled(), true);
    await seed('{protected');
    await cell('A', 0, 0).click();
    await button('Undo').click();
    await button('Redo').click();
    assert.equal(await saved(), '{protected');
    await button('Replace unreadable saved data').click();
    await confirm();
    const beforeFailure = await saved();
    await page.evaluate(() => {
      window.originalSet = Storage.prototype.setItem;
      window.writeCount = 0;
      Storage.prototype.setItem = function (...args) {
        if (args[0] === 'doubleknit.currentProject') window.writeCount++;
        throw new DOMException('Quota', 'QuotaExceededError');
      };
    });
    await cell('A', 0, 0).click();
    await button('Undo').click();
    await button('Redo').click();
    assert.equal(await page.evaluate(() => window.writeCount), 3);
    assert.equal(await saved(), beforeFailure);
    assert.match(await page.locator('.storage-warning').innerText(), /Saving failed/);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSet; });
    await button('Retry saving').click();
    assert.notEqual(await saved(), beforeFailure);
    console.log('PASS accepted/cancelled imports, protected bytes and one save request per history operation under quota failure');

    // Explicit stage-4 regression targets. Measure dispatch through C and two settled frames,
    // not Playwright's locator/actionability overhead. No CPU throttling.
    const timings = await page.evaluate(async notation => {
      const { createProject } = await import('/src/model.js');
      const p = createProject(200, 200);
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
        p.a[y][x] = (x + y) % 2;
        p.b[y][x] = (x + y + 1) % 2;
      }
      p.display = { stitches: 20, rows: 30, proportional: true, guides: true, guideSize: 10, notation };
      const { serializeProjectFile, parseProjectFile } = await import('/src/projects.js');
      const exported = serializeProjectFile(p, 'Maximum');
      if (JSON.stringify(parseProjectFile(exported).project) !== JSON.stringify(p)) throw new Error('Maximum file round-trip differs');
      return { project: p, bytes: new Blob([JSON.stringify(p)]).size, fileBytes: new Blob([exported]).size };
    }, notation);
    // Import a large checkerboard first, then measure a resize from 199 to 200.
    await upload.setInputFiles({ ...file, buffer: Buffer.from(JSON.stringify(timings.project)) });
    await confirm();
    await matchesC();
    const measured = await page.evaluate(async () => {
      const frames = async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); };
      const waitC = async () => {
        for (;;) {
          const p = JSON.parse(localStorage.getItem('doubleknit.currentProject'));
          const cells = document.querySelectorAll('[aria-labelledby="title-C"] .cell');
          if (cells.length === p.width * p.height && [...cells].every((el, i) => {
            const y = Math.floor(i / p.width), x = i % p.width;
            return Number(el.classList.contains('black')) === p.a[y][x]
              && el.classList.contains(p.display.notation === 'plus' ? 'pair-plus' : 'pair-split')
                === (p.display.notation === 'plus' ? p.b[y][p.width - 1 - x] === 0 : p.a[y][x] !== p.b[y][p.width - 1 - x]);
          })) break;
          await new Promise(requestAnimationFrame);
        }
        await frames();
      };
      const measure = async action => { const start = performance.now(); action(); await waitC(); return Math.round(performance.now() - start); };
      const a = document.querySelector('.chart-panel[aria-labelledby="title-A"]');
      const at = (x, y) => a.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      const button = (root, name) => [...root.querySelectorAll('button')].find(el => el.textContent.trim() === name);
      const originalNotation = document.getElementById('display-notation').value;
      const switching = await measure(() => {
        const select = document.getElementById('display-notation');
        select.value = originalNotation === 'triangle' ? 'plus' : 'triangle';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const select = document.getElementById('display-notation');
      select.value = originalNotation;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await waitC();
      const edit = await measure(() => at(199, 199).click());
      button(a, 'Select area').click();
      await frames();
      at(0, 0).click();
      await frames();
      at(199, 199).click();
      await frames();
      const area = await measure(() => button(a, 'Toggle selection').click());
      const undo = await measure(() => button(document, 'Undo').click());
      const setInput = (id, value) => {
        const input = document.getElementById(id);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setInput('width', 199);
      setInput('height', 199);
      document.querySelector('#apply-dimensions').click();
      await frames();
      button(document.querySelector('dialog'), 'Confirm').click();
      await waitC();
      setInput('width', 200);
      setInput('height', 200);
      const resize = await measure(() => document.querySelector('#apply-dimensions').click());
      return { edit, area, undo, resize, switching };
    });
    console.log(notation + ' maximum-size metrics', JSON.stringify({ ...measured, sourceBytes: timings.bytes, fileBytes: timings.fileBytes }));
    for (const [operation, ms] of Object.entries(measured)) {
      // Large whole-face and notation changes are measured, not one-second gates.
      if (operation === 'area' || operation === 'switching') continue;
      const target = ['resize', 'undo'].includes(operation) ? 3000 : 1000;
      assert.ok(ms < target, `${operation}: ${ms} ms exceeds ${target} ms`);
    }
    assert.ok(timings.bytes < 1024 * 1024);
    assert.ok(timings.fileBytes < 1024 * 1024);
    await page.locator('#jump-row-A').fill('200');
    await page.locator('#jump-column-A').fill('1');
    const navigation = await page.evaluate(async () => {
      const form = document.querySelector('[aria-label="Navigate chart A"]');
      const start = performance.now();
      form.requestSubmit();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return performance.now() - start;
    });
    console.log(`Stage 4 navigation ${Math.round(navigation)} ms`);
    assert.ok(navigation < 1000);
    assert.equal(await cell('A', 0, 0).evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Exercise C's independent scroll navigation and pair-aligned guides at an interior coordinate.
    await page.locator('#jump-row-C').fill('100');
    await page.locator('#jump-column-C').fill('101');
    await panel('C').getByRole('button', { name: 'Go to pair' }).click();
    const cGeometry = await panel('C').locator('.chart-viewport').evaluate(viewport => {
      const cell = viewport.querySelectorAll('.chart-row')[100].querySelectorAll('.cell')[100];
      const frame = viewport.querySelector('.frame-line.vertical[style*="2400px"]');
      return { x: cell.getBoundingClientRect().left - viewport.getBoundingClientRect().left,
        y: cell.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
        frameOffset: frame.getBoundingClientRect().left - cell.getBoundingClientRect().left,
        focused: viewport === document.activeElement };
    });
    assert.ok(cGeometry.x >= 50 && cGeometry.x < 60);
    assert.ok(cGeometry.y >= 0 && cGeometry.y < 10);
    assert.equal(cGeometry.frameOffset, -1);
    assert.equal(cGeometry.focused, true);
    await page.screenshot({ path: '/tmp/doubleknit-editing.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  try {
    const touch = await mobile.newPage();
    await touch.goto(url);
    await touch.getByRole('button', { name: 'New', exact: true }).click();
    await touch.getByRole('button', { name: 'Confirm', exact: true }).click();
    const panel = touch.locator('.chart-panel[aria-labelledby="title-A"]');
    const cell = (x, y) => panel.locator(`[data-x="${x}"][data-y="${y}"]`);
    await touch.getByLabel('Notation', { exact: true }).selectOption(notation);
    const touchInitial = await touch.evaluate(() => localStorage.getItem('doubleknit.currentProject'));
    await panel.getByRole('button', { name: 'Select area', exact: true }).tap();
    await cell(0, 0).tap();
    await cell(2, 2).tap();
    assert.equal(await panel.locator('[aria-selected=true]').count(), 9);
    assert.equal(await touch.evaluate(() => localStorage.getItem('doubleknit.currentProject')), touchInitial);
    await panel.getByRole('button', { name: 'Toggle selection' }).tap();
    assert.equal(await panel.locator('.cell.black').count(), 9);
    const grid = panel.getByRole('grid');
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    const client = await mobile.newCDPSession(touch);
    const x = box.x + box.width - 30, y = Math.max(20, box.y) + 70;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x - step * 20, y }],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await panel.locator('[aria-selected=true]').count(), 9);
    assert.equal(await panel.locator('.cell.black').count(), 9);
    assert.ok(await grid.evaluate(el => el.scrollLeft) > 0);
    assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log('PASS touch two-corner selection and scrolling without selection or colour changes');
  } finally { await mobile.close(); }
}
