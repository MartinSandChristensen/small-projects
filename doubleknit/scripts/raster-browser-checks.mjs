import assert from 'node:assert/strict';
import { createProject } from '../src/model.js';
import { png, gif, rgba, exif, pngChunk, indexedPng } from './raster-fixtures.mjs';

const file = (name, buffer) => ({ name, mimeType: 'application/octet-stream', buffer });
const fixture = (rows, name = 'pixel-art.png') => file(name, png(rows[0].length, rows.length, rgba(rows)));
const key = 'doubleknit.currentProject';
export async function checkRaster(browser, url) {
  const failures = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({ locale: 'en-GB', viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage(); page.on('pageerror', error => failures.push(error.message));
    await page.goto(url); await page.locator('#language').waitFor();
    const open = () => page.locator('.raster-controls > button').click();
    const dialog = page.locator('.raster-dialog');
    const preview = async () => { await dialog.locator('button[type="submit"]').click(); await page.locator('#raster-preview-title').waitFor(); };
    const accept = () => dialog.locator('.primary').click();
    const cancel = () => dialog.locator('.dialog-actions button').first().click();
    const stored = () => page.evaluate(key => localStorage.getItem(key), key);
    // Import is also project creation. Blank work needs no destructive warning.
    await open(); assert.equal(await dialog.locator('.dialog-actions button').first().evaluate(el => el === document.activeElement), true);
    await page.locator('#raster-mode').selectOption('plain');
    assert.equal(await page.locator('#raster-b').count(), 0);
    await page.locator('#raster-a').setInputFiles(fixture(['001'])); await preview();
    assert.equal(await stored(), null); assert.equal(await page.locator('#raster-confirm').count(), 0);
    await accept(); await page.getByRole('grid').waitFor();
    assert.deepEqual(JSON.parse(await stored()).a, [[0, 0, 1]]);
    assert.equal(await page.locator('[aria-labelledby="title-C"]').count(), 0);
    // Create history/selection and retained non-default settings.
    await page.locator('#project-name').fill('Ærø billede');
    await page.locator('#workflow').selectOption('in-the-round');
    await page.locator('#export-proportional').check();
    const cell = page.getByRole('grid').getByRole('gridcell').last();
    await cell.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
    const selected = await page.locator('.cell.selected').count(); assert.ok(selected > 0);
    const before = await stored();
    await open(); await page.locator('#raster-mode').selectOption('double-faced');
    await page.locator('#raster-a').setInputFiles(fixture(['..1', '.01', '101']));
    await page.locator('#raster-b').setInputFiles(fixture(['1..', '01.', '110'], 'back.png')); await preview();
    assert.equal(await dialog.locator('.primary').isDisabled(), true);
    await page.screenshot({ path: `/tmp/doubleknit-raster-${touch ? 'touch' : 'desktop'}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#raster-language').selectOption('da');
    await page.locator('#raster-confirm').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/doubleknit-raster-preview-${touch ? 'touch' : 'desktop'}.png` });
    await page.locator('#raster-language').selectOption('en-GB');
    await page.keyboard.press('Escape');
    assert.equal(await stored(), before); assert.equal(await page.locator('.cell.selected').count(), selected);
    assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), true);
    // Invalid imports preserve work, feedback translates in-place, filename is unchanged.
    await open(); await page.locator('#raster-a').setInputFiles(fixture(['010']));
    const bad = png(3, 1, [255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
    await page.locator('#raster-a').setInputFiles(file('Æøå.png', bad));
    await dialog.locator('button[type="submit"]').click(); await dialog.locator('[role="alert"]').waitFor();
    assert.match(await dialog.locator('[role="alert"]').textContent(), /Æøå.png.*third colour.*round 1, column 3/);
    await page.locator('#raster-language').selectOption('da');
    assert.match(await dialog.locator('[role="alert"]').textContent(), /Æøå.png.*tredje farve.*omgang 1/);
    assert.equal(await stored(), before); await page.locator('#raster-language').selectOption('en-GB');
    // Delayed decoder: cancel, reopen and complete another import; stale work cannot replace it.
    await page.evaluate(() => {
      window.originalBitmap = window.createImageBitmap;
      window.pendingBitmaps = [];
      window.createImageBitmap = (...args) => new Promise((resolve, reject) => window.pendingBitmaps.push(() => window.originalBitmap(...args).then(resolve, reject)));
    });
    await page.locator('#raster-a').setInputFiles(fixture(['01'])); await dialog.locator('button[type="submit"]').click();
    await page.waitForFunction(() => window.pendingBitmaps.length === 1);
    await page.locator('#raster-language').selectOption('da');
    assert.match(await dialog.textContent(), /Kontrollerer billeder/);
    await cancel(); await page.evaluate(() => { window.createImageBitmap = window.originalBitmap; });
    await open(); await page.locator('#raster-language').selectOption('en-GB');
    await page.locator('#raster-mode').selectOption('double-faced');
    await page.locator('#raster-linked').check(); assert.equal(await page.locator('#raster-b').count(), 0);
    await page.locator('#raster-a').setInputFiles(fixture(['001'])); await preview();
    await page.evaluate(async () => { await Promise.all(window.pendingBitmaps.map(resolve => resolve())); });
    assert.equal(await dialog.locator('canvas').getAttribute('width'), '48');
    await page.locator('#raster-confirm').check(); await accept();
    let result = JSON.parse(await stored());
    assert.equal(result.identicalPatterns, true); assert.equal(Object.hasOwn(result, 'b'), false);
    assert.equal(result.workflow, 'in-the-round'); assert.deepEqual(result.display, JSON.parse(before).display);
    assert.equal(await page.locator('#project-name').inputValue(), 'Ærø billede');
    assert.equal(await page.locator('#export-proportional').isChecked(), true);
    assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.cell.selected').count(), 0);
    // Successful independent triangular import in both viewport sizes.
    await open(); await page.locator('#raster-linked').uncheck();
    await page.locator('#raster-a').setInputFiles(fixture(['..1', '.01', '101']));
    await page.locator('#raster-b').setInputFiles(fixture(['1..', '01.', '110'])); await preview();
    await page.locator('#raster-confirm').check(); await accept();
    result = JSON.parse(await stored()); assert.deepEqual(result.maskA, [[2, 3], [1, 3], [0, 3]]);
    assert.deepEqual(result.b[2], [1, 1, 0]);
    await page.reload(); await page.locator('#workflow').waitFor(); assert.deepEqual(JSON.parse(await stored()), result);
    // The actual decoder must preserve orientation/opaque colours and reject metadata animation.
    for (const [name, buffer, expected, error] of [
      ['indexed.png', indexedPng(), [[0, 1, 0]]],
      ['still.gif', gif(3, 1, [0, 1, 0]), [[0, 1, 0]]],
      ['shape.gif', gif(3, 1, [0, 1, 1], { transparent: true }), [[0, 1, 1]]],
      ['oriented.png', png(3, 2, rgba(['001', '110']), [exif(6)]), [[1, 0], [1, 0], [0, 1]]],
      ['partial.png', png(1, 1, [0, 0, 0, 127]), null, 'Partial transparency'],
      ['holes.png', png(3, 1, rgba(['0.1'])), null, 'gap splits'],
      ['empty.png', png(1, 1, rgba(['.'])), null, 'at least one'],
      ['animated.gif', gif(1, 1, [0], { animated: true }), null, 'Animated'],
      ['animated.png', png(1, 1, rgba(['0']), [pngChunk('acTL')]), null, 'Animated'],
      ['photo.jpg', Buffer.from([255, 216, 255, 0, 0, 0]), null, 'JPEG'],
      ['large.png', png(201, 1, rgba(['0'.repeat(201)])), null, 'between 1 and 200'],
    ]) {
      const decoded = await page.evaluate(async ({ name, bytes }) => {
        const { decodeRaster } = await import('./src/raster-decode.js');
        const { rasterProject } = await import('./src/raster.js');
        const { createProject } = await import('./src/model.js');
        try { const a = await decodeRaster(new File([Uint8Array.from(bytes)], name), 'a'); return { project: rasterProject({ a }, createProject(), 'plain') }; }
        catch (cause) { return { error: cause.message }; }
      }, { name, bytes: [...buffer] });
      if (error) assert.ok(decoded.error?.includes(error), `${name}: ${JSON.stringify(decoded)}`);
      else assert.deepEqual(decoded.project.a, expected, name);
    }
    // Maximum raster replacements through the actual UI for all modes and both notations.
    const maximum = fixture(Array.from({ length: 200 }, (_, y) => Array.from({ length: 200 }, (_, x) => (x + y) % 2).join('')));
    await page.locator('#display-notation').selectOption('plus');
    for (const [mode, linked] of [['plain', false], ['double-faced', false], ['double-faced', true]]) {
      await open(); await page.locator('#raster-mode').selectOption(mode);
      if (mode === 'double-faced') await page.locator('#raster-linked').setChecked(linked);
      await page.locator('#raster-a').setInputFiles(maximum);
      if (mode === 'double-faced' && !linked) await page.locator('#raster-b').setInputFiles(maximum);
      await preview(); await page.locator('#raster-confirm').check(); await accept();
      await page.waitForFunction(() => document.querySelector('[role="grid"]').getAttribute('aria-rowcount') === '200');
      result = JSON.parse(await stored()); assert.equal(result.width, 200); assert.equal(result.height, 200);
      assert.deepEqual(result.a[0].slice(0, 4), [0, 1, 0, 1]);
      assert.equal(result.display.notation, 'plus');
      await page.getByRole('grid').first().getByRole('gridcell').last().click();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual(JSON.parse(await stored()), result);
    }
    await context.close();
  }
  // Import into protected storage and into a failed write retains recovery contracts.
  for (const protectedData of [true, false]) {
    const context = await browser.newContext(); const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(url); await page.locator('#language').waitFor();
    await page.evaluate(({ key, protectedData, source }) => localStorage.setItem(key, protectedData ? '{broken' : JSON.stringify(source)), { key, protectedData, source: createProject() });
    await page.reload(); await page.locator('#language').waitFor();
    if (!protectedData) await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); };
      window.restoreWrites = () => { Storage.prototype.setItem = original; };
    }, key);
    const before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.locator('.raster-controls > button').click(); await page.locator('#raster-mode').selectOption('plain');
    await page.locator('#raster-a').setInputFiles(fixture(['001']));
    await page.locator('.raster-dialog button[type="submit"]').click(); await page.locator('#raster-preview-title').waitFor();
    await page.locator('.raster-dialog .primary').click();
    assert.equal(await page.getByRole('grid').getByRole('gridcell').count(), 3);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
    if (!protectedData) {
      await page.evaluate(() => window.restoreWrites());
      await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
      assert.deepEqual(JSON.parse(await page.evaluate(key => localStorage.getItem(key), key)).a, [[0, 0, 1]]);
    }
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log('PASS raster import: desktop/touch, previews, modes, localisation, cancellation/stale reads, PNG/GIF/orientation, 200×200 and storage recovery');
}
