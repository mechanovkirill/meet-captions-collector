// content.js — reads Google Meet live captions from the DOM and forwards
// committed lines to the background service worker. No audio is touched.
(() => {
  'use strict';

  // Match the captions region across UI languages (EN "Captions", RU "Субтитры").
  const REGION_LABEL_RE = /caption|субтитр|подпис/i;
  const SCAN_DEBOUNCE_MS = 300;

  // A fresh id namespace per page load so rejoining the same meeting never
  // overwrites lines captured in an earlier session.
  const SESSION = Date.now();
  let counter = 0;

  const nodeState = new WeakMap(); // entry node -> { lineId, order, text }
  let currentRegion = null;
  let regionObserver = null;
  let scanTimer = null;

  function meetingId() {
    return location.pathname.replace(/[^a-z0-9-]/gi, '') || 'unknown';
  }

  function findRegion() {
    for (const r of document.querySelectorAll('div[role="region"]')) {
      if (REGION_LABEL_RE.test(r.getAttribute('aria-label') || '')) return r;
    }
    return null;
  }

  // Each caption block has one avatar <img>; the block is the parent of the
  // header that wraps that img. The obfuscated class is only a fast path.
  function getEntries(region) {
    const byClass = region.querySelectorAll('.nMcdL');
    if (byClass.length) return [...byClass];
    const entries = [];
    region.querySelectorAll('img').forEach((img) => {
      const header = img.closest('div');
      const entry = header && header.parentElement;
      if (entry && entry !== region) entries.push(entry);
    });
    return entries;
  }

  function parseEntry(entry) {
    const img = entry.querySelector('img');
    let speaker = '';
    let text = '';
    if (img) {
      const header = img.closest('div');
      speaker = (header ? header.textContent : '').replace(/\s+/g, ' ').trim();
      const parts = [];
      for (const child of entry.children) {
        if (header && child.contains(img)) continue; // skip the name/avatar header
        parts.push(child.textContent);
      }
      text = parts.join(' ').replace(/\s+/g, ' ').trim();
    } else {
      text = entry.textContent.replace(/\s+/g, ' ').trim();
    }
    return { speaker, text };
  }

  // Normalize to lowercase word/number tokens so caption refinements that only
  // touch punctuation or capitalization ("so alexa" -> "So, Alexa") don't look
  // like a different line.
  function normTokens(s) {
    return s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  }

  // Google Meet grows a caption in place and continuously re-punctuates and
  // re-capitalizes the WHOLE line while refining it, so a raw string-prefix test
  // is wrong — it treats every re-punctuation as a brand-new line. Compare word
  // tokens instead and treat it as the same utterance while one is (almost) a
  // token-prefix of the other, tolerating the last couple of words still being
  // corrected. A shorter, unrelated text means the block was reused for a new
  // utterance (or Meet chunked a long turn) -> new line.
  function sameUtterance(prev, cur) {
    const a = normTokens(prev);
    const b = normTokens(cur);
    if (!a.length || !b.length) return true;
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i += 1;
    return i >= 1 && i >= n - 2;
  }

  function send(state, speaker, text) {
    try {
      chrome.runtime.sendMessage({
        type: 'line',
        meetingId: meetingId(),
        title: document.title,
        lineId: state.lineId,
        order: state.order,
        speaker,
        text,
        ts: Date.now(),
      }).catch(() => {});
    } catch (_) { /* extension context invalidated on reload */ }
  }

  function scan() {
    if (!currentRegion || !currentRegion.isConnected) { ensureRegion(); return; }
    for (const entry of getEntries(currentRegion)) {
      const { speaker, text } = parseEntry(entry);
      if (!text) continue;
      let st = nodeState.get(entry);
      if (!st || !sameUtterance(st.text, text)) {
        counter += 1;
        st = { lineId: `${SESSION}.${counter}`, order: SESSION * 100000 + counter, text: '' };
        nodeState.set(entry, st);
      }
      if (text !== st.text) {
        st.text = text;
        send(st, speaker, text);
      }
    }
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = null; scan(); }, SCAN_DEBOUNCE_MS);
  }

  function ensureRegion() {
    const region = findRegion();
    if (region === currentRegion) return;
    if (regionObserver) { regionObserver.disconnect(); regionObserver = null; }
    currentRegion = region;
    if (region) {
      regionObserver = new MutationObserver(scheduleScan);
      regionObserver.observe(region, { childList: true, subtree: true, characterData: true });
      scheduleScan();
    }
  }

  new MutationObserver(ensureRegion).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  ensureRegion();
})();
