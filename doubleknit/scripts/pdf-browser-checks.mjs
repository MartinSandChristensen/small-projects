import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject } from '../src/model.js';

export async function checkPdf(browser, url) {
  const failures = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({ locale: 'en-US', viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const project = createProject(20, 20); project.display.rows = 30;
    await context.addInitScript(project => {
      if (!sessionStorage.getItem('pdf-seeded')) {
        localStorage.setItem('doubleknit.currentProject', JSON.stringify(project));
        sessionStorage.setItem('pdf-seeded', 'yes');
      }
    }, project);
    const page = await context.newPage(); page.on('pageerror', e => failures.push(e.message));
    await page.goto(url); await page.locator('#export-proportional').waitFor();
    const before = await page.evaluate(() => localStorage.getItem('doubleknit.currentProject'));
    await page.locator('#export-proportional').check();
    assert.equal(await page.locator('[aria-labelledby="title-C"] .cell').first().evaluate(el => el.getBoundingClientRect().width), 36);
    assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), before);
    await page.locator('#project-name').fill('Ærø mønster');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const dialog = page.locator('.pdf-dialog');
    assert.equal(await page.locator('#pdf-paper').inputValue(), 'letter');
    assert.equal(await dialog.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.locator('#pdf-width').fill('2');
    assert.equal(await dialog.getByRole('button', { name: 'Download PDF', exact: true }).isDisabled(), true);
    await page.locator('#pdf-width').fill('4');
    const pending = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), 'Ærø mønster.pdf');
    const path = `/tmp/doubleknit-pdf-${touch ? 'touch' : 'desktop'}.pdf`;
    await download.saveAs(path);
    assert.equal((await readFile(path)).subarray(0, 5).toString(), '%PDF-');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Export PDF', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.locator('#language').selectOption('da');
    await page.getByRole('button', { name: 'Eksportér PDF', exact: true }).click();
    await page.locator('#pdf-width').fill('4,5');
    assert.match(await page.locator('#pdf-preview').textContent(), /4,5/);
    assert.equal(await page.locator('#pdf-paper').inputValue(), 'letter');
    const danishPending = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Hent PDF', exact: true }).click();
    await (await danishPending).saveAs(`/tmp/doubleknit-pdf-danish-${touch ? 'touch' : 'desktop'}.pdf`);
    await page.screenshot({ path: `/tmp/doubleknit-pdf-dialog-${touch ? 'touch' : 'desktop'}.png`, fullPage: false });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.evaluate(() => localStorage.getItem('doubleknit.currentProject')), before);
    await page.reload(); await page.locator('#export-proportional').waitFor();
    assert.equal(await page.locator('#export-proportional').isChecked(), false);
    await page.getByRole('button', { name: 'Eksportér PDF', exact: true }).click();
    assert.equal(await page.locator('#pdf-width').inputValue(), '4');
    await context.close();
  }
  // Recover from a CDN failure without touching protected data or claiming a download.
  const recovery = await browser.newContext(); const recoverPage = await recovery.newPage();
  await recoverPage.goto(url); await recoverPage.locator('#language').waitFor();
  await recoverPage.evaluate(() => localStorage.setItem('doubleknit.currentProject', '{unreadable'));
  await recoverPage.reload(); await recoverPage.locator('#export-proportional').waitFor();
  await recovery.route('**/jspdf.umd.min.js', route => route.abort());
  await recoverPage.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await recoverPage.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await recoverPage.getByText('Could not prepare the PDF.', { exact: false }).waitFor();
  assert.equal(await recoverPage.evaluate(() => localStorage.getItem('doubleknit.currentProject')), '{unreadable');
  await recovery.unroute('**/jspdf.umd.min.js');
  const retryDownload = recoverPage.waitForEvent('download');
  await recoverPage.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await retryDownload;
  await recovery.close();
  // Render a matrix directly through the same source snapshot API, including maximum charts.
  const context = await browser.newContext(); const page = await context.newPage(); await page.goto(url);
  await page.locator('#language').waitFor();
  for (const mode of ['plain', 'independent', 'linked']) for (const notation of ['triangle', 'plus']) {
    const bytes = await page.evaluate(async ({ mode, notation }) => {
      const { createProject } = await import('./src/model.js');
      const { planPdf } = await import('./src/pdf-layout.js');
      const { generatePdf } = await import('./src/pdf.js');
      const project = createProject(200, 200, mode === 'plain' ? 'plain' : 'double-faced', mode === 'linked');
      project.workflow = notation === 'plus' ? 'in-the-round' : 'flat';
      project.display.notation = notation; project.display.guides = true; project.display.rows = 40;
      project.maskA = project.maskA.map((_, y) => mode === 'linked' ? [y % 80, 200 - y % 80] : [0, y + 1]);
      project.a = project.a.map((row, y) => row.map((_, x) => (x + y) % 2));
      if (project.b) project.b = project.b.map(row => row.map((_, x) => x % 3 === 0 ? 0 : 1));
      const plan = planPdf(project, { width: notation === 'plus' ? 4 : 3, proportional: notation === 'plus' }, 'da');
      const blob = await generatePdf({ project, name: 'Ærø Ø Å æ ø å', locale: 'da', plan });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, { mode, notation });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`/tmp/doubleknit-pdf-${mode}-${notation}.pdf`, Buffer.from(bytes));
  }
  for (const fixture of [
    { name: 'landscape', width: 60, height: 10, mode: 'double-faced' },
    { name: 'reduced', width: 45, height: 40, mode: 'double-faced' },
    { name: 'plain-reduced', width: 45, height: 60, mode: 'plain' },
  ]) {
    const bytes = await page.evaluate(async fixture => {
      const { createProject } = await import('./src/model.js');
      const { planPdf } = await import('./src/pdf-layout.js');
      const { generatePdf } = await import('./src/pdf.js');
      const project = createProject(fixture.width, fixture.height, fixture.mode);
      const blob = await generatePdf({ project, name: 'Ærø ' + 'W'.repeat(76), locale: 'da', plan: planPdf(project, {}, 'da') });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, fixture);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`/tmp/doubleknit-pdf-${fixture.name}.pdf`, Buffer.from(bytes));
  }
  // Change source/language after export begins at its first async boundary; the snapshot stays coherent.
  const snapshotDownload = page.waitForEvent('download');
  const frozen = await page.evaluate(async () => {
    const { createProject } = await import('./src/model.js');
    const { PdfControls } = await import('./src/pdf-controls.js');
    const fake = { project: createProject(2, 2), name: 'Ærø snapshot', locale: 'da', busy: false,
      proposal: {}, options: { paper: 'a4', width: 4, overlap: 2, orientation: 'auto', proportional: false } };
    const pending = PdfControls.methods.download.call(fake);
    fake.project = createProject(200, 200); fake.name = 'Changed'; fake.locale = 'en-GB';
    await pending;
    return { feedback: fake.feedback, busy: fake.busy };
  });
  await (await snapshotDownload).saveAs('/tmp/doubleknit-pdf-snapshot.pdf');
  assert.match(frozen.feedback, /Download er startet/); assert.equal(frozen.busy, false);
  await context.close();
  assert.deepEqual(failures, []);
  console.log('PASS PDF desktop/touch controls, download, Danish, transient settings, source snapshots and maximum-size mode/notation matrix');
}
