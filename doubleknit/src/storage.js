import { message, errorMessage, translate } from './i18n.js';
import { createProject, validateProject } from './model.js';

export const STORAGE_KEY = 'doubleknit.currentProject';

// Storage is injected lazily: even accessing window.localStorage can throw.
// protected and unread states never write without explicit replacement consent.
export function createPersistence(getStorage) {
  let state = 'ready';
  let warning = '';
  let missing = false;
  let reviewedRaw = null;

  function write(project, replace = false) {
    try {
      const storage = getStorage();
      if (!replace && storage.getItem(STORAGE_KEY) !== reviewedRaw) {
        state = 'protected'; warning = message('ui.storageConflict'); return false;
      }
      const serialized = JSON.stringify(validateProject(project));
      storage.setItem(STORAGE_KEY, serialized);
      reviewedRaw = serialized;
      state = 'ready';
      warning = '';
      return true;
    } catch {
      warning = message(state === 'protected' ? 'storage.writeProtected' : 'storage.write');
      return false;
    }
  }

  return {
    get missing() { return missing; },
    get state() { return state; },
    get warning() { return translate(warning); },
    get warningMessage() { return warning; },
    load() {
      let raw;
      try {
        raw = getStorage().getItem(STORAGE_KEY);
        reviewedRaw = raw;
      } catch {
        state = 'unread';
        warning = message('storage.read');
        return createProject();
      }
      missing = raw === null;
      if (missing) return createProject();
      try {
        return validateProject(JSON.parse(raw));
      } catch (error) {
        state = 'protected';
        warning = message('storage.invalid', { reason: errorMessage(error) });
        return createProject();
      }
    },
    save(project) {
      if (state !== 'ready') return false;
      return write(project);
    },
    // Re-read before allowing writes after an initial read failure. Keep current
    // in-memory work; an existing item requires consent, even if it is valid.
    retry(project) {
      if (state === 'unread') {
        try {
          if (getStorage().getItem(STORAGE_KEY) !== null) {
            state = 'protected';
            warning = message('storage.recovered');
            return false;
          }
          state = 'ready';
          reviewedRaw = null;
        } catch {
          return false;
        }
      }
      return this.save(project);
    },
    replace(project) {
      // A reset cannot bypass an unsuccessful initial read.
      if (state === 'unread') return false;
      return write(project, true);
    },
  };
}
