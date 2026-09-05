const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const coreSource = fs.readFileSync('core.js', 'utf8');
const backgroundSource = fs.readFileSync('background.js', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const emoji = (emojiId = 'smile-123', packId = 'basic') => ({
  emojiId,
  packId,
  name: `emoji ${emojiId}`,
  imageUrl: `https://ssl.pstatic.net/${emojiId}.png`
});

function loadCore() {
  const context = vm.createContext({ URL, TextEncoder, Date, console });
  vm.runInContext(coreSource, context, { filename: 'core.js' });
  return context.ChzzShortcut;
}

function key(code, modifiers = {}) {
  return {
    code,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    getModifierState: () => false,
    ...modifiers
  };
}

function backgroundFixture(initial = {}, options = {}) {
  const data = structuredClone(initial);
  let listener;
  let writes = 0;
  let failNextWrite = false;
  const local = {
    async get(keys) {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      const result = {};
      for (const name of keys) if (Object.hasOwn(data, name)) result[name] = structuredClone(data[name]);
      return result;
    },
    async set(values) {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('quota');
      }
      const next = structuredClone(values);
      Object.assign(data, next);
      writes++;
    }
  };
  const context = vm.createContext({
    URL,
    TextEncoder,
    Date,
    console,
    setTimeout,
    clearTimeout,
    chrome: {
      storage: { local },
      runtime: {
        id: 'extension-id',
        onMessage: { addListener(fn) { listener = fn; } }
      }
    }
  });
  context.importScripts = name => {
    assert.equal(name, 'core.js');
    vm.runInContext(coreSource, context, { filename: name });
  };
  vm.runInContext(backgroundSource, context, { filename: 'background.js' });
  const send = (message, sender = { id: 'extension-id' }) => new Promise(resolve => {
    const keepOpen = listener({ namespace: 'chzz-shortcut', ...message }, sender, resolve);
    if (keepOpen !== true && sender.id === 'extension-id') resolve(undefined);
  });
  return {
    data,
    send,
    failNextWrite() { failNextWrite = true; },
    get writes() { return writes; }
  };
}

test('legacy preferences and slots migrate into one valid v2 state', () => {
  const C = loadCore();
  const state = C.stateFromLegacy({
    [C.preferencesKey]: { enabled: false, modifier: 'altShift' },
    [C.slotKey(2)]: emoji()
  });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.enabled, false);
  assert.equal(state.sets[0].slots.length, 9);
  assert.equal(state.sets[0].slots[1].shortcut.shift, true);
  assert.equal(state.sets[0].slots[1].emoji.emojiId, 'smile-123');
  assert.equal(state.favorites.length, 1);
});

test('export/import roundtrip validates envelope and preserves state', () => {
  const C = loadCore();
  const state = C.applyCommand(C.createDefaultState(), {
    type: 'SET_SLOT', setId: 'default', slotId: '1', emoji: emoji()
  });
  const text = C.exportState(state);
  const envelope = JSON.parse(text);
  assert.equal(envelope.format, 'chzz-shortcut');
  assert.equal(envelope.version, 2);
  assert.match(envelope.exportedAt, /^\d{4}-/);
  assert.deepEqual(plain(C.parseImportText(text)), plain(state));
});

test('every accepted large state still exports below import limit and roundtrips', () => {
  const C = loadCore();
  const state = plain(C.createDefaultState());
  for (let setIndex = 1; setIndex < C.MAX_SETS; setIndex++) {
    const copy = structuredClone(state.sets[0]);
    copy.id = `set-${setIndex}`;
    copy.name = `세트 ${setIndex}`;
    state.sets.push(copy);
  }
  for (const [setIndex, set] of state.sets.entries()) {
    for (const slot of set.slots) slot.emoji = emoji(`slot-${setIndex}-${slot.id}`, 'slots');
  }
  state.favorites = Array.from({ length: C.MAX_FAVORITES }, (_, index) => ({
    ...emoji(`favorite-${index}`, 'favorites'),
    imageUrl: `https://ssl.pstatic.net/${'x'.repeat(1000)}-${index}.png`
  }));
  const validated = C.validateState(state);
  const text = C.exportState(validated);
  assert.ok(Buffer.byteLength(text, 'utf8') <= C.MAX_IMPORT_BYTES);
  assert.deepEqual(plain(C.parseImportText(text)), plain(validated));

  const oversized = C.createDefaultState();
  oversized.favorites = [{ ...emoji(), imageUrl: `https://ssl.pstatic.net/${'x'.repeat(C.MAX_IMPORT_BYTES)}` }];
  assert.throws(() => C.validateState(oversized), /전체 크기.*512KiB/);
});

test('invalid, unsafe, incomplete and oversized imports are rejected', () => {
  const C = loadCore();
  assert.throws(() => C.parseImportText('{oops'), /JSON/);
  assert.throws(() => C.parseImportText(JSON.stringify({ format: 'other', version: 2, data: {} })), /v2/);
  assert.throws(() => C.parseImportText(JSON.stringify({ format: 'chzz-shortcut', version: 2, data: C.createDefaultState() })), /시각/);
  const missing = C.createDefaultState();
  delete missing.sets[0].slots[0].emoji;
  assert.throws(() => C.validateState(missing), /누락/);
  const unsafe = C.createDefaultState();
  unsafe.sets[0].slots[0].emoji = { ...emoji(), imageUrl: 'https://evil.example/track.png' };
  assert.throws(() => C.validateState(unsafe), /pstatic/);
  assert.throws(() => C.parseImportText(' '.repeat(C.MAX_IMPORT_BYTES + 1)), /512KiB/);
});

test('shortcut normalization allows safe combos and matches numpad aliases including repeat', () => {
  const C = loadCore();
  const altOne = { code: 'Digit1', alt: true, ctrl: false, shift: false, meta: false };
  assert.deepEqual(plain(C.shortcutFromEvent(key('Numpad1', { altKey: true, repeat: true }))), altOne);
  assert.equal(C.shortcutMatches(key('Numpad1', { altKey: true, repeat: true }), altOne), true);
  assert.equal(C.shortcutMatches(key('Digit1', { altKey: true, shiftKey: true }), altOne), false);
  assert.equal(C.shortcutFromEvent(key('KeyA', { shiftKey: true })), null);
  assert.deepEqual(plain(C.shortcutFromEvent(key('F12'))), { code: 'F12', alt: false, ctrl: false, shift: false, meta: false });
  assert.equal(C.shortcutFromEvent(key('Enter', { ctrlKey: true })), null);
  assert.equal(C.shortcutFromEvent(key('KeyA', { ctrlKey: true, defaultPrevented: true })), null);
});

test('duplicate shortcuts fail within a set and across cycle keys, but work across sets', () => {
  const C = loadCore();
  const duplicate = C.createDefaultState();
  duplicate.sets[0].slots[1].shortcut = duplicate.sets[0].slots[0].shortcut;
  assert.throws(() => C.validateState(duplicate), /중복/);
  const cycle = C.createDefaultState();
  cycle.setShortcuts.next = cycle.sets[0].slots[0].shortcut;
  assert.throws(() => C.validateState(cycle), /충돌/);
  let state = C.applyCommand(C.createDefaultState(), { type: 'CREATE_SET', name: '두 번째' });
  assert.doesNotThrow(() => C.validateState(state));
  assert.equal(state.sets[0].slots[0].shortcut.code, state.sets[1].slots[0].shortcut.code);
});

test('commands are pure and registration adds a favorite without clearing shortcut', () => {
  const C = loadCore();
  const original = C.createDefaultState();
  const changed = C.applyCommand(original, { type: 'SET_SLOT', setId: 'default', slotId: '1', emoji: emoji() });
  assert.equal(original.revision, 0);
  assert.equal(original.sets[0].slots[0].emoji, null);
  assert.equal(changed.revision, 1);
  assert.equal(changed.favorites.length, 1);
  const cleared = C.applyCommand(changed, { type: 'SET_SLOT', setId: 'default', slotId: '1', emoji: null });
  assert.equal(cleared.sets[0].slots[0].emoji, null);
  assert.equal(cleared.sets[0].slots[0].shortcut.code, 'Digit1');
  assert.equal(cleared.favorites.length, 1);
});

test('blank set creation clears only defaults that collide with global cycle keys', () => {
  const C = loadCore();
  const altOne = { code: 'Digit1', alt: true, ctrl: false, shift: false, meta: false };
  let state = C.applyCommand(C.createDefaultState(), {
    type: 'SET_SHORTCUT', setId: 'default', slotId: '1', shortcut: null
  });
  state = C.applyCommand(state, { type: 'SET_CYCLE_SHORTCUT', direction: 'previous', shortcut: altOne });
  state = C.applyCommand(state, { type: 'CREATE_SET', name: '새 세트' });
  assert.equal(state.sets[1].slots[0].shortcut, null);
  assert.equal(state.sets[1].slots[1].shortcut.code, 'Digit2');
  assert.doesNotThrow(() => C.validateState(state));
});

test('background serializes concurrent mutations without lost updates', async () => {
  const C = loadCore();
  const fixture = backgroundFixture({ [C.STATE_KEY]: plain(C.createDefaultState()) }, { delay: 5 });
  const [disabled, created] = await Promise.all([
    fixture.send({ type: 'UPDATE_SETTINGS', enabled: false }),
    fixture.send({ type: 'CREATE_SET', name: '게임' })
  ]);
  assert.equal(disabled.ok, true);
  assert.equal(created.ok, true);
  assert.equal(created.state.revision, 2);
  assert.equal(created.state.enabled, false);
  assert.equal(created.state.sets.length, 2);
});

test('failed writes preserve stored state and do not poison queue', async () => {
  const C = loadCore();
  const initial = plain(C.createDefaultState());
  const fixture = backgroundFixture({ [C.STATE_KEY]: initial });
  fixture.failNextWrite();
  const failed = await fixture.send({ type: 'UPDATE_SETTINGS', enabled: false });
  assert.equal(failed.ok, false);
  assert.equal(fixture.data[C.STATE_KEY].revision, 0);
  const succeeded = await fixture.send({ type: 'UPDATE_SETTINGS', enabled: false });
  assert.equal(succeeded.ok, true);
  assert.equal(succeeded.state.revision, 1);
});

test('stale import is rejected without backup or state changes', async () => {
  const C = loadCore();
  const initial = plain(C.createDefaultState());
  const fixture = backgroundFixture({ [C.STATE_KEY]: initial });
  const response = await fixture.send({ type: 'IMPORT_STATE', state: initial, mode: 'replace', expectedRevision: 9 });
  assert.equal(response.ok, false);
  assert.match(response.error, /새로고침.*미리보기/);
  assert.equal(fixture.data[C.STATE_KEY].revision, 0);
  assert.equal(fixture.data[C.BACKUP_KEY], undefined);
});

test('failed atomic import write preserves both current state and prior backup', async () => {
  const C = loadCore();
  const initial = plain(C.createDefaultState());
  const oldBackup = plain(C.createDefaultState());
  oldBackup.enabled = false;
  const fixture = backgroundFixture({ [C.STATE_KEY]: initial, [C.BACKUP_KEY]: oldBackup });
  fixture.failNextWrite();
  const response = await fixture.send({ type: 'IMPORT_STATE', state: initial, mode: 'replace', expectedRevision: 0 });
  assert.equal(response.ok, false);
  assert.deepEqual(fixture.data[C.STATE_KEY], initial);
  assert.deepEqual(fixture.data[C.BACKUP_KEY], oldBackup);
});

test('replace import saves backup and restore swaps snapshots reversibly', async () => {
  const C = loadCore();
  const initial = plain(C.createDefaultState());
  const imported = plain(C.createDefaultState());
  imported.enabled = false;
  imported.revision = 800;
  imported.sets[0].name = '가져온 설정';
  const fixture = backgroundFixture({ [C.STATE_KEY]: initial });
  const replaced = await fixture.send({ type: 'IMPORT_STATE', state: imported, mode: 'replace', expectedRevision: 0 });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.state.revision, 1);
  assert.equal(replaced.state.enabled, false);
  assert.equal(fixture.data[C.BACKUP_KEY].enabled, true);
  const restored = await fixture.send({ type: 'RESTORE_BACKUP', expectedRevision: 1 });
  assert.equal(restored.state.revision, 2);
  assert.equal(restored.state.enabled, true);
  assert.equal(fixture.data[C.BACKUP_KEY].enabled, false);
});

test('merge retains local settings, unions favorites and gives imported sets unique IDs', async () => {
  const C = loadCore();
  let local = C.applyCommand(C.createDefaultState(), { type: 'SET_SLOT', setId: 'default', slotId: '1', emoji: emoji('one') });
  local.enabled = false;
  const imported = C.applyCommand(C.createDefaultState(), { type: 'SET_SLOT', setId: 'default', slotId: '2', emoji: emoji('two') });
  imported.enabled = true;
  const fixture = backgroundFixture({ [C.STATE_KEY]: plain(local) });
  const response = await fixture.send({ type: 'IMPORT_STATE', state: plain(imported), mode: 'merge', expectedRevision: local.revision });
  assert.equal(response.ok, true);
  assert.equal(response.state.enabled, false);
  assert.equal(response.state.activeSetId, 'default');
  assert.deepEqual(response.state.sets.map(set => set.id), ['default', 'default-2']);
  assert.deepEqual(response.state.favorites.map(item => item.emojiId), ['one', 'two']);
});

test('background migrates once, preserves legacy keys and rejects malformed existing v2 state', async () => {
  const C = loadCore();
  const legacyKey = C.slotKey(1);
  const migrated = backgroundFixture({ [legacyKey]: emoji() });
  const response = await migrated.send({ type: 'GET_STATE' });
  assert.equal(response.ok, true);
  assert.equal(migrated.data[legacyKey].emojiId, 'smile-123');
  assert.equal(migrated.data[C.STATE_KEY].sets[0].slots[0].emoji.emojiId, 'smile-123');

  const malformed = { schemaVersion: 2 };
  const corrupt = backgroundFixture({ [C.STATE_KEY]: malformed, [legacyKey]: emoji() });
  const rejected = await corrupt.send({ type: 'GET_STATE' });
  assert.equal(rejected.ok, false);
  assert.deepEqual(corrupt.data[C.STATE_KEY], malformed);
});

test('background rejects messages from another extension', async () => {
  const C = loadCore();
  const fixture = backgroundFixture({ [C.STATE_KEY]: plain(C.createDefaultState()) });
  const response = await fixture.send({ type: 'GET_STATE' }, { id: 'other-extension' });
  assert.deepEqual(plain(response), { ok: false, error: '허용되지 않은 메시지 발신자입니다.' });
});
