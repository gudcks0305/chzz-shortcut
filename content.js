(() => {
  "use strict";
  if (document.getElementById("chzz-shortcut")) return;
  const C = globalThis.ChzzShortcut;
  const EDITOR = '#aside-chatting pre[contenteditable="true"], #aside-chatting textarea[class*="_input_"]:not([disabled]):not([readonly])';
  let settings = C.preferences(), slots = {}, ready = false, busy = false, recording = null;
  let editor = null, recordingTimer, toastTimer, mountTimer, operation = 0;
  const host = document.createElement("span");
  host.id = "chzz-shortcut";
  host.style.cssText = "display:inline-flex;flex-shrink:0;align-self:center";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { color-scheme:dark; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#edf4ef; }
      * { box-sizing:border-box; } [hidden] { display:none!important; }
      button,select { font:inherit; color:inherit; } button { cursor:pointer; }
      button { border:1px solid #36443c; background:#252e28; border-radius:8px; padding:6px 9px; }
      button:hover { background:#35453b; } button:focus-visible,select:focus-visible { outline:2px solid #00e7a1; outline-offset:2px; }
      button:disabled { opacity:.5; cursor:wait; }
      #launcher { margin:0 6px; padding:3px 7px; color:#00e7a1; background:transparent; font-size:19px; }
      #panel { position:fixed; z-index:2147483646; right:18px; bottom:104px; width:min(370px,calc(100vw - 24px)); max-height:calc(100vh - 130px); overflow:auto; background:#171d19; border:1px solid #3b5143; border-radius:16px; padding:18px; box-shadow:0 16px 60px #0009; }
      header { display:flex; align-items:center; justify-content:space-between; } h2 { margin:0; font-size:18px; }
      p { margin:10px 0 14px; color:#aabbb0; font-size:12px; } #close { border:0; background:none; font-size:20px; }
      .preferences { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:14px; }
      label { display:flex; gap:6px; align-items:center; } input { accent-color:#00e7a1; } select { background:#252e28; border:1px solid #36443c; border-radius:6px; padding:5px; }
      .slot { display:flex; align-items:center; gap:8px; padding:8px 0; border-top:1px solid #2e3a32; }
      kbd { flex-shrink:0; width:25px; height:27px; display:grid; place-items:center; background:#2b3930; border:1px solid #49624f; border-radius:6px; color:#83f3bd; }
      img { width:32px; height:32px; object-fit:contain; } .empty { width:32px; text-align:center; color:#53685b; }
      .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
      .remove { color:#a6b6ad; background:transparent; border:0; padding:6px; }
      #status { position:fixed; z-index:2147483647; right:18px; bottom:65px; max-width:min(390px,calc(100vw - 36px)); background:#233b2c; border:1px solid #5c916c; border-radius:10px; padding:11px 14px; box-shadow:0 6px 24px #0006; }
    </style>
    <button id="launcher" type="button" title="이모티콘 단축키 설정" aria-label="이모티콘 단축키 설정" aria-expanded="false">⌨</button>
    <section id="panel" role="dialog" aria-label="이모티콘 단축키 설정" hidden>
      <header><h2>이모티콘 단축키</h2><button id="close" type="button" aria-label="설정 닫기">×</button></header>
      <p>슬롯 등록 → 이모티콘 팩 선택 → 이모티콘 클릭.<br>채팅창에서 숫자키 조합으로 삽입하고, Enter로 전송하세요.</p>
      <div class="preferences"><label><input id="enabled" type="checkbox">사용</label><label>조합 <select id="modifier"><option value="alt">Alt / Option</option><option value="altShift">Alt / Option + Shift</option></select></label></div>
      <div id="slots"></div>
      <p>1~9 키 및 숫자패드 지원 · 현재 브라우저에 저장<br>등록은 최근 목록 대신 해당 이모티콘 팩에서 해주세요.</p>
    </section>
    <div id="status" role="status" aria-live="polite" hidden></div>`;
  const $ = id => root.getElementById(id);
  const storage = chrome.storage.local;

  function notify(message, persistent = false) {
    clearTimeout(toastTimer);
    $("status").textContent = message;
    $("status").hidden = false;
    if (!persistent) toastTimer = setTimeout(() => { $("status").hidden = true; }, 4500);
  }
  function panel(open) {
    $("panel").hidden = !open;
    $("launcher").setAttribute("aria-expanded", String(open));
    if (open) { render(); $("close").focus(); }
  }
  function render() {
    $("enabled").checked = settings.enabled;
    $("modifier").value = settings.modifier;
    $("slots").replaceChildren();
    for (let n = 1; n <= 9; n++) {
      const entry = slots[n], row = document.createElement("div");
      row.className = "slot";
      const key = document.createElement("kbd"); key.textContent = n;
      const preview = document.createElement(entry?.imageUrl ? "img" : "span");
      if (entry?.imageUrl) { preview.src = entry.imageUrl; preview.alt = ""; preview.referrerPolicy = "no-referrer"; }
      else { preview.className = "empty"; preview.textContent = "·"; }
      const name = document.createElement("span"); name.className = "name";
      name.textContent = entry?.name || "비어 있음"; name.title = entry?.emojiId || "";
      const assign = document.createElement("button"); assign.type = "button";
      assign.textContent = entry ? "변경" : "등록"; assign.dataset.slot = n;
      assign.setAttribute("aria-label", `${n}번 ${entry ? "변경" : "등록"}`);
      assign.disabled = !ready;
      assign.addEventListener("click", () => startRecording(n));
      row.append(key, preview, name, assign);
      if (entry) {
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove";
        remove.textContent = "×"; remove.setAttribute("aria-label", `${n}번 삭제`);
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try { await storage.remove(C.slotKey(n)); delete slots[n]; render(); notify(`${n}번 단축키 삭제됨`); }
          catch { notify("저장 실패. 확장 프로그램을 새로고침한 뒤 다시 시도하세요."); remove.disabled = false; }
        });
        row.append(remove);
      }
      $("slots").append(row);
    }
  }
  function toggleButton(input = editor) {
    return Array.from(input?.parentElement?.querySelectorAll('button[aria-haspopup="true"][aria-expanded]') || [])
      .find(b => /이모티콘|emoticon|emoji/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent}`));
  }
  function visible(element) { return !!element && element.getClientRects().length > 0; }
  function contextFor(input) { return { container: input.parentElement, url: location.href }; }
  function currentInput(context) {
    if (context.url !== location.href || !context.container.isConnected) return null;
    return context.container.querySelector(EDITOR);
  }
  function available(button) {
    return visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true"
      && !button.querySelector('[class*="lock"]') && !button.closest('[class*="is_locked"]');
  }
  function findEmoji(emojiId) {
    return Array.from(document.querySelectorAll('#emoji_area li[id^="emoji_"] button img'))
      .find(img => img.alt === `{:${emojiId}:}`)?.closest("button");
  }
  async function waitFor(find, valid = () => true) {
    for (let n = 0; n < 40; n++) {
      if (!valid()) throw new Error("작업이 취소됨. 채팅창에서 다시 시도하세요.");
      const result = find(); if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("이모티콘을 찾지 못함. 해당 팩에서 단축키를 다시 등록하세요.");
  }
  async function openPicker(input, valid) {
    const toggle = toggleButton(input);
    if (!toggle || toggle.disabled) throw new Error("이모티콘 버튼을 찾지 못함. 로그인과 채팅 가능 상태를 확인하세요.");
    const opened = toggle.getAttribute("aria-expanded") !== "true";
    if (opened) toggle.click();
    await waitFor(() => visible(document.getElementById("emoji_area")), valid);
    return { toggle, opened };
  }
  function cancelRecording(message) {
    recording = null; clearTimeout(recordingTimer);
    if (message) notify(message);
  }
  async function startRecording(n) {
    if (!ready || busy) return;
    cancelRecording();
    const input = document.querySelector(EDITOR);
    if (!visible(input)) { notify("로그인 후 채팅 입력창이 활성화된 상태에서 등록하세요."); return; }
    const current = { slot: n, context: contextFor(input) };
    recording = current;
    panel(false);
    notify(`${n}번 등록 중: 이모티콘 팩에서 원하는 이모티콘 클릭. Esc로 취소.`, true);
    recordingTimer = setTimeout(() => cancelRecording("등록 시간이 지나 취소됨. 다시 등록해주세요."), 60000);
    try { await openPicker(input, () => recording === current && !!currentInput(current.context)); }
    catch (error) { if (recording === current) cancelRecording(error.message); }
  }
  function captureEmoji(event) {
    if (!recording || !(event.target instanceof Element)) return;
    const button = event.target.closest('#emoji_area li[id^="emoji_"] button');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const { slot, context } = recording;
    if (!currentInput(context)) { cancelRecording("페이지가 바뀌어 등록 취소됨."); return; }
    if (!available(button)) { notify("사용 가능한 이모티콘을 선택하세요. Esc로 취소.", true); return; }
    const img = button.querySelector("img");
    const match = /^\{:([\w-]+):\}$/.exec(img?.alt || "");
    const pack = document.querySelector('button[id^="emoji_pack_id_"][aria-current="true"]');
    if (!pack) { notify("최근 목록 대신 이모티콘 팩 탭을 먼저 선택하세요. Esc로 취소.", true); return; }
    const entry = C.binding({ emojiId: match?.[1], packId: pack.id.slice("emoji_pack_id_".length), imageUrl: img?.src, name: `${pack.textContent.trim()} · ${match?.[1]}` });
    if (!entry) { notify("이 이모티콘의 정보를 읽지 못함. 다른 이모티콘을 선택하세요.", true); return; }
    cancelRecording();
    storage.set({ [C.slotKey(slot)]: entry }).then(() => {
      slots[slot] = entry; render();
      notify(`${slot}번 등록됨. 채팅창에서 ${settings.modifier === "altShift" ? "Alt/Option+Shift" : "Alt/Option"}+${slot}`);
      const input = currentInput(context);
      if (input) {
        const toggle = toggleButton(input); if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
        currentInput(context)?.focus();
      }
    }).catch(() => notify("저장 실패. 페이지를 새로고침한 뒤 다시 등록하세요."));
  }
  async function insert(entry, input) {
    busy = true;
    const token = ++operation, context = contextFor(input);
    const valid = () => token === operation && !!currentInput(context);
    let picker;
    try {
      picker = await openPicker(input, valid);
      let button = findEmoji(entry.emojiId);
      if (!button) {
        const tab = document.getElementById(`emoji_pack_id_${entry.packId}`);
        if (!tab) throw new Error("현재 사용할 수 없는 이모티콘 팩입니다. 구독 상태를 확인하거나 다시 등록하세요.");
        // The category carousel handles pointer down/up, not a plain click.
        for (const type of ["mousedown", "mouseup", "click"]) tab.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === "mousedown" ? 1 : 0 }));
        button = await waitFor(() => findEmoji(entry.emojiId), valid);
      }
      if (!valid()) return;
      if (!available(button)) throw new Error("잠겼거나 사용할 수 없는 이모티콘입니다. 구독 상태를 확인하세요.");
      // Use CHZZK's handler: it updates React state and the outgoing draft together.
      button.click();
      if (picker.opened && picker.toggle.isConnected && picker.toggle.getAttribute("aria-expanded") === "true") picker.toggle.click();
      currentInput(context)?.focus();
    } catch (error) { notify(error.message); }
    finally { busy = false; }
  }
  function keydown(event) {
    if (event.key === "Escape") {
      if (recording) { event.preventDefault(); event.stopImmediatePropagation(); cancelRecording("등록 취소됨"); }
      if (!$("panel").hidden) { panel(false); $("launcher").focus(); }
      return;
    }
    const n = C.shortcutSlot(event, settings);
    const target = event.target instanceof Element ? event.target.closest(EDITOR) : null;
    if (!ready || recording || !n || !target || !visible(target) || !slots[n]) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!busy && !event.repeat) void insert(slots[n], target);
  }
  $("launcher").addEventListener("click", () => { cancelRecording(); panel($("panel").hidden); });
  $("close").addEventListener("click", () => { panel(false); $("launcher").focus(); });
  async function savePreferences() {
    const next = C.preferences({ enabled: $("enabled").checked, modifier: $("modifier").value });
    try { await storage.set({ [C.preferencesKey]: next }); settings = next; notify("설정 저장됨"); }
    catch { render(); notify("설정 저장 실패. 페이지를 새로고침하세요."); }
  }
  $("enabled").addEventListener("change", savePreferences);
  $("modifier").addEventListener("change", savePreferences);
  document.addEventListener("click", captureEmoji, true);
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("pointerdown", event => { if (busy && event.isTrusted) operation++; }, true);
  window.addEventListener("keydown", event => { if (busy && event.isTrusted && !C.shortcutSlot(event, settings)) operation++; }, true);

  function mount() {
    mountTimer = null;
    const next = document.querySelector(EDITOR);
    if (!next) { host.remove(); editor = null; if (recording) cancelRecording(); return; }
    editor = next;
    if (host.parentElement !== next.parentElement) next.parentElement.append(host);
  }
  // Fast path avoids repeated queries while live chat messages stream in.
  new MutationObserver(() => {
    if (host.isConnected && editor?.isConnected) return;
    if (!mountTimer) mountTimer = setTimeout(mount, 200);
  }).observe(document.body, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[C.preferencesKey]) settings = C.preferences(changes[C.preferencesKey].newValue);
    for (let n = 1; n <= 9; n++) if (changes[C.slotKey(n)]) slots[n] = C.binding(changes[C.slotKey(n)].newValue);
    if (!$("panel").hidden) render();
  });
  storage.get([C.preferencesKey, ...Array.from({ length: 9 }, (_, i) => C.slotKey(i + 1))]).then(data => {
    settings = C.preferences(data[C.preferencesKey]);
    for (let n = 1; n <= 9; n++) slots[n] = C.binding(data[C.slotKey(n)]);
    ready = true; render();
  }).catch(() => notify("설정을 불러오지 못함. 확장 프로그램과 페이지를 새로고침하세요."));
  mount();
})();
