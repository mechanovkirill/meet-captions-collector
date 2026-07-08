// prompt.js — builds the LLM prompt for the web hand-off.
export function buildPrompt(title, lines) {
  const transcript = lines
    .map((l) => `${l.speaker || 'Speaker'}: ${l.text}`)
    .join('\n');
  return [
    'You are an assistant that processes meeting transcripts.',
    `Meeting: ${title}`,
    '',
    'Reply in the same language as the transcript (English or Russian). Produce:',
    '1. **Summary** — a concise overview of what was discussed.',
    '2. **Action items** — a bullet list; include the owner when identifiable.',
    '3. **Follow-ups** — open questions and suggested next steps.',
    '',
    'Transcript:',
    '"""',
    transcript,
    '"""',
  ].join('\n');
}
