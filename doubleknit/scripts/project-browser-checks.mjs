import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function checkProjects(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const key = 'doubleknit.currentProject', libraryKey = 'doubleknit.namedProjects';
  const stored = () => page.evaluate(() => ({ ...localStorage }));
  const choose = name => page.getByLabel('Named saves', { exact: true }).selectOption({ label: name });
  const upload = text => page.getByLabel('Import JSON (up to 1 MiB)').setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('heading', { name: 'Two faces. One pattern.' }).waitFor();
    await page.locator('#width').fill('2'); await page.locator('#height').fill('1');
    await button('Apply dimensions').click();
    await page.locator('#project-name').fill('White'); await button('Save named snapshot').click();
    await page.locator('[aria-labelledby="title-A"] [data-x="1"][data-y="0"]').click();
    await page.getByLabel('Show guide frames').check();
    await page.locator('#project-name').fill('Black'); await button('Save named snapshot').click();
    const before = await stored();
    await choose('White'); await button('Load snapshot').click();
    await button('Cancel').click(); assert.deepEqual(await stored(), before);
    await button('Load snapshot').click(); await button('Confirm').click();
    assert.deepEqual(JSON.parse((await stored())[key]).a, [[0, 0]]);
    assert.equal((await stored())[libraryKey], before[libraryKey]);
    await choose('Black'); await button('Load snapshot').click(); await button('Confirm').click();
    await button('Save named snapshot').click(); await button('Cancel').click();
    assert.equal((await stored())[libraryKey], before[libraryKey]);
    await page.locator('#project-name').fill('Renamed'); await button('Rename to project name').click();
    const downloadEvent = page.waitForEvent('download'); await button('Export JSON').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'Renamed.doubleknit.json');
    assert.equal(await download.failure(), null);
    const exported = await readFile(await download.path(), 'utf8');
    const roundtrip = JSON.parse(exported);
    assert.deepEqual(roundtrip.project.a, [[0, 1]]);
    await button('Reset pattern').click(); await button('Confirm').click();
    const reset = await stored();
    await upload(exported); await button('Cancel').click(); assert.deepEqual(await stored(), reset);
    await upload(exported); await button('Confirm').click();
    assert.deepEqual(JSON.parse((await stored())[key]), roundtrip.project);
    const imported = await stored();
    for (const invalid of ['{bad', JSON.stringify({ ...roundtrip, fileVersion: 20 }), ' '.repeat(1024 * 1024 + 1)]) {
      await upload(invalid); await page.getByText(/Import failed:/).waitFor();
      assert.deepEqual(await stored(), imported);
    }
    await page.evaluate(() => { window.oldSet = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); }; });
    await page.locator('#project-name').fill('Failed'); await button('Save named snapshot').click();
    await page.getByText(/Operation failed:/).waitFor(); assert.deepEqual(await stored(), imported);
    await page.evaluate(() => { Storage.prototype.setItem = window.oldSet; });
    await choose('Renamed'); await button('Delete snapshot').click(); await button('Cancel').click();
    assert.deepEqual(await stored(), imported);
    await button('Delete snapshot').click(); await button('Confirm').click();
    assert.equal(JSON.parse((await stored())[libraryKey]).entries.length, 1);
    await page.evaluate(key => localStorage.setItem(key, '{protected'), key); await page.reload();
    await upload(exported); await button('Confirm').click();
    assert.equal((await stored())[key], '{protected');
    await page.locator('[aria-labelledby="title-A"] [data-x="1"][data-y="0"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS named snapshots, cancellation, rename/delete, actual file round-trip, invalid/oversize imports, quota and protected loads');
  } finally { await context.close(); }
}
