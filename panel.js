(() => {
  "use strict";
  const C = globalThis.ChzzShortcut;
  function create(host, callbacks) {
    const root = host.attachShadow({ mode: "open" });
    let state = null, backupAvailable = false, capture = null, captureBusy = false, toastTimer;
    let pendingImport = null, deleteSetId = null;
    root.innerHTML = `
      <style>
        :host{color-scheme:dark;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#edf4ef}
        *{box-sizing:border-box}[hidden]{display:none!important}button,input,select{font:inherit;color:inherit}
        button{cursor:pointer;border:1px solid #36483d;background:#25332a;border-radius:8px;padding:6px 9px;white-space:nowrap}
        button:hover{background:#364d3e}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #00e7a1;outline-offset:2px}
        input,select{background:#202a23;border:1px solid #3a4e41;border-radius:7px;padding:7px;min-width:0}input[type=checkbox]{accent-color:#00e7a1}
        #launcher{margin:0 6px;padding:3px 7px;color:#00e7a1;background:transparent;font-size:19px}
        #panel{position:fixed;z-index:2147483646;right:16px;bottom:96px;width:min(460px,calc(100vw - 24px));max-height:calc(100vh - 120px);overflow:auto;background:#161e19;border:1px solid #415d49;border-radius:16px;padding:18px;box-shadow:0 16px 60px #0009}
        header,.line,.slot,.favorite{display:flex;align-items:center;gap:8px}header{justify-content:space-between}h2{font-size:18px;margin:0}h3{font-size:14px;margin:14px 0 8px}
        p,.hint{color:#a6bbae;font-size:12px;margin:8px 0 12px}label{display:flex;align-items:center;gap:5px}fieldset{border:0;padding:0;margin:0;min-width:0}
        #close,.quiet{border:0;background:transparent}#close{font-size:22px}#set-select{flex:1}.line{margin:9px 0;flex-wrap:wrap}.grow{flex:1;min-width:90px}
        nav{display:flex;gap:6px;margin:16px 0 12px;border-bottom:1px solid #314638;padding-bottom:10px}nav button{flex:1;background:transparent}nav [aria-selected=true]{background:#254b34;border-color:#53a474;color:#a4ffd0}
        .slot,.favorite{padding:10px 0;border-top:1px solid #2b3d31}.slot{flex-wrap:wrap}.slot-number{color:#7cac8c;width:14px;font-size:11px}.shortcut{min-width:80px;max-width:180px;overflow:hidden;text-overflow:ellipsis;color:#98eebb;font-size:11px}
        img{width:32px;height:32px;object-fit:contain}.empty{width:32px;text-align:center;color:#657d6c}.name{flex:1;min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.remove{color:#9bb1a3;background:transparent;border:0;padding:5px}
        #favorites-search{width:100%}.favorite{flex-wrap:wrap}.favorite .actions{display:flex;gap:4px;margin-left:auto}.favorite .actions button{font-size:11px;padding:5px 7px}.count{color:#7bac8c;font-size:11px}
        #key-capture,#import-preview,#delete-confirm{border:1px solid #638d6e;background:#233c2b;padding:12px;border-radius:10px;margin:10px 0}
        #key-error{color:#ffc09f;margin:8px 0;white-space:pre-wrap}.danger{border-color:#8e6455;color:#ffcab6}#import-summary{white-space:pre-wrap;max-height:180px;overflow:auto}.backup-actions{display:flex;gap:8px;flex-wrap:wrap}
        #status{position:fixed;z-index:2147483647;right:16px;bottom:58px;max-width:min(440px,calc(100vw - 32px));background:#233b2c;border:1px solid #648f70;border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px #0006;display:flex;align-items:center;gap:10px}
        #dismiss-status{flex-shrink:0;border:0;background:transparent;padding:2px 5px;font-size:18px}
      </style>
      <button id="launcher" type="button" title="이모티콘 단축키 설정" aria-label="이모티콘 단축키 설정" aria-expanded="false">⌨</button>
      <section id="panel" role="dialog" aria-label="이모티콘 단축키 설정" hidden>
        <header><h2>이모티콘 단축키</h2><button id="close" type="button" aria-label="설정 닫기">×</button></header>
        <p>자주 쓰는 이모티콘을 모으고, 원하는 키에 연결하세요.</p>
        <fieldset id="controls" disabled>
          <div class="line"><label for="set-select">세트</label><select id="set-select" aria-label="활성 단축키 세트"></select><label><input id="enabled" type="checkbox">사용</label></div>
          <nav role="tablist" aria-label="설정 종류"><button type="button" role="tab" data-view="shortcuts" aria-selected="true">단축키</button><button type="button" role="tab" data-view="favorites" aria-selected="false">즐겨찾기</button><button type="button" role="tab" data-view="backup" aria-selected="false">백업·세트 관리</button></nav>
          <section id="view-shortcuts">
            <p>키 버튼을 눌러 조합 변경 · 등록/변경을 눌러 이모티콘 선택<br>채팅 입력창에서 동작하며, 패널은 닫아둬도 됩니다.</p>
            <div id="slots"></div>
            <h3>세트 전환 단축키</h3><div class="line"><button type="button" id="previous-key"></button><button type="button" id="next-key"></button></div>
            <p>Mac의 Option은 Alt. 브라우저·다른 확장이 사용하는 조합은 먼저 가져갈 수 있습니다. Enter·Esc·Tab과 일반 문자 단독 입력은 지정할 수 없습니다.</p>
          </section>
          <section id="view-favorites" hidden>
            <div class="line"><button type="button" id="add-favorite">+ 이모티콘 추가</button><span id="favorite-count" class="count"></span></div>
            <input id="favorites-search" type="search" aria-label="즐겨찾기 검색" placeholder="이름 또는 이모티콘 ID 검색">
            <div class="line"><label for="favorite-slot">배치할 슬롯</label><select id="favorite-slot"></select><span class="hint">현재 세트에 배치</span></div>
            <div id="favorites"></div><p>즐겨찾기를 해제해도 이미 배치한 단축키는 유지됩니다.</p>
          </section>
          <section id="view-backup" hidden>
            <h3>세트 관리</h3>
            <div class="line"><input id="set-name" class="grow" aria-label="현재 세트 이름" maxlength="40"><button type="button" id="rename-set">이름 변경</button></div>
            <div class="line"><input id="new-set-name" class="grow" aria-label="새 세트 이름" placeholder="새 세트 이름" maxlength="40"><button type="button" id="create-set">만들기</button></div>
            <div class="line"><button type="button" id="copy-set">현재 세트 복제</button><button type="button" id="delete-set" class="danger">현재 세트 삭제</button><span id="set-count" class="count"></span></div>
            <div id="delete-confirm" hidden><p id="delete-text"></p><button type="button" id="confirm-delete" class="danger">이 세트 삭제</button> <button type="button" id="cancel-delete">취소</button></div>
            <h3>JSON 백업</h3><p>모든 세트·키 조합·즐겨찾기를 한 파일로 보관합니다.</p>
            <div class="backup-actions"><button type="button" id="export-state">내보내기</button><button type="button" id="choose-import">가져오기</button><button type="button" id="restore-backup" disabled>이전 백업 복원</button></div>
            <input id="import-file" type="file" accept=".json,application/json" hidden>
            <div id="import-preview" hidden><strong>가져올 내용 확인</strong><p id="import-summary"></p><label>적용 방식 <select id="import-mode"><option value="merge">기존 내용에 병합</option><option value="replace">전체 교체</option></select></label><p>병합은 세트를 추가합니다. 교체는 파일의 내용으로 바꿉니다. 적용 직전 상태는 자동 백업됩니다.</p><button type="button" id="apply-import">가져오기 적용</button> <button type="button" id="cancel-import">취소</button></div>
            <p>최대 9개 세트 · 세트당 9개 슬롯 · 즐겨찾기 200개<br>이 확장의 JSON 형식만 지원합니다. 다른 확장 백업 파일은 지원하지 않습니다.</p>
          </section>
        </fieldset>
        <section id="key-capture" hidden><strong id="key-title"></strong><p>원하는 키 조합을 지금 누르세요. Esc로 취소합니다.</p><div id="key-error" role="alert"></div><button type="button" id="clear-key">단축키 해제</button> <button type="button" id="cancel-key">취소</button></section>
      </section>
      <div id="status" hidden><span id="status-message" role="status" aria-live="polite"></span><button id="dismiss-status" type="button" aria-label="안내 닫기 및 등록 취소">×</button></div>`;
    const $ = id => root.getElementById(id);
    const active = () => state?.sets.find(set => set.id === state.activeSetId);
    function hideStatus() { clearTimeout(toastTimer); $("status").hidden = true; }
    function notify(message, persistent = false) {
      clearTimeout(toastTimer); $("status-message").textContent = message; $("status").hidden = false;
      if (!persistent) toastTimer = setTimeout(hideStatus, 4500);
    }
    function setOpen(open) {
      $("panel").hidden = !open; $("launcher").setAttribute("aria-expanded", String(open));
      if (open) { render(state, backupAvailable); $("close").focus(); }
      else cancelCapture();
    }
    function button(text, label, action, className = "") {
      const node = document.createElement("button"); node.type = "button"; node.textContent = text;
      node.setAttribute("aria-label", label); node.className = className;
      node.addEventListener("click", async () => {
        node.disabled = true;
        try { await action(); } catch (error) { notify(error.message); }
        finally { if (node.isConnected) node.disabled = false; }
      });
      return node;
    }
    function preview(emoji) {
      const el = document.createElement(emoji?.imageUrl ? "img" : "span");
      if (emoji?.imageUrl) { el.src = emoji.imageUrl; el.alt = ""; el.referrerPolicy = "no-referrer"; }
      else { el.className = "empty"; el.textContent = "·"; }
      return el;
    }
    function title(emoji) {
      const el = document.createElement("span"); el.className = "name";
      el.textContent = emoji?.name || "비어 있음"; el.title = emoji?.emojiId || ""; return el;
    }
    function render(next, hasBackup = backupAvailable) {
      state = next; backupAvailable = hasBackup; $("controls").disabled = !state;
      if (!state) return;
      const set = active();
      $("enabled").checked = state.enabled;
      $("set-select").replaceChildren(...state.sets.map(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; return o; }));
      $("set-select").value = set.id;
      $("launcher").title = `이모티콘 단축키 · ${set.name}`;
      if (root.activeElement !== $("set-name")) $("set-name").value = set.name;
      $("set-count").textContent = `${state.sets.length}/9개 세트`;
      $("create-set").disabled = $("copy-set").disabled = state.sets.length >= 9;
      $("delete-set").disabled = state.sets.length === 1;
      $("restore-backup").disabled = !backupAvailable;
      $("slots").replaceChildren();
      for (const slot of set.slots) {
        const row = document.createElement("div"); row.className = "slot";
        const number = document.createElement("span"); number.className = "slot-number"; number.textContent = slot.id;
        const key = button(C.shortcutLabel(slot.shortcut), `${slot.id}번 단축키 변경`, () => startCapture({ setId: set.id, slotId: slot.id }), "shortcut");
        key.dataset.keySlot = slot.id;
        const assign = button(slot.emoji ? "변경" : "등록", `${slot.id}번 ${slot.emoji ? "변경" : "등록"}`, () => callbacks.register({ type: "slot", setId: set.id, slotId: slot.id }));
        assign.dataset.slot = slot.id;
        row.append(number, key, preview(slot.emoji), title(slot.emoji), assign);
        if (slot.emoji) row.append(button("×", `${slot.id}번 삭제`, () => callbacks.command("SET_SLOT", { setId: set.id, slotId: slot.id, emoji: null }), "remove"));
        $("slots").append(row);
      }
      $("previous-key").textContent = `이전: ${C.shortcutLabel(state.setShortcuts.previous)}`;
      $("next-key").textContent = `다음: ${C.shortcutLabel(state.setShortcuts.next)}`;
      renderFavorites();
    }
    function renderFavorites() {
      if (!state) return;
      const query = $("favorites-search").value.trim().toLocaleLowerCase();
      $("favorite-count").textContent = `${state.favorites.length}/200개`;
      $("favorites").replaceChildren();
      state.favorites.forEach((emoji, index) => {
        if (query && !`${emoji.name} ${emoji.emojiId}`.toLocaleLowerCase().includes(query)) return;
        const row = document.createElement("div"); row.className = "favorite";
        const actions = document.createElement("div"); actions.className = "actions";
        actions.append(button("사용", `${emoji.name} 삽입`, () => callbacks.insert(emoji)));
        actions.append(button("슬롯에 넣기", `${emoji.name} 슬롯에 넣기`, () => callbacks.command("SET_SLOT", { setId: active().id, slotId: $("favorite-slot").value, emoji })));
        for (const [direction, label] of [["up", "↑"], ["down", "↓"]]) {
          const move = button(label, `${emoji.name} ${direction === "up" ? "위로" : "아래로"}`, () => callbacks.command("REORDER_FAVORITE", { emojiId: emoji.emojiId, packId: emoji.packId, direction }));
          move.disabled = direction === "up" ? index === 0 : index === state.favorites.length - 1; actions.append(move);
        }
        actions.append(button("★", `${emoji.name} 즐겨찾기 해제`, () => callbacks.command("REMOVE_FAVORITE", { emojiId: emoji.emojiId, packId: emoji.packId })));
        row.append(preview(emoji), title(emoji), actions); $("favorites").append(row);
      });
      if (!$("favorites").childElementCount) { const p = document.createElement("p"); p.textContent = query ? "검색 결과 없음" : "이모티콘을 등록하면 즐겨찾기에도 추가됩니다."; $("favorites").append(p); }
    }
    function cancelCapture() { capture = null; $("key-capture").hidden = true; }
    function startCapture(target) {
      callbacks.cancel(); capture = target; $("key-error").textContent = "";
      $("key-title").textContent = target.direction ? `${target.direction === "previous" ? "이전" : "다음"} 세트 전환키` : `${target.slotId}번 단축키 지정`;
      $("key-capture").hidden = false; $("cancel-key").focus();
      $("key-capture").scrollIntoView?.({ block: "nearest" });
    }
    async function saveKey(shortcut) {
      if (!capture || captureBusy) return;
      const target = capture; captureBusy = true;
      try {
        await callbacks.command(target.direction ? "SET_CYCLE_SHORTCUT" : "SET_SHORTCUT", { ...target, shortcut });
        if (capture === target) cancelCapture(); notify("단축키 저장됨");
      } catch (error) { $("key-error").textContent = error.message; }
      finally { captureBusy = false; }
    }
    root.addEventListener("keydown", event => {
      if (capture) {
        event.stopPropagation();
        if (event.isComposing || event.keyCode === 229) return;
        const shortcut = C.shortcutFromEvent(event);
        event.preventDefault();
        if (event.key === "Escape") { cancelCapture(); return; }
        if (event.repeat || /^(Alt|Control|Shift|Meta)/.test(event.code)) return;
        if (!shortcut) { $("key-error").textContent = "Ctrl/Alt/Command 조합 또는 F1~F12를 사용하세요. 이 키는 지정할 수 없습니다."; return; }
        void saveKey(shortcut);
      } else if (event.key === "Escape") { event.preventDefault(); callbacks.cancel(); setOpen(false); callbacks.focusEditor(); }
    }, true);
    function on(id, action) {
      $(id).addEventListener("click", async () => {
        const node = $(id); node.disabled = true;
        try { await action(); } catch (error) { notify(error.message); }
        finally { node.disabled = false; if (state) render(state, backupAvailable); }
      });
    }
    $("launcher").addEventListener("click", () => { callbacks.cancel(); setOpen($("panel").hidden); });
    $("close").addEventListener("click", () => { callbacks.cancel(); setOpen(false); callbacks.focusEditor(); });
    $("dismiss-status").addEventListener("click", () => { callbacks.cancel(); hideStatus(); callbacks.focusEditor(); });
    $("enabled").addEventListener("change", async () => {
      try { await callbacks.command("UPDATE_SETTINGS", { enabled: $("enabled").checked }); }
      catch (error) { render(state, backupAvailable); notify(error.message); }
    });
    $("set-select").addEventListener("change", async () => {
      try { callbacks.cancel(); await callbacks.command("SELECT_SET", { setId: $("set-select").value }); }
      catch (error) { render(state, backupAvailable); notify(error.message); }
    });
    for (const tab of root.querySelectorAll("[data-view]")) tab.addEventListener("click", () => {
      for (const other of root.querySelectorAll("[data-view]")) { const selected = other === tab; other.setAttribute("aria-selected", String(selected)); $("view-" + other.dataset.view).hidden = !selected; }
      cancelCapture();
    });
    for (let n = 1; n <= 9; n++) { const option = document.createElement("option"); option.value = String(n); option.textContent = `${n}번`; $("favorite-slot").append(option); }
    $("favorites-search").addEventListener("input", renderFavorites);
    on("add-favorite", () => callbacks.register({ type: "favorite" }));
    on("previous-key", () => startCapture({ direction: "previous" }));
    on("next-key", () => startCapture({ direction: "next" }));
    on("clear-key", () => saveKey(null));
    on("cancel-key", cancelCapture);
    on("rename-set", () => callbacks.command("RENAME_SET", { setId: active().id, name: $("set-name").value }));
    on("create-set", async () => { await callbacks.command("CREATE_SET", { name: $("new-set-name").value }); $("new-set-name").value = ""; });
    on("copy-set", () => callbacks.command("CREATE_SET", { name: `${active().name.slice(0, 36)} 복사`, copyFromId: active().id }));
    on("delete-set", () => { deleteSetId = active().id; $("delete-text").textContent = `‘${active().name}’ 세트와 이 세트의 슬롯을 삭제합니다. 즐겨찾기는 유지됩니다.`; $("delete-confirm").hidden = false; });
    on("cancel-delete", () => { deleteSetId = null; $("delete-confirm").hidden = true; });
    on("confirm-delete", async () => { await callbacks.command("DELETE_SET", { setId: deleteSetId }); deleteSetId = null; $("delete-confirm").hidden = true; });
    on("export-state", () => {
      const url = URL.createObjectURL(new Blob([C.exportState(state)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `chzz-shortcut-${new Date().toISOString().slice(0, 10)}.json`;
      root.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify("JSON 백업 다운로드를 요청했음");
    });
    on("choose-import", () => { $("import-file").value = ""; $("import-file").click(); });
    $("import-file").addEventListener("change", async () => {
      const file = $("import-file").files?.[0]; if (!file) return;
      pendingImport = null; $("import-preview").hidden = true;
      try {
        if (file.size > 512 * 1024) throw new Error("512KB 이하의 JSON 파일을 선택하세요.");
        const data = C.parseImportText(await file.text());
        pendingImport = { state: data, expectedRevision: state.revision };
        const count = data.sets.reduce((n, set) => n + set.slots.filter(slot => slot.emoji).length, 0);
        $("import-summary").textContent = `${data.sets.length}개 세트 · ${count}개 이모티콘 슬롯 · 즐겨찾기 ${data.favorites.length}개\n${data.sets.map(set => `• ${set.name}`).join("\n")}`;
        $("import-mode").value = "merge"; $("import-preview").hidden = false;
      } catch (error) { notify(error.message); }
    });
    on("cancel-import", () => { pendingImport = null; $("import-preview").hidden = true; });
    on("apply-import", async () => {
      if (!pendingImport) return;
      await callbacks.command("IMPORT_STATE", { ...pendingImport, mode: $("import-mode").value });
      pendingImport = null; $("import-preview").hidden = true; notify("가져오기 완료. 이전 상태는 백업에 보관됨");
    });
    on("restore-backup", async () => { await callbacks.command("RESTORE_BACKUP", { expectedRevision: state.revision }); notify("백업 복원됨. 복원 전 내용도 백업으로 보관됨"); });
    return { root, render, setOpen, notify, hideStatus, get isOpen() { return !$("panel").hidden; } };
  }
  globalThis.ChzzShortcutPanel = Object.freeze({ create });
})();
