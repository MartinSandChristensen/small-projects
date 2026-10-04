import { workingSequence } from './legend.js';
import { previewEdge } from './shape-editing.js';
import { message, translate, errorMessage } from './i18n.js';
import { workflowText, workflowMessages, workingDirection, faceRelativePlus } from './workflow.js';
import { faceColour, faceRole, pairAppearance } from './notation.js';
import { includesCell, selectionBounds } from './selection.js';
import { cellGeometry, guideBoundaries } from './display.js';
import { rowNumber, rowDirection } from './model.js';

// Cache complete accessible/render descriptions per immutable pair row. This avoids
// repeated Vue proxy and presentation lookups for every attribute of every cell.
const pairRows = new WeakMap();
function presentRow(row, notation, number, workflow, locale, project) {
  let variants = pairRows.get(row);
  if (!variants) { variants = new Map(); pairRows.set(row, variants); }
  const key = `${notation}:${number}:${workflow}:${locale}:${Boolean(faceRelativePlus(project))}`;
  if (!variants.has(key)) {
    const direction = project ? workingDirection(project, number) : rowDirection(number, workflow), unit = workflowMessages(workflow).unit;
    variants.set(key, row.map((pair, x) => {
      const appearance = pairAppearance(pair, notation, direction, locale);
      const description = project && pair.present !== false
        ? workingSequence(project, pair, workflow === 'flat' && number % 2 === 0, locale)
        : appearance.description;
      return { classes: appearance.classes, style: appearance.style,
        label: translate(message('chart.pairLabel', { unit, number, column: x + 1, description }), locale) };
    }));
  }
  return variants.get(key);
}

// Retain only the latest label variant for an immutable face row. Workflow/shape
// changes refresh it, without accumulating every outline visited in session history.
const faceRows = new WeakMap();
function faceLabels(row, span, face, number, workflow, locale) {
  const key = `${face}:${number}:${workflow}:${locale}:${span?.[0]}:${span?.[1]}`;
  const cached = faceRows.get(row);
  if (cached?.key === key) return cached.labels;
  const unit = workflowMessages(workflow).unit;
  const labels = row.map((colour, x) => translate(message(!span || x < span[0] || x >= span[1]
    ? 'chart.absentLabel' : 'chart.faceLabel', { face, unit, number, column: x + 1,
      role: message('role.' + faceRole(face, colour)),
    }), locale));
  faceRows.set(row, { key, labels });
  return labels;
}

export const PatternChart = {
  props: ['face', 'cells', 'focused', 'editable', 'display', 'selectionEpoch', 'working', 'spans', 'workflow', 'combinedProportional', 'source', 'title', 'tool', 'project', 'shapeMode', 'zoom'],
  data() {
    return { selecting: false, anchor: null, end: null, completed: false,
      hovered: null, hoverShape: null, pendingShape: null, shapeError: '', jumpRow: '1', jumpColumn: '1', jumpError: '' };
  },
  watch: {
    bounds(value) { this.$emit('selection', value); },
    selectionEpoch() { this.clearSelection(); this.cancelShape(); },
    project() { this.cancelShape(); },
    tool() {
      this.cancelShape(); this.selecting = this.tool === 'select';
      if (!this.shaping && this.focused && !this.present(this.focused.y, this.focused.x)) {
        this.$emit('move', this.nearest(this.focused.x, this.focused.y));
      }
    },
    shapeMode() { this.hoverShape = null; this.hovered = null; this.shapeError = ''; },
    working() { this.leaveChart(); },
    workflow() { this.jumpError = ''; },
  },
  computed: {
    isSource() { return this.source ?? this.editable; },
    shaping() { return this.editable && this.tool === 'shape' && this.face === 'A' && Boolean(this.project); },
    interactive() { return this.editable || this.shaping; },
    changedCount() {
      return this.pendingShape ? this.cells.reduce((sum, row, y) => sum + row.filter((_, x) => { const old = this.project.maskA[y], next = this.pendingShape.maskA[y]; return Boolean(old && x >= old[0] && x < old[1]) !== Boolean(next && x >= next[0] && x < next[1]); }).length, 0) : 0;
    },
    words() { return workflowText(this.workflow, this.locale); },
    faceSpans() {
      if (!this.isSource) return this.cells.map(row => {
        const left = row.findIndex(pair => pair.present !== false);
        return left < 0 ? null : [left, row.findLastIndex(pair => pair.present !== false) + 1];
      });
      return this.spans?.map(span => span && this.face === 'B'
        ? [this.cells[0].length - span[1], this.cells[0].length - span[0]] : span);
    },
    outline() {
      if (!this.faceSpans || this.faceSpans.every(span => span && span[0] === 0 && span[1] === this.cells[0].length)) return '';
      const commands = [], w = this.geometry.width, h = this.geometry.height;
      const line = (x1, y1, x2, y2) => commands.push(`M${x1 * w},${y1 * h}L${x2 * w},${y2 * h}`);
      this.faceSpans.forEach((span, y) => {
        if (!span) return;
        line(span[0], y, span[0], y + 1); line(span[1], y, span[1], y + 1);
        for (const [neighbour, edgeY] of [[this.faceSpans[y - 1], y], [this.faceSpans[y + 1], y + 1]]) {
          if (!neighbour) line(span[0], edgeY, span[1], edgeY);
          else {
            if (span[0] < neighbour[0]) line(span[0], edgeY, Math.min(span[1], neighbour[0]), edgeY);
            if (span[1] > neighbour[1]) line(Math.max(span[0], neighbour[1]), edgeY, span[1], edgeY);
          }
        }
      });
      return commands.join('');
    },
    editableLabels() {
      return this.isSource ? this.cells.map((row, y) => faceLabels(row,
        this.faceSpans?.[y] ?? (this.spans ? null : [0, row.length]), this.face,
        rowNumber(this.cells.length, y), this.workflow, this.locale)) : [];
    },
    workingGuides() { return true; },
    renderedRows() {
      return this.isSource ? this.cells : this.cells.map((row, y) =>
        presentRow(row, this.display.notation, rowNumber(this.cells.length, y), this.workflow, this.locale, this.project));
    },
    bounds() { return this.anchor && this.end ? selectionBounds(this.anchor, this.end) : null; },
    selectionText() {
      const b = this.bounds;
      return b ? message('chart.selection', { units: workflowMessages(this.workflow).units,
        first: this.cells.length - b.bottom, last: this.cells.length - b.top, left: b.left + 1, right: b.right + 1 })
        : message('chart.none');
    },
    geometry() {
      const base = cellGeometry(this.display, this.face);
      return { ...base, width: base.width * (this.zoom ?? 1), height: base.height * (this.zoom ?? 1) };
    },
    previewedShape() { return this.hoverShape ?? this.pendingShape; },
    boundaries() { return guideBoundaries(this.face, this.cells[0].length, this.cells.length, this.display.guideSize); },
    chartStyle() { return { '--cell-width': this.geometry.width + 'px', '--cell-height': this.geometry.height + 'px', '--row-font-size': Math.min(11, this.geometry.height * 0.7) + 'px' }; },
  },
  emits: ['toggle', 'move', 'area', 'change', 'selection'],
  methods: {
    rowNumber, includesCell, faceColour,
    cancelShape() { this.pendingShape = this.hoverShape = null; this.shapeError = ''; },
    applyShape() { if (this.pendingShape) { const next = this.pendingShape; this.cancelShape(); this.$emit('change', next); } },
    shapeChanged(y, x) {
      if (!this.previewedShape) return false;
      const old = this.project.maskA[y], next = this.previewedShape.maskA[y];
      return Boolean(old && x >= old[0] && x < old[1]) !== Boolean(next && x >= next[0] && x < next[1]);
    },
    edgeAt(x, y) {
      const base = this.pendingShape ?? this.project, span = base.maskA[y];
      const left = span?.[0] ?? 0, right = (span?.[1] ?? base.width) - 1;
      return Math.abs(x - left) <= Math.abs(x - right) ? 'left' : 'right';
    },
    previewShape(x, y, pin = true) {
      this.hoverShape = null; this.shapeError = '';
      const base = this.pendingShape ?? this.project;
      try {
        const next = previewEdge(base, { x, y, mode: this.shapeMode, edge: this.edgeAt(x, y) });
        if (next === base) { if (pin) this.shapeError = message('chart.shapeSame'); }
        else if (pin) this.pendingShape = next;
        else this.hoverShape = next;
      } catch (error) { this.shapeError = errorMessage(error); }
    },
    hoverCell(event) {
      if (!this.isSource || this.working || event.pointerType === 'touch') return;
      const cell = event.target.closest('[data-x]');
      if (!cell) { this.leaveChart(); return; }
      const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
      if (this.hovered?.x === x && this.hovered?.y === y) return;
      this.hovered = { x, y };
      if (this.shaping) this.previewShape(x, y, false);
    },
    leaveChart() { this.hovered = null; this.hoverShape = null; },
    direction(y) {
      const number = rowNumber(this.cells.length, y);
      const direction = !this.isSource && this.project ? workingDirection(this.project, number)
        : rowDirection(number, this.workflow);
      return this.face === 'B' ? (direction === 'right-to-left' ? 'left-to-right' : 'right-to-left') : direction;
    },
    rtl(y) { return this.direction(y) === 'right-to-left'; },
    present(y, x) { const span = this.faceSpans?.[y]; return !this.spans || Boolean(span && x >= span[0] && x < span[1]); },
    nearest(x, y) {
      if (!this.spans) return { x, y };
      let nearest, distance = Infinity;
      this.faceSpans.forEach((span, row) => {
        if (!span) return;
        const column = Math.max(span[0], Math.min(span[1] - 1, x));
        const d = Math.abs(row - y) + Math.abs(column - x);
        if (d < distance) { distance = d; nearest = { x: column, y: row }; }
      });
      return nearest;
    },
    selectionRow(y) {
      return this.bounds && y >= this.bounds.top && y <= this.bounds.bottom
        ? `${this.bounds.left}:${this.bounds.right}` : '';
    },
    clearSelection() { this.anchor = this.end = null; this.completed = false; },
    chooseCorner(point) {
      if (!this.anchor || this.completed) {
        this.anchor = point;
        this.end = point;
        this.completed = false;
      } else {
        this.end = point;
        this.completed = true;
      }
    },
    toggleSelection() {
      if (this.bounds) { this.$emit('area', this.bounds); this.completed = true; }
    },
    focusCell(x, y) {
      if (!this.shaping) ({ x, y } = this.nearest(x, y));
      this.$emit('move', { x, y });
      this.$nextTick(() => {
        const cell = this.$refs.viewport.querySelector(`[data-x="${x}"][data-y="${y}"]`);
        cell?.focus({ preventScroll: true });
        cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    },
    jump() {
      const row = Number(this.jumpRow), column = Number(this.jumpColumn);
      if (!/^\d+$/.test(this.jumpRow.trim()) || !/^\d+$/.test(this.jumpColumn.trim())
          || !Number.isInteger(row) || row < 1 || row > this.cells.length
          || !Number.isInteger(column) || column < 1 || column > this.cells[0].length) {
        this.jumpError = message('chart.rangeError', { unit: workflowMessages(this.workflow).unit, height: this.cells.length, width: this.cells[0].length });
        this.$el.querySelector(`#jump-row-${this.face}`).focus();
        return;
      }
      this.jumpError = '';
      const x = column - 1, y = this.cells.length - row;
      if (this.interactive) {
        if (!this.shaping && !this.present(y, x)) this.jumpError = message('chart.nearest');
        this.focusCell(x, y);
      }
      else {
        const viewport = this.$refs.viewport;
        viewport.focus({ preventScroll: true });
        viewport.scrollLeft = x * this.geometry.width;
        viewport.scrollTop = y * this.geometry.height;
      }
    },
    select(event, toggle = false) {
      if (!this.interactive) return;
      const cell = event.target.closest('[data-x]');
      if (!cell) return;
      const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
      if (this.shaping) {
        this.$emit('move', { x, y });
        cell.focus({ preventScroll: true });
        if (toggle) this.previewShape(x, y);
        return;
      }
      if (!this.present(y, x)) {
        if (toggle && (this.tool ? this.tool === 'select' : this.selecting)) this.chooseCorner({ x, y });
        this.focusCell(x, y);
        return;
      }
      this.$emit('move', { x, y });
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (toggle) {
        if (this.tool ? this.tool === 'select' : this.selecting) this.chooseCorner({ x, y });
        else this.$emit('toggle', { x, y });
      }
    },
    keydown(event) {
      if (!this.interactive || !event.target.matches('[data-x]')) return;
      if (event.key === 'Escape') { event.preventDefault(); this.clearSelection(); this.cancelShape(); return; }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) this.select(event, true);
        return;
      }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const origin = event.shiftKey && this.anchor && this.end ? this.end : this.focused;
      let x = Math.max(0, Math.min(this.cells[0].length - 1, origin.x + delta[0]));
      let y = Math.max(0, Math.min(this.cells.length - 1, origin.y + delta[1]));
      if (!this.shaping && !event.shiftKey && !this.present(y, x)) {
        // Vertical movement follows the next occupied row and clamps to its span.
        if (delta[1]) {
          while (y >= 0 && y < this.cells.length && !this.faceSpans[y]) y += delta[1];
          if (y < 0 || y >= this.cells.length) return;
          x = Math.max(this.faceSpans[y][0], Math.min(this.faceSpans[y][1] - 1, x));
        } else return;
      }
      if (event.shiftKey) {
        this.selecting = true;
        if (!this.anchor) this.anchor = { ...this.focused };
        this.end = { x, y };
        this.completed = true;
      }
      this.focusCell(x, y);
    },
  },
  template: `
    <section class="chart-panel" :aria-labelledby="'title-' + face">
      <header class="chart-heading">
        <h2 :id="'title-' + face"><span v-if="!title" class="face-badge">{{ face }}</span>
          {{ title || (isSource ? t('chart.face', { face }) : t('chart.working')) }}</h2>
        <span class="chart-size">{{ n(cells[0].length) }} × {{ n(cells.length) }}<span v-if="hovered && isSource && !working" class="cell-coordinate"> ({{ n(hovered.x + 1) }}, {{ n(cells.length - hovered.y) }})</span></span>
      </header>
      <p :id="'description-' + face" class="chart-description">
        {{ working ? t('ui.knitHelp') : isSource ? t(editable ? 'chart.designDescription' : 'ui.readonly') : t('chart.combinedDescription') }}
      </p>
      <div v-if="editable && !shaping && (bounds || tool === 'select')" class="area-controls">
        <template v-if="bounds">
          <button type="button" @click="toggleSelection">{{ t('chart.swap') }}</button>
          <button type="button" @click="clearSelection">{{ t('chart.deselect') }}</button>
        </template>
        <p role="status">{{ bounds ? t(selectionText) : t('chart.corners') }}</p>
      </div>
      <div v-if="shaping" class="shape-preview-controls">
        <p v-if="!pendingShape" class="control-help">{{ t('chart.shapeHint') }}</p>
        <p v-if="pendingShape" role="status">{{ t('chart.shapePreview', { count: changedCount }) }}</p>
        <button v-if="pendingShape" type="button" @click="applyShape">{{ t('chart.shapeApply') }}</button>
        <button v-if="pendingShape" type="button" @click="cancelShape">{{ t('chart.shapeCancel') }}</button>
        <p v-if="shapeError" role="alert" class="field-error">{{ t(shapeError) }}</p>
      </div>
      <details class="chart-navigation-details">
      <summary>{{ t('chart.navigateSummary') }}</summary>
      <p class="navigation-help">{{ t('chart.navigationHelp', { labels: words.labels }) }}</p>
      <form class="chart-navigation" @submit.prevent="jump" :aria-label="t('chart.navigate', { face })" novalidate>
        <label :for="'jump-row-' + face">{{ words.label }}
          <input :id="'jump-row-' + face" v-model="jumpRow" type="text" inputmode="numeric"
            :aria-describedby="jumpError ? 'jump-error-' + face : null" :aria-invalid="Boolean(jumpError)"></label>
        <label :for="'jump-column-' + face">{{ t('chart.column') }}
          <input :id="'jump-column-' + face" v-model="jumpColumn" type="text" inputmode="numeric"
            :aria-describedby="jumpError ? 'jump-error-' + face : null" :aria-invalid="Boolean(jumpError)"></label>
        <button type="submit">{{ isSource ? t('chart.goStitch') : t('chart.goPair') }}</button>
        <p v-if="jumpError" :id="'jump-error-' + face" class="field-error" role="alert">{{ t(jumpError) }}</p>
      </form>
      </details>
      <div ref="viewport" class="chart-viewport" :role="interactive ? 'grid' : 'region'"
        :tabindex="interactive ? null : 0" :aria-labelledby="'title-' + face"
        :aria-describedby="'description-' + face + (editable ? ' editing-help' : ' combined-help')"
        :aria-multiselectable="editable ? true : null" @pointermove="hoverCell" @pointerleave="leaveChart"
        :aria-rowcount="editable ? cells.length : null" :aria-colcount="editable ? cells[0].length : null"
        v-on="interactive ? { click: event => select(event, true), keydown, focusin: event => select(event) } : {}">
        <div class="chart-content" :style="chartStyle">
          <div v-if="display.guides" class="guide-overlay" aria-hidden="true"
            :style="{ width: cells[0].length * geometry.width + 'px', height: cells.length * geometry.height + 'px' }">
            <span v-for="x in boundaries.vertical" :key="'x' + x" class="frame-line vertical"
              :style="{ left: x * geometry.width + 'px' }"></span>
            <span v-for="y in boundaries.horizontal" :key="'y' + y" class="frame-line horizontal"
              :style="{ top: y * geometry.height + 'px' }"></span>
          </div>
          <svg v-if="outline" class="shape-outline" aria-hidden="true"
            :width="cells[0].length * geometry.width" :height="cells.length * geometry.height">
            <path :d="outline"></path>
          </svg>
          <div v-for="(row, y) in renderedRows" :key="y" class="chart-row" :role="editable ? 'row' : null"
            :aria-rowindex="editable ? y + 1 : null"
            :aria-label="editable ? t('chart.rowLabel', { unit: words.unit, number: rowNumber(cells.length, y), direction: t('direction.' + direction(y)) }) : null"
            v-memo="[row, spans?.[y], focused?.y === y ? focused.x : -1, cells.length, selectionRow(y), display.notation, workingGuides, workflow, locale, direction(y), isSource, interactive, shaping, previewedShape?.maskA[y]]">
            <span class="row-guide" :aria-hidden="!workingGuides || rtl(y) ? true : null"
              :aria-label="!workingGuides || !rtl(y)
                ? t('chart.rowLabel', { unit: words.unit, number: rowNumber(cells.length, y), direction: t('direction.' + direction(y)) }) : null">
              <template v-if="!workingGuides || !rtl(y)">
                {{ n(rowNumber(cells.length, y)) }} {{ rtl(y) ? '←' : '→' }}
              </template>
            </span>
            <span v-for="(colour, x) in row" :key="x" class="cell" :class="isSource ? { absent: !present(y, x), black: present(y, x) && faceColour(face, colour, display.notation) === 1,
                selected: editable && includesCell(bounds, x, y), 'shape-preview-cell': shapeChanged(y, x) } : colour.classes" :style="isSource ? null : colour.style"
              :aria-disabled="interactive && !shaping && !present(y, x) ? true : null"
              :aria-selected="editable ? includesCell(bounds, x, y) : null"
              :role="interactive ? 'gridcell' : 'img'" :data-x="isSource ? x : null" :data-y="isSource ? y : null"
              :aria-label="isSource ? editableLabels[y][x] : colour.label" :aria-colindex="editable ? x + 1 : null"
              :tabindex="interactive ? ((shaping || present(y, x)) && focused.x === x && focused.y === y ? 0 : -1) : null"
              :title="isSource ? null : colour.label"></span>
            <span v-if="workingGuides" class="row-guide row-guide-right"
              :aria-hidden="!rtl(y) ? true : null"
              :aria-label="rtl(y)
                ? t('chart.rowLabel', { unit: words.unit, number: rowNumber(cells.length, y), direction: t('direction.right-to-left') }) : null">
              <template v-if="rtl(y)">← {{ n(rowNumber(cells.length, y)) }}</template>
            </span>
          </div>
        </div>
      </div>
    </section>`,
};
