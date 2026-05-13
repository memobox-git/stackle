// Rotating example prompts shown beneath the chat-hero chips.
// Three picked deterministically per chat id so they don't flicker
// between renders. Tone matches the rest of the empty hero: concrete,
// actionable, slightly opinionated.

const EXAMPLES: string[] = [
  "Rewrite my summary for a senior data role",
  "What's missing for a Stripe DE interview?",
  "Score my LinkedIn About section",
  "Find the weakest bullet on my resume",
  "Tailor my resume for this JD",
  "Drill me on SQL window functions",
  "Compare my background to a Staff DE bar",
  "What three things would make me 10% stronger?",
  "Write a cold email to a hiring manager",
  "What roles am I closest to ready for?",
  "Practice a behavioural for ownership",
  "Explain dbt incremental models like I'm new",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function pickHeroExamples(opts: { chatId?: string | null; count?: number }): string[] {
  const { chatId, count = 3 } = opts;
  const seed = chatId ?? `${Date.now()}-${Math.random()}`;
  const base = hashString(seed);
  const picks: string[] = [];
  const used = new Set<number>();
  let offset = 0;
  while (picks.length < count && used.size < EXAMPLES.length) {
    const idx = (base + offset) % EXAMPLES.length;
    if (!used.has(idx)) {
      used.add(idx);
      picks.push(EXAMPLES[idx]);
    }
    offset++;
  }
  return picks;
}
