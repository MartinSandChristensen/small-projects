import { message, AppError, errorMessage, translate, formatNumber, parseDecimal, createLanguagePreference } from './i18n.js';
import { workflowText, workflowMessages } from './workflow.js';
import { createApp, computed, nextTick, reactive, shallowRef, ref, onMounted, onUnmounted } from 'https://cdn.jsdelivr.net/npm/vue@3.5.30/dist/vue.esm-browser.prod.js';
import { watch } from 'https://cdn.jsdelivr.net/npm/vue@3.5.30/dist/vue.esm-browser.prod.js';
import { createProject, derivePairs, initialFocus, parseDimension, reverseColour, relationship, setRelationship,
  setWorkflow, isPresent, isSymmetricMask, isDesignClear, clearDesign, resizeFocus, resizeProject,
  resizeRemovesPattern, toggleArea, toggleCell, validateProject } from './model.js';
import { createHistory } from './history.js';
import { createPersistence } from './storage.js';
import { ShapeControls } from './shape-controls.js';
import { PatternChart } from './chart.js';
import { DisplayControls } from './display-controls.js';
import { CompactLegend } from './notation.js';
import { validateDisplay, cellGeometry } from './display.js';
import { ProjectControls } from './project-controls.js';
import { PdfControls } from './pdf-controls.js';
import { RasterControls } from './raster-controls.js';
import { RelationshipChoices } from './relationship-choices.js';

const languageState = reactive(createLanguagePreference(() => window.localStorage, window.navigator));
watch(() => languageState.locale, (locale, previous) => {
  const scroll = [window.scrollX, window.scrollY];
  const viewports = [...document.querySelectorAll('.chart-viewport')]
    .map(element => [element, element.scrollLeft, element.scrollTop]);
  const active = document.activeElement;
  const caret = active?.matches('input[type="text"], textarea')
    ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;
  document.documentElement.lang = locale;
  document.title = translate('page.title', locale);
  if (previous) nextTick(() => {
    // Translation can change paragraph heights; retain scrolling and text selection too.
    for (const [element, left, top] of viewports) element.scrollTo(left, top);
    if (caret && document.activeElement === active) active.setSelectionRange(...caret);
    window.scrollTo(...scroll);
  });
}, { immediate: true });

const app = createApp({
  components: { ShapeControls, CompactLegend, PatternChart, ProjectControls, DisplayControls, PdfControls, RasterControls, RelationshipChoices },
  setup() {
    const persistence = createPersistence(() => window.localStorage);
    const project = shallowRef(persistence.load());
    const needsCreation = ref(persistence.missing), newEpoch = ref(0);
    const projectControls = ref(null), rasterControls = ref(null);
    const metadata = ref({ name: translate('project.untitled', languageState.locale), saved: false });
    const projectWarning = ref('');
    const nameEditing = ref(false), nameDraft = ref(''), nameInput = ref(null), nameButton = ref(null);
    function editName() { nameDraft.value = metadata.value.name; nameEditing.value = true; nextTick(() => { nameInput.value?.focus(); nameInput.value?.select(); }); }
    function finishName(save) {
      if (save && !projectControls.value.setName(nameDraft.value)) return;
      nameEditing.value = false; nextTick(() => nameButton.value?.focus());
    }
    const workspace = ref('design'), faceView = ref('front'), tool = ref('draw');
    const shapeMode = ref('trim'), selectionA = ref(null), zoom = ref(1);
    const zoomSteps = [0.025, 0.05, 0.1, 0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
    function stepZoom(direction) {
      zoom.value = direction > 0 ? zoomSteps.find(value => value > zoom.value + 0.0001) ?? 2
        : [...zoomSteps].reverse().find(value => value < zoom.value - 0.0001) ?? 0.01;
    }
    function fitZoom() {
      const geometry = cellGeometry(project.value.display);
      const viewports = [...document.querySelectorAll('.chart-viewport')].filter(el => el.getClientRects().length);
      zoom.value = Math.max(0.01, Math.min(1, ...viewports.map(el => Math.min(
        Math.max(1, el.clientWidth - 106) / (project.value.width * geometry.width),
        Math.max(1, parseFloat(getComputedStyle(el).maxHeight) - 6) / (project.value.height * geometry.height)))));
    }
    const panel = ref(null), panelClose = ref(null), projectButton = ref(null);
    const smallScreen = ref(window.matchMedia('(max-width: 700px)').matches);
    const media = window.matchMedia('(max-width: 700px)');
    const onScreen = () => { smallScreen.value = media.matches; if (media.matches && faceView.value === 'compare') faceView.value = 'front'; };
    onMounted(() => media.addEventListener('change', onScreen));
    onUnmounted(() => media.removeEventListener('change', onScreen));
    let panelOpener;
    function openPanel(name) {
      if (panel.value === name) { closePanel(); return; }
      panelOpener = document.activeElement;
      panel.value = name;
      nextTick(() => panelClose.value?.focus());
    }
    function closePanel() {
      panel.value = null;
      if (panelOpener?.isConnected) panelOpener.focus();
      else projectButton.value?.focus();
    }
    function chooseWorkspace(value) { workspace.value = value; }
    function chooseFace(value) { faceView.value = value; if (tool.value === 'shape' && value !== 'front') tool.value = 'draw'; }
    function chooseTool(value) { tool.value = value; if (value === 'shape') faceView.value = 'front'; }
    const words = computed(() => workflowText(project.value.workflow, languageState.locale));
    const currentRelationship = computed(() => relationship(project.value));
    const reverseCache = new WeakMap();
    const reverseCells = computed(() => project.value.b ?? project.value.a.map(row => {
      let cache = reverseCache.get(row);
      if (!cache) { cache = {}; reverseCache.set(row, cache); }
      const kind = project.value.mode;
      return cache[kind] ??= (kind === 'plain' ? [...row].reverse() : row).map(value => 1 - value);
    }));
    const canClear = computed(() => !isDesignClear(project.value));
    const canLink = computed(() => isSymmetricMask(project.value));
    const history = createHistory(project.value);
    const canUndo = ref(false), canRedo = ref(false), selectionEpoch = ref(0);
    let previousCombinedProject = project.value;
    const combined = shallowRef(project.value.mode === 'plain' ? [] : derivePairs(project.value));
    watch(project, (next, previous, onCleanup) => {
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          combined.value = next.mode === 'plain' ? [] : derivePairs(next, previousCombinedProject, combined.value);
          previousCombinedProject = next;
        });
      });
      onCleanup(() => cancelAnimationFrame(frame));
    }, { flush: 'post' });
    const dimensions = reactive({ width: String(project.value.width), height: String(project.value.height) });
    const errors = reactive({ width: '', height: '' });
    const focus = reactive({ a: initialFocus(project.value, 'a'), b: initialFocus(project.value, 'b') });
    const warning = ref(persistence.warningMessage), storageState = ref(persistence.state);
    const announcement = ref(''), dialog = ref(null), confirmation = shallowRef(null);
    const creation = reactive({ relationship: 'plain', width: '20', height: '20', workflow: 'flat', stitches: '', rows: '', error: '' });
    let returnFocus;
    function syncStorage() { warning.value = persistence.warningMessage; storageState.value = persistence.state; }
    function syncDimensions() {
      dimensions.width = String(project.value.width); dimensions.height = String(project.value.height);
      errors.width = errors.height = '';
    }
    function commit(next, { reset = false, replace = false, record = true, clearHistory = false } = {}) {
      if (next === project.value) return;
      const previous = project.value;
      const activeFace = document.activeElement?.closest('[role="grid"]')?.getAttribute('aria-labelledby');
      for (const face of ['a', 'b']) focus[face] = reset ? initialFocus(next, face) : resizeFocus(focus[face], face, previous, next);
      if (clearHistory) history.clear(next); else if (record) history.push(next);
      canUndo.value = history.canUndo; canRedo.value = history.canRedo;
      if (clearHistory || reset || !record || next.maskA !== previous.maskA || next.width !== previous.width
          || next.height !== previous.height || relationship(next) !== relationship(previous)) selectionEpoch.value++;
      project.value = next;
      if (replace) persistence.replace(next); else persistence.save(next);
      syncStorage();
      if (activeFace) nextTick(() => {
        const point = focus[activeFace === 'title-A' ? 'a' : 'b'];
        const cell = document.querySelector(`[role="grid"][aria-labelledby="${activeFace}"] [data-x="${point.x}"][data-y="${point.y}"]`);
        if (cell?.getClientRects().length) { cell.focus({ preventScroll: true }); cell.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      });
    }
    function loadProject(next) {
      needsCreation.value = false;
      commit(validateProject(next), { reset: true, clearHistory: true }); syncDimensions();
      workspace.value = 'design'; faceView.value = 'front'; tool.value = 'draw'; panel.value = null;
    }
    function loadRaster(next) { newEpoch.value++; loadProject(next); }
    function changeWorkflow(event) { commit(setWorkflow(project.value, event.target.value)); }
    function changeDisplay(display) {
      const clean = validateDisplay(display);
      if (Object.keys(clean).some(key => clean[key] !== project.value.display[key])) commit({ ...project.value, display: clean });
    }
    function travel(direction) {
      const next = history[direction]();
      if (!next) return;
      commit(next, { record: false }); syncDimensions();
      announcement.value = message(direction === 'undo' ? 'history.undone' : 'history.redone');
    }
    function historyKey(event) {
      if (confirmation.value || event.target.closest('dialog')) return;
      if (event.key === 'Escape' && panel.value) { event.preventDefault(); closePanel(); return; }
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault(); if (!event.repeat) travel(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    }
    function area(face, bounds) {
      let count = 0;
      for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) if (isPresent(project.value, face, y, x)) count++;
      commit(toggleArea(project.value, face, bounds));
      announcement.value = message('area.toggled', { count, face: face.toUpperCase() });
    }
    function toggle(face, point) { commit(toggleCell(project.value, face, point.y, point.x)); }
    function ask(title, text, action) {
      if (confirmation.value) throw new AppError('dialog.busy');
      returnFocus = document.activeElement; confirmation.value = { title, message: text, action };
      nextTick(() => dialog.value.showModal());
    }
    function closeDialog(accept = false) {
      if (accept && confirmation.value?.creation && (!parseDimension(creation.width) || !parseDimension(creation.height))) {
        creation.error = message('error.whole', { max: 200 });
        document.getElementById(!parseDimension(creation.width) ? 'new-width' : 'new-height')?.focus(); return;
      }
      if (accept && confirmation.value?.creation && (creation.stitches.trim() || creation.rows.trim())) {
        try { validateDisplay({ ...project.value.display, stitches: parseDecimal(creation.stitches, languageState.locale), rows: parseDecimal(creation.rows, languageState.locale) }); }
        catch (error) { creation.error = errorMessage(error); document.getElementById('new-stitches')?.focus(); return; }
      }
      const action = confirmation.value?.action;
      dialog.value.close(); confirmation.value = null;
      if (accept) action();
      nextTick(() => {
        if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus();
        else projectButton.value?.focus();
      });
    }
    const resizePreview = computed(() => {
      const w = parseDimension(dimensions.width), h = parseDimension(dimensions.height);
      if (!w || !h) return null;
      try { return resizeProject(project.value, w, h); } catch { return null; }
    });
    function applyDimensions() {
      const width = parseDimension(dimensions.width), height = parseDimension(dimensions.height);
      errors.width = width === null ? message('error.whole', { max: 200 }) : '';
      errors.height = height === null ? message('error.whole', { max: 200 }) : '';
      if (width === null || height === null) { document.getElementById(width === null ? 'width' : 'height').focus(); return; }
      let next;
      try { next = resizeProject(project.value, width, height); }
      catch (error) { errors.width = errorMessage(error); document.getElementById('width').focus(); return; }
      const apply = () => { commit(next); syncDimensions(); announcement.value = message('resize.done', { width, height, units: workflowMessages(project.value.workflow).units }); };
      if (resizeRemovesPattern(project.value, width, height)) ask(message('resize.title'), message('resize.confirm'), apply);
      else apply();
    }
    function newProject() {
      Object.assign(creation, { relationship: 'plain', width: '20', height: '20', workflow: 'flat', stitches: '', rows: '', error: '' });
      ask(message('ui.new'), message(needsCreation.value ? 'ui.startHelp' : !metadata.value.saved ? 'ui.newUnsaved' : 'ui.newReplace'), () => {
        const next = createProject(parseDimension(creation.width), parseDimension(creation.height), creation.relationship === 'plain' ? 'plain' : 'double-faced', creation.relationship === 'linked');
        if (creation.stitches.trim() || creation.rows.trim()) next.display = validateDisplay({ ...next.display,
          stitches: parseDecimal(creation.stitches, languageState.locale), rows: parseDecimal(creation.rows, languageState.locale), proportional: true });
        newEpoch.value++;
        loadProject(setWorkflow(next, creation.workflow)); announcement.value = message('new.created');
      });
      confirmation.value = { ...confirmation.value, creation: true };
    }
    function changeRelationship(kind) {
      if (kind === currentRelationship.value) return;
      ask(message('ui.relationshipTitle'), message('ui.relationshipConfirm'), () => {
        commit(setRelationship(project.value, kind)); faceView.value = 'front';
      });
      confirmation.value = { ...confirmation.value, relationship: kind };
    }
    function clear() {
      if (!canClear.value) return;
      ask(message('ui.clearTitle'), message('ui.clearConfirm'), () => {
        commit(clearDesign(project.value)); announcement.value = message('ui.cleared');
      });
    }
    function retrySaving() { persistence.retry(project.value); syncStorage(); }
    function replaceSaved() { ask(message('replace.title'), message('replace.confirm'), () => { persistence.replace(project.value); syncStorage(); }); }
    function changeShape(next) { commit(next); announcement.value = message('shape.updated'); }
    return { nameEditing, nameDraft, nameInput, nameButton, editName, finishName, languageState, project, projectControls, rasterControls, metadata, projectWarning, workspace, faceView, tool,
      shapeMode, selectionA, zoom, stepZoom, fitZoom, panel, panelClose, projectButton, smallScreen, openPanel, closePanel, chooseWorkspace, chooseFace,
      chooseTool, words, currentRelationship, reverseCells, canClear, canLink, needsCreation, newEpoch, canUndo, canRedo,
      selectionEpoch, combined, dimensions, errors, resizePreview, focus, warning, storageState, announcement, dialog,
      confirmation, creation, ask, closeDialog, loadProject, loadRaster, changeWorkflow, changeDisplay, travel, historyKey,
      area, toggle, applyDimensions, newProject, changeRelationship, clear, retrySaving, replaceSaved, changeShape };
  },
  template: `
    <div class="app-shell" @keydown="historyKey">
      <header class="app-header">
        <span class="brand">DOUBLEKNIT</span>
        <h1 v-if="needsCreation">Doubleknit</h1>
        <form v-else-if="nameEditing" class="header-name-form" @submit.prevent="finishName(true)" @keydown.esc.stop.prevent="finishName(false)">
          <label class="sr-only" for="header-project-name">{{ t('projects.name') }}</label>
          <input ref="nameInput" id="header-project-name" v-model="nameDraft" maxlength="80" required>
          <button type="submit">{{ t('projects.rename') }}</button><button type="button" @click="finishName(false)">{{ t('ui.cancel') }}</button>
        </form>
        <h1 v-else><button ref="nameButton" type="button" class="project-title" :aria-label="t('ui.renameTitle', { name: metadata.name })" @click="editName">{{ metadata.name }}</button></h1>
        <span v-if="!needsCreation" class="save-status" role="status">{{ t(warning || projectWarning ? 'ui.draft' : metadata.saved ? 'ui.saved' : 'ui.draft') }}</span>
        <pdf-controls v-if="!needsCreation" :project="project" :name="metadata.name"></pdf-controls>
        <label class="sr-only" for="language">{{ t('language.label') }}</label>
        <select id="language" :value="locale" @change="languageState.choose($event.target.value)"><option value="en-GB">English</option><option value="da">Dansk</option></select>
      </header>
      <nav class="panel-menu" :aria-label="t('ui.menus')">
        <button ref="projectButton" type="button" @click="openPanel('project')" :aria-expanded="panel === 'project'" aria-controls="workspace-panel">{{ t('ui.project') }} <span aria-hidden="true">▾</span></button>
        <button :disabled="needsCreation" type="button" @click="openPanel('pattern')" :aria-expanded="panel === 'pattern'" aria-controls="workspace-panel">{{ t('ui.patternMenu') }} <span aria-hidden="true">▾</span></button>
        <button type="button" @click="openPanel('help')" :aria-expanded="panel === 'help'" aria-controls="workspace-panel">{{ t('ui.help') }} <span aria-hidden="true">▾</span></button>
      </nav>
      <main>
        <p v-if="languageState.warning" role="status">{{ t(languageState.warning) }}</p>
        <section v-if="needsCreation" class="welcome">
          <p class="eyebrow">DOUBLEKNIT</p><h2>{{ t('ui.welcome') }}</h2><p>{{ t('ui.welcomeHelp') }}</p>
          <div class="welcome-actions"><button class="primary" type="button" @click="newProject">{{ t('ui.new') }}</button>
            <button type="button" @click="openPanel('project')">{{ t('ui.open') }}</button>
            <button type="button" @click="rasterControls.open()">{{ t('ui.image') }}</button></div>
        </section>
        <template v-else>
          <nav class="workspace-nav" :aria-label="t('ui.view')">
            <div class="button-group"><button type="button" :aria-pressed="workspace === 'design'" @click="chooseWorkspace('design')">{{ t('ui.design') }}</button>
              <button type="button" :aria-pressed="workspace === 'knit'" @click="chooseWorkspace('knit')">{{ t('ui.knit') }}</button></div>
            <div v-show="workspace === 'design'" class="button-group face-tabs">
              <button type="button" :aria-pressed="faceView === 'front'" @click="chooseFace('front')">{{ t('ui.front') }}</button>
              <button type="button" :aria-pressed="faceView === 'reverse'" @click="chooseFace('reverse')">{{ t('ui.reverse') }}</button>
              <button v-if="!smallScreen" type="button" :aria-pressed="faceView === 'compare'" @click="chooseFace('compare')">{{ t('ui.compare') }}</button></div>

          </nav>
          <div v-show="workspace === 'design'" class="editor-toolbar">
            <div class="button-group"><button v-for="name in ['draw', 'select', 'shape']" :key="name" type="button" :aria-pressed="tool === name" @click="chooseTool(name)">{{ t('ui.' + name) }}</button></div>
            <div class="button-group"><button type="button" :disabled="!canUndo" @click="travel('undo')">{{ t('history.undo') }}</button>
              <button type="button" :disabled="!canRedo" @click="travel('redo')">{{ t('history.redo') }}</button></div>
            <div v-if="tool === 'shape'" class="shape-toolbar">
              <div class="button-group"><button type="button" :aria-pressed="shapeMode === 'trim'" @click="shapeMode = 'trim'">{{ t('ui.trim') }}</button>
                <button type="button" :aria-pressed="shapeMode === 'restore'" @click="shapeMode = 'restore'">{{ t('ui.restore') }}</button></div>
            </div>
          </div>
          <p id="editing-help" class="editing-help">{{ t(workspace === 'knit' ? 'ui.knitHelp' : 'ui.' + tool + 'Help') }}</p>
        </template>
        <div v-if="warning" class="storage-warning">
          <p role="alert">{{ t(warning) }}</p>
          <button v-if="storageState !== 'protected'" type="button" @click="retrySaving">{{ t('storage.retry') }}</button>
          <button v-else type="button" @click="replaceSaved">{{ t('storage.replace') }}</button>
        </div>
        <div v-if="projectWarning" class="storage-warning"><p role="alert">{{ t(projectWarning) }}</p>
          <button type="button" @click="openPanel('project')">{{ t('ui.project') }}</button></div>
        <div class="workspace-body" :class="{ 'panel-open': panel }">
          <div v-if="!needsCreation" class="chart-workspace">
            <details v-show="workspace === 'knit'" class="reading-help" open>
              <summary>{{ t('ui.readChart') }}</summary>
              <div id="combined-help"><compact-legend :project="project"></compact-legend></div>
            </details>
            <p v-if="workspace === 'design' && faceView !== 'front' && currentRelationship !== 'independent'" class="editing-help">{{ t('ui.follows') }}</p>
            <div class="chart-zoom" role="group" :aria-label="t('ui.zoom')">
              <button type="button" @click="stepZoom(-1)" :disabled="zoom <= 0.01" :aria-label="t('ui.zoomOut')">−</button>
              <button type="button" @click="zoom = 1" :aria-label="t('ui.zoomReset')">{{ n(Math.round(zoom * 100)) }}%</button>
              <button type="button" @click="stepZoom(1)" :disabled="zoom >= 2" :aria-label="t('ui.zoomIn')">+</button>
              <button type="button" @click="fitZoom">{{ t('ui.zoomFit') }}</button>
            </div>
            <div class="charts" :class="{ comparison: workspace === 'design' && faceView === 'compare' }">
              <pattern-chart :zoom="zoom" v-show="workspace === 'design' ? faceView !== 'reverse' : project.mode === 'plain'"
                :title="t(workspace === 'knit' ? 'ui.knittingChart' : 'ui.frontDesign')" :source="true" :project="project"
                :workflow="project.workflow" :working="workspace === 'knit'" :selection-epoch="selectionEpoch"
                :display="project.display" face="A" :spans="project.maskA" :cells="project.a" :focused="focus.a"
                :editable="workspace === 'design'" :tool="tool" :shape-mode="shapeMode"
                @selection="selectionA = $event" @change="changeShape" @area="area('a', $event)" @move="focus.a = $event" @toggle="toggle('a', $event)"></pattern-chart>
              <pattern-chart :zoom="zoom" v-show="workspace === 'design' && faceView !== 'front'" :title="t('ui.reverseDesign')"
                :source="true" :project="project" :workflow="project.workflow" :selection-epoch="selectionEpoch"
                :display="project.display" face="B" :spans="project.maskA" :cells="reverseCells" :focused="focus.b"
                :editable="workspace === 'design' && currentRelationship === 'independent'" :tool="tool === 'shape' ? 'draw' : tool"
                @area="area('b', $event)" @move="focus.b = $event" @toggle="toggle('b', $event)"></pattern-chart>
              <pattern-chart :zoom="zoom" v-if="project.mode === 'double-faced' && combined.length" v-show="workspace === 'knit'"
                :title="t('ui.knittingChart')" :source="false" :project="project" :workflow="project.workflow" :display="project.display" face="C" :cells="combined" :editable="false"></pattern-chart>
            </div>
            <shape-controls v-show="workspace === 'design' && tool === 'shape'" :project="project" :refresh="selectionEpoch" :selection="selectionA" @change="changeShape"></shape-controls>
            <div class="workspace-footer"><button class="text-button" type="button" @click="openPanel('pattern')">{{ n(project.width) }} × {{ n(project.height) }} · {{ words.name }}</button></div>
          </div>
          <aside id="workspace-panel" v-show="panel" class="workspace-panel" :aria-label="panel ? t('ui.' + panel) : null">
            <button ref="panelClose" type="button" class="panel-close" @click="closePanel" :aria-label="t('ui.close')">×</button>
            <section v-show="panel === 'project'">
              <h2>{{ t('ui.project') }}</h2>
              <div class="project-actions"><button type="button" @click="newProject">{{ t('ui.new') }}</button>
                <button type="button" @click="rasterControls.open()">{{ t('ui.image') }}</button></div>
              <project-controls ref="projectControls" :project="project" :has-project="!needsCreation" :ask="ask" :new-epoch="newEpoch"
                :opened="panel === 'project'" :save-allowed="storageState === 'ready'"
                @load="loadProject" @metadata="metadata = $event" @warning="projectWarning = $event"></project-controls>
            </section>
            <section v-show="panel === 'pattern' && !needsCreation" class="pattern-settings">
              <h2>{{ t('ui.pattern') }}</h2>
              <display-controls :workflow="project.workflow" :workspace="workspace" :plain="project.mode === 'plain'" :refresh="selectionEpoch" :display="project.display" @change="changeDisplay">
                <div class="pattern-basics">
                  <label for="workflow">{{ t('workflow.title') }}</label><select id="workflow" :value="project.workflow" @change="changeWorkflow"><option value="flat">{{ t('workflow.flat') }}</option><option value="in-the-round">{{ t('workflow.round') }}</option></select>
                  <h3 id="chart-size-title">{{ t('ui.chartSize') }}</h3>
                  <form @submit.prevent="applyDimensions" aria-labelledby="chart-size-title" novalidate>
                    <div class="dimension-field"><label for="width">{{ t('controls.width') }} <span>{{ t('controls.widthUnit') }}</span></label>
                      <input id="width" v-model="dimensions.width" inputmode="numeric" :aria-invalid="Boolean(errors.width)" aria-describedby="width-error">
                      <p id="width-error" class="field-error" role="alert">{{ t(errors.width) }}</p></div>
                    <div class="dimension-field"><label for="height">{{ t('controls.height') }} <span>({{ words.units }})</span></label>
                      <input id="height" v-model="dimensions.height" inputmode="numeric" :aria-invalid="Boolean(errors.height)" aria-describedby="height-error">
                      <p id="height-error" class="field-error" role="alert">{{ t(errors.height) }}</p></div>
                    <template v-if="resizePreview && resizePreview !== project">
                      <div class="resize-preview"><figure v-for="(candidate, i) in [project, resizePreview]" :key="i">
                        <svg :viewBox="'0 0 ' + Math.max(project.width, resizePreview.width) + ' ' + Math.max(project.height, resizePreview.height)" role="img" :aria-label="t(i ? 'ui.resized' : 'ui.original')">
                          <rect v-for="(span, y) in candidate.maskA" :key="y" :x="(span?.[0] || 0) + Math.max(project.width, resizePreview.width) - candidate.width" :y="y + Math.max(project.height, resizePreview.height) - candidate.height" :width="span ? span[1] - span[0] : 0" height="1" fill="currentColor"/>
                        </svg><figcaption>{{ t(i ? 'ui.resized' : 'ui.original') }}</figcaption></figure></div>
                      <p class="control-help">{{ t('ui.resizePreview', { width: resizePreview.width, height: resizePreview.height, units: words.units }) }}</p>
                    </template>
                    <button id="apply-dimensions" type="submit">{{ t('controls.apply') }}</button>
                  </form>
                </div>
              </display-controls>
              <details><summary>{{ t('ui.relationship') }} · {{ t('ui.relationship.' + currentRelationship) }}</summary>
                <relationship-choices :model-value="currentRelationship" :allow-linked="canLink" name="settings-relationship" @update:model-value="changeRelationship"></relationship-choices></details>
              <details><summary>{{ t('ui.clear') }}</summary><p>{{ t('ui.clearConfirm') }}</p><button type="button" :disabled="!canClear" @click="clear">{{ t('ui.clear') }}</button></details>
            </section>

            <section v-show="panel === 'help'"><h2>{{ t('ui.help') }}</h2>
              <details open><summary>{{ t('ui.editHelp') }}</summary><p>{{ t('ui.drawHelp') }} {{ t('ui.selectHelp') }}</p><p>{{ t('ui.shortcuts') }}</p></details>
              <details><summary>{{ t('ui.shape') }}</summary><p>{{ t('ui.shapeHelp') }} {{ t('ui.exactHelp') }}</p></details>
              <details><summary>{{ t('ui.aboutStorage') }}</summary><p>{{ t('ui.storageHelp') }}</p></details>
              <details><summary>{{ t('ui.readChart') }}</summary><p>{{ words.reading }} {{ t('workflow.provisional') }}</p></details>
            </section>
          </aside>
        </div>
        <p class="sr-only" role="status">{{ t(announcement) }}</p>
      </main>
      <raster-controls ref="rasterControls" :hide-button="true" :project="project" :has-project="!needsCreation" @load="loadRaster"></raster-controls>
      <dialog ref="dialog" class="confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" @cancel.prevent="closeDialog(false)">
        <template v-if="confirmation"><h2 id="confirmation-title">{{ t(confirmation.title) }}</h2><p id="confirmation-message">{{ t(confirmation.message) }}</p>
          <template v-if="confirmation.creation">
            <relationship-choices v-model="creation.relationship" name="new-relationship"></relationship-choices>
            <div class="creation-dimensions"><label for="new-width">{{ t('controls.width') }} <span>{{ t('controls.widthUnit') }}</span><input id="new-width" v-model="creation.width" inputmode="numeric"></label>
              <label for="new-height">{{ t('controls.height') }} <span>({{ workflowText(creation.workflow).units }})</span><input id="new-height" v-model="creation.height" inputmode="numeric"></label></div>
            <details class="creation-gauge"><summary>{{ t('ui.newGauge') }}</summary>
              <p>{{ t('ui.newGaugeHelp') }}</p>
              <div class="creation-dimensions">
                <label for="new-stitches">{{ t('display.gaugeStitches') }}<input id="new-stitches" v-model="creation.stitches" inputmode="decimal"></label>
                <label for="new-rows">{{ t('display.gaugeRows', { units: workflowText(creation.workflow).units }) }}<input id="new-rows" v-model="creation.rows" inputmode="decimal"></label>
              </div>
            </details>
            <p v-if="creation.error" class="field-error" role="alert">{{ t(creation.error) }}</p>
            <label for="new-workflow">{{ t('workflow.title') }}</label><select id="new-workflow" v-model="creation.workflow"><option value="flat">{{ t('workflow.flat') }}</option><option value="in-the-round">{{ t('workflow.round') }}</option></select>
          </template>
          <relationship-choices v-if="confirmation.relationship" :model-value="confirmation.relationship" :disabled="true" name="confirm-relationship"></relationship-choices>
          <div class="dialog-actions"><button type="button" autofocus @click="closeDialog(false)">{{ t('dialog.cancel') }}</button>
            <button type="button" class="primary" @click="closeDialog(true)">{{ t(confirmation.creation ? 'ui.create' : confirmation.relationship ? 'ui.applyRelationship' : 'dialog.confirm') }}</button></div>
        </template>
      </dialog>
    </div>`,
});
app.provide('languageState', languageState);
app.mixin({
  inject: ['languageState'],
  computed: { locale() { return this.languageState.locale; } },
  methods: {
    t(value, args) { return translate(typeof value === 'string' && value ? message(value, args) : value, this.locale); },
    n(value) { return formatNumber(value, this.locale); },
    workflowText(workflow) { return workflowText(workflow, this.locale); },
  },
});
app.mount('#app');
