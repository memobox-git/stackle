import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import ResumeReportCard from "@/components/ResumeReportCard";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function SharedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("reports")
    .select("report_data, candidate_name, score")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const analysis = data.report_data as ResumeAnalysis;
  const candidateName = data.candidate_name ?? undefined;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", padding: "32px 16px" }}>
      {/* Stackle brand bar */}
      <div style={{
        maxWidth: "860px",
        margin: "0 auto 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "monospace", fontSize: "13px", color: "#5c5c6e", letterSpacing: "0.12em" }}>
          STACKLE · RESUME REPORT
        </span>
        <a
          href="/"
          style={{
            fontSize: "12px",
            color: "#7c6af7",
            textDecoration: "none",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Get your own review →
        </a>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", borderRadius: "12px", overflow: "hidden" }}>
        <ResumeReportCard analysis={analysis} candidateName={candidateName} />
      </div>

      <div style={{ maxWidth: "860px", margin: "24px auto 0", textAlign: "center" }}>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 24px",
            background: "#7c6af7",
            color: "#fff",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Review my resume on Stackle
        </a>
      </div>
    </div>
  );
}
