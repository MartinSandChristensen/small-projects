import { message, AppError, errorMessage, translate } from './i18n.js';
import { ref, watch, inject, onBeforeUnmount } from 'https://cdn.jsdelivr.net/npm/vue@3.5.30/dist/vue.esm-browser.prod.js';
import { MAX_FILE_BYTES, parseProjectFile, projectFilename, projectName, serializeProjectFile } from './projects.js';
import { createWorkspaceStorage, workspaceSelection } from './workspace-storage.js';

export const ProjectControls = {
  props: { project: Object, ask: Function, newEpoch: Number, hasProject: Boolean,
    saveAllowed: { type: Boolean, default: true }, opened: { type: Boolean, default: true } },
  emits: ['load', 'metadata', 'warning'],
  setup(props, { emit, expose }) {
    const language = inject('languageState');
    const defaultName = () => translate('project.untitled', language.locale);
    const store = createWorkspaceStorage(() => window.localStorage);
    const entries = ref([]), activeId = ref(null), name = ref(defaultName()), renameId = ref(null), renameDraft = ref('');
    const nameDraft = ref('');
    watch(name, value => { nameDraft.value = value; }, { immediate: true });
    const error = ref(''), status = ref(''), reading = ref(false), blocked = ref(false);
    let savedProject = '', available = false;
    function metadata(saved = false) { emit('metadata', { id: activeId.value, name: name.value, saved }); }
    function fail(cause) {
      blocked.value = true;
      error.value = message('projects.operationError', { reason: errorMessage(cause) });
      emit('warning', error.value); metadata(false);
    }
    function adopt(state, switchIdentity = true) {
      const selected = workspaceSelection(state, props.project, switchIdentity ? state.activeId : activeId.value);
      entries.value = state.entries;
      activeId.value = selected.id;
      if (selected.name) name.value = selected.name;
      savedProject = selected.signature;
      blocked.value = false; error.value = ''; emit('warning', ''); metadata(selected.saved);
    }
    function unsaved() { return props.hasProject && (!activeId.value || JSON.stringify(props.project) !== savedProject); }
    function allowMutation() {
      if (!props.saveAllowed || blocked.value) throw new AppError('error.libraryChanged');
    }
    function run(action) { try { action(); } catch (cause) { fail(cause); } }
    function reload(initial = false) {
      run(() => {
        const state = store.read(); available = true;
        entries.value = state.entries;
        if (initial) {
          const entry = state.entries.find(item => item.id === state.activeId);
          // A previous failed save or another tab can leave current work different
          // from the active entry. Preserve both by creating an independent draft.
          if (entry && props.hasProject && JSON.stringify(entry.project) === JSON.stringify(props.project)) adopt(state);
          else if (state.detachedName && props.hasProject) {
            name.value = state.detachedName; blocked.value = true; status.value = message('projectUI.deletedDraft'); metadata(false);
          }
        } else if (activeId.value) {
          const entry = state.entries.find(item => item.id === activeId.value);
          if (!entry || JSON.stringify(entry.project) !== savedProject) throw new AppError('error.libraryChanged');
          name.value = entry.name; blocked.value = false; error.value = ''; emit('warning', ''); metadata(JSON.stringify(props.project) === savedProject);
        } else if (error.value) {
          blocked.value = false; error.value = ''; emit('warning', ''); metadata(false);
        }
      });
    }
    function autosave() {
      if (!props.hasProject || !props.saveAllowed || !available || blocked.value) { metadata(false); return; }
      if (activeId.value && JSON.stringify(props.project) === savedProject) { metadata(true); return; }
      run(() => {
        adopt(activeId.value ? store.save(activeId.value, props.project) : store.create(name.value, props.project));
        status.value = message('projectUI.saved');
      });
    }
    function beginNew(title) {
      activeId.value = null; name.value = title || defaultName(); savedProject = '';
      run(() => { const state = store.read(); entries.value = state.entries; available = true; blocked.value = false; error.value = ''; emit('warning', ''); });
      metadata(false);
    }
    reload(true);
    // One watcher sees the new project and its epoch together, avoiding an old-ID write.
    watch(() => [props.newEpoch, props.project, props.hasProject, props.saveAllowed], (next, previous) => {
      if (previous && next[0] !== previous[0]) beginNew();
      autosave();
    }, { immediate: true });
    watch(() => props.opened, value => { if (value) { reload(); if (!blocked.value) autosave(); } });
    function storageChanged(event) {
      if (event.key === 'doubleknit.namedProjects' || event.key === null) {
        fail(new AppError('error.libraryChanged'));
      }
    }
    window.addEventListener('storage', storageChanged);
    onBeforeUnmount(() => window.removeEventListener('storage', storageChanged));
    function open(entry) {
      const action = () => run(() => {
        // Read again before opening: never load an obsolete browser thumbnail.
        const state = store.read();
        const current = state.entries.find(item => item.id === entry.id);
        if (!current) throw new AppError('error.snapshotMissing');
        if (!props.saveAllowed) { beginNew(current.name); emit('load', current.project); return; }
        adopt(store.open(current.id)); emit('load', current.project);
      });
      if (unsaved()) props.ask(message('projects.loadTitle'), message('projectUI.unsavedOpen'), action);
      else action();
    }
    function copy() {
      run(() => {
        if (!props.saveAllowed) return;
        store.read(); available = true;
        adopt(store.create(name.value, props.project)); status.value = message('projectUI.saved');
      });
    }
    function startRename(entry) { renameId.value = entry.id; renameDraft.value = entry.name; }
    function rename() {
      run(() => { allowMutation(); adopt(store.rename(renameId.value, projectName(renameDraft.value)), false); renameId.value = null; });
    }
    function remove(entry) {
      props.ask(message('projects.deleteTitle'), message('projectUI.deleteConfirm', { name: entry.name }), () => run(() => {
        allowMutation();
        const wasActive = entry.id === activeId.value;
        const state = store.remove(entry.id);
        adopt(state, false);
        // Keep current work as an unsaved draft; deletion must not instantly recreate it.
        if (wasActive) { beginNew(entry.name); blocked.value = true; status.value = message('projectUI.deletedDraft'); }
      }));
    }
    async function importFile(event) {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      reading.value = true;
      try {
        if (file.size > MAX_FILE_BYTES) throw new AppError('error.fileSize');
        const candidate = parseProjectFile(await file.text(), defaultName());
        const action = () => { beginNew(candidate.name); emit('load', candidate.project); };
        if (unsaved()) props.ask(message('projects.importTitle'), message('projectUI.unsavedOpen'), action);
        else action();
      } catch (cause) { error.value = message('projects.importError', { reason: errorMessage(cause) }); }
      finally { reading.value = false; }
    }
    function exportFile() {
      try {
        const blob = new Blob([serializeProjectFile(props.project, name.value)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        try { link.href = url; link.download = projectFilename(name.value); document.body.append(link); link.click(); }
        finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
      } catch (cause) { error.value = message('projects.operationError', { reason: errorMessage(cause) }); }
    }
    function thumbnail(project) {
      // Bound the preview to 32 × 32 samples even for very large charts.
      const cells = [], stepX = Math.max(1, Math.ceil(project.width / 32)), stepY = Math.max(1, Math.ceil(project.height / 32));
      for (let y = 0; y < project.height; y += stepY) for (let x = 0; x < project.width; x += stepX) {
        if (project.a[y]?.[x] && project.maskA[y] && x >= project.maskA[y][0] && x < project.maskA[y][1]) cells.push(`M${x} ${y}h${stepX}v${stepY}h-${stepX}z`);
      }
      return cells.join('');
    }
    function edited(entry) { return entry.editedAt ? new Date(entry.editedAt).toLocaleDateString(language.locale) : ''; }
    function setName(value) {
      let title;
      try { title = projectName(value); }
      catch (cause) { error.value = errorMessage(cause); emit('warning', error.value); return false; }
      try {
        allowMutation();
        if (activeId.value) adopt(store.rename(activeId.value, title), false);
        else { name.value = title; metadata(false); }
        nameDraft.value = name.value;
        return true;
      } catch (cause) { fail(cause); return false; }
    }
    expose({ beginNew, exportFile, setName });
    return { entries, activeId, name, nameDraft, setName, renameId, renameDraft, error, status, reading, blocked,
      reload: () => { reload(); if (!blocked.value) autosave(); }, open, copy, startRename, rename, remove, importFile, exportFile, thumbnail, edited };
  },
  template: `
    <section class="project-controls" aria-labelledby="projects-title">
      <h2 id="projects-title">{{ t('projectUI.title') }}</h2>
      <p class="help-text">{{ t('projectUI.browserOnly') }}</p>
      <form v-if="hasProject" class="project-name-form" @submit.prevent="setName(nameDraft)">
        <label for="project-name">{{ t('projects.name') }}</label>
        <input id="project-name" v-model="nameDraft" maxlength="80" required :disabled="!saveAllowed || blocked">
        <button type="submit" :disabled="!saveAllowed || blocked">{{ t('projects.rename') }}</button>
      </form>
      <div class="project-actions" v-if="hasProject">
        <button type="button" @click="copy" :disabled="!saveAllowed">{{ t('projectUI.copy') }}</button>
        <button type="button" @click="exportFile">{{ t('projectUI.download') }}</button>
      </div>
      <label for="import-project">{{ t('projectUI.import') }}</label>
      <input id="import-project" type="file" :disabled="reading" accept=".json,application/json" @change="importFile">
      <h3 v-if="entries.length">{{ t('projectUI.yourPatterns') }}</h3>
      <ul class="project-browser" v-if="entries.length">
        <li v-for="entry in entries" :key="entry.id" class="project-card" :class="{ active: entry.id === activeId }">
          <button type="button" class="project-open" @click="open(entry)" :aria-current="entry.id === activeId ? 'true' : undefined">
            <svg class="project-thumbnail" width="64" height="64" :viewBox="'0 0 ' + entry.project.width + ' ' + entry.project.height" aria-hidden="true"><rect width="100%" height="100%" fill="white"/><path :d="thumbnail(entry.project)" fill="#243d32"/></svg>
            <span><strong>{{ entry.name }}</strong><small>{{ t('ui.stitchSize', { width: entry.project.width, height: entry.project.height }) }}<template v-if="edited(entry)"> · {{ edited(entry) }}</template></small></span>
          </button>
          <form v-if="renameId === entry.id" @submit.prevent="rename">
            <label :for="'rename-' + entry.id">{{ t('projects.name') }}</label>
            <input :id="'rename-' + entry.id" v-model="renameDraft" maxlength="80" required>
            <button type="submit">{{ t('projects.rename') }}</button><button type="button" @click="renameId = null">{{ t('projectUI.cancel') }}</button>
          </form>
          <div class="project-entry-actions" v-else>
            <button type="button" @click="startRename(entry)" :disabled="!saveAllowed || blocked">{{ t('projects.rename') }}</button>
            <button type="button" @click="remove(entry)" :disabled="!saveAllowed || blocked">{{ t('projects.delete') }}</button>
          </div>
        </li>
      </ul>
      <p v-else class="help-text">{{ t('projectUI.empty') }}</p>
      <p v-if="error" class="field-error" role="alert">{{ t(error) }}</p>
      <button v-if="blocked" type="button" @click="reload">{{ t('projects.reload') }}</button>
      <p role="status">{{ reading ? t('projects.reading') : t(status) }}</p>
    </section>`,
};
