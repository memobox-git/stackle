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
  "de-fundamentals/de-vs-analyst-vs-scientist": `
# DE vs Analyst vs Scientist

The three titles bleed into each other constantly, especially at small companies where one person does all three jobs. But the *separation of concerns* is real, and recruiters interview against it. Knowing where you fit changes how you pitch yourself.

## The simplest split

Think of it as a relay race for data:

\`\`\`
[Sources]
   ↓
Data Engineer  — gets it into one place, makes it queryable
   ↓
Data Analyst   — answers business questions from the clean data
   ↓
Data Scientist — builds models, runs experiments, finds non-obvious patterns
\`\`\`

A DE hands off cleaned, modelled tables. An analyst writes SQL against those tables to answer "how did sales perform in EU last quarter?" A data scientist might use the same tables to build a forecasting model.

## What each role actually does on a Tuesday

| | Data Engineer | Data Analyst | Data Scientist |
|---|---|---|---|
| **Owns** | Pipelines, models, infra | Dashboards, ad-hoc queries | Models, experiments |
| **Writes most** | Python, SQL, YAML | SQL, dashboard formulas | Python (pandas, scikit-learn, PyTorch) |
| **Cares about** | Reliability, freshness, cost | Correctness, clarity | Predictive accuracy, statistical rigour |
| **Talks to** | Backend engineers, infra | Product, finance, marketing | PM, ML eng, research |

## The hybrid roles you'll see in postings

- **Analytics Engineer** — sits between DE and analyst. Owns the SQL transformation layer (dbt). Doesn't build pipelines, doesn't build dashboards, just turns raw tables into clean modelled ones. Born from the dbt era; most new postings split it out.
- **ML Engineer** — sits next to data scientist. Owns the *productionisation* — feature stores, model serving, monitoring. The scientist builds the model offline; the ML engineer makes it run at scale.
- **Full-stack Data person** — small startup pattern. One person does ingest → transform → dashboard → model. Great for learning, painful for depth.

## Which role is hot right now

Analytics engineering and ML engineering are the two roles growing fastest in postings. Pure data analyst roles are softening (LLMs eat ad-hoc query work). Pure DE roles are stable. Data scientist demand has cooled from its 2018 peak but is still very real for product/finance domains.

If you're choosing a path: AE if you love SQL and modelling, MLE if you love systems and infra, DS if you love stats and experimentation, DE if you love systems and don't mind being on call for the pipeline that ships at 3am.
`,

  "de-fundamentals/a-day-in-the-life": `
# A day in the life of a DE

There's no typical day, but there is a typical *rhythm*. Most DEs split their week into four kinds of time:

## 1. Reactive — "the pipeline broke"

Roughly 30% of a senior DE's time on a normal week, sometimes 80% on a bad week.

Examples:
- Airflow DAG failed at 3am because a source API changed its schema. You wake up, push a hotfix, backfill.
- An analyst Slacks "yesterday's numbers look wrong." You trace upstream, find that a Kafka consumer group lagged and dropped two hours of events.
- A new dimension table is suddenly 10x slower because someone introduced a fan-out join. You fix the join and bake in a row-count check.

The first year of any DE job is mostly this. The compounding skill is building things so well that this bucket shrinks.

## 2. Build — "ship the new pipeline"

The kind of work that goes on your resume.

Examples:
- New product feature → new event schema → new ingest pipeline + warehouse model + dashboard.
- Migrating a legacy Talend ETL job to dbt.
- Standing up a real-time feature store for the ML team.

You'll do less of this than you expect early in your career. Senior DEs do more of it because they're trusted with bigger scope.

## 3. Plumbing — "make the platform better"

The work nobody asked for that quietly compounds:

- Cutting Snowflake cost by 40% by adding clustering keys to three hot tables.
- Replacing a brittle bash script with a proper Airflow operator.
- Writing a CI check that fails any PR that breaks dbt test coverage.

This is the work that gets you promoted. It's also the work you have to *find time for* — nobody schedules it for you.

## 4. Meetings + code review

15-25% of a senior DE's week. Standup, planning, design review, PR review, the occasional architecture meeting with a peer team. Less than backend engineers but more than you'd think.

## What you almost never do

- Build dashboards (that's the analyst).
- Train models (that's the scientist).
- Write user-facing code (that's the product engineer).
- Manage people (until you're a lead or staff).

## A real Tuesday

> 09:00 — Standup. The PII redaction pipeline failed overnight; you take it.
> 09:30 — Trace the failure to a Snowflake task that timed out. Bump the warehouse size, kick off a rerun.
> 10:30 — Two PRs to review: a dbt model from an analyst, a new ingest from a junior DE.
> 11:30 — Design doc for the next sprint: streaming clickstream into the warehouse. You sketch the topology.
> 13:00 — Lunch.
> 14:00 — Pair session with the ML team on a feature store schema.
> 15:30 — Cost audit. Snowflake bill jumped 12% — you find an analyst running unindexed full scans.
> 17:00 — Write up the redaction failure as a postmortem. Send Slack update.
> 18:00 — Done.

That's a *good* day. The bad days are the postmortem-then-another-postmortem days.
`,

  "de-fundamentals/the-modern-data-stack": `
# The modern data stack — the 60-second tour

"Modern data stack" (MDS) is the post-2018 architecture that replaced the Hadoop / Informatica / on-prem warehouse era. If a posting mentions it, they mean roughly these six pieces:

\`\`\`
[Sources] → [Ingest] → [Warehouse] → [Transform] → [BI / Reverse ETL] → [Consumers]
\`\`\`

## The six layers

**1. Sources.** Your app's Postgres, Stripe, Salesforce, server logs, mobile events. Anything that produces data.

**2. Ingest (EL).** Tools that move data from source → warehouse with minimal transformation.
- *Tools:* Fivetran, Airbyte, Stitch, Hevo. Custom Python is still common for weird sources.

**3. Warehouse.** Where the data actually lives.
- *Tools:* Snowflake, BigQuery, Databricks (technically a lakehouse), Redshift, Firebolt.
- Pick one and go deep — they're 80% the same conceptually.

**4. Transform (T).** SQL that turns raw tables into modelled, business-ready tables.
- *Tools:* dbt is the standard. SQLMesh is the up-and-comer.

**5. Orchestration.** Schedules everything, retries failures, alerts on breakage.
- *Tools:* Airflow (still the default), Dagster, Prefect, Mage, Temporal for non-DAG workflows.

**6. BI / activation.** What consumes the clean data.
- *BI:* Looker, Tableau, Hex, Mode, Metabase.
- *Reverse ETL:* Hightouch, Census — ship warehouse data back out to Salesforce, HubSpot, etc.

## What sits on top

- **Observability** — Monte Carlo, Bigeye, Elementary. Detect "your pipeline ran but the numbers are wrong."
- **Catalog / governance** — Atlan, Collibra, Stemma. Who owns what table, what does this column mean, who has access.
- **Streaming** — Kafka, Kinesis, Pulsar for the data; Flink, Materialize, RisingWave for the processing.

## Why the MDS pattern won

Three reasons:

1. **Decoupling.** Each layer is a swappable best-of-breed tool. You can move from Fivetran to Airbyte without ripping out dbt.
2. **SQL as the lingua franca.** Analytics engineers can do real engineering work without leaving SQL.
3. **Cloud-native pricing.** Pay for compute when you use it. The 2010s pattern of pre-paying for a 20-node Hadoop cluster is dead.

## What "MDS" doesn't include

- Real-time / streaming. Slowly being absorbed but still a parallel stack.
- ML training infrastructure. SageMaker, Vertex, etc — separate world.
- Application backend. Postgres / DynamoDB / your microservices — that's *upstream* of the MDS.

## The minimum stack to ship something today

If you're starting fresh and need to be productive in a week:
- **Postgres** (source) → **Fivetran or Airbyte** (ingest) → **BigQuery or Snowflake** (warehouse) → **dbt** (transform) → **Metabase or Hex** (BI). Orchestrate with **dbt Cloud** or **Airflow**.

That stack costs $200-500/month for a small team and runs companies pulling in nine-figure ARR.
`,

  "de-fundamentals/batch-vs-streaming": `
# Batch vs streaming

The single biggest architectural choice in data engineering: do you process data in chunks on a schedule, or as it arrives in real time?

The honest answer for 90% of use cases: **batch is fine and probably what you want**. Streaming is real but expensive, both in money and in engineering complexity. People over-stream constantly. Don't be one of them.

## The mental model

**Batch.** Wait, collect, process all at once.
- "Every hour, take the last hour of orders and update the warehouse."
- Familiar tools: SQL, Spark, dbt, Airflow.
- Latency: minutes to hours.

**Streaming.** Process every event the instant it arrives.
- "The moment a user clicks 'pay', update the fraud-score table within 200ms."
- Familiar tools: Kafka, Flink, Kinesis, Materialize.
- Latency: milliseconds to seconds.

## When streaming actually matters

Three buckets, in roughly this order:

1. **User-facing latency.** Fraud detection, real-time recommendations, abuse detection. If a slow signal means lost money or user harm, you stream.
2. **Operational dashboards.** Trading floors, ad bidding, on-call ops. Numbers stale by 30 minutes are useless.
3. **Event-driven integration.** "When X happens, trigger Y in another system." Often better with event buses than batch ETL.

## When batch wins (the underrated default)

- Finance / accounting close. End-of-day is fine.
- Analytics dashboards refreshed hourly. Nobody is making decisions on the minute.
- ML training data. Daily refresh is plenty.
- 99% of internal data products.

**Cost.** A streaming Flink job that processes 1M events/hour costs ~10x what an hourly batch job costs to do the same thing in a warehouse.

**Complexity.** Watermarks, exactly-once semantics, dead-letter queues, state stores, backpressure. All of these become problems you have to solve in streaming. None of them exist in batch.

## The "micro-batch" middle ground

Spark Streaming, dbt's incremental models running every 5 minutes, Snowflake Tasks every minute. They feel like streaming from a latency standpoint but use batch primitives underneath. *This is what most teams calling themselves "real-time" actually do.* It's fine. It's usually the right answer.

## The vocabulary you'll get asked about

- **Lambda architecture** — run a batch layer for accuracy + a streaming layer for speed, merge results. Mostly dead but interviewers still ask.
- **Kappa architecture** — only streaming, batch is just a special case. The "modern" replacement.
- **Exactly-once** — the holy grail in streaming. Hard. Kafka + Flink achieves it under specific conditions.
- **Watermark** — how a streaming system knows "I've seen all events for time T" so it can finalise aggregates. Late-arriving events break this.

## A useful heuristic

Ask: *"What's the cost of a 1-hour delay on this data?"* If the answer is "nothing", batch. If the answer is "we lose customers / money / reputation", streaming.
`,

  "de-fundamentals/star-vs-snowflake-schema": `
# Star vs snowflake schema

Two ways to model a data warehouse. Star is the answer 95% of the time. Snowflake is the answer the other 5% — and exists mostly so interviewers can ask you the difference.

## The setup

You have a warehouse. You want to answer "how much revenue per region per product category last quarter?" That requires joining a *fact* (revenue rows) to multiple *dimensions* (region, product, time).

## Star schema

One fact table at the centre, dimension tables radiating out. *Each dimension is a single denormalised table.* The shape on a diagram looks like a star.

\`\`\`
              dim_date
                 |
dim_region — fct_orders — dim_product
                 |
            dim_customer
\`\`\`

\`dim_product\` would have everything about a product flat — name, category, sub-category, brand, supplier, supplier_country — all in one table.

## Snowflake schema

Same idea, but each dimension is **further normalised** into multiple tables. \`dim_product\` would split into \`dim_product\` → \`dim_category\` → \`dim_subcategory\`, with the product table holding only an FK to its category, which holds only an FK to its subcategory, etc.

The shape on a diagram branches and re-branches — like a snowflake.

## Why star wins

**Query speed.** Joining 4 tables (one fact + three dimensions) is fast. Joining 14 tables (one fact + three dimensions, each split into 4 sub-tables) is not.

**Analyst sanity.** A junior analyst can write \`SELECT region, SUM(revenue) FROM fct_orders JOIN dim_region ...\`. They cannot easily write a 14-way join.

**Modern warehouses don't care about storage.** The whole reason snowflake schema existed historically was to save disk — duplicate data costs money on a 1990s on-prem warehouse. Snowflake/BigQuery storage is cheap; that pressure is gone.

## When snowflake schema is right

**Slowly-changing dimensions with deep hierarchies.** A retail product taxonomy that's 6 levels deep, where the upper levels change often and you need to maintain history. Snowflaking gives you a single place to update each level.

**Regulatory data with reusable sub-dimensions.** Healthcare codes, financial instrument types — when the same sub-hierarchy is referenced by multiple top-level dims.

That's roughly it. If you can't justify it with one of those, use a star.

## What you'll get asked

> "Walk me through how you'd model an e-commerce orders dataset."

Right answer: **star schema**. \`fct_orders\` as the grain (one row per order line), with \`dim_product\`, \`dim_customer\`, \`dim_store\`, \`dim_date\` denormalised. Mention you'd handle product categorisation as a denormalised set of columns inside \`dim_product\` (\`category\`, \`subcategory\`, \`brand\`) unless there's a reason to snowflake the taxonomy.

Wrong answer: starting with normalised 3NF and "joining as needed". That's an OLTP pattern, not an analytical warehouse pattern.
`,

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
