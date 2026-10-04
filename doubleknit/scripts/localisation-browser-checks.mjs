import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject, setWorkflow } from '../src/model.js';

export async function checkLocalisation(browser, url) {
  const key = 'doubleknit.currentProject';
  const failures = [];
  async function open({ locale = 'en-US', languages, stored, project, mobile = false, deny = false } = {}) {
    const context = await browser.newContext({ locale, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(({ languages, stored, project, deny, key }) => {
      if (languages) Object.defineProperty(navigator, 'languages', { get: () => languages });
      if (!sessionStorage.getItem('localisation-seeded')) {
        if (stored !== undefined) localStorage.setItem('doubleknit.language', stored);
        if (project) localStorage.setItem(key, JSON.stringify(project));
        sessionStorage.setItem('localisation-seeded', 'yes');
      }
      if (deny) {
        const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) { if (key === 'doubleknit.language') throw new Error('denied'); return get.call(this, key); };
        Storage.prototype.setItem = function (key, value) { if (key === 'doubleknit.language') throw new Error('denied'); return set.call(this, key, value); };
      }
    }, { languages, stored, project, deny, key });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(url); await page.locator('#language').waitFor();
    return { context, page };
  }
  const choose = async (page, locale) => {
    await page.locator('#language').selectOption(locale);
    await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
  };
  const storedProject = page => page.evaluate(key => localStorage.getItem(key), key);
  const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const [options, expected] of [
    [{ stored: 'da' }, 'da'], [{ stored: 'invalid', languages: ['fr-FR', 'da-DK', 'en-GB'] }, 'da'],
    [{ languages: ['en-US', 'da'] }, 'en-GB'], [{ languages: ['fr-FR'] }, 'en-GB'],
  ]) {
    const { context, page } = await open(options);
    assert.equal(await page.locator('html').getAttribute('lang'), expected);
    assert.equal(await page.locator('#language').inputValue(), expected);
    if (!options.stored) assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.language')), null);
    await context.close();
  }

  for (const mobile of [false, true]) {
    const { context, page } = await open({ mobile, project: createProject(20, 20) });
    const a = page.locator('[aria-labelledby="title-A"]');
    await page.locator('#display-stitches').fill('20.5');
    await page.locator('#display-rows').fill('30.5');
    await page.getByRole('button', { name: 'Apply display settings', exact: true }).click();
    await a.locator('[data-x="19"][data-y="19"]').click();
    await a.getByRole('button', { name: 'Select area', exact: true }).click();
    await a.locator('[data-x="18"][data-y="19"]').click();
    await a.locator('[data-x="19"][data-y="19"]').click();
    await page.locator('#project-name').fill('Ærø {name}');
    await page.locator('#width').fill('bad');
    await page.locator('#apply-dimensions').click();
    const source = await storedProject(page);
    const before = await page.evaluate(() => ({
      focused: document.activeElement.id, pageScroll: [scrollX, scrollY],
      scroll: [...document.querySelectorAll('.chart-viewport')].map(el => [el.scrollLeft, el.scrollTop]),
      selected: document.querySelectorAll('[aria-selected="true"]').length,
    }));
    // Dispatch without moving focus: locale updates themselves must preserve the current target.
    await page.locator('#language').evaluate(el => { el.value = 'da'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => document.documentElement.lang === 'da');
    assert.equal(await page.title(), 'Doubleknit — mønsterdesigner til dobbeltstrik');
    assert.equal(await page.locator('#width').inputValue(), 'bad');
    assert.equal(await page.locator('#project-name').inputValue(), 'Ærø {name}');
    assert.equal(await page.locator('#display-stitches').inputValue(), '20,5');
    assert.match(await page.locator('#width-error').textContent(), /helt tal/);
    assert.match(await a.locator('[data-x="19"][data-y="19"]').getAttribute('aria-label'), /mønsterfarve/);
    assert.match(await page.locator('[aria-labelledby="title-C"] .cell').first().getAttribute('aria-label'), /Strikkepind/);
    assert.deepEqual(await page.evaluate(() => ({ focused: document.activeElement.id, pageScroll: [scrollX, scrollY],
      scroll: [...document.querySelectorAll('.chart-viewport')].map(el => [el.scrollLeft, el.scrollTop]),
      selected: document.querySelectorAll('[aria-selected="true"]').length })), before);
    assert.equal(await storedProject(page), source);
    assert.equal(await page.locator('[role="pind"]').count(), 0);
    assert.equal(await page.locator('.chart-row[role="row"]').count(), 40);
    await page.locator('#display-stitches').fill('21,5');
    await page.getByRole('button', { name: 'Anvend visningsindstillinger', exact: true }).click();
    assert.equal(JSON.parse(await storedProject(page)).display.stitches, 21.5);
    await page.locator('#display-stitches').fill('21.5');
    await page.getByRole('button', { name: 'Anvend visningsindstillinger', exact: true }).click();
    assert.match(await page.locator('#display-error-stitches').textContent(), /positivt/);
    await choose(page, 'en-GB');
    assert.equal(await page.locator('#display-stitches').inputValue(), '21.5');
    assert.match(await page.locator('#display-error-stitches').textContent(), /positive/);
    await choose(page, 'da');
    await page.getByRole('button', { name: 'Fortryd', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'da');
    assert.equal(JSON.parse(await storedProject(page)).display.stitches, 20.5);
    await page.locator('#workflow').selectOption('in-the-round'); await frames(page);
    assert.match(await a.locator('[data-x="0"][data-y="0"]').getAttribute('aria-label'), /omgang/);
    await page.locator('#shape-first').fill('0');
    await page.getByRole('button', { name: 'Anvend kanter for omgange', exact: true }).click();
    assert.match(await page.locator('#shape-error').textContent(), /omgang/);
    await page.getByRole('button', { name: 'Nulstil mønster', exact: true }).click();
    assert.match(await page.locator('#confirmation-message').textContent(), /strik frem og tilbage/);
    assert.equal(await page.getByRole('button', { name: 'Annuller', exact: true }).evaluate(el => el === document.activeElement), true);
    if (mobile) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: '/tmp/doubleknit-localisation-touch.png' });
    }
    // An open confirmation also reacts without losing its focus or action.
    await page.locator('#language').evaluate(el => { el.value = 'en-GB'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor();
    assert.match(await page.locator('#confirmation-message').textContent(), /flat knitting/);
    assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await choose(page, 'da');
    await page.getByRole('button', { name: 'Gem navngiven kopi', exact: true }).click();
    assert.match(await page.locator('.project-controls').textContent(), /Gemte “Ærø \{name\}”/);
    await page.getByRole('button', { name: 'Nyt', exact: true }).click();
    await page.locator('#new-mode').selectOption('plain');
    await page.getByRole('button', { name: 'Bekræft', exact: true }).click();
    assert.equal(await page.locator('#project-name').inputValue(), 'Unavngivet');
    assert.equal(await page.locator('html').getAttribute('lang'), 'da');
    await page.getByRole('button', { name: 'Indlæs kopi', exact: true }).click();
    await page.getByRole('button', { name: 'Bekræft', exact: true }).click();
    assert.equal(await page.locator('#project-name').inputValue(), 'Ærø {name}');
    assert.equal(await page.locator('html').getAttribute('lang'), 'da');
    await page.locator('#display-notation').selectOption('plus'); await frames(page);
    assert.match(await page.locator('.compact-legend').textContent(), /mønstergarn/);
    await page.getByRole('checkbox', { name: 'Ens mønstre på begge sider', exact: true }).click();
    assert.match(await page.locator('#confirmation-message').textContent(), /kan ikke fortrydes/);
    await page.getByRole('button', { name: 'Annuller', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportér JSON', exact: true }).click();
    const filePath = await (await downloadPromise).path();
    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(exported.name, 'Ærø {name}');
    assert.equal('language' in exported, false); assert.equal('locale' in exported.project, false);
    assert.deepEqual(exported.project, JSON.parse(await storedProject(page)));
    await page.locator('#import-project').setInputFiles(filePath);
    assert.match(await page.locator('#confirmation-message').textContent(), /Ærø \{name\}/);
    await page.getByRole('button', { name: 'Bekræft', exact: true }).click();
    assert.deepEqual(JSON.parse(await storedProject(page)), exported.project);
    await page.locator('#import-project').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    assert.match(await page.locator('.project-controls [role="alert"]').textContent(), /Ugyldig JSON/);
    await choose(page, 'en-GB');
    assert.match(await page.locator('.project-controls [role="alert"]').textContent(), /Invalid JSON/);
    await choose(page, 'da');
    await page.reload(); await page.locator('#language').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'da');
    await context.close();
  }
  {
    const { context, page } = await open({ deny: true, project: createProject(2, 2) });
    await choose(page, 'da');
    assert.match(await page.locator('.language-control [role="status"]').textContent(), /sprogvalg/);
    await page.locator('[aria-labelledby="title-A"] [data-x="1"][data-y="1"]').click();
    assert.equal(JSON.parse(await storedProject(page)).a[1][1], 1);
    await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
    await page.reload(); await page.locator('#language').waitFor(); await choose(page, 'da');
    assert.match(await page.locator('.storage-warning').textContent(), /oprindelige gemte data bevares/);
    assert.equal(await storedProject(page), '{broken');
    await context.close();
  }
  for (const mode of ['plain', 'double-faced', 'linked']) {
    const project = setWorkflow(createProject(200, 200, mode === 'plain' ? 'plain' : 'double-faced', mode === 'linked'), 'in-the-round');
    const { context, page } = await open({ project });
    const before = await storedProject(page), start = Date.now();
    await choose(page, 'da'); await frames(page);
    assert.match(await page.locator('[aria-labelledby="title-A"] [data-x="199"][data-y="199"]').getAttribute('aria-label'), /omgang 1/);
    if (mode !== 'plain') assert.match(await page.locator('[aria-labelledby="title-C"] .cell').last().getAttribute('aria-label'), /Strikkeomgang 1/);
    assert.equal(await storedProject(page), before);
    console.log(`PASS 200 × 200 ${mode} language switch: ${Date.now() - start} ms`);
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log('PASS localisation detection, persistence, live text/errors/dialogs, unchanged source/focus/selection, decimals and narrow Danish layout');
}
