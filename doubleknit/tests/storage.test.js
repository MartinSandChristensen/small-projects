import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, toggleCell } from '../src/model.js';
import { createPersistence, STORAGE_KEY } from '../src/storage.js';

function fixture(raw = null) {
  const storage = { raw, readsFail: false, writesFail: false, writes: 0,
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      if (this.readsFail) throw new Error('denied');
      return this.raw;
    },
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      if (this.writesFail) throw new Error('quota');
      this.raw = value;
      this.writes++;
    },
  };
  return { storage, persistence: createPersistence(() => storage) };
}

test('missing storage starts default without writing; committed source round-trips', () => {
  const { storage, persistence } = fixture();
  const project = persistence.load();
  assert.deepEqual(project, createProject());
  assert.equal(storage.writes, 0);
  const next = toggleCell(project, 'b', 1, 2);
  assert.equal(persistence.save(next), true);
  assert.deepEqual(createPersistence(() => storage).load(), next);
  assert.equal(storage.writes, 1);
  assert.deepEqual(Object.keys(JSON.parse(storage.raw)), ['schemaVersion', 'mapping', 'mode', 'width', 'height', 'workflow', 'identicalPatterns', 'a', 'b', 'maskA', 'display']);
});

for (const raw of ['{broken', 'null', JSON.stringify({ ...createProject(1, 1), schemaVersion: 99 }),
  JSON.stringify({ ...createProject(1, 1), mapping: 'future' }),
  JSON.stringify({ ...createProject(1, 1), a: [[7]] })]) {
  test(`invalid saved data stays untouched until explicit replacement: ${raw.slice(0, 50)}`, () => {
    const { storage, persistence } = fixture(raw);
    const edited = toggleCell(persistence.load(), 'a', 0, 0);
    assert.equal(persistence.state, 'protected');
    assert.ok(persistence.warning);
    assert.equal(persistence.save(edited), false);
    assert.equal(persistence.retry(edited), false);
    assert.equal(storage.raw, raw);
    storage.writesFail = true;
    assert.equal(persistence.replace(edited), false);
    assert.equal(persistence.state, 'protected');
    assert.equal(storage.raw, raw);
    storage.writesFail = false;
    assert.equal(persistence.replace(edited), true);
    assert.equal(persistence.state, 'ready');
    assert.equal(persistence.warning, '');
    assert.deepEqual(JSON.parse(storage.raw), edited);
  });
}

test('quota failure keeps editing in memory and retries the complete current project', () => {
  const { storage, persistence } = fixture();
  const project = persistence.load();
  persistence.save(project);
  const before = storage.raw;
  storage.writesFail = true;
  const edited = toggleCell(project, 'a', 0, 0);
  assert.equal(persistence.save(edited), false);
  assert.equal(storage.raw, before);
  assert.ok(persistence.warning);
  storage.writesFail = false;
  assert.equal(persistence.retry(edited), true);
  assert.equal(persistence.warning, '');
  assert.deepEqual(JSON.parse(storage.raw), edited);
});

for (const raw of [null, '{invalid', JSON.stringify(createProject(1, 1))]) {
  test(`failed initial read requires successful retry and protects existing data: ${raw}`, () => {
    const { storage, persistence } = fixture(raw);
    storage.readsFail = true;
    const edited = toggleCell(persistence.load(), 'b', 0, 0);
    assert.equal(persistence.state, 'unread');
    assert.equal(persistence.save(edited), false);
    assert.equal(persistence.replace(edited), false);
    assert.equal(persistence.retry(edited), false);
    assert.equal(storage.writes, 0);
    storage.readsFail = false;
    assert.equal(persistence.retry(edited), raw === null);
    if (raw !== null) {
      assert.equal(storage.raw, raw);
      assert.equal(persistence.state, 'protected');
      assert.equal(persistence.replace(edited), true);
    }
    assert.deepEqual(JSON.parse(storage.raw), edited);
    assert.equal(persistence.warning, '');
  });
}

test('a throwing localStorage getter is caught, and recovery can resume', () => {
  const { storage } = fixture();
  let denied = true;
  const persistence = createPersistence(() => {
    if (denied) throw new Error('SecurityError');
    return storage;
  });
  const project = persistence.load();
  assert.equal(persistence.state, 'unread');
  assert.ok(persistence.warning);
  denied = false;
  assert.equal(persistence.retry(project), true);
});

test('another tab cannot silently replace the current draft during edits or retry', () => {
  const {storage,persistence}=fixture();const p=persistence.load();persistence.save(p);
  const other=JSON.stringify(toggleCell(p,'a',1,1));storage.raw=other;
  const mine=toggleCell(p,'a',0,0);
  assert.equal(persistence.save(mine),false);assert.equal(storage.raw,other);
  assert.equal(persistence.state,'protected');assert.equal(persistence.retry(mine),false);
  assert.equal(persistence.replace(mine),true);assert.deepEqual(JSON.parse(storage.raw),mine);
});
