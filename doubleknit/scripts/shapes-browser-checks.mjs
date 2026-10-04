import assert from 'node:assert/strict';
import { createProject, toggleArea } from '../src/model.js';
import { serializeProjectFile, parseProjectFile } from '../src/projects.js';

export async function checkShapes(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const panel = face => page.locator(`.chart-panel[aria-labelledby="title-${face}"]`);
    const cell = (face, x, y) => panel(face).locator(`[data-x="${x}"][data-y="${y}"]`);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('doubleknit.currentProject')));
    const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    async function seed(project) {
      await page.evaluate(p => localStorage.setItem('doubleknit.currentProject', JSON.stringify(p)), project);
      await page.reload(); await panel('A').waitFor(); await settle();
    }
    async function cut(first, last, left, right = 0, empty = false) {
      await page.locator('#shape-first').fill(String(first)); await page.locator('#shape-last').fill(String(last));
      await page.locator('#shape-left').fill(String(left));
      if (await page.locator('#shape-right').count()) await page.locator('#shape-right').fill(String(right));
      await button(empty ? 'Empty rows' : 'Apply row edges').click(); await settle();
    }
    async function measure(action) {
      const start = await page.evaluate(() => performance.now());
      await action(); await settle();
      return Math.round(await page.evaluate(() => performance.now()) - start);
    }
    try {
      await page.goto(url);
      await seed(createProject(3, 3));
      if (touch) await cell('A', 0, 0).tap(); else await cell('A', 0, 0).click();
      await cell('B', 2, 0).click();
      const coloured = await saved();
      await cut(3, 3, 2); await cut(2, 2, 1);
      const triangle = await saved();
      assert.deepEqual(triangle.maskA, [[2, 3], [1, 3], [0, 3]]);
      assert.deepEqual(triangle.a, coloured.a); assert.deepEqual(triangle.b, coloured.b);
      assert.equal(await panel('A').locator('.absent').count(), 3);
      assert.equal(await panel('B').locator('.absent').count(), 3);
      assert.equal(await cell('B', 2, 0).getAttribute('aria-disabled'), 'true');
      assert.equal(await page.getByRole('checkbox', { name: 'Identical patterns on both faces' }).isDisabled(), true);
      for (const notation of ['triangle', 'plus']) {
        await page.locator('#display-notation').selectOption(notation); await settle();
        assert.equal(await panel('C').locator('.absent').count(), 3);
        assert.equal(await panel('C').locator('.absent.black, .absent.pair-plus, .absent.pair-split').count(), 0);
        assert.equal(await panel('C').locator('.shape-outline path').count(), 1);
        assert.match(await panel('C').locator('.absent').first().getAttribute('aria-label'), /absent pair/);
      }
      const beforeAbsent = await saved();
      await cell('A', 2, 0).focus();
      await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
      assert.equal(await panel('A').locator('[aria-selected=true]').count(), 3);
      await page.keyboard.press('Escape');
      await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
      await cell('A', 0, 0).click({ force: true }); assert.deepEqual(await saved(), beforeAbsent);
      assert.equal(await cell('A', 2, 0).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('ArrowLeft');
      assert.equal(await cell('A', 2, 0).evaluate(el => el === document.activeElement), true);
      await cell('A', 0, 2).focus(); await page.keyboard.press('ArrowUp');
      assert.equal(await cell('A', 1, 1).evaluate(el => el === document.activeElement), true);
      await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
      await cell('A', 0, 0).click({ force: true }); await cell('A', 1, 0).click({ force: true });
      await panel('A').getByRole('button', { name: 'Toggle selection', exact: true }).click();
      assert.deepEqual(await saved(), beforeAbsent);
      await cut(3, 3, 0);
      assert.equal(await panel('A').locator('[aria-selected=true]').count(), 0);
      assert.equal((await saved()).a[0][0], 1); assert.equal((await saved()).b[0][2], 0);
      await button('Undo').click(); assert.deepEqual(await saved(), beforeAbsent);
      await button('Redo').click(); assert.deepEqual((await saved()).maskA[0], [0, 3]);
      const beforeInvalid = await saved();
      await cut(2, 2, 0, 0, true);
      assert.match(await page.locator('#shape-error').innerText(), /only above or below/);
      assert.deepEqual(await saved(), beforeInvalid);
      await cut(3, 3, 0, 0, true);
      assert.equal((await saved()).maskA[0], null);
      assert.equal(await panel('A').locator('[tabindex="0"]').count(), 1);
      await page.locator('#jump-row-A').fill('3'); await page.locator('#jump-column-A').fill('1');
      await panel('A').getByRole('button', { name: 'Go to stitch' }).click();
      assert.match(await page.locator('#jump-error-A').innerText(), /absent/);
      assert.equal(await cell('A', 1, 1).evaluate(el => el === document.activeElement), true);
      await page.locator('#project-name').fill('Shaped'); await button('Save named snapshot').click();
      const shape = await saved(), download = page.waitForEvent('download');
      await button('Export JSON').click(); const file = await (await download).path();
      await button('Reset pattern').click(); await button('Confirm').click();
      await page.locator('input[type=file]').setInputFiles(file); await button('Confirm').click();
      assert.deepEqual(await saved(), shape); assert.equal(await button('Undo').isDisabled(), true);
      await page.reload(); await panel('A').waitFor(); assert.deepEqual(await saved(), shape);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/tmp/doubleknit-shapes-${touch ? 'touch' : 'desktop'}.png`, fullPage: true });
      await seed(createProject(5, 3, 'double-faced', true));
      await cut(3, 3, 2); assert.deepEqual((await saved()).maskA[0], [2, 3]);
      await cell('A', 0, 2).click(); assert.deepEqual((await saved()).a[2], [1, 0, 0, 0, 0]);
      const linked = await saved();
      await page.locator('#width').fill('6'); await button('Apply dimensions').click();
      assert.match(await page.locator('#width-error').innerText(), /symmetric/);
      assert.deepEqual(await saved(), linked); assert.equal(await page.locator('dialog[open]').count(), 0);
      await cut(3, 3, 0, 0, true); assert.equal((await saved()).maskA[0], null);
      // Exercise maximum shapes in every source mode and both visible notations.
      for (const mode of ['plain', 'independent', 'linked']) for (const notation of mode === 'plain' ? ['triangle'] : ['triangle', 'plus']) {
        let p = createProject(200, 200, mode === 'plain' ? 'plain' : 'double-faced', mode === 'linked');
        p.a = p.a.map((row, y) => row.map((_, x) => (x + y) % 2));
        if (p.b) p.b = p.a.map(row => row.map(v => 1 - v));
        p.maskA = p.maskA.map((_, y) => [y % 80, 200 - y % 80]);
        p.display = { ...p.display, notation, guides: true, proportional: true, stitches: 20, rows: 30 };
        await seed(p);
        const edit = await measure(() => cell('A', 199, 0).evaluate(el => el.click()));
        const undo = await measure(() => button('Undo').evaluate(el => el.click()));
        assert.deepEqual(await saved(), p);
        await panel('A').getByRole('button', { name: 'Select area', exact: true }).click();
        await cell('A', 0, 0).evaluate(el => el.click());
        await cell('A', 199, 199).evaluate(el => el.click());
        const area = await measure(() => panel('A').getByRole('button', { name: 'Toggle selection', exact: true }).evaluate(el => el.click()));
        assert.deepEqual(await saved(), toggleArea(p, 'a', { top: 0, bottom: 199, left: 0, right: 199 }));
        const areaUndo = await measure(() => button('Undo').evaluate(el => el.click()));
        assert.deepEqual(await saved(), p);
        await page.locator('#jump-row-A').fill('1'); await page.locator('#jump-column-A').fill('100');
        const navigation = await measure(() => panel('A').getByRole('button', { name: 'Go to stitch' }).evaluate(el => el.click()));
        assert.equal(await cell('A', 99, 199).evaluate(el => el === document.activeElement), true);
        if (touch && notation === 'triangle') {
          const viewport = panel('A').locator('.chart-viewport');
          await viewport.scrollIntoViewIfNeeded();
          const box = await viewport.boundingBox(), client = await context.newCDPSession(page);
          const x = box.x + box.width - 35, y = box.y + 100;
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let step = 1; step <= 6; step++) await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: [{ x: x - step * 20, y }],
          });
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await client.detach();
          assert.deepEqual(await saved(), p);
          assert.ok(await viewport.evaluate(el => el.scrollLeft) > 0);
        }
        // Apply controls without including Playwright's scrolling/actionability delay in timings.
        await page.locator('#shape-first').fill('200'); await page.locator('#shape-last').fill('200');
        await page.locator('#shape-left').fill('1');
        const shapeMs = await measure(() => button('Apply row edges').evaluate(el => el.click()));
        assert.deepEqual((await saved()).maskA[0], [1, mode === 'linked' ? 199 : 200]);
        const shapeUndo = await measure(() => button('Undo').evaluate(el => el.click()));
        assert.deepEqual(await saved(), p);
        await page.locator('#height').fill('199'); await button('Apply dimensions').click(); await button('Confirm').click(); await settle();
        await page.locator('#height').fill('200');
        const resize = await measure(() => button('Apply dimensions').evaluate(el => el.click()));
        assert.equal((await saved()).maskA[0], null);
        const file = serializeProjectFile(await saved(), 'Maximum shape');
        assert.deepEqual(parseProjectFile(file).project, await saved());
        assert.equal(await panel('A').locator('[tabindex="0"]').count(), 1);
        assert.equal(await panel('A').locator('.cell').count(), 40000);
        assert.equal(await panel('A').locator('.shape-outline path').count(), 1);
        assert.ok(edit < 1000 && undo < 1000 && areaUndo < 3000 && navigation < 1000 && shapeUndo < 1000 && resize < 3000,
          JSON.stringify({ edit, undo, areaUndo, navigation, shapeUndo, resize }));
        console.log('PASS shaped 200 × 200', { touch, mode, notation, edit, undo, area, areaUndo, navigation, shapeMs, shapeUndo, resize, fileBytes: Buffer.byteLength(file) });
      }
      // A shape operation and undo must preserve unreadable bytes.
      await page.evaluate(() => localStorage.setItem('doubleknit.currentProject', '{broken shape'));
      await page.reload(); await panel('A').waitFor(); await cut(20, 20, 1);
      await button('Undo').click();
      assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), '{broken shape');
      assert.deepEqual(errors, []);
      console.log('PASS shaped controls, absence, focus, restoration, symmetry, files and protected history', { touch });
    } finally { await context.close(); }
  }
}

if (process.argv[1]?.endsWith('shapes-browser-checks.mjs')) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true });
  try { await checkShapes(browser, process.env.APP_URL || 'http://127.0.0.1:8080'); }
  finally { await browser.close(); }
}
