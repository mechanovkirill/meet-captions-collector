// background.js — service worker. Persists captured lines to IndexedDB and
// re-broadcasts them to the side panel for live updates.
import { upsertLine, upsertMeeting } from './idb.js';

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'line') return;
  (async () => {
    await upsertLine(msg);
    await upsertMeeting({ meetingId: msg.meetingId, title: msg.title, updatedAt: msg.ts });
    // Best-effort live update; ignored if the side panel is closed.
    chrome.runtime.sendMessage({ type: 'line-broadcast', line: msg }).catch(() => {});
  })();
});
