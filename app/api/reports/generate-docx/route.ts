// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, ShadingType, BorderStyle, WidthType,
  convertInchesToTwip,
} from "docx";
import { ResumeAnalysis, ScoreCategory } from "@/lib/agents/schemas/resumeIntelligence";

// ── Color constants ───────────────────────────────────────────────────────────

const NAVY = "2E4057";
const WHITE = "FFFFFF";
const GREEN = "16A34A";
const ORANGE = "D97706";
const RED = "DC2626";
const BLUE = "1D4ED8";
const LIGHT_GRAY = "F3F4F6";
const MID_GRAY = "6B7280";

// ── Helpers ───────────────────────────────────────────────────────────────────

function badgeColor(status: ScoreCategory["status"]): string {
  if (status === "STRONG") return BLUE;
  if (status === "GOOD") return GREEN;
  if (status === "REVIEW") return ORANGE;
  return RED;
}

function overallBadge(total: number): { label: string; color: string } {
  if (total >= 88) return { label: "STRONG", color: BLUE };
  if (total >= 75) return { label: "SOLID", color: GREEN };
  if (total >= 60) return { label: "REVIEW", color: ORANGE };
  return { label: "WEAK", color: RED };
}

function scoreBar(score: number, max: number): string {
  const pct = Math.min(1, score / max);
  const filled = Math.round(pct * 12);
  return "\u2588".repeat(filled) + "\u2591".repeat(12 - filled);
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: NAVY, size: 22, font: "Calibri" })],
    spacing: { before: 300, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
  });
}

function bodyPara(text: string, opts?: { bold?: boolean; color?: string; size?: number; after?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({
      text,
      font: "Calibri",
      size: opts?.size ?? 20,
      bold: opts?.bold,
      color: opts?.color ?? "111111",
    })],
    spacing: { after: opts?.after ?? 80 },
  });
}

function bulletPara(text: string, color?: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, font: "Calibri", size: 20, color: color ?? "374151" })],
    indent: { left: 300 },
    spacing: { after: 50 },
  });
}

function priorityLabel(action: string): string {
  const u = action.toUpperCase();
  if (u.startsWith("HIGH")) return "HIGH";
  if (u.startsWith("MEDIUM")) return "MEDIUM";
  if (u.startsWith("LOW")) return "LOW";
  return "MEDIUM";
}

function priorityColor(label: string): string {
  if (label === "HIGH") return RED;
  if (label === "MEDIUM") return ORANGE;
  return "6366F1";
}

type DocChild = Paragraph | Table;

function tdCell(
  text: string,
  opts?: {
    bold?: boolean; color?: string; bg?: string;
    size?: number; width?: number;
    align?: typeof AlignmentType[keyof typeof AlignmentType];
    courier?: boolean;
  }
): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text,
        font: opts?.courier ? "Courier New" : "Calibri",
        size: opts?.size ?? 20,
        bold: opts?.bold,
        color: opts?.color ?? "111111",
      })],
      alignment: opts?.align ?? AlignmentType.LEFT,
    })],
    shading: opts?.bg ? { type: ShadingType.CLEAR, fill: opts.bg } : undefined,
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

function tableWithBorders(rows: TableRow[], totalWidth = 8100): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" };
  const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" };
  return new Table({
    rows,
    width: { size: totalWidth, type: WidthType.DXA },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    borders: { top: border, bottom: border, left: border, right: border, insideH: thinBorder, insideV: thinBorder } as any,
  });
}

// ── Document builder ──────────────────────────────────────────────────────────

async function buildDoc(
  analysis: ResumeAnalysis,
  candidateName: string,
  targetMarket: string,
  seniorityLevel: string,
  reviewType: string,
): Promise<Buffer> {
  const scores = analysis.scores;
  const badge = overallBadge(scores.total);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const cats = [
    { label: "ATS Compatibility",  ...scores.atsCompatibility },
    { label: "Content & Impact",   ...scores.contentImpact },
    { label: "Structure & Format", ...scores.structureFormatting },
    { label: "Keyword Coverage",   ...scores.keywordCoverage },
    { label: "Seniority Signal",   ...scores.senioritySignal },
  ];

  const children: DocChild[] = [];

  // ── HEADER ──────────────────────────────────────────────────────────────────
  children.push(new Paragraph({
    children: [new TextRun({ text: "STACKLE · RESUME INTELLIGENCE REPORT", font: "Calibri", size: 16, color: MID_GRAY, bold: true, allCaps: true })],
    spacing: { after: 40 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: candidateName, font: "Calibri", size: 36, bold: true, color: NAVY })],
    spacing: { after: 80 },
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: analysis.likelyTargetRole ?? "Resume Review", font: "Calibri", size: 22, color: NAVY }),
      new TextRun({ text: `  ·  ${targetMarket}  ·  ${seniorityLevel}  ·  ${reviewType}`, font: "Calibri", size: 20, color: MID_GRAY }),
    ],
    spacing: { after: 40 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: today, font: "Calibri", size: 18, color: MID_GRAY })],
    spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 6 } },
  }));

  // ── SCORE SUMMARY ────────────────────────────────────────────────────────────
  children.push(sectionHeading("SCORE SUMMARY"));
  children.push(tableWithBorders([
    new TableRow({
      tableHeader: true,
      children: [
        tdCell("Category", { bold: true, bg: LIGHT_GRAY, width: 3400 }),
        tdCell("Score",    { bold: true, bg: LIGHT_GRAY, width: 900, align: AlignmentType.CENTER }),
        tdCell("Visual",   { bold: true, bg: LIGHT_GRAY, width: 2400 }),
        tdCell("Status",   { bold: true, bg: LIGHT_GRAY, width: 1400 }),
      ],
    }),
    ...cats.map((cat) => new TableRow({
      children: [
        tdCell(cat.label, { width: 3400 }),
        tdCell(`${cat.score}/${cat.max}`, { align: AlignmentType.CENTER, width: 900, bold: true, color: badgeColor(cat.status) }),
        tdCell(scoreBar(cat.score, cat.max), { courier: true, size: 16, color: badgeColor(cat.status), width: 2400 }),
        tdCell(cat.status, { bold: true, bg: badgeColor(cat.status), color: WHITE, width: 1400 }),
      ],
    })),
    new TableRow({
      children: [
        tdCell("Overall Total",                { bold: true, bg: NAVY, color: WHITE, width: 3400 }),
        tdCell(`${scores.total}/100`,          { align: AlignmentType.CENTER, bold: true, bg: badge.color, color: WHITE, width: 900 }),
        tdCell(scoreBar(scores.total, 100),    { courier: true, size: 16, color: WHITE, bg: badge.color, width: 2400 }),
        tdCell(badge.label,                    { bold: true, bg: badge.color, color: WHITE, width: 1400 }),
      ],
    }),
  ]));
  children.push(bodyPara(`Projected post-fix score: ${scores.projectedPostFix} / 100`, { bold: true, color: GREEN, after: 200 }));

  // ── OVERALL ASSESSMENT ───────────────────────────────────────────────────────
  children.push(sectionHeading("OVERALL ASSESSMENT"));
  children.push(bodyPara(analysis.overallAssessment, { after: 200 }));

  // ── AT A GLANCE ──────────────────────────────────────────────────────────────
  children.push(sectionHeading("AT A GLANCE"));
  children.push(tableWithBorders([
    new TableRow({
      tableHeader: true,
      children: [
        tdCell("Strengths",        { bold: true, bg: "F0FDF4", color: GREEN, width: 4050 }),
        tdCell("Areas to Improve", { bold: true, bg: "FFF7ED", color: ORANGE, width: 4050 }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: analysis.strengths.slice(0, 6).map((s) => new Paragraph({
            children: [new TextRun({ text: `\u2713  ${s}`, font: "Calibri", size: 18, color: "374151" })],
            spacing: { after: 60 },
          })),
          width: { size: 4050, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { type: ShadingType.CLEAR, fill: "F0FDF4" },
        }),
        new TableCell({
          children: analysis.weaknesses.slice(0, 6).map((w) => new Paragraph({
            children: [new TextRun({ text: `!  ${w}`, font: "Calibri", size: 18, color: "374151" })],
            spacing: { after: 60 },
          })),
          width: { size: 4050, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { type: ShadingType.CLEAR, fill: "FFF7ED" },
        }),
      ],
    }),
  ]));
  children.push(new Paragraph({ children: [], spacing: { after: 120 } }));

  // ── ATS KEYWORD AUDIT ────────────────────────────────────────────────────────
  const kwPresent = (analysis.keywordsPresent ?? []).join("  ·  ") || "None identified";
  const kwGaps    = (analysis.keywordGaps    ?? []).join("  ·  ") || "No critical gaps";

  children.push(sectionHeading("ATS KEYWORD AUDIT"));
  children.push(tableWithBorders([
    new TableRow({
      tableHeader: true,
      children: [
        tdCell("Keywords Present", { bold: true, bg: "F0FDF4", color: GREEN, width: 4050 }),
        tdCell("Keywords to Add",  { bold: true, bg: "FEF2F2", color: RED,   width: 4050 }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: kwPresent, font: "Calibri", size: 18, color: GREEN })], spacing: { after: 40 } })],
          width: { size: 4050, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { type: ShadingType.CLEAR, fill: "F0FDF4" },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: kwGaps, font: "Calibri", size: 18, color: RED })], spacing: { after: 40 } })],
          width: { size: 4050, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { type: ShadingType.CLEAR, fill: "FEF2F2" },
        }),
      ],
    }),
  ]));
  children.push(new Paragraph({ children: [], spacing: { after: 120 } }));

  // ── PRIORITIZED ACTION PLAN ──────────────────────────────────────────────────
  children.push(sectionHeading("PRIORITIZED ACTION PLAN"));
  children.push(tableWithBorders([
    new TableRow({
      tableHeader: true,
      children: [
        tdCell("Priority",         { bold: true, bg: LIGHT_GRAY, width: 900 }),
        tdCell("Recommended Fix",  { bold: true, bg: LIGHT_GRAY, width: 5700 }),
        tdCell("Score Impact",     { bold: true, bg: LIGHT_GRAY, width: 1500 }),
      ],
    }),
    ...(analysis.rewritePriorities ?? []).map((action) => {
      const pri     = priorityLabel(action);
      const fixText = action.replace(/^(HIGH|MEDIUM|LOW)\s*[—–-]\s*/i, "");
      const match   = fixText.match(/\+\d+\s*pts?[^)"]*/i);
      const impact  = match ? match[0] : "";
      const clean   = fixText.replace(/\s*\+\d+\s*pts?[^)"]*$/i, "").trim();
      return new TableRow({
        children: [
          tdCell(pri,    { bold: true, bg: priorityColor(pri), color: WHITE, width: 900 }),
          tdCell(clean,  { width: 5700 }),
          tdCell(impact, { color: impact ? GREEN : MID_GRAY, bold: !!impact, width: 1500 }),
        ],
      });
    }),
  ]));
  children.push(new Paragraph({ children: [], spacing: { after: 120 } }));

  // ── SCORE DEDUCTIONS ─────────────────────────────────────────────────────────
  children.push(sectionHeading("SCORE DEDUCTIONS"));
  for (const cat of cats) {
    if (cat.deductions && cat.deductions.length > 0) {
      children.push(bodyPara(cat.label, { bold: true, color: NAVY, after: 40 }));
      for (const d of cat.deductions) {
        children.push(bulletPara(d, RED));
      }
      children.push(new Paragraph({ children: [], spacing: { after: 60 } }));
    }
  }

  // ── CLOSING ASSESSMENT ───────────────────────────────────────────────────────
  children.push(sectionHeading("CLOSING ASSESSMENT"));
  children.push(bodyPara(analysis.overallAssessment, { after: 80 }));
  children.push(bodyPara(`Projected post-fix score: ${scores.projectedPostFix} / 100`, { bold: true, color: GREEN, after: 200 }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "\u2014 End of Report \u2014", font: "Calibri", size: 20, color: MID_GRAY, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 240 },
  }));

  // ── Build document ───────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width:  convertInchesToTwip(8.5),
            height: convertInchesToTwip(11),
          },
          margin: {
            top:    convertInchesToTwip(0.75),
            bottom: convertInchesToTwip(0.75),
            left:   convertInchesToTwip(0.75),
            right:  convertInchesToTwip(0.75),
          },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { analysis, candidateName, targetMarket, seniorityLevel, reviewType } = await req.json();

    if (!analysis) {
      return NextResponse.json({ error: "analysis is required" }, { status: 400 });
    }

    const name     = candidateName ?? analysis.likelyTargetRole ?? "Candidate";
    const market   = targetMarket  ?? "US General";
    const seniority = seniorityLevel ?? "Senior";
    const review   = reviewType    ?? "Full Review";

    const buffer = await buildDoc(analysis, name, market, seniority, review);
    const filename = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_Resume_Review.docx`;

    return new NextResponse(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("[generate-docx] Error:", err);
    return NextResponse.json({ error: "Failed to generate document" }, { status: 500 });
  }
}
