import { AppError } from './i18n.js';
import { validateProject } from './model.js';

export const LIBRARY_KEY = 'doubleknit.namedProjects';
export const MAX_FILE_BYTES = 1024 * 1024;
export function projectName(value) {
  if (typeof value !== 'string') throw new AppError('error.nameRequired');
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new AppError('error.nameCharacters');
  }
  return name;
}
const nameKey = name => projectName(name).toLowerCase();

export function parseProjectFile(text, unnamed = 'Untitled') {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new AppError('error.fileSize');
  let value;
  try { value = JSON.parse(text); } catch { throw new AppError('error.fileJson'); }
  if (value && Object.hasOwn(value, 'fileVersion')) {
    if (value.fileVersion !== 1 || value.format !== 'doubleknit') throw new AppError('error.fileVersion');
    return { name: projectName(value.name), project: validateProject(value.project) };
  }
  return { name: projectName(unnamed), project: validateProject(value) };
}
export function serializeProjectFile(project, name) {
  return JSON.stringify({ format: 'doubleknit', fileVersion: 1, name: projectName(name),
    project: validateProject(project) }, null, 2);
}
export function projectFilename(name) {
  return (projectName(name).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'pattern') + '.doubleknit.json';
}
export function validateLibrary(value) {
  if (!value || value.libraryVersion !== 1 || !Array.isArray(value.entries)) throw new AppError('error.libraryVersion');
  const ids = new Set(), names = new Set();
  return value.entries.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) throw new AppError('error.snapshotId');
    const name = projectName(entry.name), key = nameKey(name);
    if (names.has(key)) throw new AppError('error.duplicateNames');
    ids.add(entry.id); names.add(key);
    return { id: entry.id, name, project: validateProject(entry.project) };
  });
}
// Each mutation re-reads storage and compares the exact reviewed collection before
// one atomic setItem. Failed reads/validation/writes never replace the old value.
export function snapshotId() {
  // getRandomValues also supports ordinary HTTP static hosting.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function createProjectLibrary(getStorage, newId = snapshotId) {
  let raw, entries = [], available = false;
  function read() {
    const candidate = getStorage().getItem(LIBRARY_KEY);
    const clean = candidate === null ? [] : validateLibrary(JSON.parse(candidate));
    raw = candidate; entries = clean; available = true;
    return clean.map(entry => ({ ...entry, project: validateProject(entry.project) }))
      .sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  }
  function write(next) {
    if (!available) throw new AppError('error.libraryReload');
    const storage = getStorage();
    if (storage.getItem(LIBRARY_KEY) !== raw) throw new AppError('error.libraryChanged');
    const serialized = JSON.stringify({ libraryVersion: 1, entries: next });
    storage.setItem(LIBRARY_KEY, serialized);
    raw = serialized; entries = next;
  }
  return {
    read() { available = false; return read(); },
    save(name, project, overwriteId = null) {
      name = projectName(name);
      const existing = entries.find(entry => nameKey(entry.name) === nameKey(name));
      if (existing && existing.id !== overwriteId) throw new AppError('error.confirmOverwrite');
      if (overwriteId && existing?.id !== overwriteId) throw new AppError('error.snapshotChanged');
      const entry = { id: existing?.id ?? newId(), name, project: validateProject(project) };
      write([...entries.filter(item => item.id !== entry.id), entry]);
      return entry.id;
    },
    rename(id, name) {
      name = projectName(name);
      if (!entries.some(entry => entry.id === id)) throw new AppError('error.snapshotMissing');
      if (entries.some(entry => entry.id !== id && nameKey(entry.name) === nameKey(name))) throw new AppError('error.nameInUse');
      write(entries.map(entry => entry.id === id ? { ...entry, name } : entry));
    },
    remove(id) {
      if (!entries.some(entry => entry.id === id)) throw new AppError('error.snapshotMissing');
      write(entries.filter(entry => entry.id !== id));
    },
  };
}
