(() => {
  "use strict";
  const PREFIX = "chzzShortcut.";
  const slotKey = n => `${PREFIX}slot.${n}`;
  const preferencesKey = `${PREFIX}preferences`;
  function preferences(value) {
    return { enabled: value?.enabled !== false, modifier: value?.modifier === "altShift" ? "altShift" : "alt" };
  }
  function imageUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && (u.hostname === "pstatic.net" || u.hostname.endsWith(".pstatic.net")) ? u.href : "";
    } catch { return ""; }
  }
  function binding(value) {
    if (!value || typeof value.emojiId !== "string" || !/^[\w-]{1,200}$/.test(value.emojiId)) return null;
    if (typeof value.packId !== "string" || !/^[\w-]{1,200}$/.test(value.packId)) return null;
    return { emojiId: value.emojiId, packId: value.packId, name: String(value.name || value.emojiId).slice(0,160), imageUrl: imageUrl(value.imageUrl) };
  }
  function shortcutSlot(event, settings) {
    if (!settings.enabled || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return null;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey !== (settings.modifier === "altShift")) return null;
    if (event.getModifierState?.("AltGraph")) return null;
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    return match ? Number(match[1]) : null;
  }
  globalThis.ChzzShortcut = Object.freeze({ slotKey, preferencesKey, preferences, binding, shortcutSlot });
})();
