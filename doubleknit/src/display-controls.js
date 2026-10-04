import { message, parseDecimal, decimalInput } from './i18n.js';
import { cellGeometry, MAX_GUIDE_SIZE } from './display.js';

export const DisplayControls = {
  props: ['display', 'refresh', 'plain', 'workflow', 'workspace'],
  emits: ['change'],
  data() { return { stitches: '', rows: '', guideSize: '', errors: {} }; },
  watch: {
    display: { immediate: true, handler() { this.refreshDrafts(); } },
    refresh() { this.refreshDrafts(); },
    locale(next, previous) {
      for (const key of ['stitches', 'rows']) {
        // Preserve unfinished/invalid drafts verbatim; reformat only committed values.
        if (this[key] === decimalInput(this.display[key], previous)) {
          this[key] = decimalInput(this.display[key], next);
        }
      }
    },
  },
  computed: { geometry() { return cellGeometry(this.display, 'A'); } },
  methods: {
    refreshDrafts() {
      for (const key of ['stitches', 'rows', 'guideSize']) this[key] = decimalInput(this.display[key], this.locale);
      this.errors = {};
    },
    apply(group) {
      const errors = {}, values = {};
      const keys = group === 'gauge' ? ['stitches', 'rows'] : ['guideSize'];
      for (const key of keys) {
        values[key] = key === 'guideSize' ? Number(this[key]) : parseDecimal(this[key], this.locale);
        if (key === 'guideSize') {
          if (!/^\d+$/.test(this[key].trim()) || !Number.isInteger(values[key])
              || values[key] < 1 || values[key] > MAX_GUIDE_SIZE) errors[key] = message('error.whole', { max: MAX_GUIDE_SIZE });
        } else if (!this[key].trim() || !Number.isFinite(values[key]) || values[key] <= 0) errors[key] = message('error.positive');
      }
      this.errors = errors;
      if (Object.keys(errors).length) {
        this.$nextTick(() => {
          const ref = this.$refs[Object.keys(errors)[0]];
          (Array.isArray(ref) ? ref[0] : ref)?.focus();
        });
        return;
      }
      this.$emit('change', { ...this.display, ...values });
    },
    toggle(key, event) { this.$emit('change', { ...this.display, [key]: event.target.checked }); },
  },
  template: `
    <section class="controls display-controls" :aria-label="t('display.title')">
      <h2>{{ t('display.title') }}</h2>
      <label class="checkbox-label"><input type="checkbox" :checked="display.proportional"
        @change="toggle('proportional', $event)"> {{ t('uiDisplay.proportions') }}</label>
      <form v-if="display.proportional" @submit.prevent="apply('gauge')" novalidate>
        <p class="control-help">{{ t('uiDisplay.gaugeHelp') }}</p>
        <div v-for="field in [{key: 'stitches', label: t('display.gaugeStitches')},
          {key: 'rows', label: t('display.gaugeRows', { units: workflowText(workflow).units })}]"
          :key="field.key" class="dimension-field">
          <label :for="'display-' + field.key">{{ field.label }}</label>
          <input :id="'display-' + field.key" :ref="field.key" v-model="$data[field.key]" type="text" inputmode="decimal"
            :aria-invalid="Boolean(errors[field.key])" :aria-describedby="errors[field.key] ? 'display-error-' + field.key : undefined">
          <p v-if="errors[field.key]" :id="'display-error-' + field.key" class="field-error" role="alert">{{ t(errors[field.key]) }}</p>
        </div>
        <button type="submit">{{ t('uiDisplay.applyGauge') }}</button>
        <p v-if="geometry.clamped" class="control-help" role="status">{{ t('display.clamped', { ratio: geometry.ratio, min: 0.5, max: 2 }) }}</p>
      </form>
      <slot></slot>
      <div v-if="!plain && workspace === 'knit'" class="dimension-field"><label for="display-notation">{{ t('display.notation') }}</label>
        <select id="display-notation" :value="display.notation" @change="$emit('change', { ...display, notation: $event.target.value })">
          <option value="plus">{{ t('display.plus') }}</option><option value="triangle">{{ t('display.triangle') }}</option>
        </select>
      </div>
      <label class="checkbox-label"><input type="checkbox" :checked="display.guides"
        @change="toggle('guides', $event)"> {{ t('display.guides') }}</label>
      <form v-if="display.guides" @submit.prevent="apply('guides')" novalidate>
        <label for="display-guideSize">{{ t('display.guideSize') }}</label>
        <input id="display-guideSize" ref="guideSize" v-model="guideSize" type="text" inputmode="numeric"
          :aria-invalid="Boolean(errors.guideSize)" :aria-describedby="errors.guideSize ? 'display-error-guideSize' : undefined">
        <p v-if="errors.guideSize" id="display-error-guideSize" class="field-error" role="alert">{{ t(errors.guideSize) }}</p>
        <button type="submit">{{ t('uiDisplay.applyGuides') }}</button>
      </form>
    </section>`,
};
