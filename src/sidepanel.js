// sidepanel.js — the UI: meeting picker, live transcript, search, export and
// the web hand-off to Claude / ChatGPT.
import { getLines, listMeetings, clearMeeting } from './idb.js';
import { buildPrompt } from './prompt.js';

const $ = (id) => document.getElementById(id);

let selectedMeeting = null;
let lines = [];

function currentTitle() {
  const opt = $('meeting').selectedOptions[0];
  return (opt && opt.textContent) || 'Meeting';
}

async function refreshMeetings() {
  const meetings = await listMeetings();
  const sel = $('meeting');
  sel.innerHTML = '';
  for (const m of meetings) {
    const opt = document.createElement('option');
    opt.value = m.meetingId;
    opt.textContent = m.title || m.meetingId;
    sel.appendChild(opt);
  }
  if ((!selectedMeeting || !meetings.some((m) => m.meetingId === selectedMeeting)) && meetings.length) {
    selectedMeeting = meetings[0].meetingId;
  }
  if (selectedMeeting) sel.value = selectedMeeting;
  await loadTranscript();
}

async function loadTranscript() {
  lines = selectedMeeting ? await getLines(selectedMeeting) : [];
  render();
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const shown = q
    ? lines.filter((l) => `${l.text} ${l.speaker}`.toLowerCase().includes(q))
    : lines;
  $('count').textContent = `${shown.length} / ${lines.length}`;

  const list = $('transcript');
  list.innerHTML = '';
  for (const l of shown) {
    const row = document.createElement('div');
    row.className = 'line';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = l.speaker || '—';
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = l.text;
    row.append(who, txt);
    list.appendChild(row);
  }
  if (!q) list.scrollTop = list.scrollHeight;
}

function transcriptMarkdown(title) {
  return (
    `# ${title}\n\n` +
    lines.map((l) => `- **${l.speaker || 'Speaker'}:** ${l.text}`).join('\n') +
    '\n'
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}

async function handoff(url) {
  const ok = await copyText(buildPrompt(currentTitle(), lines));
  toast(ok
    ? 'Prompt + transcript copied. Paste (Ctrl+V) in the tab that opened.'
    : 'Could not copy to the clipboard.');
  chrome.tabs.create({ url });
}

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

// --- events ---
$('meeting').addEventListener('change', (e) => {
  selectedMeeting = e.target.value;
  loadTranscript();
});
$('search').addEventListener('input', render);
$('refresh').addEventListener('click', refreshMeetings);
$('copy').addEventListener('click', async () => {
  const ok = await copyText(transcriptMarkdown(currentTitle()));
  toast(ok ? 'Transcript copied (Markdown).' : 'Could not copy.');
});
$('download').addEventListener('click', () => {
  const name = currentTitle().replace(/[^\w.-]+/g, '_') || 'meeting';
  download(`${name}.md`, transcriptMarkdown(currentTitle()));
});
$('claude').addEventListener('click', () => handoff('https://claude.ai/new'));
$('chatgpt').addEventListener('click', () => handoff('https://chatgpt.com/'));
$('clear').addEventListener('click', async () => {
  if (!selectedMeeting) return;
  if (!confirm('Delete the saved transcript for this meeting?')) return;
  await clearMeeting(selectedMeeting);
  selectedMeeting = null;
  await refreshMeetings();
});

// Live updates pushed from the background worker.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'line-broadcast') return;
  const l = msg.line;
  if (!selectedMeeting) {
    selectedMeeting = l.meetingId;
    refreshMeetings();
    return;
  }
  if (l.meetingId !== selectedMeeting) return;
  const i = lines.findIndex((x) => x.lineId === l.lineId);
  if (i >= 0) lines[i] = { ...lines[i], ...l };
  else lines.push(l);
  lines.sort((a, b) => a.order - b.order);
  render();
});

refreshMeetings();
