// Dynamic question generator for Interview Prep.
//
// Replaces the static question bank's hard dead-end for non-SQL skills.
// Calls Sonnet 4.5 with a structured prompt and returns an array of
// InterviewQuestion objects ready to render in the drill canvas.
//
// Why dynamic: the static bank only ships SQL today. Users see Python /
// Spark / Snowflake / Databricks chips on the welcome screen because
// those come from their resume, but clicking any of them previously
// hit a "No questions for that combo yet" wall. Now: the agent
// generates 1-20 realistic interview questions on demand, optionally
// grounded in the user's actual resume projects.

import Anthropic from "@anthropic-ai/sdk";
import type { InterviewQuestion, Difficulty } from "./questionBank/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface QuestionGenInput {
  skill: string;
  difficulty: Difficulty | "mixed";
  count: number;
  // Optional resume slice so questions can reference real projects
  // ("In your Stripe pipeline, you mentioned X — walk me through Y")
  // instead of generic textbook prompts.
  resumeContext?: {
    topRole?: string | null;
    topCompany?: string | null;
    yearsExperience?: number | null;
    experiences?: Array<{ title: string; company: string; bullets: string[] }>;
    topSkills?: string[];
  } | null;
}

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior staff engineer designing technical interview questions.

You produce REALISTIC, INTERVIEW-GRADE questions in a strict JSON shape. No fluff. No textbook reproductions. The questions must feel like what a strong interviewer would actually ask in 2024-2025.

OUTPUT FORMAT
You return ONLY a JSON array. No prose, no markdown fences, just the array. Each element matches this shape exactly:

{
  "id": "gen-<skill-lower>-<shortid>",
  "category": "<exact skill string from input>",
  "subcategory": "<specific sub-topic e.g. 'Window Functions', 'Async I/O', 'Schema Design'>",
  "difficulty": "easy" | "medium" | "hard",
  "prompt": "<the question text, 2-4 sentences max, conversational tone>",
  "contextSetup": "<schemas / DDL / function signatures / sample input — code in fenced blocks where relevant>",
  "starterCode": "<the candidate editor starter — pre-filled scaffold they extend, NOT the answer>",
  "sampleData": "<1-2 line plain-English description of sample data or expected I/O>",
  "rubric": {
    "correctApproach": "<the canonical approach, one paragraph>",
    "commonMistakes": ["<3-5 specific mistakes>"],
    "bonusPoints": ["<2-4 things a strong candidate adds>"],
    "traps": ["<2-3 subtle traps experienced interviewers watch for>"]
  },
  "expectedKeywords": ["<5-8 technical terms that should appear in a good answer>"],
  "followUps": ["<2-4 follow-up questions an interviewer would ask>"],
  "relatedConcepts": ["<2-4 adjacent topics>"],
  "companiesUse": ["<3-5 real companies that ask this type of question>"],
  "timeBenchmarkSeconds": <60-1800 — realistic median solve time>
}

DIFFICULTY CALIBRATION
- easy: a junior engineer should solve confidently in 5-10 min. Single concept, no edge cases.
- medium: requires combining 2-3 concepts. Mid-level engineers solve in 10-20 min.
- hard: senior+ territory. Requires non-obvious insights, edge cases matter, may have 2-3 ways to attack it.

RESUME GROUNDING
If the input includes resume context (experiences with specific companies + bullets), AT LEAST 30-50% of the questions should reference the candidate's actual work. Example: instead of "design a rate limiter", ask "you mentioned reducing Spark job cost by 40% at Acme — walk me through how you'd extend that approach to a streaming pipeline." Reference the bullets verbatim where natural. Don't invent projects they didn't list.

SKILL COVERAGE
For the requested skill, span sub-topics across the requested count. Don't generate 5 versions of the same window-function question. Variety matters.

DO NOT
- Wrap output in \`\`\`json fences.
- Include any text before or after the array.
- Generate questions that reveal the answer in the prompt.
- Use placeholder text ("TODO", "fill in", "your code here") in rubric fields.

OUTPUT THE ARRAY DIRECTLY.`;

// ── User message builder ──────────────────────────────────────────
function buildUserMessage(input: QuestionGenInput): string {
  const lines: string[] = [];
  lines.push(`SKILL: ${input.skill}`);
  lines.push(`DIFFICULTY: ${input.difficulty}`);
  lines.push(`COUNT: ${input.count}`);
  lines.push("");

  const r = input.resumeContext;
  if (r) {
    lines.push("CANDIDATE RESUME CONTEXT:");
    if (r.topRole && r.topCompany) lines.push(`  Current: ${r.topRole} at ${r.topCompany}`);
    if (typeof r.yearsExperience === "number") lines.push(`  Years experience: ${r.yearsExperience}`);
    if (r.topSkills && r.topSkills.length > 0) lines.push(`  Top skills: ${r.topSkills.join(", ")}`);
    if (r.experiences && r.experiences.length > 0) {
      lines.push("  Recent experiences:");
      for (const exp of r.experiences.slice(0, 4)) {
        lines.push(`    - ${exp.title} at ${exp.company}`);
        for (const b of (exp.bullets ?? []).slice(0, 3)) {
          lines.push(`      • ${b.slice(0, 220)}`);
        }
      }
    }
    lines.push("");
    lines.push("Use this resume context to ground 30-50% of questions in their real projects.");
  } else {
    lines.push("(No resume context provided — produce generic skill questions.)");
  }
  lines.push("");
  lines.push(`Produce exactly ${input.count} questions for ${input.skill} at ${input.difficulty} difficulty.`);
  lines.push("Output the JSON array directly. No fences, no preamble.");
  return lines.join("\n");
}

// ── Parser ────────────────────────────────────────────────────────
// Sonnet sometimes wraps in fences despite instruction. Strip defensively.
function extractJSONArray(raw: string): unknown[] | null {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const startIdx = t.indexOf("[");
  const endIdx = t.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  try {
    const parsed = JSON.parse(t.slice(startIdx, endIdx + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeQuestion(raw: unknown, skill: string, fallbackDifficulty: Difficulty, idx: number): InterviewQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const get = (k: string): unknown => o[k];
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const num = (v: unknown, def: number): number => (typeof v === "number" && Number.isFinite(v) ? v : def);

  const prompt = str(get("prompt")).trim();
  if (!prompt) return null;

  const rubricRaw = (get("rubric") ?? {}) as Record<string, unknown>;
  const difficultyRaw = str(get("difficulty")).toLowerCase();
  const difficulty: Difficulty = (["easy", "medium", "hard"] as const).includes(difficultyRaw as Difficulty)
    ? (difficultyRaw as Difficulty)
    : fallbackDifficulty;

  return {
    id: str(get("id")) || `gen-${skill.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${idx}`,
    category: str(get("category")) || skill,
    subcategory: str(get("subcategory")) || skill,
    difficulty,
    prompt,
    contextSetup: str(get("contextSetup")),
    starterCode: str(get("starterCode")),
    sampleData: str(get("sampleData")),
    rubric: {
      correctApproach: str(rubricRaw.correctApproach),
      commonMistakes: arr(rubricRaw.commonMistakes),
      bonusPoints: arr(rubricRaw.bonusPoints),
      traps: arr(rubricRaw.traps),
    },
    expectedKeywords: arr(get("expectedKeywords")),
    followUps: arr(get("followUps")),
    relatedConcepts: arr(get("relatedConcepts")),
    companiesUse: arr(get("companiesUse")),
    timeBenchmarkSeconds: num(get("timeBenchmarkSeconds"), 600),
  };
}

// ── Main entry ────────────────────────────────────────────────────
export async function generateQuestions(input: QuestionGenInput): Promise<InterviewQuestion[]> {
  const count = Math.max(1, Math.min(20, input.count));
  const fallbackDifficulty: Difficulty = input.difficulty === "mixed" ? "medium" : input.difficulty;

  const userMessage = buildUserMessage({ ...input, count });
  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    // Each question is ~500-900 tokens. count*1000 + headroom.
    max_tokens: Math.min(16000, count * 1200 + 1000),
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
  const parsed = extractJSONArray(raw);
  if (!parsed) {
    console.error("[question-gen] failed to parse JSON array. raw head:", raw.slice(0, 400));
    throw new Error("Question generator returned invalid JSON");
  }
  const normalized = parsed
    .map((q, i) => normalizeQuestion(q, input.skill, fallbackDifficulty, i))
    .filter((q): q is InterviewQuestion => q !== null);

  if (normalized.length === 0) {
    throw new Error("Question generator produced zero valid questions");
  }
  // Trim or pad to requested count. We don't pad — if the model gave us
  // fewer than asked, ship what we have.
  return normalized.slice(0, count);
}
