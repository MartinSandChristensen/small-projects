import { workingDirection } from './workflow.js';
import { message, translate, formatMillimetres, parseDecimal, decimalInput, errorMessage } from './i18n.js';
import { validateProject, derivePairs, isPresent } from './model.js';
import { projectName } from './projects.js';
import { pairPresentation } from './notation.js';
import { DEFAULT_EXPORT, PAPER_SIZES, defaultPaper, planPdf, pdfFilename } from './pdf-layout.js';

export const PdfControls = {
  props: ['project', 'name', 'proportional'],
  data() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('doubleknit-print-preferences')) ?? {}; } catch { /* Optional preferences. */ }
    return { paper: Object.hasOwn(PAPER_SIZES, saved.paper) ? saved.paper : defaultPaper(window.navigator),
      orientation: ['auto', 'portrait', 'landscape'].includes(saved.orientation) ? saved.orientation : 'auto',
      width: Number.isFinite(saved.width) && saved.width >= 3 ? decimalInput(saved.width, this.locale) : '4',
      overlap: Number.isInteger(saved.overlap) && saved.overlap >= 0 && saved.overlap <= 5 ? String(saved.overlap) : '2',
      busy: false, opened: false, feedback: '', opener: null };
  },
  watch: {
    options: { deep: true, handler(value) {
      if (this.proposal.error) return;
      try { localStorage.setItem('doubleknit-print-preferences', JSON.stringify(value)); } catch { /* Printing still works. */ }
    } },
    locale(next, previous) {
      const value = parseDecimal(this.width, previous);
      if (value !== null) this.width = decimalInput(value, next);
    },
  },
  computed: {
    previewCells() {
      const plan = this.proposal.plan;
      if (!plan) return [];
      const tile = plan.tiles[0], cells = [], pairs = this.project.mode === 'plain' ? null : derivePairs(this.project);
      for (let y = tile.top; y < tile.bottom; y++) for (let x = tile.left; x < tile.right; x++) {
        if (!isPresent(this.project, 'a', y, x)) continue;
        const model = pairs ? pairPresentation(pairs[y][x], this.project.display.notation,
          workingDirection(this.project, this.project.height - y), this.locale) : { background: this.project.a[y][x] };
        cells.push({ key: x + ':' + y, x: 20 + (x - tile.left) * plan.cellWidth,
          y: 34 + (y - tile.top) * plan.cellHeight, ...model });
      }
      return cells;
    },
    options() {
      return { ...DEFAULT_EXPORT, paper: this.paper, orientation: this.orientation, proportional: this.project.display.proportional,
        width: parseDecimal(this.width, this.locale), overlap: /^\d+$/.test(this.overlap) ? Number(this.overlap) : NaN };
    },
    needsTiling() {
      try { return planPdf(this.project, { ...this.options, overlap: 0 }, this.locale).tiled; } catch { return false; }
    },
    proposal() {
      try {
        const single = planPdf(this.project, { ...this.options, overlap: 0 }, this.locale);
        return { plan: single.tiled ? planPdf(this.project, this.options, this.locale) : single };
      }
      catch (cause) { return { error: errorMessage(cause) }; }
    },
  },
  methods: {
    mm(value) { return formatMillimetres(value, this.locale); },
    async open() {
      this.opener = document.activeElement;
      this.feedback = '';
      this.opened = true;
      await this.$nextTick();
      this.$refs.dialog.showModal();
      this.$refs.cancel.focus();
    },
    close() {
      if (this.busy) return;
      this.$refs.dialog.close();
      this.opened = false;
      this.opener?.focus();
    },
    async download() {
      if (this.busy || this.proposal.error) return;
      const locale = this.locale;
      this.feedback = '';
      this.busy = true;
      try {
        // Capture before the first await: subsequent edits or language changes cannot leak in.
        const project = validateProject(this.project), name = projectName(this.name);
        const plan = this.proposal.plan;
        const { generatePdf } = await import('./pdf.js');
        const blob = await generatePdf({ project, name, locale, plan });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        try {
          link.href = url; link.download = pdfFilename(name);
          document.body.append(link); link.click();
        } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
        this.busy = false;
        this.close();
      } catch (cause) {
        this.feedback = translate(message('pdf.failed', { reason: errorMessage(cause) }), locale);
      } finally { this.busy = false; }
    },
  },
  template: `
    <div class="pdf-controls">
      <button type="button" @click="open" aria-haspopup="dialog">{{ t('pdf.export') }}<span aria-hidden="true">…</span></button>
      <dialog v-if="opened" ref="dialog" class="pdf-dialog" aria-labelledby="pdf-title" @cancel.prevent="close">
        <h2 id="pdf-title">{{ t('pdf.export') }}</h2>
        <p>{{ t('pdf.settingsHelp') }}</p>
        <form @submit.prevent="download">
          <div class="pdf-fields">
            <div><label for="pdf-paper">{{ t('pdf.paper') }}</label><select id="pdf-paper" v-model="paper" :disabled="busy">
              <option value="a4">A4</option><option value="a3">A3</option><option value="letter">Letter</option><option value="tabloid">Tabloid (11 × 17 in)</option></select></div>
          </div>
          <details class="pdf-advanced"><summary>{{ t('uiDisplay.printLayout') }}</summary>
          <div class="pdf-fields">
            <div><label for="pdf-orientation">{{ t('pdf.orientation') }}</label>
              <select id="pdf-orientation" v-model="orientation" :disabled="busy">
                <option value="auto">{{ t('pdf.auto') }}</option><option value="portrait">{{ t('pdf.portrait') }}</option>
                <option value="landscape">{{ t('pdf.landscape') }}</option></select></div>
            <div><label for="pdf-width">{{ t('pdf.width') }}</label>
              <input id="pdf-width" v-model="width" type="text" inputmode="decimal" :disabled="busy"></div>
            <div v-if="needsTiling"><label for="pdf-overlap">{{ t('pdf.overlap') }}</label>
              <input id="pdf-overlap" v-model="overlap" type="text" inputmode="numeric" :disabled="busy"></div>
          </div>
          </details>
          <p>{{ t(project.display.proportional ? 'pdf.gauge' : 'pdf.square') }}</p>
          <p v-if="proposal.error" class="field-error" role="alert">{{ t(proposal.error) }}</p>
          <template v-else>
            <figure class="pdf-paper-preview">
              <svg :viewBox="'0 0 ' + proposal.plan.paper.join(' ')" role="img" :aria-label="t('uiDisplay.paperPreview')">
                <rect width="100%" height="100%" fill="white" stroke="#aaa" />
                <text x="20" y="20" font-size="5">{{ name }}</text>
                <g v-if="!proposal.plan.tiled" class="pdf-preview-legend"
                  :transform="'translate(' + proposal.plan.legendBox.x + ',' + proposal.plan.legendBox.y + ')'">
                  <rect :width="proposal.plan.legendBox.width" :height="proposal.plan.legendBox.height" fill="#f4f4f4" />
                  <template v-for="(item, index) in proposal.plan.legendBox.items" :key="index">
                    <text v-if="item.kind === 'text'" :x="item.x" :y="item.y" :font-size="item.size * 25.4 / 72">{{ item.value }}</text>
                    <rect v-else :x="item.x" :y="item.y" width="5" height="5" fill="#999" />
                  </template>
                </g>
                <g v-for="cell in previewCells" :key="cell.key" :transform="'translate(' + cell.x + ',' + cell.y + ')'">
                  <rect :width="proposal.plan.cellWidth" :height="proposal.plan.cellHeight" :fill="(cell.lower ? cell.lower.colour : cell.background) ? '#111' : '#fff'" stroke="#777" stroke-width="0.1" />
                  <path v-if="cell.upper && cell.upper.colour !== cell.lower.colour"
                    :d="cell.upper.corner === 'upper-right' ? 'M0,0 H' + proposal.plan.cellWidth + ' V' + proposal.plan.cellHeight + ' Z' : 'M0,0 H' + proposal.plan.cellWidth + ' L0,' + proposal.plan.cellHeight + ' Z'"
                    :fill="cell.upper.colour ? '#111' : '#fff'" />
                  <path v-if="cell.plus" :d="'M' + proposal.plan.cellWidth * .25 + ',' + proposal.plan.cellHeight / 2 + ' h' + proposal.plan.cellWidth * .5 + ' M' + proposal.plan.cellWidth / 2 + ',' + proposal.plan.cellHeight * .25 + ' v' + proposal.plan.cellHeight * .5"
                    :stroke="cell.background ? '#fff' : '#111'" stroke-width="0.4" />
                </g>
              </svg>
              <figcaption>{{ t('uiDisplay.paperPreview') }}</figcaption>
            </figure>
            <p id="pdf-preview" role="status">{{ t('pdf.preview', { count: proposal.plan.pageCount,
              orientation: t('pdf.' + proposal.plan.orientation), width: mm(proposal.plan.cellWidth), height: mm(proposal.plan.cellHeight) }) }}</p>
            <p v-if="proposal.plan.tiled">{{ t('pdf.tiledHelp') }}</p>
            <p v-else-if="proposal.plan.cellWidth < options.width">{{ t('pdf.reduced') }}</p>
          </template>
          <p>{{ t('pdf.actualSize') }}</p>
          <p role="status">{{ busy ? t('pdf.preparing') : feedback }}</p>
          <div class="dialog-actions">
            <button ref="cancel" type="button" :disabled="busy" @click="close">{{ t('dialog.cancel') }}</button>
            <button type="submit" class="primary" :disabled="busy || Boolean(proposal.error)">{{ t('pdf.download') }}</button>
          </div>
        </form>
      </dialog>
    </div>`,
};
