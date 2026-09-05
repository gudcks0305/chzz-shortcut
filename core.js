(() => {
  "use strict";

  const PREFIX = "chzzShortcut.";
  const STATE_KEY = `${PREFIX}state.v2`;
  const BACKUP_KEY = `${PREFIX}backup.v2`;
  const preferencesKey = `${PREFIX}preferences`;
  const slotKey = n => `${PREFIX}slot.${n}`;
  const SCHEMA_VERSION = 2;
  const MAX_SETS = 9;
  const MAX_SLOTS = 9;
  const MAX_FAVORITES = 200;
  const MAX_IMPORT_BYTES = 512 * 1024;
  const MAX_SET_NAME_LENGTH = 40;
  const SET_ID = /^[A-Za-z0-9_-]{1,64}$/;
  const EMOJI_ID = /^[\w-]{1,200}$/;
  const PUNCTUATION_CODES = new Set([
    "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
    "Semicolon", "Quote", "Comma", "Period", "Slash"
  ]);
  const CODE_LABELS = Object.freeze({
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/"
  });

  function object(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function imageUrl(value) {
    if (typeof value !== "string") return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "pstatic.net" || url.hostname.endsWith(".pstatic.net")) ? url.href : "";
    } catch {
      return "";
    }
  }

  function binding(value) {
    if (!object(value) || typeof value.emojiId !== "string" || !EMOJI_ID.test(value.emojiId)) return null;
    if (typeof value.packId !== "string" || !EMOJI_ID.test(value.packId)) return null;
    return {
      emojiId: value.emojiId,
      packId: value.packId,
      name: String(value.name || value.emojiId).slice(0, 160),
      imageUrl: imageUrl(value.imageUrl)
    };
  }

  function preferences(value) {
    return {
      enabled: value?.enabled !== false,
      modifier: value?.modifier === "altShift" ? "altShift" : "alt"
    };
  }

  function canonicalCode(code) {
    const numpad = /^Numpad([0-9])$/.exec(code);
    return numpad ? `Digit${numpad[1]}` : code;
  }

  function normalizedShortcut(value) {
    if (!object(value) || typeof value.code !== "string") return null;
    for (const key of ["alt", "ctrl", "shift", "meta"]) if (typeof value[key] !== "boolean") return null;
    const shortcut = {
      code: canonicalCode(value.code),
      alt: value.alt,
      ctrl: value.ctrl,
      shift: value.shift,
      meta: value.meta
    };
    const modified = shortcut.alt || shortcut.ctrl || shortcut.meta;
    if (/^Key[A-Z]$/.test(shortcut.code) || /^Digit[0-9]$/.test(shortcut.code) || PUNCTUATION_CODES.has(shortcut.code)) {
      return modified ? shortcut : null;
    }
    return /^F(?:[1-9]|1[0-2])$/.test(shortcut.code) ? shortcut : null;
  }

  function shortcutFromEvent(event) {
    if (!event || event.isComposing || event.keyCode === 229 || event.defaultPrevented || event.getModifierState?.("AltGraph")) return null;
    return normalizedShortcut({
      code: event.code,
      alt: !!event.altKey,
      ctrl: !!event.ctrlKey,
      shift: !!event.shiftKey,
      meta: !!event.metaKey
    });
  }

  function shortcutKey(shortcut) {
    const value = normalizedShortcut(shortcut);
    return value ? `${value.code}:${Number(value.alt)}${Number(value.ctrl)}${Number(value.shift)}${Number(value.meta)}` : "";
  }

  function shortcutMatches(event, shortcut) {
    const actual = shortcutFromEvent(event);
    const expected = normalizedShortcut(shortcut);
    return !!actual && !!expected && shortcutKey(actual) === shortcutKey(expected);
  }

  function shortcutLabel(shortcut) {
    const value = normalizedShortcut(shortcut);
    if (!value) return "미지정";
    const parts = [];
    if (value.ctrl) parts.push("Ctrl");
    if (value.alt) parts.push("Alt/Option");
    if (value.shift) parts.push("Shift");
    if (value.meta) parts.push("Meta/Command");
    if (value.code.startsWith("Key")) parts.push(value.code.slice(3));
    else if (value.code.startsWith("Digit")) parts.push(value.code.slice(5));
    else parts.push(CODE_LABELS[value.code] || value.code);
    return parts.join(" + ");
  }

  function shortcutSlot(event, settings) {
    if (!settings?.enabled || event?.isComposing || event?.keyCode === 229 || event?.defaultPrevented) return null;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey !== (settings.modifier === "altShift")) return null;
    if (event.getModifierState?.("AltGraph")) return null;
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    return match ? Number(match[1]) : null;
  }

  function defaultShortcut(slotId, modifier = "alt") {
    return {
      code: `Digit${slotId}`,
      alt: true,
      ctrl: false,
      shift: modifier === "altShift",
      meta: false
    };
  }

  function emptySlots(modifier = "alt") {
    return Array.from({ length: MAX_SLOTS }, (_, index) => ({
      id: String(index + 1),
      shortcut: defaultShortcut(String(index + 1), modifier),
      emoji: null
    }));
  }

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      enabled: true,
      activeSetId: "default",
      setShortcuts: { previous: null, next: null },
      sets: [{ id: "default", name: "기본 세트", slots: emptySlots() }],
      favorites: []
    };
  }

  function fail(message) {
    throw new Error(message);
  }

  function validateName(value, context = "세트 이름") {
    if (typeof value !== "string") fail(`${context} 형식이 올바르지 않습니다.`);
    const name = value.trim();
    if (!name || name.length > MAX_SET_NAME_LENGTH) fail(`${context}은 1~${MAX_SET_NAME_LENGTH}자여야 합니다.`);
    return name;
  }

  function validateBinding(value, context) {
    if (!object(value)) fail(`${context} 이모티콘 형식이 올바르지 않습니다.`);
    if (typeof value.name !== "string" || typeof value.imageUrl !== "string") fail(`${context} 이모티콘 필드가 누락되었습니다.`);
    const result = binding(value);
    if (!result) fail(`${context} 이모티콘 식별자가 올바르지 않습니다.`);
    if (value.name.length > 160) fail(`${context} 이모티콘 이름이 너무 깁니다.`);
    if (value.imageUrl && !result.imageUrl) fail(`${context} 미리보기 URL은 pstatic.net HTTPS만 허용됩니다.`);
    return result;
  }

  function validateNullableShortcut(value, context) {
    if (value === null) return null;
    const result = normalizedShortcut(value);
    if (!result) fail(`${context} 단축키가 허용되지 않는 조합입니다.`);
    return result;
  }

  function bindingKey(emoji) {
    return `${emoji.packId}\u0000${emoji.emojiId}`;
  }

  function envelopeText(state, exportedAt) {
    return JSON.stringify({ format: "chzz-shortcut", version: SCHEMA_VERSION, exportedAt, data: state }, null, 2);
  }

  function validateState(value) {
    if (!object(value)) fail("설정 데이터가 객체가 아닙니다.");
    if (value.schemaVersion !== SCHEMA_VERSION) fail(`지원하지 않는 설정 버전입니다. 버전 ${SCHEMA_VERSION} 파일을 사용하세요.`);
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER) fail("설정 revision이 올바르지 않습니다.");
    if (typeof value.enabled !== "boolean") fail("사용 여부 설정이 올바르지 않습니다.");
    if (typeof value.activeSetId !== "string" || !SET_ID.test(value.activeSetId)) fail("활성 세트 ID가 올바르지 않습니다.");
    if (!object(value.setShortcuts) || !("previous" in value.setShortcuts) || !("next" in value.setShortcuts)) fail("세트 전환 단축키가 누락되었습니다.");
    const setShortcuts = {
      previous: validateNullableShortcut(value.setShortcuts.previous, "이전 세트"),
      next: validateNullableShortcut(value.setShortcuts.next, "다음 세트")
    };
    if (setShortcuts.previous && setShortcuts.next && shortcutKey(setShortcuts.previous) === shortcutKey(setShortcuts.next)) {
      fail("이전/다음 세트 단축키가 중복됩니다.");
    }
    if (!Array.isArray(value.sets) || value.sets.length < 1 || value.sets.length > MAX_SETS) fail(`세트는 1~${MAX_SETS}개여야 합니다.`);
    const setIds = new Set();
    const cycleKeys = new Set([shortcutKey(setShortcuts.previous), shortcutKey(setShortcuts.next)].filter(Boolean));
    const sets = value.sets.map((set, setIndex) => {
      const context = `${setIndex + 1}번 세트`;
      if (!object(set) || typeof set.id !== "string" || !SET_ID.test(set.id)) fail(`${context} ID가 올바르지 않습니다.`);
      if (setIds.has(set.id)) fail(`세트 ID가 중복됩니다: ${set.id}`);
      setIds.add(set.id);
      if (!Array.isArray(set.slots) || set.slots.length !== MAX_SLOTS) fail(`${context} 슬롯은 정확히 ${MAX_SLOTS}개여야 합니다.`);
      const slotIds = new Set();
      const usedShortcuts = new Set();
      const slots = set.slots.map((slot, slotIndex) => {
        const slotContext = `${context} ${slotIndex + 1}번 슬롯`;
        if (!object(slot) || typeof slot.id !== "string" || !/^[1-9]$/.test(slot.id)) fail(`${slotContext} ID가 올바르지 않습니다.`);
        if (slotIds.has(slot.id)) fail(`${context} 슬롯 ID가 중복됩니다: ${slot.id}`);
        slotIds.add(slot.id);
        if (!("shortcut" in slot) || !("emoji" in slot)) fail(`${slotContext} 필드가 누락되었습니다.`);
        const shortcut = validateNullableShortcut(slot.shortcut, slotContext);
        const key = shortcutKey(shortcut);
        if (key && usedShortcuts.has(key)) fail(`${context} 안에서 단축키가 중복됩니다: ${shortcutLabel(shortcut)}`);
        if (key && cycleKeys.has(key)) fail(`${slotContext} 단축키가 세트 전환 단축키와 충돌합니다.`);
        if (key) usedShortcuts.add(key);
        const emoji = slot.emoji === null ? null : validateBinding(slot.emoji, slotContext);
        return { id: slot.id, shortcut, emoji };
      });
      for (let id = 1; id <= MAX_SLOTS; id++) if (!slotIds.has(String(id))) fail(`${context}에 ${id}번 슬롯이 없습니다.`);
      return { id: set.id, name: validateName(set.name, `${context} 이름`), slots };
    });
    if (!setIds.has(value.activeSetId)) fail("활성 세트가 세트 목록에 없습니다.");
    if (!Array.isArray(value.favorites) || value.favorites.length > MAX_FAVORITES) fail(`즐겨찾기는 최대 ${MAX_FAVORITES}개입니다.`);
    const favoriteIds = new Set();
    const favorites = value.favorites.map((entry, index) => {
      const emoji = validateBinding(entry, `${index + 1}번 즐겨찾기`);
      const key = bindingKey(emoji);
      if (favoriteIds.has(key)) fail(`즐겨찾기가 중복됩니다: ${emoji.name}`);
      favoriteIds.add(key);
      return emoji;
    });
    const normalized = {
      schemaVersion: SCHEMA_VERSION,
      revision: value.revision,
      enabled: value.enabled,
      activeSetId: value.activeSetId,
      setShortcuts,
      sets,
      favorites
    };
    if (utf8Bytes(envelopeText(normalized, "2000-01-01T00:00:00.000Z")) > MAX_IMPORT_BYTES) {
      fail("설정 전체 크기는 512KiB 이하여야 합니다. 긴 미리보기 URL이나 불필요한 항목을 줄이세요.");
    }
    return normalized;
  }

  function stateFromLegacy(storageData) {
    const data = object(storageData) ? storageData : {};
    const oldPreferences = preferences(data[preferencesKey]);
    const state = createDefaultState();
    state.enabled = oldPreferences.enabled;
    state.sets[0].slots = emptySlots(oldPreferences.modifier).map(slot => ({
      ...slot,
      emoji: binding(data[slotKey(slot.id)])
    }));
    state.favorites = state.sets[0].slots.filter(slot => slot.emoji).map(slot => slot.emoji)
      .filter((emoji, index, all) => all.findIndex(other => bindingKey(other) === bindingKey(emoji)) === index);
    return validateState(state);
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
    return unescape(encodeURIComponent(text)).length;
  }

  function parseImportText(text) {
    if (typeof text !== "string") fail("가져올 내용은 JSON 텍스트여야 합니다.");
    if (utf8Bytes(text) > MAX_IMPORT_BYTES) fail("가져오기 파일은 512KiB 이하여야 합니다.");
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      fail("JSON 문법이 올바르지 않습니다.");
    }
    if (!object(envelope) || envelope.format !== "chzz-shortcut" || envelope.version !== SCHEMA_VERSION || !("data" in envelope)) {
      fail("치지직 단축키 v2 내보내기 파일이 아닙니다.");
    }
    if (typeof envelope.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(envelope.exportedAt)
      || Number.isNaN(Date.parse(envelope.exportedAt))) fail("내보내기 시각이 누락되었거나 올바르지 않습니다.");
    return validateState(envelope.data);
  }

  function exportState(state) {
    return envelopeText(validateState(state), new Date().toISOString());
  }

  function nextSetId(sets, preferred = "set") {
    const used = new Set(sets.map(set => set.id));
    const clean = typeof preferred === "string" && SET_ID.test(preferred) ? preferred : "set";
    if (!used.has(clean)) return clean;
    for (let suffix = 2; suffix <= 10000; suffix++) {
      const room = 64 - String(suffix).length - 1;
      const candidate = `${clean.slice(0, room)}-${suffix}`;
      if (!used.has(candidate)) return candidate;
    }
    fail("고유한 세트 ID를 만들 수 없습니다.");
  }

  function findSet(state, setId) {
    const set = state.sets.find(candidate => candidate.id === setId);
    if (!set) fail("대상 세트를 찾을 수 없습니다.");
    return set;
  }

  function findSlot(set, slotId) {
    if (typeof slotId !== "string" || !/^[1-9]$/.test(slotId)) fail("슬롯 ID가 올바르지 않습니다.");
    const slot = set.slots.find(candidate => candidate.id === slotId);
    if (!slot) fail("대상 슬롯을 찾을 수 없습니다.");
    return slot;
  }

  function bump(state) {
    state.revision += 1;
    return validateState(state);
  }

  function addFavorite(state, emoji) {
    const key = bindingKey(emoji);
    if (state.favorites.some(entry => bindingKey(entry) === key)) return;
    if (state.favorites.length >= MAX_FAVORITES) fail(`즐겨찾기는 최대 ${MAX_FAVORITES}개입니다.`);
    state.favorites.push(emoji);
  }

  function applyCommand(inputState, command) {
    const state = validateState(inputState);
    if (!object(command) || typeof command.type !== "string") fail("명령 형식이 올바르지 않습니다.");
    switch (command.type) {
      case "UPDATE_SETTINGS":
        if (typeof command.enabled !== "boolean") fail("사용 여부는 boolean이어야 합니다.");
        state.enabled = command.enabled;
        break;
      case "SELECT_SET":
        findSet(state, command.setId);
        state.activeSetId = command.setId;
        break;
      case "CREATE_SET": {
        if (state.sets.length >= MAX_SETS) fail(`세트는 최대 ${MAX_SETS}개입니다.`);
        const name = validateName(command.name);
        const source = command.copyFromId === undefined ? null : findSet(state, command.copyFromId);
        const id = nextSetId(state.sets, "set");
        const cycleKeys = new Set([shortcutKey(state.setShortcuts.previous), shortcutKey(state.setShortcuts.next)].filter(Boolean));
        state.sets.push({
          id,
          name,
          slots: source
            ? source.slots.map(slot => ({ id: slot.id, shortcut: slot.shortcut, emoji: slot.emoji }))
            : emptySlots().map(slot => ({ ...slot, shortcut: cycleKeys.has(shortcutKey(slot.shortcut)) ? null : slot.shortcut }))
        });
        state.activeSetId = id;
        break;
      }
      case "RENAME_SET":
        findSet(state, command.setId).name = validateName(command.name);
        break;
      case "DELETE_SET": {
        if (state.sets.length === 1) fail("마지막 세트는 삭제할 수 없습니다.");
        const index = state.sets.findIndex(set => set.id === command.setId);
        if (index < 0) fail("대상 세트를 찾을 수 없습니다.");
        state.sets.splice(index, 1);
        if (state.activeSetId === command.setId) state.activeSetId = state.sets[Math.min(index, state.sets.length - 1)].id;
        break;
      }
      case "SET_SLOT": {
        const slot = findSlot(findSet(state, command.setId), command.slotId);
        const emoji = command.emoji === null ? null : validateBinding(command.emoji, "슬롯");
        slot.emoji = emoji;
        if (emoji) addFavorite(state, emoji);
        break;
      }
      case "SET_SHORTCUT":
        findSlot(findSet(state, command.setId), command.slotId).shortcut = validateNullableShortcut(command.shortcut, "슬롯");
        break;
      case "SET_CYCLE_SHORTCUT":
        if (command.direction !== "previous" && command.direction !== "next") fail("세트 전환 방향이 올바르지 않습니다.");
        state.setShortcuts[command.direction] = validateNullableShortcut(command.shortcut, "세트 전환");
        break;
      case "ADD_FAVORITE":
        addFavorite(state, validateBinding(command.emoji, "즐겨찾기"));
        break;
      case "REMOVE_FAVORITE": {
        if (typeof command.emojiId !== "string" || typeof command.packId !== "string") fail("즐겨찾기 식별자가 올바르지 않습니다.");
        const index = state.favorites.findIndex(entry => entry.emojiId === command.emojiId && entry.packId === command.packId);
        if (index < 0) fail("즐겨찾기를 찾을 수 없습니다.");
        state.favorites.splice(index, 1);
        break;
      }
      case "REORDER_FAVORITE": {
        if (command.direction !== "up" && command.direction !== "down") fail("이동 방향이 올바르지 않습니다.");
        const index = state.favorites.findIndex(entry => entry.emojiId === command.emojiId && entry.packId === command.packId);
        if (index < 0) fail("즐겨찾기를 찾을 수 없습니다.");
        const target = command.direction === "up" ? index - 1 : index + 1;
        if (target >= 0 && target < state.favorites.length) [state.favorites[index], state.favorites[target]] = [state.favorites[target], state.favorites[index]];
        break;
      }
      default:
        fail("지원하지 않는 명령입니다.");
    }
    return bump(state);
  }

  function mergeStates(currentState, importedState) {
    const current = validateState(currentState);
    const imported = validateState(importedState);
    if (current.sets.length + imported.sets.length > MAX_SETS) fail(`병합 후 세트가 최대 ${MAX_SETS}개를 넘습니다.`);
    const merged = current;
    for (const importedSet of imported.sets) {
      const id = nextSetId(merged.sets, importedSet.id);
      merged.sets.push({
        id,
        name: importedSet.name,
        slots: importedSet.slots.map(slot => ({ id: slot.id, shortcut: slot.shortcut, emoji: slot.emoji }))
      });
    }
    for (const emoji of imported.favorites) addFavorite(merged, emoji);
    return bump(merged);
  }

  globalThis.ChzzShortcut = Object.freeze({
    PREFIX,
    STATE_KEY,
    BACKUP_KEY,
    SCHEMA_VERSION,
    MAX_SETS,
    MAX_SLOTS,
    MAX_FAVORITES,
    MAX_IMPORT_BYTES,
    MAX_SET_NAME_LENGTH,
    slotKey,
    preferencesKey,
    preferences,
    binding,
    shortcutSlot,
    canonicalCode,
    normalizedShortcut,
    shortcutFromEvent,
    shortcutMatches,
    shortcutLabel,
    shortcutKey,
    createDefaultState,
    validateState,
    stateFromLegacy,
    parseImportText,
    exportState,
    applyCommand,
    mergeStates
  });
})();
