# Meet Captions Collector

A local Chrome extension (Manifest V3): it reads Google Meet's built-in captions
straight from the DOM, accumulates the transcript locally in IndexedDB, and — on
a button press — hands it off to the LLM of your choice (Claude / ChatGPT) for a
summary, action items and follow-ups.

Audio is never processed or sent anywhere — it relies on the speech recognition
Google Meet already performs.

## Install (no build step)

1. `python3 make_icons.py` — generate the icons (once).
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `transcribe` folder.

## Usage

1. Join a Google Meet and **turn captions on** (the CC button). Without captions
   enabled there is nothing to collect.
2. Click the extension icon in the toolbar — a side panel opens with the live
   transcript, search and buttons.
3. After the meeting:
   - **Copy MD / Download .md** — the transcript as Markdown.
   - **→ Claude / → ChatGPT** — the prompt + transcript are copied to the
     clipboard and a new tab opens. Paste with `Ctrl+V` and send.

## How it works

```
Google Meet (CC on)
   │  content.js  — MutationObserver on div[role="region"][aria-label="Captions"]
   ▼
background.js  — saves lines to IndexedDB (extension origin)
   ▼
sidepanel.js   — live transcript, search, export, web hand-off to the LLM
```

Deduplication: Meet appends to the same caption block as someone keeps speaking.
Each block is tracked by its DOM node and recorded as a single line, updated up
to its final text (see `isSameLine` in `src/content.js`).

## Limitations

- Google's caption selectors are obfuscated. Binding relies on the stable
  `role="region"` + `aria-label` (EN/RU), with a fallback path based on the
  "block = parent of the header with the avatar" structure. A Meet redesign may
  require fixing `getEntries()` / `REGION_LABEL_RE` in `src/content.js`.
- Text quality = the quality of Google Meet's recognition.
- Captions must be enabled manually.

## Files

| File | Purpose |
|------|------------|
| `manifest.json` | MV3 manifest |
| `src/content.js` | reads captions from the DOM |
| `src/background.js` | saves to IndexedDB + broadcasts to the panel |
| `src/idb.js` | IndexedDB wrapper |
| `src/sidepanel.*` | side panel UI |
| `src/prompt.js` | the LLM prompt |
| `make_icons.py` | icon generator |
