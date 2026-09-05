const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('core.js', 'utf8') + '\n' + fs.readFileSync('content.js', 'utf8');
const sample = { emojiId: 'smile-123', packId: 'basic', name: '웃음', imageUrl: 'https://ssl.pstatic.net/emoji.png' };
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, initial = {}, options = {}) {
  const dom = new JSDOM('<body><input id="search"><div id="aside-chatting"><div id="composer"><pre contenteditable="true"></pre><button id="toggle" aria-haspopup="true" aria-expanded="false">이모티콘</button></div><button id="send">채팅</button></div></body>', { url: 'https://chzzk.naver.com/live/test', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, data = structuredClone(initial), listeners = [];
  let inserted = 0, sent = 0, writes = 0;
  w.HTMLElement.prototype.getClientRects = function () { return this.isConnected && !this.hidden ? [{}] : []; };
  Object.defineProperty(w.HTMLElement.prototype, 'contentEditable', { get() { return this.getAttribute('contenteditable'); } });
  w.chrome = { storage: { local: {
    async get() { return structuredClone(data); },
    async set(values) {
      if (options.failSave) throw Error('quota');
      writes++;
      const changes = {};
      for (const [key, value] of Object.entries(values)) { changes[key] = { newValue: value }; data[key] = value; }
      listeners.forEach(fn => fn(changes, 'local'));
    },
    async remove(key) { delete data[key]; listeners.forEach(fn => fn({ [key]: {} }, 'local')); }
  }, onChanged: { addListener(fn) { listeners.push(fn); } } } };
  let editor = d.querySelector('pre');
  if (options.idleTextarea) {
    const textarea = d.createElement('textarea'); textarea.className = '_input_19u4u_59';
    editor.replaceWith(textarea); editor = textarea;
  }
  function renderEmoji(id = sample.emojiId) {
    d.getElementById('emoji_area').innerHTML = `<li id="emoji_${id}"><button type="button">${options.locked ? '<i class="_lock_abc"></i>' : ''}<img alt="{:${id}:}" src="${sample.imageUrl}"></button></li>`;
    d.querySelector('#emoji_area button').onclick = () => { inserted++; editor.append(d.createElement('img')); };
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
    picker.innerHTML = `<button id="emoji_pack_id_basic" aria-current="${!options.recent}">기본</button><div id="emoji_area"></div>`;
    d.body.append(picker); renderEmoji(options.otherPack ? 'other' : sample.emojiId);
    let held = false;
    d.getElementById('emoji_pack_id_basic').addEventListener('mousedown', event => { held = event.buttons === 1; });
    d.getElementById('emoji_pack_id_basic').addEventListener('mouseup', () => {
      if (!held) return;
      held = false;
      d.getElementById('emoji_pack_id_basic').setAttribute('aria-current', 'true');
      w.setTimeout(() => renderEmoji(), options.renderDelay || 0);
    });
  };
  d.getElementById('send').onclick = () => { sent++; };
  w.eval(source); await tick();
  const root = d.getElementById('chzz-shortcut').shadowRoot;
  const key = (props = {}, target = editor) => {
    const event = new w.KeyboardEvent('keydown', { key: '¡', code: 'Digit1', altKey: true, bubbles: true, cancelable: true, ...props });
    target.dispatchEvent(event); return event;
  };
  return { w, d, root, get editor() { return editor; }, data, key, get inserted() { return inserted; }, get sent() { return sent; }, get writes() { return writes; } };
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
  await f.w.chrome.storage.local.set({ 'chzzShortcut.preferences': { enabled: false } });
  assert.equal(f.key().defaultPrevented, false);
});
test('registration consumes native click, saves selected pack, and never inserts', async t => {
  const f = await fixture(t);
  f.root.getElementById('launcher').click(); f.root.querySelector('[data-slot="1"]').click(); await tick();
  f.d.querySelector('#emoji_area button img').click(); await tick();
  assert.equal(f.data['chzzShortcut.slot.1'].emojiId, sample.emojiId);
  assert.equal(f.data['chzzShortcut.slot.1'].packId, sample.packId);
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
  assert.equal(f.data['chzzShortcut.slot.1'], undefined);
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
  assert.equal(f.data['chzzShortcut.slot.1'].emojiId, sample.emojiId);
  assert.equal(f.d.activeElement, f.editor);
  f.key(); await tick(80); assert.equal(f.inserted, 1); assert.equal(f.sent, 0);
});
