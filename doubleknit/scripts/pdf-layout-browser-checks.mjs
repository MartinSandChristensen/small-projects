import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function checkPdfLayout(browser, url) {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: touch });
    const page = await context.newPage();
    try {
      await page.goto(url);
      const fixtures = await page.evaluate(async () => {
        const { createProject } = await import('./src/model.js');
        const { planPdf } = await import('./src/pdf-layout.js');
        const { generatePdf } = await import('./src/pdf.js');
        const fixtures = [];
        for (const locale of ['en-GB', 'da']) for (const notation of ['plus', 'triangle'])
          for (const workflow of ['flat', 'in-the-round']) {
            const project = createProject(); project.display.notation = notation; project.workflow = workflow;
            project.a = project.a.map((row, y) => row.map((_, x) => Number((x + y) % 5 === 0)));
            const plan = planPdf(project, { orientation: 'landscape' }, locale);
            const blob = await generatePdf({ project, name: 'Ærø landscape', locale, plan });
            // Compare every planned line against the actual embedded jsPDF font metrics.
            const doc = new window.jspdf.jsPDF();
            const response = await fetch('./assets/NotoSans-Regular.ttf');
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
            doc.addFileToVFS('Noto.ttf', binary); doc.addFont('Noto.ttf', 'Noto', 'normal'); doc.setFont('Noto');
            for (const item of plan.legendBox.items.filter(item => item.kind === 'text')) {
              doc.setFontSize(item.size);
              if (item.x + doc.getTextWidth(item.value) > plan.legendBox.width) throw Error('Legend text overflow');
            }
            fixtures.push({ locale, notation, workflow, pageCount: plan.pageCount, cellWidth: plan.cellWidth,
              bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
          }
        const project = createProject(); project.display.notation = 'triangle';
        localStorage.setItem('doubleknit.currentProject', JSON.stringify(project));
        localStorage.setItem('doubleknit.language', 'da');
        localStorage.setItem('doubleknit-print-preferences', JSON.stringify({ paper: 'a4', orientation: 'landscape', width: 4, overlap: 2 }));
        return fixtures;
      });
      for (const fixture of fixtures) {
        assert.equal(fixture.pageCount, 1); assert.equal(fixture.cellWidth, 4);
        if (!touch) await writeFile(`/tmp/doubleknit-pdf-layout-${fixture.locale}-${fixture.notation}-${fixture.workflow}.pdf`, Buffer.from(fixture.bytes));
      }
      await page.reload();
      await page.locator('.project-title').click();
      await page.locator('#header-project-name').fill('Ærø landscape');
      await page.locator('#header-project-name').press('Enter');
      await page.locator('.pdf-controls > button').click();
      await page.locator('.pdf-preview-legend').waitFor();
      assert.match(await page.locator('#pdf-preview').innerText(), /4,0 × 4,0 mm/);
      assert.equal(await page.locator('#pdf-overlap').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/doubleknit-pdf-layout-${touch ? 'touch' : 'desktop'}.png`, fullPage: true });
      const download = page.waitForEvent('download'); await page.locator('.pdf-dialog button[type=submit]').click();
      await (await download).saveAs(`/tmp/doubleknit-pdf-layout-ui-${touch ? 'touch' : 'desktop'}.pdf`);
      await page.locator('.pdf-dialog').waitFor({ state: 'detached' });
      console.log(`PDF layout ${touch ? 'touch' : 'desktop'}: measured text, landscape fixtures, preview and download passed`);
    } finally { await context.close(); }
  }
}
