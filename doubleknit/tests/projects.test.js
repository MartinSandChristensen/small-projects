import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, toggleCell } from '../src/model.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';
import { createProjectLibrary, LIBRARY_KEY, MAX_FILE_BYTES, parseProjectFile,
  projectFilename, projectName, serializeProjectFile } from '../src/projects.js';

function fixture() {
  const data = new Map();
  const storage = { fail: false, getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (this.fail) throw new Error('quota'); data.set(key, value); } };
  let id = 0;
  const library = createProjectLibrary(() => storage, () => String(++id));
  library.read();
  return { data, storage, library };
}
test('independent snapshots, explicit overwrite, stable rename IDs, sorting and deletion', () => {
  const { library } = fixture();
  const white = createProject(2, 1), black = toggleCell(white, 'b', 0, 1);
  const z = library.save(' Zebra ', white), a = library.save('Alpha', black);
  assert.deepEqual(library.read().map(e => e.name), ['Alpha', 'Zebra']);
  assert.throws(() => library.save('ZEBRA', black), /Confirm/);
  library.save('ZEBRA', black, z);
  library.rename(z, 'Beta');
  assert.equal(library.read().find(e => e.name === 'Beta').id, z);
  assert.throws(() => library.rename(z, 'alpha'), /already in use/);
  const copy = library.read(); copy[0].project.b[0][1] = 1;
  assert.equal(library.read()[0].project.b[0][1], 0);
  library.remove(a);
  assert.deepEqual(library.read().map(e => e.id), [z]);
});
test('failed writes, malformed collections and concurrent changes preserve stored bytes', () => {
  const { library, storage, data } = fixture();
  const id = library.save('Original', createProject(1, 1));
  const before = data.get(LIBRARY_KEY);
  storage.fail = true;
  for (const action of [() => library.save('Original', createProject(2, 1), id),
    () => library.rename(id, 'Renamed'), () => library.remove(id)]) {
    assert.throws(action, /quota/); assert.equal(data.get(LIBRARY_KEY), before);
  }
  storage.fail = false;
  data.set(LIBRARY_KEY, '{broken');
  assert.throws(() => library.remove(id), /another tab/);
  assert.throws(() => library.read());
  assert.throws(() => library.save('New', createProject()), /Reload/);
  assert.equal(data.get(LIBRARY_KEY), '{broken');
});
test('reset/current storage protection never deletes named saves; loads cannot bypass protection', () => {
  const { library, storage, data } = fixture();
  library.save('Keep', createProject(1, 1));
  const before = data.get(LIBRARY_KEY);
  data.set(STORAGE_KEY, '{broken');
  const persistence = createPersistence(() => storage); persistence.load();
  assert.equal(persistence.save(library.read()[0].project), false);
  assert.equal(data.get(STORAGE_KEY), '{broken');
  persistence.replace(createProject());
  assert.equal(data.get(LIBRARY_KEY), before);
});
test('file envelope and raw current source round-trips validate sources and discard derived/unknown data', () => {
  const project = toggleCell(createProject(3, 2), 'a', 1, 2);
  assert.deepEqual(parseProjectFile(serializeProjectFile({ ...project, c: [[8]] }, ' Scarf ')), { name: 'Scarf', project });
  assert.deepEqual(parseProjectFile(JSON.stringify(project)), { name: 'Untitled', project });
  assert.equal(projectFilename('../A/B 🧶'), 'A-B.doubleknit.json');
  assert.equal(projectName(' e\u0301 '), 'é');
});
test('invalid files and names are rejected, including versions, mapping, size and cells', () => {
  for (const name of ['', '  ', 'a'.repeat(81), 'a\nb']) assert.throws(() => projectName(name));
  const project = createProject(1, 1);
  for (const value of [null, { ...project, schemaVersion: 99 }, { ...project, mapping: 'unknown' },
    { ...project, a: [[2]] }, { ...project, b: [] },
    { format: 'doubleknit', fileVersion: 2, project, name: 'a' },
    { format: 'other', fileVersion: 1, project, name: 'a' }]) {
    assert.throws(() => parseProjectFile(JSON.stringify(value)));
  }
  assert.throws(() => parseProjectFile('{bad'), /Invalid JSON/);
  assert.throws(() => parseProjectFile(' '.repeat(MAX_FILE_BYTES + 1)), /1 MiB/);
  assert.ok(new TextEncoder().encode(serializeProjectFile(createProject(200, 200), 'Maximum')).length < MAX_FILE_BYTES);
});
test('unavailable library can retry without writing or altering current work', () => {
  let denied = true;
  const library = createProjectLibrary(() => { if (denied) throw new Error('denied'); return { getItem: () => null }; });
  assert.throws(() => library.read(), /denied/);
  assert.throws(() => library.save('a', createProject()), /Reload/);
  denied = false;
  assert.deepEqual(library.read(), []);
});
