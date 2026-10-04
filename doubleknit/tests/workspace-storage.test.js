import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, toggleCell } from '../src/model.js';
import { LIBRARY_KEY, createProjectLibrary } from '../src/projects.js';
import { createWorkspaceStorage, workspaceSelection } from '../src/workspace-storage.js';
function fixture() {
  const data = new Map(); let n = 0;
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const create = () => createWorkspaceStorage(() => storage, () => `id-${++n}`, () => '2026-09-21T10:00:00Z');
  const store = create(); store.read(); return { data, storage, create, store };
}
test('active identity, edits, name and timestamp survive restart; copies are independent', () => {
  const { store, create } = fixture(), white = createProject(2, 2);
  const first = store.create('Scarf', white), id = first.activeId;
  store.save(id, toggleCell(white, 'a', 0, 1)); store.rename(id, 'Winter scarf');
  const restarted = create(), state = restarted.read();
  assert.equal(state.activeId, id); assert.equal(state.entries[0].name, 'Winter scarf');
  assert.equal(state.entries[0].project.a[0][1], 1); assert.equal(state.entries[0].editedAt, '2026-09-21T10:00:00Z');
  const copied = restarted.create('Winter scarf', white);
  assert.notEqual(copied.activeId, id); assert.equal(copied.entries[1].name, 'Winter scarf (2)');
  assert.equal(copied.entries[0].project.a[0][1], 1);
  restarted.open(id); restarted.remove(id); assert.equal(restarted.read().activeId, null);
});
test('legacy snapshots are retained with no guessed active identity', () => {
  const { storage, create } = fixture();
  const old = createProjectLibrary(() => storage, () => 'legacy'); old.read(); old.save('Original', createProject(2, 2));
  const store = create(), state = store.read(); assert.equal(state.activeId, null);
  assert.equal(state.entries[0].id, 'legacy');
  const next = store.create('Untitled', createProject(3, 3)); assert.equal(next.entries.length, 2);
});
test('corrupt, unreadable, quota and concurrent failures preserve bytes and identity', () => {
  const { store, data, storage, create } = fixture();
  const state = store.create('First', createProject(2, 2)), before = data.get(LIBRARY_KEY);
  const other = create(); other.read(); other.rename(state.activeId, 'External change');
  const external = data.get(LIBRARY_KEY);
  assert.throws(() => store.save(state.activeId, createProject(3, 3)), /changed/);
  assert.equal(data.get(LIBRARY_KEY), external);
  store.read(); storage.setItem = () => { throw Error('quota'); };
  assert.throws(() => store.create('Second', createProject()), /quota/); assert.equal(data.get(LIBRARY_KEY), external);
  data.set(LIBRARY_KEY, '{bad'); assert.throws(() => store.read());
  assert.throws(() => store.save(state.activeId, createProject()), /Reload/); assert.equal(data.get(LIBRARY_KEY), '{bad');
  storage.getItem = () => { throw Error('denied'); }; assert.throws(() => store.read(), /denied/);
  assert.throws(() => store.create('Next', createProject()), /Reload/); assert.notEqual(before, external);
});
test('returned projects cannot mutate stored data; names remain unique across rename', () => {
  const { store } = fixture(); const first = store.create('Scarf', createProject(2, 2));
  first.entries[0].project.a[0][0] = 1; assert.equal(store.read().entries[0].project.a[0][0], 0);
  const second = store.create('SCARF', createProject(2, 2)); assert.equal(second.entries[1].name, 'SCARF (2)');
  assert.throws(() => store.rename(second.activeId, 'scarf'), /already in use/);
});

test('deleting the current project persists a detached draft until copy or open', () => {
  const { store, create } = fixture(); const first = store.create('Keep draft', createProject(2, 2));
  store.remove(first.activeId);
  const resumed = create(); const draft = resumed.read();
  assert.equal(draft.activeId, null); assert.equal(draft.detachedName, 'Keep draft'); assert.deepEqual(draft.entries, []);
  const copied = resumed.create(draft.detachedName, createProject(2, 2));
  assert.equal(copied.detachedName, null); assert.ok(create().read().activeId);
});

test('metadata changes after another tab opens a project retain local identity and never overwrite that project', () => {
  const { store: tabA, create } = fixture();
  const chartA = createProject(2, 2), chartB = createProject(3, 3);
  const idA = tabA.create('A', chartA).activeId;
  const idB = tabA.create('B', chartB).activeId;
  tabA.open(idA);
  const tabB = create(); tabB.read(); tabB.open(idB);
  tabA.read();
  const afterRename = tabA.rename(idA, 'Renamed A');
  assert.equal(afterRename.activeId, idB);
  const local = workspaceSelection(afterRename, chartA, idA);
  assert.equal(local.id, idA); assert.equal(local.name, 'Renamed A'); assert.equal(local.saved, true);
  tabA.save(local.id, toggleCell(chartA, 'a', 0, 0));
  assert.deepEqual(tabB.read().entries.find(entry => entry.id === idB).project, chartB);
  tabB.open(idB); tabA.read();
  const removed = tabA.remove(idB);
  assert.equal(workspaceSelection(removed, chartA, idA).id, idA);
});
test('metadata changes cannot report an unsaved local edit as saved; explicit open and copy select the new identity', () => {
  const { store, storage } = fixture(); const chart = createProject(2, 2);
  const id = store.create('Original', chart).activeId;
  const edited = toggleCell(chart, 'a', 0, 0), originalWrite = storage.setItem;
  storage.setItem = () => { throw Error('quota'); };
  assert.throws(() => store.save(id, edited), /quota/);
  storage.setItem = originalWrite;
  store.read();
  const renamed = store.rename(id, 'Renamed');
  assert.equal(workspaceSelection(renamed, edited, id).saved, false);
  const copied = store.create('Renamed', edited), selection = workspaceSelection(copied, edited);
  assert.notEqual(selection.id, id); assert.equal(selection.saved, true);
  const opened = store.open(id);
  assert.equal(workspaceSelection(opened, chart).id, id);
  assert.equal(workspaceSelection(opened, chart).saved, true);
});
