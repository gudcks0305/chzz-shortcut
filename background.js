"use strict";

importScripts("core.js");

const C = globalThis.ChzzShortcut;
const storage = chrome.storage.local;
const LEGACY_KEYS = [C.preferencesKey, ...Array.from({ length: C.MAX_SLOTS }, (_, index) => C.slotKey(index + 1))];
let queue = Promise.resolve();

function usefulError(error) {
  return error instanceof Error && error.message ? error.message : "설정을 처리하지 못했습니다.";
}

function backupAvailable(value) {
  if (value === undefined) return false;
  try {
    C.validateState(value);
    return true;
  } catch {
    return false;
  }
}

async function readState() {
  const data = await storage.get([C.STATE_KEY, C.BACKUP_KEY, ...LEGACY_KEYS]);
  if (data[C.STATE_KEY] !== undefined) {
    return { state: C.validateState(data[C.STATE_KEY]), backup: data[C.BACKUP_KEY] };
  }
  const state = C.stateFromLegacy(data);
  await storage.set({ [C.STATE_KEY]: state });
  return { state, backup: data[C.BACKUP_KEY] };
}

function requireExpectedRevision(message, state) {
  if (!Number.isSafeInteger(message.expectedRevision) || message.expectedRevision !== state.revision) {
    throw new Error("설정이 다른 탭에서 변경되었습니다. 새로고침 후 가져오기 미리보기를 다시 확인하세요.");
  }
}

async function handle(message) {
  const { state, backup } = await readState();
  if (message.type === "GET_STATE") {
    return { ok: true, state, backupAvailable: backupAvailable(backup) };
  }

  if (message.type === "IMPORT_STATE") {
    requireExpectedRevision(message, state);
    if (message.mode !== "merge" && message.mode !== "replace") throw new Error("가져오기 방식을 선택하세요.");
    const imported = C.validateState(message.state);
    let next;
    if (message.mode === "merge") {
      next = C.mergeStates(state, imported);
    } else {
      next = C.validateState({ ...imported, revision: state.revision + 1 });
    }
    await storage.set({ [C.BACKUP_KEY]: state, [C.STATE_KEY]: next });
    return { ok: true, state: next, backupAvailable: true };
  }

  if (message.type === "RESTORE_BACKUP") {
    requireExpectedRevision(message, state);
    if (backup === undefined) throw new Error("복원할 백업이 없습니다.");
    const restored = C.validateState({ ...C.validateState(backup), revision: state.revision + 1 });
    await storage.set({ [C.BACKUP_KEY]: state, [C.STATE_KEY]: restored });
    return { ok: true, state: restored, backupAvailable: true };
  }

  const next = C.applyCommand(state, message);
  await storage.set({ [C.STATE_KEY]: next });
  return { ok: true, state: next, backupAvailable: backupAvailable(backup) };
}

function enqueue(message) {
  const task = () => handle(message);
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.namespace !== "chzz-shortcut") return undefined;
  if (sender?.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "허용되지 않은 메시지 발신자입니다." });
    return false;
  }
  enqueue(message).then(sendResponse, error => sendResponse({ ok: false, error: usefulError(error) }));
  return true;
});
