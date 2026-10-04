// Session-only immutable snapshots. Budget counts a conservative serialized size per
// retained project (even when arrays are shared); it is not a JS heap measurement.
export const HISTORY_LIMIT = 100;
export const HISTORY_BYTES = 16 * 1024 * 1024;
export function createHistory(initial, { limit = HISTORY_LIMIT, bytes = HISTORY_BYTES } = {}) {
  let entries = [entry(initial)], cursor = 0;
  function entry(project) { return { project, size: JSON.stringify(project).length * 2 }; }
  function trim() {
    let total = entries.reduce((sum, item) => sum + item.size, 0);
    while (entries.length > 1 && (entries.length > limit + 1 || total > bytes)) {
      total -= entries.shift().size;
      cursor--;
    }
  }
  return {
    get canUndo() { return cursor > 0; },
    get canRedo() { return cursor < entries.length - 1; },
    push(project) {
      if (project === entries[cursor].project) return;
      entries = entries.slice(0, cursor + 1);
      entries.push(entry(project));
      cursor++;
      trim();
    },
    undo() { return cursor > 0 ? entries[--cursor].project : null; },
    redo() { return cursor < entries.length - 1 ? entries[++cursor].project : null; },
    clear(project) { entries = [entry(project)]; cursor = 0; },
  };
}
