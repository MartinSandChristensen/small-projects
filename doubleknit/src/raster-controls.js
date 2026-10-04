import { toRaw } from 'https://cdn.jsdelivr.net/npm/vue@3.5.30/dist/vue.esm-browser.prod.js';
import { errorMessage } from './i18n.js';
import { editableFaces, faceSpan } from './model.js';
import { isBlankPattern, rasterProject } from './raster.js';
import { decodeRaster } from './raster-decode.js';
import { RelationshipChoices } from './relationship-choices.js';
import { workflowMessages } from './workflow.js';

export const RasterControls = {
  components: { RelationshipChoices },
  props: ['project', 'hasProject', 'hideButton'],
  emits: ['load'],
  data() {
    return { opened: false, mode: 'double-faced', linked: false, files: { a: null, b: null },
      candidate: null, feedback: '', busy: false, generation: 0, confirmed: false, opener: null, source: null };
  },
  computed: {
    independent() { return this.mode === 'double-faced' && !this.linked; },
    faces() { return this.independent ? ['a', 'b'] : ['a']; },
    warn() { return this.hasProject && !isBlankPattern(this.project); },
    words() { return workflowMessages(this.source?.workflow ?? this.project.workflow); },
  },
  methods: {
    async open() {
      this.opener = document.activeElement;
      this.source = this.project;
      this.mode = this.project.mode; this.linked = Boolean(this.project.identicalPatterns);
      this.files = { a: null, b: null }; this.invalidate(); this.opened = true;
      await this.$nextTick(); this.$refs.dialog.showModal(); this.$refs.cancel.focus();
    },
    invalidate() {
      this.generation++; this.candidate = null; this.feedback = ''; this.busy = false; this.confirmed = false;
    },
    relationship(value) {
      this.mode = value === 'plain' ? 'plain' : 'double-faced';
      this.linked = value === 'linked';
      this.settings();
    },
    settings() {
      if (this.mode === 'plain') this.linked = false;
      this.files.b = null;
      if (this.$refs.fileB?.[0]) this.$refs.fileB[0].value = '';
      this.invalidate();
    },
    pick(face, event) { this.files[face] = event.target.files?.[0] ?? null; this.invalidate(); },
    close() {
      this.invalidate(); this.$refs.dialog.close(); this.opened = false; this.opener?.focus();
    },
    async preview() {
      this.invalidate(); const generation = this.generation;
      const faces = [...this.faces], mode = this.mode, linked = this.linked, source = this.source;
      this.busy = true;
      try {
        const images = Object.fromEntries(await Promise.all(faces.map(async face =>
          [face, await decodeRaster(this.files[face], face)])));
        const candidate = rasterProject(images, source, mode, linked);
        if (generation !== this.generation || !this.opened) return;
        this.candidate = candidate;
        await this.$nextTick();
        if (generation !== this.generation || !this.opened) return;
        for (const face of editableFaces(candidate)) this.draw(face, candidate);
      } catch (cause) {
        if (generation === this.generation) { this.candidate = null; this.feedback = errorMessage(cause); }
      } finally { if (generation === this.generation) this.busy = false; }
    },
    draw(face, project) {
      const canvas = this.$refs['preview' + face][0];
      const scale = Math.max(1, Math.min(16, Math.floor(400 / Math.max(project.width, project.height))));
      canvas.width = project.width * scale; canvas.height = project.height * scale;
      const context = canvas.getContext('2d');
      for (let y = 0; y < project.height; y++) for (let x = 0; x < project.width; x++) {
        const span = faceSpan(project, face, y), present = span && x >= span[0] && x < span[1];
        context.fillStyle = present ? (project[face][y][x] ? '#000' : '#fff') : ((x + y) % 2 ? '#a9c9bc' : '#d7e7e0');
        context.fillRect(x * scale, y * scale, scale, scale);
      }
    },
    accept() {
      if (!this.candidate || this.busy || (this.warn && !this.confirmed)) return;
      // An asynchronous import never overwrites a different project than the one
      // previewed. The native modal normally prevents such intervening operations.
      if (toRaw(this.source) !== toRaw(this.project)) { this.feedback = { key: 'raster.changed' }; return; }
      const candidate = this.candidate;
      this.close(); this.$emit('load', candidate);
    },
  },
  template: `
    <div class="raster-controls">
      <button v-if="!hideButton" type="button" @click="open">{{ t('raster.open') }}</button>
      <dialog v-if="opened" ref="dialog" class="raster-dialog" aria-labelledby="raster-title" @cancel.prevent="close">
        <h2 id="raster-title">{{ t('raster.open') }}</h2>
        <p>{{ t('uiDisplay.importHelp') }}</p>
        <details><summary>{{ t('uiDisplay.imageRequirements') }}</summary><p>{{ t('raster.help') }}</p></details>
        <p v-if="warn">{{ t('raster.warning') }}</p>
        <form @submit.prevent="preview">
          <relationship-choices name="raster-relationship" :model-value="mode === 'plain' ? 'plain' : linked ? 'linked' : 'independent'"
            @update:model-value="relationship" />
          <p>{{ t(independent ? 'raster.twoImages' : 'raster.oneImage') }}</p>
          <div v-for="face in faces" :key="face" class="raster-file">
            <label :for="'raster-' + face">{{ t('raster.image', { face: face.toUpperCase() }) }}</label>
            <input :id="'raster-' + face" :ref="face === 'b' ? 'fileB' : 'fileA'" type="file"
              accept=".png,.gif,image/png,image/gif" @change="pick(face, $event)">
          </div>
          <button type="submit" :disabled="busy || faces.some(face => !files[face])">{{ t('raster.preview') }}</button>
        </form>
        <p v-if="feedback" class="field-error" role="alert">{{ t(feedback) }}</p>
        <p v-if="busy" role="status">{{ t('raster.reading') }}</p>
        <section v-if="candidate" aria-labelledby="raster-preview-title">
          <h3 id="raster-preview-title">{{ t('raster.preview') }}</h3>
          <p role="status">{{ t('raster.summary', { width: candidate.width, height: candidate.height, units: words.units }) }}</p>
          <p>{{ t('raster.previewHelp') }}</p>
          <div class="raster-previews">
            <figure v-for="face in faces" :key="face">
              <figcaption>{{ t('raster.image', { face: face.toUpperCase() }) }} — {{ files[face].name }}</figcaption>
              <canvas :ref="'preview' + face" role="img" :aria-label="t('raster.previewLabel', { face: face.toUpperCase() })"></canvas>
            </figure>
          </div>
          <label v-if="warn" class="checkbox-label"><input id="raster-confirm" type="checkbox" v-model="confirmed">
            {{ t('raster.confirm') }}</label>
        </section>
        <div class="dialog-actions">
          <button ref="cancel" type="button" @click="close">{{ t('dialog.cancel') }}</button>
          <button type="button" class="primary" @click="accept" :disabled="!candidate || busy || (warn && !confirmed)">{{ t('raster.accept') }}</button>
        </div>
      </dialog>
    </div>`,
};
