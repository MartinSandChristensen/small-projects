export const RelationshipChoices = {
  props: { modelValue: String, disabled: Boolean, allowLinked: { type: Boolean, default: true }, name: { default: 'relationship' } },
  emits: ['update:modelValue'],
  data: () => ({ choices: ['plain', 'linked', 'independent'], motif: ['1110', '1000', '1100', '1000', '1000'] }),
  methods: {
    squares(kind, reverse) {
      return this.motif.flatMap((row, y) => [...row].map((value, x) => {
        const bit = reverse ? kind === 'independent' ? (x === y % 4 ? '0' : '1')
          : kind === 'plain' ? this.motif[y][3 - x] : value : value;
        return { x, y, dark: reverse ? bit === '0' : bit === '1' };
      }));
    },
  },
  template: `
    <fieldset class="relationship-choices">
      <legend>{{ t('ui.relationship') }}</legend>
      <label v-for="kind in choices" :key="kind" class="relationship-choice" :class="{ chosen: modelValue === kind }">
        <input type="radio" :name="name" :value="kind" :checked="modelValue === kind"
          :disabled="disabled || (kind === 'linked' && !allowLinked)" @change="$emit('update:modelValue', kind)">
        <span class="relationship-copy"><strong>{{ t('ui.relationship.' + kind) }}</strong>
          <span>{{ t('ui.relationship.' + kind + '.help') }}</span>
          <span v-if="kind === 'linked' && !allowLinked">{{ t('link.asymmetric') }}</span>
        </span>
        <span class="relationship-previews" aria-hidden="true">
          <svg v-for="reverse in [false, true]" :key="String(reverse)" viewBox="0 0 4 5" width="32" height="40">
            <rect v-for="(cell, i) in squares(kind, reverse)" :key="i" :x="cell.x" :y="cell.y" width="1" height="1" :fill="cell.dark ? '#23382f' : '#fff'" stroke="#9eafa5" stroke-width=".04"/>
          </svg>
        </span>
      </label>
    </fieldset>`,
};
