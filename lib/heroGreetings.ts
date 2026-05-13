// Rotating hero greetings for the empty-chat landing.
//
// Picked once per chat (or once per mount when there's no chat id) so
// the greeting doesn't change between renders within the same session.
// Each greeting is short — 1-6 words — matching Claude/ChatGPT empty
// states.
//
// {name} is replaced with the user's first name when known. Greetings
// without {name} render verbatim even when we have a name (so the
// rotation feels human, not robotic).

// Forward-looking greetings only — no 'pick up where you left off' or
// 'back at it' style lines that confuse users on a fresh session.
// Mix of name-based warmth and general 'what would you like to do'
// openers, every one of them inviting the next action.
const GREETINGS: string[] = [
  "Hey there, {name}",
  "Hi {name}",
  "What's up, {name}?",
  "How can I help, {name}?",
  "Good to see you, {name}",
  "Hey {name}",
  "What's on the agenda today?",
  "How can I help today?",
  "What are we working on?",
  "Ready when you are",
  "Let's get into it",
  "What's next?",
  "Where would you like to start?",
  "What can I help with?",
  "Tell me what you need",
  "What's the goal today?",
];

// Deterministic hash → keeps the same greeting for the same chat id
// across renders, but each new chat gets a fresh one.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function pickHeroGreeting(opts: { chatId?: string | null; firstName?: string | null }): string {
  const { chatId, firstName } = opts;
  const seed = chatId ?? `${Date.now()}-${Math.random()}`;
  const raw = GREETINGS[hashString(seed) % GREETINGS.length];
  const name = firstName?.trim() || "there";
  // If the greeting has {name} but we have no name, prefer one that doesn't.
  if (raw.includes("{name}") && !firstName?.trim()) {
    // Fall back to a name-less greeting at the next index.
    const nameless = GREETINGS.filter((g) => !g.includes("{name}"));
    return nameless[hashString(seed) % nameless.length];
  }
  return raw.replace("{name}", name);
}
