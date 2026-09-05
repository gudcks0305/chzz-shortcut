const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const coreSource = fs.readFileSync('core.js', 'utf8');
const backgroundSource = fs.readFileSync('background.js', 'utf8');
const source = fs.readFileSync('panel.js', 'utf8') + '\n' + fs.readFileSync('content.js', 'utf8');
const sample = { emojiId: 'smile-123', packId: 'basic', name: '웃음', imageUrl: 'https://ssl.pstatic.net/emoji.png' };
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, initial = {}, options = {}) {
  const dom = new JSDOM('<body><input id="search"><div id="aside-chatting"><div id="composer"><pre contenteditable="true"></pre><button id="toggle" aria-haspopup="true" aria-expanded="false">이모티콘</button></div><button id="send">채팅</button></div></body>', { url: 'https://chzzk.naver.com/live/test', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(async () => {
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(0);
    dom.window.close();
  });
  const w = dom.window, d = w.document, data = structuredClone(initial), listeners = [];
  let inserted = 0, sent = 0, writes = 0, baselineWrites = 0, initialized = false, lastEmoji = sample.emojiId;
  const insertedIds = [];
  w.HTMLElement.prototype.getClientRects = function () { return this.isConnected && !this.hidden ? [{}] : []; };
  Object.defineProperty(w.HTMLElement.prototype, 'contentEditable', { get() { return this.getAttribute('contenteditable'); } });
  w.chrome = { storage: { local: {
    async get() { return structuredClone(data); },
    async set(values) {
      if (options.failSave && initialized) throw Error('quota');
      if (options.saveDelay && initialized) await tick(options.saveDelay);
      writes++;
      const changes = {};
      for (const [key, value] of Object.entries(values)) { changes[key] = { newValue: value }; data[key] = value; }
      listeners.forEach(fn => fn(changes, 'local'));
    },
    async remove(key) { delete data[key]; listeners.forEach(fn => fn({ [key]: {} }, 'local')); }
  }, onChanged: { addListener(fn) { listeners.push(fn); } } } };
  const messageListeners = [];
  w.chrome.runtime = {
    id: 'test-extension',
    onMessage: { addListener(fn) { messageListeners.push(fn); } },
    sendMessage(message) { return new Promise(resolve => messageListeners[0](structuredClone(message), { id: 'test-extension' }, result => resolve(structuredClone(result)))); }
  };
  w.eval(coreSource);
  w.importScripts = () => w.eval(coreSource);
  w.eval(backgroundSource);
  let editor = d.querySelector('pre');
  if (options.idleTextarea) {
    const textarea = d.createElement('textarea'); textarea.className = '_input_19u4u_59';
    editor.replaceWith(textarea); editor = textarea;
  }
  function renderEmoji(ids = options.nativeEmojis || [sample.emojiId]) {
    if (!Array.isArray(ids)) ids = [ids];
    d.getElementById('emoji_area').innerHTML = ids.map(id => `<li id="emoji_${id}"><button type="button">${options.locked ? '<i class="_lock_abc"></i>' : ''}<img alt="{:${id}:}" src="${sample.imageUrl}"></button></li>`).join('');
    for (const [index, button] of Array.from(d.querySelectorAll('#emoji_area button')).entries()) button.onclick = () => {
      inserted++; lastEmoji = ids[index]; insertedIds.push(lastEmoji); editor.append(d.createElement('img'));
    };
  }
  d.getElementById('toggle').onclick = event => {
    const toggle = event.currentTarget;
    if (editor.tagName === 'TEXTAREA') {
      const active = d.createElement('pre'); active.setAttribute('contenteditable', 'true');
      editor.replaceWith(active); editor = active;
    }
    if (toggle.getAttribute('aria-expanded') === 'true') { toggle.setAttribute('aria-expanded', 'false'); d.getElementById('picker')?.remove(); return; }
    toggle.setAttribute('aria-expanded', 'true');
    const picker = d.createElement('div'); picker.id = 'picker';
    picker.innerHTML = '<div id="emoji_area"></div>';
    if (options.areaDelay) {
      picker.firstElementChild.hidden = true;
      w.setTimeout(() => { if (picker.isConnected) picker.firstElementChild.hidden = false; }, options.areaDelay);
    }
    d.body.append(picker);
    const loadCatalog = () => {
      if (!picker.isConnected) return;
      const tab = d.createElement('button'); tab.id = 'emoji_pack_id_basic';
      tab.setAttribute('aria-current', String(!options.recent)); tab.textContent = '기본'; picker.prepend(tab);
      renderEmoji(options.recentOnly ? lastEmoji : options.otherPack ? 'other' : sample.emojiId);
      let held = false;
      tab.addEventListener('mousedown', event => { held = event.buttons === 1; });
      tab.addEventListener('mouseup', () => {
        if (!held) return;
        held = false; tab.setAttribute('aria-current', 'true');
        w.setTimeout(() => { if (picker.isConnected) renderEmoji(); }, options.renderDelay || 0);
      });
    };
    if (options.packDelay) w.setTimeout(loadCatalog, options.packDelay);
    else loadCatalog();
  };
  d.getElementById('send').onclick = () => { sent++; };
  w.eval(source); await tick(); baselineWrites = writes; initialized = true;
  const root = d.getElementById('chzz-shortcut').shadowRoot;
  const key = (props = {}, target = editor) => {
    const event = new w.KeyboardEvent('keydown', { key: '¡', code: 'Digit1', altKey: true, bubbles: true, cancelable: true, ...props });
    target.dispatchEvent(event); return event;
  };
  return { w, d, root, get editor() { return editor; }, data, key, insertedIds, get state() { return data[w.ChzzShortcut.STATE_KEY]; }, async command(type, payload = {}) { return w.chrome.runtime.sendMessage({ namespace: 'chzz-shortcut', type, ...payload }); }, get inserted() { return inserted; }, get sent() { return sent; }, get writes() { return writes - baselineWrites; } };
}
const bound = { 'chzzShortcut.slot.1': sample };

test('native insertion opens picker, updates draft, closes picker; never sends', async t => {
  const f = await fixture(t, bound);
  assert.equal(f.key().defaultPrevented, true); await tick(80);
  assert.equal(f.inserted, 1); assert.equal(f.sent, 0);
  assert.equal(f.editor.querySelectorAll('img').length, 1);
  assert.equal(f.d.getElementById('toggle').getAttribute('aria-expanded'), 'false');
});
test('held bound keys are consumed without another insertion', async t => {
  const f = await fixture(t, bound); f.key(); await tick(80);
  assert.equal(f.key({ repeat: true }).defaultPrevented, true); await tick();
  assert.equal(f.inserted, 1);
});
test('composition, unrelated modifier, unmapped slot, outside editor remain untouched', async t => {
  const f = await fixture(t, bound);
  for (const props of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: false }, { code: 'Digit2' }]) assert.equal(f.key(props).defaultPrevented, false);
  assert.equal(f.key({}, f.d.getElementById('search')).defaultPrevented, false);
  assert.equal(f.inserted, 0);
});
test('AltShift and numpad supported, disabled preference respected', async t => {
  const f = await fixture(t, { ...bound, 'chzzShortcut.preferences': { modifier: 'altShift' } });
  assert.equal(f.key().defaultPrevented, false);
  assert.equal(f.key({ shiftKey: true, code: 'Numpad1' }).defaultPrevented, true); await tick(80);
  assert.equal(f.inserted, 1);
  await f.command('UPDATE_SETTINGS', { enabled: false });
  assert.equal(f.key().defaultPrevented, false);
});
test('registration consumes native click, saves selected pack, and never inserts', async t => {
  const f = await fixture(t);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button img').click(); await tick();
  assert.equal(f.state.sets[0].slots[0].emoji.emojiId, sample.emojiId);
  assert.equal(f.state.sets[0].slots[0].emoji.packId, sample.packId);
  assert.equal(f.inserted, 0); assert.equal(f.sent, 0);
});
test('recent tab cannot save an incorrect pack; Escape cancels registration', async t => {
  const f = await fixture(t, {}, { recent: true });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button').click(); await tick();
  assert.equal(f.writes, 0); assert.equal(f.inserted, 0);
  assert.match(f.root.getElementById('status').textContent, /팩 탭/);
  f.key({ key: 'Escape', code: 'Escape', altKey: false });
  assert.match(f.root.getElementById('status').textContent, /취소/);
});
test('delayed native pack switch finds saved emoji and ignores rapid second shortcut', async t => {
  const f = await fixture(t, bound, { otherPack: true, renderDelay: 60 });
  f.key(); f.key(); await tick(180);
  assert.equal(f.inserted, 1); assert.equal(f.sent, 0);
});
test('locked emoji cannot register or insert', async t => {
  const f = await fixture(t, bound, { locked: true });
  f.key(); await tick(80); assert.equal(f.inserted, 0);
  assert.match(f.root.getElementById('status').textContent, /잠겼/);
});
test('navigation during pending lookup aborts insertion', async t => {
  const f = await fixture(t, bound, { otherPack: true, renderDelay: 80 });
  f.key(); await tick(10); f.w.history.pushState({}, '', '/live/other'); await tick(160);
  assert.equal(f.inserted, 0);
});
test('storage failure reports failure without claiming registration', async t => {
  const f = await fixture(t, {}, { failSave: true });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button').click(); await tick();
  assert.equal(f.writes, 0); assert.equal(f.inserted, 0);
  assert.match(f.root.getElementById('status').textContent, /저장 실패/);
});
test('delete persists and removes shortcut immediately', async t => {
  const f = await fixture(t, bound); f.root.getElementById('launcher').click();
  f.root.querySelector('[aria-label="1번 삭제"]').click(); await tick();
  assert.equal(f.state.sets[0].slots[0].emoji, null);
  assert.equal(f.key().defaultPrevented, false);
});
test('untrusted preview URLs and malformed stored identifiers are rejected', async t => {
  const f = await fixture(t);
  assert.equal(f.w.ChzzShortcut.binding({ ...sample, imageUrl: 'https://evil.test/track' }).imageUrl, '');
  assert.equal(f.w.ChzzShortcut.binding({ ...sample, emojiId: '"><script>' }), null);
});
test('idle textarea mounts settings and survives replacement by active pre during registration', async t => {
  const f = await fixture(t, {}, { idleTextarea: true });
  assert.equal(f.editor.tagName, 'TEXTAREA');
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  assert.equal(f.editor.tagName, 'PRE');
  f.d.querySelector('#emoji_area button').click(); await tick();
  assert.equal(f.state.sets[0].slots[0].emoji.emojiId, sample.emojiId);
  assert.equal(f.d.activeElement, f.editor);
  f.key(); await tick(80); assert.equal(f.inserted, 1); assert.equal(f.sent, 0);
});
test('reopening settings cancels registration and clears its warning immediately', async t => {
  const f = await fixture(t, {}, { recent: true });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button').click();
  assert.equal(f.root.getElementById('status').hidden, false);
  f.root.getElementById('launcher').click();
  assert.equal(f.root.getElementById('status').hidden, true);
  f.d.querySelector('#emoji_area button').click(); await tick();
  assert.equal(f.writes, 0); assert.equal(f.inserted, 1);
});
test('closing the native picker cancels pending registration and its toast', async t => {
  const f = await fixture(t);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.getElementById('toggle').click(); await tick();
  assert.equal(f.root.getElementById('status').hidden, true);
  f.d.getElementById('toggle').click(); f.d.querySelector('#emoji_area button').click(); await tick();
  assert.equal(f.writes, 0); assert.equal(f.inserted, 1);
});
test('toast close button cancels registration without saving or inserting', async t => {
  const f = await fixture(t);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.root.getElementById('dismiss-status').click();
  assert.equal(f.root.getElementById('status').hidden, true);
  assert.equal(f.writes, 0); assert.equal(f.inserted, 0);
  assert.equal(f.d.activeElement, f.editor);
});
test('recent-pack warning automatically hides after 4.5 seconds', async t => {
  const f = await fixture(t, {}, { recent: true });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button').click();
  assert.equal(f.root.getElementById('status').hidden, false);
  await tick(4600);
  assert.equal(f.root.getElementById('status').hidden, true);
  assert.equal(f.writes, 0); assert.equal(f.inserted, 0);
});
test('alternating slots survive delayed catalogs every time the picker reopens', async t => {
  const second = { ...sample, emojiId: 'wink-456', name: '윙크' };
  const f = await fixture(t, { ...bound, 'chzzShortcut.slot.2': second }, {
    packDelay: 80, recentOnly: true, nativeEmojis: [sample.emojiId, second.emojiId]
  });
  for (const n of [1, 2, 1, 2]) {
    f.key({ code: `Digit${n}` }); await tick(200);
    assert.equal(f.d.getElementById('toggle').getAttribute('aria-expanded'), 'false');
  }
  assert.deepEqual(f.insertedIds, [sample.emojiId, second.emojiId, sample.emojiId, second.emojiId]);
  assert.equal(f.sent, 0);
});
test('closing a picker before its area appears cancels registration immediately', async t => {
  const f = await fixture(t, {}, { areaDelay: 100 });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.getElementById('toggle').click(); await tick();
  assert.equal(f.root.getElementById('status').hidden, true);
  await tick(100);
  assert.equal(f.root.getElementById('status').hidden, true);
  assert.equal(f.writes, 0);
});

test('UI captures a custom key, persists it, and uses it while panel is closed', async t => {
  const f = await fixture(t, bound);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-key-slot="1"]').click();
  f.root.getElementById('cancel-key').dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true, bubbles: true, composed: true, cancelable: true }));
  await tick();
  assert.equal(f.state.sets[0].slots[0].shortcut.code, 'KeyK');
  assert.equal(f.root.getElementById('key-capture').hidden, true);
  f.root.getElementById('close').click();
  assert.equal(f.d.activeElement, f.editor);
  assert.equal(f.key().defaultPrevented, false);
  assert.equal(f.key({ key: 'K', code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true }).defaultPrevented, true);
  await tick(80); assert.equal(f.inserted, 1); assert.equal(f.sent, 0);
});
test('UI rejects duplicate shortcuts without discarding the previous binding', async t => {
  const f = await fixture(t, bound);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-key-slot="1"]').click();
  f.root.getElementById('cancel-key').dispatchEvent(new f.w.KeyboardEvent('keydown', { key: '2', code: 'Digit2', altKey: true, bubbles: true, composed: true, cancelable: true }));
  await tick();
  assert.match(f.root.getElementById('key-error').textContent, /중복/);
  assert.equal(f.state.sets[0].slots[0].shortcut.code, 'Digit1');
  assert.equal(f.root.getElementById('key-capture').hidden, false);
});
test('the same key selects different emojis in different sets and cycle shortcuts switch sets', async t => {
  const second = { ...sample, emojiId: 'wink-456' };
  const f = await fixture(t, bound, { nativeEmojis: [sample.emojiId, second.emojiId], otherPack: true });
  const created = await f.command('CREATE_SET', { name: '두 번째', copyFromId: 'default' });
  const id = created.state.activeSetId;
  await f.command('SET_SLOT', { setId: id, slotId: '1', emoji: second });
  await f.command('SET_CYCLE_SHORTCUT', { direction: 'next', shortcut: { code: 'BracketRight', alt: true, ctrl: false, shift: false, meta: false } });
  f.key(); await tick(100);
  f.key({ key: ']', code: 'BracketRight' }); await tick();
  assert.equal(f.state.activeSetId, 'default');
  f.key(); await tick(100);
  assert.deepEqual(f.insertedIds, [second.emojiId, sample.emojiId]); assert.equal(f.sent, 0);
});
test('favorite UI reuses a saved emoji in another set without opening native picker', async t => {
  const f = await fixture(t, bound);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-view="backup"]').click();
  f.root.getElementById('new-set-name').value = '새 방송'; f.root.getElementById('create-set').click(); await tick();
  const id = f.state.activeSetId;
  assert.notEqual(id, 'default');
  f.root.querySelector('[data-view="favorites"]').click(); f.root.getElementById('favorite-slot').value = '2';
  f.root.querySelector('[aria-label="웃음 슬롯에 넣기"]').click(); await tick();
  assert.equal(f.state.sets.find(set => set.id === id).slots[1].emoji.emojiId, sample.emojiId);
  assert.equal(f.d.getElementById('picker'), null);
  f.root.querySelector('[aria-label="웃음 즐겨찾기 해제"]').click(); await tick();
  assert.equal(f.state.favorites.length, 0);
  assert.equal(f.state.sets.find(set => set.id === id).slots[1].emoji.emojiId, sample.emojiId);
});
async function chooseImport(f, state) {
  const text = f.w.ChzzShortcut.exportState(state);
  const file = f.root.getElementById('import-file');
  Object.defineProperty(file, 'files', { value: [{ size: Buffer.byteLength(text), text: async () => text }], configurable: true });
  file.dispatchEvent(new f.w.Event('change')); await tick();
}
test('import UI previews without mutation, replaces explicitly, then restores the backup', async t => {
  const f = await fixture(t, bound);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-view="backup"]').click();
  const imported = f.w.ChzzShortcut.createDefaultState(); imported.sets[0].name = '가져온 세트';
  await chooseImport(f, imported);
  assert.equal(f.root.getElementById('import-preview').hidden, false);
  assert.equal(f.state.sets[0].name, '기본 세트');
  f.root.getElementById('import-mode').value = 'replace'; f.root.getElementById('apply-import').click(); await tick();
  assert.equal(f.state.sets[0].name, '가져온 세트');
  assert.equal(f.root.getElementById('restore-backup').disabled, false);
  f.root.getElementById('restore-backup').click(); await tick();
  assert.equal(f.state.sets[0].slots[0].emoji.emojiId, sample.emojiId);
});
test('import preview cannot overwrite settings changed by another tab', async t => {
  const f = await fixture(t, bound);
  const imported = f.w.ChzzShortcut.createDefaultState();
  await chooseImport(f, imported);
  await f.command('UPDATE_SETTINGS', { enabled: false });
  f.root.getElementById('import-mode').value = 'replace'; f.root.getElementById('apply-import').click(); await tick();
  assert.equal(f.state.enabled, false);
  assert.equal(f.state.sets[0].slots[0].emoji.emojiId, sample.emojiId);
  assert.match(f.root.getElementById('status-message').textContent, /다른 탭|미리보기/);
});
test('recording retains its target set when another tab switches the active set', async t => {
  const f = await fixture(t);
  const created = await f.command('CREATE_SET', { name: '다른 세트' }); const other = created.state.activeSetId;
  await f.command('SELECT_SET', { setId: 'default' });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  await f.command('SELECT_SET', { setId: other });
  f.d.querySelector('#emoji_area button').click(); await tick();
  assert.equal(f.state.sets.find(set => set.id === 'default').slots[0].emoji.emojiId, sample.emojiId);
  assert.equal(f.state.sets.find(set => set.id === other).slots[0].emoji, null);
});
test('a late save response cannot close or overwrite a newer registration prompt', async t => {
  const f = await fixture(t, {}, { saveDelay: 80 });
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button').click();
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="2"]').click(); await tick(110);
  assert.equal(f.d.getElementById('toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(f.root.getElementById('status').hidden, false);
  assert.match(f.root.getElementById('status-message').textContent, /2번 등록 중/);
  assert.equal(f.state.sets[0].slots[0].emoji.emojiId, sample.emojiId);
  f.d.querySelector('#emoji_area button').click(); await tick(100);
  assert.equal(f.state.sets[0].slots[1].emoji.emojiId, sample.emojiId);
});
