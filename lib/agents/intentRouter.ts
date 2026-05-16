// Dynamic intent router.
//
// Two-tier classification:
//   1. Regex pass — covers the obvious cases (zero latency, zero cost).
//   2. Haiku fallback — only when regex doesn't match a known category.
//
// Returns null when the user message clearly isn't an actionable intent
// (general chat, questions, etc). The caller treats null as "fall
// through to the regular synthesis path."

import Anthropic from "@anthropic-ai/sdk";
import {
  type IntentCategory,
  type IntentRoute,
  optionsFor,
  narrationFor,
} from "@/lib/intents/registry";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Regex pass ────────────────────────────────────────────────────
//
// Each entry has a category, a regex (case-insensitive) and a list
// of skill / role hints to scan separately. Order matters — first
// match wins, so we put more-specific patterns first.
const REGEX_PATTERNS: Array<{
  category: IntentCategory;
  rx: RegExp;
}> = [
  // Interview/drill/quiz intents. Examples: "python quiz", "sql drill",
  // "interview prep", "practice behavioral", "mock interview".
  {
    category: "interview",
    rx: /\b(quiz|drill|mock interview|interview prep|prep for (an? )?interview|practice (for )?(my )?interview|interview practice|skill assessment|coding test|coding round)\b/i,
  },
  // Resume rewrite/recreate intents. Avoids matching "review my resume"
  // (which goes through the source chooser — different surface).
  {
    category: "resume",
    rx: /\b(rewrite (my |the )?resume|recreate (my |the )?resume|tailor (my |the )?resume|polish (my |the )?resume|fix (my |the )?resume)\b/i,
  },
  // Cover letter intents.
  {
    category: "cover_letter",
    rx: /\b(cover letter|write a letter|draft a letter|letter for (the )?(job|role))\b/i,
  },
];

// Hint extraction — pull out the specific skill the user mentioned so
// the chip narration can reference it ("Three ways I can help you with
// Python — pick one:"). Conservative list, expanded as patterns prove
// out.
const SKILL_HINT_RX = /\b(python|sql|spark|scala|java|javascript|typescript|react|node|go(lang)?|rust|aws|gcp|azure|kubernetes|docker|terraform|snowflake|databricks|dbt|kafka|flink|airflow|bigquery|postgres|mysql|redis|mongodb|system design|machine learning|ml|nlp|llm|behavioral)\b/i;

function extractSkillHint(text: string): string | null {
  const m = text.match(SKILL_HINT_RX);
  if (!m) return null;
  // Normalize a couple of common forms.
  const raw = m[1];
  const lc = raw.toLowerCase();
  if (lc === "golang") return "Go";
  if (lc === "ml") return "Machine Learning";
  // Default: title-case multi-letter, uppercase single acronyms.
  if (raw.length <= 3) return raw.toUpperCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// ── Haiku fallback ────────────────────────────────────────────────
//
// Classifies the user message into one of the known categories or
// "unknown". Runs only when regex misses. Cheap (~$0.0005 per call,
// <1s).
const HAIKU_SYSTEM_PROMPT = `You classify a single user message into ONE of these intent categories:

- "interview"     — user wants interview practice, quiz, drill, skill assessment, coding round prep
- "resume"        — user wants resume rewritten, recreated, tailored, polished, fixed
- "cover_letter"  — user wants a cover letter written
- "unknown"       — anything else: general chat, questions, learning, career advice, "what should I do", etc.

Also pull out the specific skill or topic if mentioned (e.g. "Python", "SQL", "machine learning"). null if not specified.

Return ONLY a JSON object:
{ "category": "<one of the four>", "detectedSkill": "<string or null>" }

No prose, no fences. Just the JSON.

Examples:
"can you help me prep for a python interview" → {"category":"interview","detectedSkill":"Python"}
"rewrite my resume for Stripe" → {"category":"resume","detectedSkill":null}
"need a cover letter for this Snowflake DE job" → {"category":"cover_letter","detectedSkill":"Snowflake"}
"what's the difference between OLTP and OLAP" → {"category":"unknown","detectedSkill":null}
"hey" → {"category":"unknown","detectedSkill":null}`;

async function haikuClassify(message: string): Promise<{ category: IntentCategory; detectedSkill: string | null } | null> {
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: HAIKU_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(cleaned.slice(s, e + 1)) as { category?: string; detectedSkill?: unknown };
    const cat = parsed.category as IntentCategory;
    if (!["interview", "resume", "cover_letter", "unknown"].includes(cat)) return null;
    const skill = typeof parsed.detectedSkill === "string" ? parsed.detectedSkill.trim() : null;
    return { category: cat, detectedSkill: skill && skill.length > 0 ? skill : null };
  } catch (err) {
    console.warn("[intentRouter] Haiku classify failed:", err);
    return null;
  }
}

// ── Main entry ────────────────────────────────────────────────────

export async function classifyIntent(userMessage: string): Promise<IntentRoute | null> {
  const trimmed = userMessage.trim();
  if (!trimmed || trimmed.length > 800) {
    // Long messages (pasted JDs, code, etc.) are not intent triggers.
    return null;
  }

  // Tier 1 — regex.
  for (const { category, rx } of REGEX_PATTERNS) {
    if (rx.test(trimmed)) {
      const detectedSkill = extractSkillHint(trimmed);
      return {
        category,
        options: optionsFor(category),
        narration: narrationFor(category, detectedSkill),
        detectedSkill,
      };
    }
  }

  // Tier 2 — Haiku, only for messages that LOOK like intent triggers.
  // Heuristic: short message, contains a verb-y word. Avoids spending
  // a Haiku call on every random message.
  const looksIntentish = /\b(help|need|want|do|make|create|generate|write|build|practice|prep|drill|quiz|test|assess|fix|rewrite|recreate|tailor|polish|review)\b/i.test(trimmed);
  if (!looksIntentish || trimmed.length > 200) return null;

  const haikuResult = await haikuClassify(trimmed);
  if (!haikuResult || haikuResult.category === "unknown") return null;

  return {
    category: haikuResult.category,
    options: optionsFor(haikuResult.category),
    narration: narrationFor(haikuResult.category, haikuResult.detectedSkill),
    detectedSkill: haikuResult.detectedSkill,
  };
}
