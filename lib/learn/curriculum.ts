// Stackle Learn — curriculum spine.
//
// Phase 0: static module/lesson structure. Lesson content lives in
// /lib/learn/lessons/<slug>.ts as exported MarkdownString. A few are
// hand-written; the rest are stubs that show "Coming soon" until we
// either author them or wire AI generation (Phase 2).
//
// Why hardcoded for now: paywall / progress / quizzes don't exist yet,
// so a database-backed CMS is premature. We migrate this to Supabase
// when content stabilises.

export type LessonStatus = "ready" | "coming-soon";

export interface Lesson {
  slug: string;            // URL segment, e.g. "what-is-data-engineering"
  title: string;
  minutes: number;         // expected read time
  free: boolean;           // gated behind paywall when false (Phase 4)
  status: LessonStatus;
}

export interface Module {
  slug: string;
  title: string;
  blurb: string;
  lessons: Lesson[];
}

export const CURRICULUM: { track: string; modules: Module[] }[] = [
  {
    track: "de-fundamentals",
    modules: [
      {
        slug: "what-is-de",
        title: "What is Data Engineering?",
        blurb: "Get oriented. Where DE sits, what DEs actually do, and how the role differs from analytics and ML.",
        lessons: [
          { slug: "what-is-data-engineering",    title: "What is Data Engineering?",                  minutes: 5, free: true, status: "ready" },
          { slug: "de-vs-analyst-vs-scientist",  title: "DE vs Analyst vs Scientist",                 minutes: 4, free: true, status: "coming-soon" },
          { slug: "a-day-in-the-life",           title: "A day in the life of a DE",                  minutes: 5, free: true, status: "coming-soon" },
          { slug: "the-modern-data-stack",       title: "The modern data stack — the 60-second tour", minutes: 6, free: true, status: "coming-soon" },
        ],
      },
      {
        slug: "core-concepts",
        title: "Core Concepts Every DE Must Know",
        blurb: "The vocabulary you're expected to be fluent in by week one.",
        lessons: [
          { slug: "etl-vs-elt",                  title: "ETL vs ELT — and why ELT won",               minutes: 5, free: true, status: "ready" },
          { slug: "batch-vs-streaming",          title: "Batch vs streaming",                         minutes: 6, free: false, status: "coming-soon" },
          { slug: "star-vs-snowflake-schema",    title: "Star vs snowflake schema",                   minutes: 7, free: false, status: "coming-soon" },
          { slug: "scd-types",                   title: "Slowly-changing dimensions (SCD types)",     minutes: 8, free: false, status: "coming-soon" },
          { slug: "data-lake-vs-warehouse",      title: "Data lake vs data warehouse vs lakehouse",   minutes: 6, free: false, status: "coming-soon" },
        ],
      },
      {
        slug: "tech-landscape",
        title: "The DE Tech Landscape",
        blurb: "Pick your fights. Which tool solves which problem, and what people actually use in production.",
        lessons: [
          { slug: "warehouses-snowflake-bq-rs",  title: "Warehouses: Snowflake vs BigQuery vs Redshift", minutes: 8, free: false, status: "coming-soon" },
          { slug: "orchestration-airflow",       title: "Orchestration: Airflow, Dagster, Prefect",   minutes: 7, free: false, status: "coming-soon" },
          { slug: "transforms-dbt",              title: "Transforms in SQL: dbt for everyone",        minutes: 8, free: false, status: "coming-soon" },
          { slug: "streaming-kafka-flink",       title: "Streaming: Kafka + Flink basics",            minutes: 9, free: false, status: "coming-soon" },
        ],
      },
      {
        slug: "interviews",
        title: "How to Prep for DE Interviews",
        blurb: "The shape of the loop. SQL bar, system design, behavioural — what to expect and how to drill.",
        lessons: [
          { slug: "the-de-loop",                 title: "What a DE interview loop looks like",        minutes: 6, free: true, status: "coming-soon" },
          { slug: "sql-bar",                     title: "The SQL bar at FAANG and FAANG-likes",        minutes: 8, free: false, status: "coming-soon" },
          { slug: "system-design-de",            title: "System design for DEs — a 4-step framework", minutes: 10, free: false, status: "coming-soon" },
          { slug: "behavioural-for-de",          title: "Behavioural questions DEs actually get",     minutes: 5, free: false, status: "coming-soon" },
        ],
      },
    ],
  },
];

export function findLesson(trackSlug: string, lessonSlug: string): { module: Module; lesson: Lesson } | null {
  const track = CURRICULUM.find((t) => t.track === trackSlug);
  if (!track) return null;
  for (const m of track.modules) {
    const lesson = m.lessons.find((l) => l.slug === lessonSlug);
    if (lesson) return { module: m, lesson };
  }
  return null;
}

export function getTrack(trackSlug: string) {
  return CURRICULUM.find((t) => t.track === trackSlug) ?? null;
}
