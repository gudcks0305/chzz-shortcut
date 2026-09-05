(() => {
  "use strict";
  if (document.getElementById("chzz-shortcut")) return;
  const C = globalThis.ChzzShortcut;
  const EDITOR = '#aside-chatting pre[contenteditable="true"], #aside-chatting textarea[class*="_input_"]:not([disabled]):not([readonly])';
  let state = null, backupAvailable = false, ready = false, busy = false, recording = null;
  let editor = null, recordingTimer, mountTimer, operation = 0, recordingEpoch = 0;
  const host = document.createElement("span");
  host.id = "chzz-shortcut";
  host.style.cssText = "display:inline-flex;flex-shrink:0;align-self:center";
  const ui = globalThis.ChzzShortcutPanel.create(host, {
    command,
    register: startRecording,
    cancel: () => cancelRecording(),
    focusEditor: () => document.querySelector(EDITOR)?.focus(),
    insert: async emoji => {
      const input = document.querySelector(EDITOR);
      if (!visible(input)) throw new Error("로그인 후 채팅 입력창을 확인하세요.");
      if (busy) throw new Error("이모티콘을 넣는 중입니다. 잠시 후 다시 시도하세요.");
      cancelRecording(); ui.setOpen(false); await insert(emoji, input);
    }
  });
  function acceptState(next, hasBackup = backupAvailable) {
    const clean = C.validateState(next);
    if (state && clean.revision < state.revision) return;
    state = clean; backupAvailable = hasBackup; ready = true;
    ui.render(state, backupAvailable);
  }
  async function command(type, payload = {}) {
    const result = await chrome.runtime.sendMessage({ namespace: "chzz-shortcut", type, ...payload });
    if (!result?.ok) throw new Error(result?.error || "확장 프로그램 연결이 끊겼습니다. 치지직 탭을 새로고침하세요.");
    acceptState(result.state, result.backupAvailable);
    return result;
  }
  function toggleButton(input = editor) {
    return Array.from(input?.parentElement?.querySelectorAll('button[aria-haspopup="true"][aria-expanded]') || [])
      .find(button => /이모티콘|emoticon|emoji/i.test(`${button.getAttribute("aria-label") || ""} ${button.textContent}`));
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
  async function waitFor(find, valid = () => true, options = {}) {
    for (let n = 0; n < (options.timeout ?? 2000) / 50; n++) {
      if (!valid()) throw new Error("작업이 취소됨. 채팅창에서 다시 시도하세요.");
      const result = find(); if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(options.message ?? "이모티콘을 찾지 못함. 해당 팩에서 단축키를 다시 등록하세요.");
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
    recordingEpoch++;
    recording = null; clearTimeout(recordingTimer); ui.hideStatus();
    if (message) ui.notify(message);
  }
  async function startRecording(target) {
    if (!ready || busy) return;
    cancelRecording();
    const input = document.querySelector(EDITOR);
    if (!visible(input)) { ui.notify("로그인 후 채팅 입력창이 활성화된 상태에서 등록하세요."); return; }
    const current = { target, context: contextFor(input), pickerToggle: toggleButton(input) };
    recording = current; ui.setOpen(false);
    const label = target.type === "favorite" ? "즐겨찾기" : `${target.slotId}번`;
    ui.notify(`${label} 등록 중: 이모티콘 팩에서 원하는 이모티콘 클릭. Esc로 취소.`, true);
    recordingTimer = setTimeout(() => cancelRecording("등록 시간이 지나 취소됨. 다시 등록해주세요."), 60000);
    try {
      const picker = await openPicker(input, () => recording === current && !!currentInput(current.context));
      if (recording === current) current.pickerToggle = picker.toggle;
    } catch (error) { if (recording === current) cancelRecording(error.message); }
  }
  function captureEmoji(event) {
    if (!recording || !(event.target instanceof Element)) return;
    const button = event.target.closest('#emoji_area li[id^="emoji_"] button');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const { target, context } = recording;
    if (!currentInput(context)) { cancelRecording("페이지가 바뀌어 등록 취소됨."); return; }
    if (!available(button)) { ui.notify("사용 가능한 이모티콘을 선택하세요. Esc로 취소."); return; }
    const img = button.querySelector("img");
    const match = /^\{:([\w-]+):\}$/.exec(img?.alt || "");
    const pack = document.querySelector('button[id^="emoji_pack_id_"][aria-current="true"]');
    if (!pack) { ui.notify("최근 목록 대신 이모티콘 팩 탭을 먼저 선택하세요. Esc로 취소."); return; }
    const emoji = C.binding({ emojiId: match?.[1], packId: pack.id.slice("emoji_pack_id_".length), imageUrl: img?.src, name: `${pack.textContent.trim()} · ${match?.[1]}` });
    if (!emoji) { ui.notify("이 이모티콘의 정보를 읽지 못함. 다른 이모티콘을 선택하세요."); return; }
    cancelRecording();
    const saveEpoch = recordingEpoch;
    const type = target.type === "favorite" ? "ADD_FAVORITE" : "SET_SLOT";
    const payload = target.type === "favorite" ? { emoji } : { setId: target.setId, slotId: target.slotId, emoji };
    command(type, payload).then(() => {
      if (recordingEpoch !== saveEpoch) return;
      const label = target.type === "favorite" ? "즐겨찾기" : `${target.slotId}번`;
      ui.notify(`${label} 등록됨`);
      const input = currentInput(context);
      if (input) {
        const toggle = toggleButton(input); if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
        currentInput(context)?.focus();
      }
    }).catch(error => { if (recordingEpoch === saveEpoch) ui.notify(`저장 실패: ${error.message}`); });
  }
  async function insert(emoji, input) {
    busy = true;
    const token = ++operation, context = contextFor(input);
    const valid = () => token === operation && !!currentInput(context);
    try {
      const picker = await openPicker(input, valid);
      let button = findEmoji(emoji.emojiId);
      if (!button) {
        // CHZZK mounts #emoji_area before its asynchronous catalog request finishes.
        const target = await waitFor(() => {
          const button = findEmoji(emoji.emojiId);
          if (button) return { button };
          const tab = document.getElementById(`emoji_pack_id_${emoji.packId}`);
          return tab ? { tab } : null;
        }, valid, { timeout: 5000, message: "이모티콘 목록에서 등록한 팩을 찾지 못함. 잠시 후 다시 시도하거나 구독 상태를 확인하세요." });
        button = target.button;
        if (target.tab) {
          // The category carousel handles pointer down/up, not a plain click.
          for (const type of ["mousedown", "mouseup", "click"]) target.tab.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === "mousedown" ? 1 : 0 }));
          button = await waitFor(() => findEmoji(emoji.emojiId), valid);
        }
      }
      if (!valid()) return;
      if (!available(button)) throw new Error("잠겼거나 사용할 수 없는 이모티콘입니다. 구독 상태를 확인하세요.");
      // Use CHZZK's handler: it updates React state and the outgoing draft together.
      button.click();
      if (picker.opened && picker.toggle.isConnected && picker.toggle.getAttribute("aria-expanded") === "true") picker.toggle.click();
      currentInput(context)?.focus();
    } catch (error) { ui.notify(error.message); }
    finally { busy = false; }
  }
  function keydown(event) {
    if (event.composedPath().includes(host)) return;
    if (event.key === "Escape") {
      if (recording) { event.preventDefault(); event.stopImmediatePropagation(); cancelRecording("등록 취소됨"); }
      else ui.hideStatus();
      if (ui.isOpen) { ui.setOpen(false); document.querySelector(EDITOR)?.focus(); }
      if (busy) operation++;
      return;
    }
    const target = event.target instanceof Element ? event.target.closest(EDITOR) : null;
    if (!ready || recording || !state.enabled || !target || !visible(target)) return;
    const set = state.sets.find(set => set.id === state.activeSetId);
    const direction = ["previous", "next"].find(key => C.shortcutMatches(event, state.setShortcuts[key]));
    if (direction) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) {
        const index = state.sets.indexOf(set), step = direction === "next" ? 1 : -1;
        const next = state.sets[(index + step + state.sets.length) % state.sets.length];
        command("SELECT_SET", { setId: next.id }).then(() => ui.notify(`세트: ${next.name}`)).catch(error => ui.notify(error.message));
      }
      return;
    }
    const slot = set.slots.find(slot => slot.emoji && C.shortcutMatches(event, slot.shortcut));
    if (!slot) { if (busy && event.isTrusted) operation++; return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (!busy && !event.repeat) void insert(slot.emoji, target);
  }
  document.addEventListener("click", captureEmoji, true);
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("pointerdown", event => { if (busy && event.isTrusted) operation++; }, true);
  function mount() {
    mountTimer = null;
    const next = document.querySelector(EDITOR);
    if (!next) { host.remove(); editor = null; if (recording) cancelRecording(); return; }
    editor = next;
    if (host.parentElement !== next.parentElement) next.parentElement.append(host);
  }
  // Fast path avoids repeated queries while live chat messages stream in.
  new MutationObserver(() => {
    if (recording?.pickerToggle && (!currentInput(recording.context) || recording.pickerToggle.getAttribute("aria-expanded") !== "true")) cancelRecording();
    if (host.isConnected && editor?.isConnected) return;
    if (!mountTimer) mountTimer = setTimeout(mount, 200);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    try {
      if (changes[C.BACKUP_KEY]) backupAvailable = !!changes[C.BACKUP_KEY].newValue;
      if (changes[C.STATE_KEY]?.newValue) acceptState(changes[C.STATE_KEY].newValue);
      else if (changes[C.BACKUP_KEY] && state) ui.render(state, backupAvailable);
    } catch (error) { ready = false; ui.notify(`설정을 읽지 못함: ${error.message}`); }
  });
  mount();
  command("GET_STATE").catch(error => ui.notify(`설정을 불러오지 못함: ${error.message}`));
})();
