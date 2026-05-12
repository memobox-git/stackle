// Stackle Learn — lesson content store.
//
// Keyed by `<track>/<lesson-slug>`. Returns markdown source as a plain
// string; the LessonReader component handles rendering. Adding a new
// lesson = appending to this map and flipping the curriculum's
// `status` to "ready".
//
// Why a flat map instead of dynamic imports per file: keeps the bundle
// simple while content volume is small. We move to MDX + dynamic
// imports the moment we cross ~30 written lessons.

export const LESSONS: Record<string, string> = {
  "de-fundamentals/what-is-data-engineering": `
# What is Data Engineering?

Data engineers build and maintain the systems that move data from where it's *generated* to where it's *useful*. Application databases, event streams, third-party APIs, log files — all of that has to land in a warehouse or lake in a shape someone can query.

That's it. That's the job.

## The three jobs underneath

Strip the title and you'll find a DE doing some mix of:

1. **Ingestion** — pulling raw data from N sources into one place. Postgres → Snowflake. Kafka → S3. Stripe API → BigQuery.
2. **Transformation** — turning raw rows into modelled tables an analyst or ML team can actually use. \`raw_stripe_charges\` → \`fct_payments\`.
3. **Orchestration** — making sure all of that runs on a schedule, retries on failure, and tells someone when it breaks.

Different companies emphasise different pieces. At a startup you do all three plus the infra. At a FAANG you might own just one slice (e.g. "I run the streaming ingestion for ads.").

## How DE is different from adjacent roles

| Role | What they own |
|---|---|
| **Data Engineer** | Pipelines, models, reliability of the data layer |
| **Analytics Engineer** | SQL transformations on top of clean data (dbt-style) |
| **Data Analyst** | Querying clean data → dashboards + answers |
| **Data Scientist** | Statistical models, experiments, ML training data |
| **ML Engineer** | Productionising ML models — feature stores, serving infra |

The lines blur, especially at small companies where one person wears all five hats.

## What you actually need to be good at

- **SQL** — non-negotiable. Window functions, CTEs, performance tuning.
- **Python** — for everything that isn't SQL.
- **One warehouse** — pick Snowflake, BigQuery, or Redshift and go deep.
- **One orchestrator** — Airflow is still the default; Dagster and Prefect are gaining.
- **One transformation tool** — dbt is the standard.
- **Cloud basics** — S3/GCS, IAM, VPCs, at least one of AWS/GCP/Azure.

That's the floor. Above the floor you specialise: streaming, real-time, governance, ML platforms, etc.

## What's next

If this sounded familiar, skip ahead to the [Core Concepts](#) module. If parts felt fuzzy — like "what's a warehouse vs a lake" — keep going lesson by lesson; we untangle them all.
`,

  "de-fundamentals/etl-vs-elt": `
# ETL vs ELT — and why ELT won

For 30 years the pattern was ETL: **E**xtract from source → **T**ransform in some middle tier → **L**oad the clean shape into the warehouse. Informatica, Talend, SSIS — all built around this.

Then cloud warehouses got cheap and fast, and the order flipped.

## The flip

**ELT** loads the raw data into the warehouse *first*, then transforms it *there* using the warehouse's own compute.

\`\`\`
ETL:  Source → [Transform server] → Warehouse
ELT:  Source → Warehouse → [Transform inside warehouse]
\`\`\`

Three things made the flip possible:

1. **Separation of storage and compute** (Snowflake, BigQuery, Databricks). You can throw more compute at a transform without resizing storage.
2. **Columnar formats + MPP** mean SQL transformations at scale are genuinely fast.
3. **dbt** gave teams a clean way to manage SQL transformations as code.

## Why ELT won

- **You keep the raw data.** When the marketing team asks for a metric six months from now and the definition has changed, you can rebuild from raw. With ETL the raw was thrown away — you only had whatever the transform server produced.
- **Transformations are version-controlled SQL.** Pull request, review, merge. Same as application code.
- **One engine, one bill.** No separate transform tier to provision and pay for.
- **Analysts can read it.** SQL is the lingua franca; Python-on-Spark transform logic in ETL pipelines was opaque to most analysts.

## When ETL is still right

- **You're loading into a transactional system, not a warehouse.** Postgres can't chew through a billion-row transform the way Snowflake can.
- **Sensitive data has to be redacted before it hits the warehouse.** PII, payment data — sometimes the law forces a transform-before-load step.
- **You're streaming.** Streaming pipelines (Kafka → S3) usually transform in flight because there's no warehouse round-trip available.

## The vocabulary you should walk away with

- **EL/T** (sometimes written this way) — the modern stack: extract + load are one tool (Fivetran, Airbyte), transform is dbt.
- **Bronze / Silver / Gold** — Databricks' naming for raw / cleaned / business-ready layers. Same idea as raw / staging / marts in dbt.
- **Reverse ETL** — the opposite direction: shipping clean warehouse data *back out* to SaaS tools (Salesforce, HubSpot). Hightouch, Census are the tools.

That last one — reverse ETL — is the third pattern people are starting to call out separately. We'll cover it later.
`,
};

export function getLessonContent(track: string, lessonSlug: string): string | null {
  const key = `${track}/${lessonSlug}`;
  return LESSONS[key] ?? null;
}
