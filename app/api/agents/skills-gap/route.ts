// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ResumeExtraction, SkillGroup } from "@/lib/agents/schemas/resumeExtraction";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior recruiter and a staff engineer at a top-tier tech company, combined.

Given a candidate's FULL resume text, their currently-listed skills, and their target role, you do THREE things:

STEP 1 — SKILL SWEEP:
Read the entire resume text — bullets, project descriptions, titles, summary. List every technical skill, tool, framework, language, platform, database, cloud service, library, or technique that is EXPLICITLY mentioned. Technical only — NO soft skills, NO methodologies like "Agile" unless it's clearly a tooling claim ("Agile/Scrum" doesn't count; "Jira" does). Include the skills already in the candidate's skill groups. Deduplicate case-insensitively (e.g. "python" and "Python" are one).

STEP 2 — CATEGORISE (STRICT 8-CATEGORY TAXONOMY):
Group the sweep results into EXACTLY these 8 canonical categories. NEVER invent new ones. NEVER use generic labels like "Tools", "Misc", "Other".

The 8 categories and what belongs in each:

1. Languages — programming languages ONLY (Python, SQL, PL/SQL, Java, Scala, Go, TypeScript, R, Bash). Data formats like JSON/XML/YAML do NOT belong here — drop them.
2. Data Processing & ETL — Spark, PySpark, Spark SQL, Hadoop, Kafka, Airflow, Prefect, Dagster, dbt (when used as transformation), Pandas, NumPy (as data lib), Beam, Flink, ETL/ELT pipelines, Batch & Streaming Processing, SQL*Loader, Informatica, Talend.
3. Cloud — AWS, Azure, GCP, S3, EC2, Lambda, Glue, EMR, Azure Data Factory, BigQuery (the platform service), GCS, Cloud Run, Cloud Functions.
4. Data Warehousing — actual warehouse/lakehouse PRODUCTS only: Snowflake, BigQuery (when listed as warehouse), Redshift, Databricks, Synapse, Teradata, Vertica, ClickHouse, Iceberg, Delta Lake. NEVER concepts like "Distributed Systems" or "Big Data Architecture" — drop those entirely.
5. Visualization & BI — Tableau, Power BI, Looker, Mode, Metabase, Superset, Matplotlib, Seaborn, Plotly, D3.js.
6. CI/CD & DevOps — Jenkins, GitHub Actions, GitLab CI, Docker, Kubernetes, Terraform, Helm, Git, GitHub, Linux, Bash scripting, REST APIs (as integration tooling), Postman, VS Code.
7. Data Quality & Observability — ONLY data-quality / monitoring tools: Great Expectations, Soda, Monte Carlo, dbt tests, Datafold, Pipeline monitoring, Prometheus (when used for data), Grafana, DataDog (data context). If the candidate has none of these, return an empty skills array for this category and the UI will hide it.
8. ML & Analytics — scikit-learn, TensorFlow, PyTorch, XGBoost, LightGBM, MLflow, NumPy (when ML), HuggingFace, LangChain, statsmodels, SciPy.

Hard rules:
- A skill must appear in EXACTLY ONE category. If you're tempted to put it in two, pick the more specific one.
- Pandas/NumPy → Data Processing & ETL (NOT Data Quality).
- REST APIs → CI/CD & DevOps.
- JSON/XML/YAML → drop entirely (data formats, not skills).
- Distributed Systems / Big Data Architecture → drop (concepts, not products).
- Output ALL 8 categories in the recategorizedGroups array, in the order above. Empty categories return { category: "...", skills: [] } so the UI can hide them. NEVER skip a category from the array.

STEP 3 — MISSING:
For the target role, add 8-12 high-priority skills the candidate is missing. Cover the gap across multiple categories — don't just suggest 12 ML tools if they're missing cloud + warehouse too. Only suggest skills appropriate to their seniority. Never suggest soft skills. Never suggest anything already in the sweep (step 1 output), even under a different name (case-insensitive match: "Apache Airflow" and "Airflow" are duplicates — drop the suggestion). One tight reason line per suggestion.

OUTPUT FORMAT — valid JSON only, no markdown fences:
{
  "currentGroups":       [{ "category": "string", "skills": ["..."] }],
  "recategorizedGroups": [{ "category": "string", "skills": ["..."] }],
  "missing": [
    { "skill": "Spark", "category": "Data & Databases", "reason": "80%+ of Senior DE JDs list Spark for distributed compute.", "priority": "high" }
  ],
  "chatLine": "For Senior Data Engineer roles you're already strong on Python + SQL. Add Spark, Airflow, dbt — those show up in 80%+ of target JDs."
}

"currentGroups" mirrors the candidate's CURRENT skill groups (what's in the resume's Skills section today, unchanged).
"recategorizedGroups" is the FULL sweep + categorisation from steps 1 and 2 — this is the proposed new skills section.
"chatLine" is what a smart friend would say. Direct, specific, no fluff. Max 220 chars.`;

interface SkillsGapRequest {
  extraction: ResumeExtraction;
  targetRole?: string | null;
  seniority?: string | null;
  // Full parsed resume text so the model can sweep for technical skills
  // mentioned in bullets / projects / titles that never made it into the
  // Skills section.
  resumeText?: string | null;
}

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 10, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  try {
    const body = (await req.json()) as SkillsGapRequest;
    if (!body.extraction) {
      return NextResponse.json({ error: "extraction is required" }, { status: 400 });
    }

    const currentSkills = (body.extraction.skillGroups ?? [])
      .map((g: SkillGroup) => `${g.category}: ${g.skills.join(", ")}`)
      .join("\n");

    // Cap raw text at ~12k chars to stay well under token budget.
    const rawText = (body.resumeText ?? "").slice(0, 12000);

    const userMessage = `Target role: ${body.targetRole ?? "not specified — infer from resume"}
Seniority: ${body.seniority ?? "not specified — infer from resume"}

Candidate's CURRENT skill groups (verbatim — preserve in currentGroups):
${currentSkills || "(no skills listed)"}

${rawText ? `FULL RESUME TEXT — sweep this for every technical skill mentioned:
---
${rawText}
---` : `Experience signal (no full resume text available — infer from bullets):
${(body.extraction.experience ?? []).slice(0, 5).map((e, i) =>
  `[${i}] ${e.title} at ${e.company}: ${(e.bullets ?? []).slice(0, 5).join(" | ")}`
).join("\n")}

Projects: ${(body.extraction.projects ?? []).slice(0, 5).map((p) => `${p.name}: ${p.description ?? ""}`).join(" | ")}

Summary: ${body.extraction.summary ?? "(none)"}`}

Return the JSON described. Do the sweep, categorise, and list missing.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
      const parsed = JSON.parse(jsonText);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON", raw }, { status: 500 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
