import assert from 'node:assert/strict';
import { createProject, derivePairs } from '../src/model.js';
import { workingDirection } from '../src/workflow.js';
import { workingLegend, workingSequence } from '../src/legend.js';

export async function checkLegend(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url);
      for (const locale of ['en-GB', 'da']) for (const mode of ['plain', 'double-faced'])
        for (const notation of ['plus', 'triangle']) for (const workflow of ['flat', 'in-the-round']) for (const linked of (mode === 'plain' ? [false] : [false, true])) {
          const project = createProject(4, 2, mode, linked);
          project.workflow = workflow;
          Object.assign(project.display, { notation, proportional: workflow === 'flat' });
          project.a = [[0, 1, 0, 1], [0, 1, 0, 1]];
          if (mode !== 'plain' && !linked) project.b = [[0, 0, 1, 1], [0, 0, 1, 1]];
          project.maskA[0] = linked ? [1, 3] : [1, 4];
          await page.evaluate(({ project, locale }) => {
            localStorage.setItem('doubleknit.currentProject', JSON.stringify(project));
            localStorage.setItem('doubleknit.language', locale);
          }, { project, locale });
          await page.reload();
          await page.getByRole('button', { name: locale === 'da' ? 'Strik' : 'Knit', exact: true }).click();
          const legend = page.locator('#combined-help .compact-legend');
          await legend.waitFor();
          const content = workingLegend(project, locale);
          const text = await legend.innerText();
          for (const value of [...content.paragraphs, ...content.notes, ...content.headings, ...content.entries.flatMap(entry => [entry.label, ...(entry.reverseLabel ? [entry.reverseLabel] : [])])]) assert.ok(text.includes(value), value);
          assert.equal(await legend.locator('.legend-samples .cell').count(), content.entries.flatMap(entry => entry.samples).length);
          const chart = page.locator(mode === 'plain' ? '[aria-labelledby="title-A"]' : '[aria-labelledby="title-C"]');
          const topGuides = await chart.locator('.chart-row').first().locator('.row-guide').allTextContents();
          assert.ok(topGuides[workingDirection(project, 2) === 'right-to-left' ? 1 : 0].includes('2'));
          if (mode === 'double-faced') {
            const cellLabel = await chart.locator('.chart-row').first().locator('.cell').nth(1).getAttribute('aria-label');
            assert.ok(cellLabel.includes(workingSequence(project, derivePairs(project)[0][1], workflow === 'flat', locale)));
            const designGuides = await page.locator('[aria-labelledby="title-A"] .chart-row').first().locator('.row-guide').allTextContents();
            assert.ok(designGuides[workflow === 'flat' ? 0 : 1].includes('2'));
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          if (locale === 'en-GB' && mode === 'double-faced' && workflow === 'flat' && !linked) {
            await page.screenshot({ path: `/tmp/doubleknit-legend-${notation}-${touch ? 'touch' : 'desktop'}.png`, fullPage: true });
          }
        }
      assert.deepEqual(errors, []);
      console.log(`Legend ${touch ? 'touch' : 'desktop'}: both languages, workflows, notations, modes, gauge and shaping passed`);
    } finally { await context.close(); }
  }
}
