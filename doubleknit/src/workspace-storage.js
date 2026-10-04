import { AppError } from './i18n.js';
import { validateProject } from './model.js';
import { LIBRARY_KEY, projectName, snapshotId, validateLibrary } from './projects.js';

// The active identity and all projects are committed in one atomic localStorage write.
// Existing version-1 snapshots become projects, without guessing which was current.
export function createWorkspaceStorage(getStorage, newId = snapshotId, now = () => new Date().toISOString()) {
  let raw, entries = [], activeId = null, detachedName = null, available = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = name => name.toLocaleLowerCase('en');
  function state() { return clone({ entries, activeId, detachedName }); }
  function write(next, active, draftName = detachedName) {
    if (!available) throw new AppError('error.libraryReload');
    const storage = getStorage();
    if (storage.getItem(LIBRARY_KEY) !== raw) throw new AppError('error.libraryChanged');
    const serialized = JSON.stringify({ libraryVersion: 1, entries: next, activeId: active, detachedName: draftName });
    storage.setItem(LIBRARY_KEY, serialized);
    raw = serialized; entries = next; activeId = active; detachedName = draftName;
    return state();
  }
  function get(id) {
    const entry = entries.find(item => item.id === id);
    if (!entry) throw new AppError('error.snapshotMissing');
    return entry;
  }
  return {
    read() {
      available = false;
      const candidate = getStorage().getItem(LIBRARY_KEY);
      const value = candidate === null ? { libraryVersion: 1, entries: [] } : JSON.parse(candidate);
      const clean = validateLibrary(value).map(entry => {
        const editedAt = value.entries.find(item => item.id === entry.id).editedAt;
        return { ...entry, ...(typeof editedAt === 'string' && Number.isFinite(Date.parse(editedAt)) ? { editedAt } : {}) };
      });
      const active = value.activeId ?? null;
      if (active !== null && !clean.some(entry => entry.id === active)) throw new AppError('error.snapshotMissing');
      const draftName = value.detachedName == null ? null : projectName(value.detachedName);
      if (active !== null && draftName !== null) throw new AppError('error.libraryVersion');
      raw = candidate; entries = clean; activeId = active; detachedName = draftName; available = true;
      return state();
    },
    uniqueName(wanted) {
      const base = projectName(wanted);
      let name = base, n = 2;
      while (entries.some(entry => key(entry.name) === key(name))) {
        const suffix = ` (${n++})`;
        name = [...base].slice(0, 80 - suffix.length).join('') + suffix;
      }
      return name;
    },
    create(name, project) {
      name = this.uniqueName(name);
      const entry = { id: newId(), name, project: validateProject(project), editedAt: now() };
      if (entries.some(item => item.id === entry.id)) throw new AppError('error.snapshotId');
      return write([...entries, entry], entry.id, null);
    },
    save(id, project) {
      get(id);
      const clean = validateProject(project);
      return write(entries.map(entry => entry.id === id ? { ...entry, project: clean, editedAt: now() } : entry), id, null);
    },
    open(id) { get(id); return write(entries, id, null); },
    rename(id, name) {
      get(id); name = projectName(name);
      if (entries.some(entry => entry.id !== id && key(entry.name) === key(name))) throw new AppError('error.nameInUse');
      return write(entries.map(entry => entry.id === id ? { ...entry, name } : entry), activeId);
    },
    remove(id) { const entry = get(id); return write(entries.filter(entry => entry.id !== id), activeId === id ? null : activeId, activeId === id ? entry.name : detachedName); },
  };
}

// Metadata-only library operations must retain this tab's selected identity.
// Another tab may have changed the persisted default without changing our chart.
export function workspaceSelection(state, currentProject, selectedId = state.activeId) {
  const entry = state.entries.find(item => item.id === selectedId);
  return {
    id: entry?.id ?? null,
    name: entry?.name ?? null,
    signature: entry ? JSON.stringify(entry.project) : '',
    saved: Boolean(entry && JSON.stringify(entry.project) === JSON.stringify(currentProject)),
  };
}
