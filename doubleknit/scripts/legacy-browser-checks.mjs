// Historical pre-workspace UI runner. Its selectors describe the retired UI.
// Current acceptance runs through browser-checks.mjs.
// Optional browser tooling; the application and unit tests have no installed dependencies.
// PLAYWRIGHT_MODULE may point to an installation outside this repository.
import assert from 'node:assert/strict';
import { checkRaster } from './raster-browser-checks.mjs';
import { checkPdf } from './pdf-browser-checks.mjs';
import { checkLocalisation } from './localisation-browser-checks.mjs';
import { checkWorkflow } from './workflow-browser-checks.mjs';
import { checkShapes } from './shapes-browser-checks.mjs';
import { checkLinked } from './linked-browser-checks.mjs';
import { checkPlain } from './plain-browser-checks.mjs';
import { checkNotation } from './notation-browser-checks.mjs';
import { checkEditing } from './editing-browser-checks.mjs';
import { checkDisplay } from './display-browser-checks.mjs';
import { checkProjects } from './project-browser-checks.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.CHROMIUM_CDP_URL
  ? await chromium.connectOverCDP(process.env.CHROMIUM_CDP_URL)
  : await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
const url = process.env.APP_URL || 'http://127.0.0.1:8080';
const key = 'doubleknit.currentProject';
const failures = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => failures.push(error.message));
const grid = face => page.getByRole('grid', { name: `Face ${face}`, exact: false });
const cell = (face, x, y) => grid(face).locator(`[data-x="${x}"][data-y="${y}"]`);
const saved = () => page.evaluate(key => localStorage.getItem(key), key);
async function ready(target = page) { await target.getByRole('heading', { name: 'Two faces. One pattern.' }).waitFor(); }
async function dimensions(w, h) {
  await page.getByLabel('Width (stitches per face)', { exact: true }).fill(String(w));
  await page.getByLabel('Height (rows)', { exact: true }).fill(String(h));
  await page.getByRole('button', { name: 'Apply dimensions', exact: true }).click();
}
async function confirm() { await page.getByRole('button', { name: 'Confirm', exact: true }).click(); }
async function seed(value) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
  await page.reload();
  await ready();
}
try {
  if (process.env.BROWSER_CHECK === 'raster') {
    await checkRaster(browser, url);
  } else if (process.env.BROWSER_CHECK === 'pdf') {
    await checkPdf(browser, url);
  } else if (process.env.BROWSER_CHECK === 'localisation') {
    await checkLocalisation(browser, url);
  } else {
  await page.goto(url);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await ready();
  assert.equal(await grid('A').getByRole('gridcell').count(), 400);
  assert.equal(await grid('B').getByRole('gridcell').count(), 400);
  assert.equal(await page.locator('[aria-labelledby="title-C"] .cell').count(), 400);
  assert.equal(await grid('B').locator('.cell.black').count(), 400);
  assert.equal(JSON.parse(await saved()).mode, 'double-faced');
  await page.getByRole('form', { name: 'Navigate chart A' }).getByRole('button').focus();
  await page.keyboard.press('Tab');
  assert.equal(await cell('A', 19, 19).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Space');
  assert.equal(JSON.parse(await saved()).a[19][19], 1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  assert.equal(await cell('A', 19, 19).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  assert.equal(JSON.parse(await saved()).a[19][18], 1);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal(JSON.parse(await saved()).a[19][18], 0);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await grid('A').evaluate(el => el.contains(document.activeElement)), false);
  await page.getByRole('form', { name: 'Navigate chart B' }).getByRole('button').focus();
  await page.keyboard.press('Tab');
  assert.equal(await cell('B', 0, 19).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.equal(await grid('B').evaluate(el => el.contains(document.activeElement)), false);
  await page.getByRole('form', { name: 'Navigate chart C' }).getByRole('button').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-labelledby')), 'title-C');
  const beforeC = await saved();
  await page.keyboard.press('Space');
  await page.locator('[aria-labelledby="title-C"] .cell').last().click();
  assert.equal(await saved(), beforeC);
  await page.reload();
  await ready();
  assert.equal(await cell('A', 19, 19).getAttribute('aria-label'), 'Face A, knitting row 1, column 20, pattern colour');
  assert.equal(await page.locator('[aria-labelledby="title-C"] .cell.black').count(), 2);
  console.log('PASS defaults, keyboard entry/navigation/toggle, read-only C and reload');

  await page.getByRole('button', { name: 'Reset pattern', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Confirm', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  await page.locator('#width').evaluate(el => el.focus());
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await saved(), beforeC);
  await page.getByRole('button', { name: 'Reset pattern', exact: true }).click();
  await confirm();
  assert.equal(await cell('A', 19, 19).getAttribute('tabindex'), '0');
  assert.equal(await cell('B', 0, 19).getAttribute('tabindex'), '0');
  await dimensions(2, 1);
  await cell('A', 0, 0).click();
  await cell('B', 1, 0).click();
  await dimensions(3, 2);
  assert.deepEqual(JSON.parse(await saved()).a, [[0, 0, 0], [0, 1, 0]]);
  assert.deepEqual(JSON.parse(await saved()).b, [[1, 1, 1], [1, 0, 1]]);
  await dimensions(2, 1);
  assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
  const beforeCrop = await saved();
  await dimensions(1, 1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await saved(), beforeCrop);
  assert.equal(await grid('A').getByRole('gridcell').count(), 2);
  await dimensions(1, 1);
  await confirm();
  assert.deepEqual(JSON.parse(await saved()).a, [[0]]);
  assert.deepEqual(JSON.parse(await saved()).b, [[1]]);
  for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const project = JSON.parse(await saved());
    if (project.a[0][0] !== a) await cell('A', 0, 0).click();
    if (project.b[0][0] !== b) await cell('B', 0, 0).click();
    await page.waitForFunction(([a, b]) => {
      const cells = [...document.querySelectorAll('[aria-labelledby="title-C"] .cell')];
      return cells.length === 1 && Number(cells[0].classList.contains('black')) === a
        && cells[0].classList.contains('pair-split') === (a !== b);
    }, [a, b]);
  }
  const beforeInvalid = await saved();
  for (const invalid of ['0', '201', '1.5', 'no', '']) {
    await dimensions(invalid, 2);
    assert.equal(await page.locator('#width').getAttribute('aria-invalid'), 'true');
    assert.equal(await saved(), beforeInvalid);
  }
  console.log('PASS resize anchors, crop/reset cancellation, validation and all four pairs in UI');

  const deferred = await page.evaluate(async () => {
    const a = document.querySelector('[aria-labelledby="title-A"] [data-x="0"][data-y="0"]');
    const b = document.querySelector('[aria-labelledby="title-B"] [data-x="0"][data-y="0"]');
    const c = () => [...document.querySelectorAll('[aria-labelledby="title-C"] .cell')]
      .map(el => Number(el.classList.contains('black')));
    const before = c();
    a.click();
    await Promise.resolve();
    b.click();
    await Promise.resolve();
    a.click();
    await new Promise(requestAnimationFrame);
    return { before, firstFrame: c(), a: a.classList.contains('black'), b: b.classList.contains('black') };
  });
  assert.deepEqual(deferred.firstFrame, deferred.before);
  assert.equal(deferred.a, false);
  assert.equal(deferred.b, false);
  await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="title-C"] .cell.black').length === 0);
  console.log('PASS A/B update before C and rapid edits converge to the latest project');

  await seed('{broken');
  await cell('A', 19, 19).click();
  assert.equal(await saved(), '{broken');
  await page.getByRole('button', { name: 'Replace unreadable saved data', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await saved(), '{broken');
  await page.getByRole('button', { name: 'Replace unreadable saved data', exact: true }).click();
  await confirm();
  assert.equal(JSON.parse(await saved()).a[19][19], 1);
  assert.equal(await page.getByRole('alert').count(), 0);
  await seed('{broken again');
  assert.equal(await page.getByRole('button', { name: 'Reset pattern', exact: true }).isDisabled(), true);
  await cell('A', 19, 19).click();
  await page.getByRole('button', { name: 'Reset pattern', exact: true }).click();
  assert.match(await page.locator('#confirmation-message').innerText(), /replaces the unreadable/);
  await confirm();
  assert.equal(JSON.parse(await saved()).width, 20);
  console.log('PASS protected storage replacement and reset disclosure');

  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  });
  const beforeQuota = await saved();
  await cell('A', 19, 19).click();
  assert.equal(await saved(), beforeQuota);
  assert.match(await page.getByRole('alert').innerText(), /Saving failed/);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  assert.equal(JSON.parse(await saved()).a[19][19], 1);
  assert.equal(await page.getByRole('alert').count(), 0);
  console.log('PASS quota failure and retry');

  await context.addInitScript(() => {
    window.originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await page.reload();
  await ready();
  assert.match(await page.locator('.storage-warning [role=alert]').innerText(), /could not be read/);
  await cell('B', 0, 19).click();
  await page.evaluate(() => { Storage.prototype.getItem = window.originalGetItem; });
  const beforeRecovery = await saved();
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  assert.match(await page.locator('.storage-warning [role=alert]').innerText(), /Existing saved data/);
  assert.equal(await saved(), beforeRecovery);
  await page.getByRole('button', { name: 'Replace unreadable saved data', exact: true }).click();
  await confirm();
  assert.equal(JSON.parse(await saved()).b[19][0], 0);
  console.log('PASS failed initial read guards existing data and retains in-memory edits');
  await page.screenshot({ path: '/tmp/doubleknit-desktop.png', fullPage: true });

  const started = performance.now();
  await dimensions(200, 200);
  assert.equal(await grid('A').getByRole('gridcell').count(), 40000);
  assert.equal(await page.locator('[aria-labelledby="title-C"] .cell').count(), 40000);
  const rendered = performance.now();
  await cell('A', 199, 199).click();
  const edited = performance.now();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log(`PASS 200 × 200: resize/check ${Math.round(rendered - started)} ms; edit ${Math.round(edited - rendered)} ms`);

  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const touch = await mobile.newPage();
  touch.on('pageerror', error => failures.push(error.message));
  await touch.goto(url);
    await touch.getByRole('button', { name: 'New', exact: true }).click();
    await touch.getByRole('button', { name: 'Confirm', exact: true }).click();
  await ready(touch);
  assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const touchGrid = touch.getByRole('grid', { name: 'Face A', exact: false });
  const touchCell = touchGrid.locator('[data-x="0"][data-y="0"]');
  assert.equal(await touchCell.evaluate(el => el.getBoundingClientRect().width), 24);
  await touchCell.tap();
  assert.equal(await touchCell.getAttribute('aria-label'), 'Face A, knitting row 20, column 1, pattern colour');
  await touchCell.tap();
  assert.equal(await touchCell.getAttribute('aria-label'), 'Face A, knitting row 20, column 1, base colour');
  const touchBefore = await touch.evaluate(key => localStorage.getItem(key), key);
  const box = await touchGrid.boundingBox();
  const client = await mobile.newCDPSession(touch);
  const x = box.x + box.width - 30, y = box.y + 110;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 20, y }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await touch.evaluate(key => localStorage.getItem(key), key), touchBefore);
  assert.ok(await touchGrid.evaluate(el => el.scrollLeft) > 0);
  await touch.screenshot({ path: '/tmp/doubleknit-mobile.png', fullPage: true });
  console.log('PASS narrow touch layout, tap exactly once, horizontal swipe without edits');
  await mobile.close();
  assert.deepEqual(failures, []);
  console.log('PASS no browser JavaScript errors');
  await checkRaster(browser, url);
  await checkPdf(browser, url);
  await checkProjects(browser, url);
  await checkDisplay(browser, url);
  await checkPlain(browser, url);
  await checkLinked(browser, url);
  await checkShapes(browser, url);
  await checkWorkflow(browser, url);
  await checkLocalisation(browser, url);
  await checkNotation(browser, url);
  await checkEditing(browser, url, devices);
  await checkEditing(browser, url, devices, 'plus');
}
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
