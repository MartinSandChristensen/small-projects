import { message, errorMessage } from './i18n.js';
import { workflowText, workflowMessages } from './workflow.js';
import { setRowEdges } from './model.js';

export const ShapeControls = {
  props: ['project', 'refresh', 'selection'],
  computed: { words() { return workflowText(this.project.workflow, this.locale); } },
  emits: ['change'],
  data: () => ({ first: '1', last: '1', left: '0', right: '0', error: '', status: '' }),
  watch: {
    selection: { immediate: true, handler(value) {
      if (value) { this.first = String(this.project.height - value.bottom); this.last = String(this.project.height - value.top); }
    } },
    'project.workflow'() { this.error = this.status = ''; },
    refresh() {
      this.first = this.last = '1'; this.left = this.right = '0'; this.error = this.status = '';
    },
  },
  methods: {
    apply(empty = false) {
      this.error = this.status = '';
      const fields = empty ? ['first', 'last'] : ['first', 'last', 'left', ...(this.project.identicalPatterns ? [] : ['right'])];
      if (fields.some(key => !/^\d+$/.test(this[key].trim()))) {
        this.error = message('shape.numbers', { units: workflowMessages(this.project.workflow).units });
        return;
      }
      try {
        const next = setRowEdges(this.project, {
          top: this.project.height - Number(this.last), bottom: this.project.height - Number(this.first),
          left: empty ? 0 : Number(this.left), right: empty ? 0 : Number(this.right), empty,
        });
        if (next === this.project) this.status = message('shape.same');
        else this.$emit('change', next);
      } catch (error) { this.error = errorMessage(error); }
    },
  },
  template: `
    <details class="controls shape-controls" :aria-label="t('shape.title')">
      <summary>{{ t('shape.exact') }}</summary>
      <p class="control-help">{{ t('shape.intro', { units: words.units, labels: words.labels }) }}</p>
      <form @submit.prevent="apply(false)" novalidate aria-describedby="shape-help shape-error">
        <div class="dimension-field"><label for="shape-first">{{ t('shape.first', { unit: words.unit }) }}</label>
          <input id="shape-first" v-model="first" inputmode="numeric" type="text"></div>
        <div class="dimension-field"><label for="shape-last">{{ t('shape.last', { unit: words.unit }) }}</label>
          <input id="shape-last" v-model="last" inputmode="numeric" type="text"></div>
        <div class="dimension-field"><label for="shape-left">{{ project.identicalPatterns ? t('shape.each') : t('shape.left') }}</label>
          <input id="shape-left" v-model="left" inputmode="numeric" type="text"></div>
        <div v-if="!project.identicalPatterns" class="dimension-field"><label for="shape-right">{{ t('shape.right') }}</label>
          <input id="shape-right" v-model="right" inputmode="numeric" type="text"></div>
        <button type="submit">{{ t(project.workflow === 'in-the-round' ? 'shape.apply.round' : 'shape.apply.row') }}</button>
        <button type="button" @click="apply(true)">{{ t('shape.empty', { units: words.units }) }}</button>
      </form>
      <p id="shape-help" class="control-help">{{ t('shape.help', { labels: words.labels, height: project.height, maxCut: project.width - 1, units: words.units }) }}</p>
      <p v-if="project.identicalPatterns" class="control-help">{{ t('shape.linked') }}</p>
      <p id="shape-error" class="field-error" :role="error ? 'alert' : null">{{ t(error) }}</p>
      <p v-if="status" role="status">{{ t(status) }}</p>
    </details>`,
};
