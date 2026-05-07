// Company personas — Phase 3 Interview Prep. Tailors the Skill Agent's
// question selection + tone to a specific company's interview pattern.
//
// MVP: 6 companies seeded with the data the spec calls out (interview
// style, question emphasis, cultural signals, common questions, red
// flags). Question routing biases by `question_emphasis` percentages
// against the candidate's available question bank.
//
// Phase 3 expansion target: 10 companies (Google, Meta, Amazon, Apple,
// Microsoft, Netflix, Stripe, Snowflake, Databricks, Salesforce).

export interface CompanyPersona {
  key: string;
  name: string;
  interviewStyle: string;
  questionEmphasis: { sql: number; distributedSystems: number; realTimeScenarios: number };
  interviewerPersona: "senior_engineer" | "tech_lead" | "principal";
  culturalSignals: string[];
  commonQuestions: string[];
  redFlagsInAnswers: string[];
}

export const COMPANY_PERSONAS: Record<string, CompanyPersona> = {
  google: {
    key: "google",
    name: "Google",
    interviewStyle: "Algorithm-first, ambiguous problem statements that test how you scope and clarify before coding. Emphasis on Big O reasoning, edge cases, and clean code.",
    questionEmphasis: { sql: 30, distributedSystems: 40, realTimeScenarios: 30 },
    interviewerPersona: "senior_engineer",
    culturalSignals: ["scale", "trade-off awareness", "googliness", "clarifying questions"],
    commonQuestions: [
      "Design a system to detect duplicate documents at web scale",
      "Write SQL to compute the 7-day rolling DAU",
      "Optimize a slow query reading 10TB of logs",
    ],
    redFlagsInAnswers: ["jumping straight to code without clarifying", "ignoring scale", "no Big O discussion"],
  },
  meta: {
    key: "meta",
    name: "Meta",
    interviewStyle: "Pragmatic, product-aware. Behavioural questions probe ownership and impact. Technical screens emphasize execution speed.",
    questionEmphasis: { sql: 50, distributedSystems: 30, realTimeScenarios: 20 },
    interviewerPersona: "tech_lead",
    culturalSignals: ["move fast", "user value", "data-informed decisions", "ownership"],
    commonQuestions: [
      "Compute the retention curve for users who signed up last month",
      "Design a system for friend recommendations",
      "Tell me about a time you shipped something with imperfect data",
    ],
    redFlagsInAnswers: ["over-engineering", "ignoring product impact", "blaming others in behaviourals"],
  },
  amazon: {
    key: "amazon",
    name: "Amazon",
    interviewStyle: "Leadership Principles drive the bar. Every behavioural answer should map to one or two LPs. Technical questions test customer-impact reasoning.",
    questionEmphasis: { sql: 45, distributedSystems: 35, realTimeScenarios: 20 },
    interviewerPersona: "senior_engineer",
    culturalSignals: ["customer obsession", "ownership", "dive deep", "frugality"],
    commonQuestions: [
      "Design a recommendation pipeline for a new product launch",
      "Write SQL to find the top sellers per category in the last 30 days",
      "Tell me about a time you made a decision with insufficient data",
    ],
    redFlagsInAnswers: ["not citing Leadership Principles", "vague metrics", "no ownership signal"],
  },
  snowflake: {
    key: "snowflake",
    name: "Snowflake",
    interviewStyle: "Rigorous SQL, data architecture focus. Customer-facing scenarios. Cost and concurrency awareness expected.",
    questionEmphasis: { sql: 60, distributedSystems: 25, realTimeScenarios: 15 },
    interviewerPersona: "senior_engineer",
    culturalSignals: ["customer-facing scenarios", "data marketplace concepts", "warehouse architecture"],
    commonQuestions: [
      "Compare warehouse vs data lake architectures",
      "Design a real-time inventory system",
      "Optimize a slow-running query",
    ],
    redFlagsInAnswers: ["treating SQL as scripting", "ignoring concurrency", "no mention of cost"],
  },
  databricks: {
    key: "databricks",
    name: "Databricks",
    interviewStyle: "Lakehouse-first thinking, Spark fluency expected, MLOps awareness for senior+ roles.",
    questionEmphasis: { sql: 35, distributedSystems: 45, realTimeScenarios: 20 },
    interviewerPersona: "tech_lead",
    culturalSignals: ["open-source contributions", "Spark internals", "Delta Lake mental model"],
    commonQuestions: [
      "Optimize a Spark job that's spilling to disk",
      "Design a Delta Lake table layout for late-arriving data",
      "Walk me through the Spark execution model end-to-end",
    ],
    redFlagsInAnswers: ["confusing RDD vs DataFrame APIs", "no partitioning strategy", "ignoring shuffles"],
  },
  stripe: {
    key: "stripe",
    name: "Stripe",
    interviewStyle: "Production-mindedness, idempotency, edge-case obsession (NULLs, retries, timezone). Engineering-quality bar is high.",
    questionEmphasis: { sql: 50, distributedSystems: 30, realTimeScenarios: 20 },
    interviewerPersona: "senior_engineer",
    culturalSignals: ["users they don't know about", "idempotency", "data integrity", "operational excellence"],
    commonQuestions: [
      "Design an idempotent payment retry system",
      "Write SQL to identify suspicious account activity",
      "Walk through how you'd debug a single failed webhook",
    ],
    redFlagsInAnswers: ["ignoring retries", "no idempotency mention", "casual about NULL handling"],
  },
};

export const COMPANY_KEYS = Object.keys(COMPANY_PERSONAS);

export function getCompanyPersona(key: string): CompanyPersona | null {
  return COMPANY_PERSONAS[key.toLowerCase()] ?? null;
}
