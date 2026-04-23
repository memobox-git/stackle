"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X, Sparkles, ArrowRight, Pencil } from "lucide-react";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

// Rotating placeholders for the "tell it what you want" custom-instruction input.
// Not typed out — just swapped into <input placeholder="..."> every ~1.8s so the
// user sees varied ideas without us dictating any of them.
const CUSTOM_FIX_HINTS = [
  "Add more categories",
  "Quantify this",
  "Mention team size",
  "More senior tone",
  "Shorter, one line",
  "Stronger action verb",
  "Less jargon",
  "Add a metric",
];

type InlineFixState = {
  sectionKey: string;
  before: string;
  after: string;
  action: string;
  priorityIndex: number;
} | null;

interface LiveEditableResumeProps {
  extraction: ResumeExtraction;
  editingSection: string | null;
  typewriterContent: string;
  onSectionClick: (key: string) => void;
  inlineFix?: InlineFixState;
  onAcceptFix?: () => void;
  onSkipFix?: () => void;
  onRewriteFix?: () => void;
  onCustomFix?: (instruction: string) => void;
  // Manual-text edit: user types into the resume directly (no AI). The
  // pencil button on hover reveals a textarea seeded with rawText. Enter or
  // blur commits the new value back to the extraction.
  onManualEdit?: (sectionKey: string, newText: string) => void;
  // AI-edit this exact section: kicks off the writer with section locked.
  // Rendered as a ✨ button next to the pencil on hover.
  onAiEdit?: (sectionKey: string) => void;
  isRewriting?: boolean;
  // Skills editing — chips add/remove + suggested additions row
  onAddSkill?: (skill: string, categoryHint?: string) => void;
  onRemoveSkill?: (categoryIndex: number, skill: string) => void;
  suggestedSkills?: { skill: string; category: string; reason: string; priority: "high" | "medium" }[];
  onDismissSuggestion?: (skill: string) => void;
  // Per-bullet user lock (user marks a bullet as "don't touch")
  lockedBulletKeys?: Set<string>;
  onToggleBulletLock?: (sectionKey: string) => void;
}

interface EditableSectionProps {
  sectionKey: string;
  children: React.ReactNode;
  editingSection: string | null;
  typewriterContent: string;
  onSectionClick: (key: string) => void;
  inline?: boolean;
  inlineFix?: InlineFixState;
  onAcceptFix?: () => void;
  onSkipFix?: () => void;
  onRewriteFix?: () => void;
  onCustomFix?: (instruction: string) => void;
  onManualEdit?: (sectionKey: string, newText: string) => void;
  onAiEdit?: (sectionKey: string) => void;
  // Raw string backing `children`. When present, enables the manual-edit
  // pencil and seeds the textarea with this exact text.
  rawText?: string;
  isRewriting?: boolean;
}

function EditableSection({
  sectionKey,
  children,
  editingSection,
  typewriterContent,
  onSectionClick,
  inline = false,
  inlineFix,
  onAcceptFix,
  onSkipFix,
  onRewriteFix,
  onCustomFix,
  onManualEdit,
  onAiEdit,
  rawText,
  isRewriting = false,
}: EditableSectionProps) {
  // Manual text editing — null = closed, string = open with current buffer.
  // The user clicks the pencil icon; the rendered text is replaced with a
  // textarea seeded from rawText. Enter or blur commits via onManualEdit.
  const [manualDraft, setManualDraft] = useState<string | null>(null);
  const manualInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (manualDraft !== null) {
      manualInputRef.current?.focus();
      manualInputRef.current?.select();
    }
  }, [manualDraft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitManual() {
    const draft = manualDraft;
    if (draft === null) return;
    const trimmed = draft;
    setManualDraft(null);
    if (trimmed !== rawText) onManualEdit?.(sectionKey, trimmed);
  }

  // "Tell it what you want" — null = closed, string = open (even if empty).
  const [customInstruction, setCustomInstruction] = useState<string | null>(null);
  const [hintIdx, setHintIdx] = useState(0);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  // Rotate the placeholder every 1.8s while the input is open.
  useEffect(() => {
    if (customInstruction === null) return;
    setHintIdx(0);
    const id = setInterval(() => setHintIdx((i) => (i + 1) % CUSTOM_FIX_HINTS.length), 1800);
    return () => clearInterval(id);
  }, [customInstruction !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus the input when it opens.
  useEffect(() => {
    if (customInstruction !== null) customInputRef.current?.focus();
  }, [customInstruction !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitCustomInstruction() {
    const text = (customInstruction ?? "").trim();
    if (!text) return;
    setCustomInstruction(null);
    onCustomFix?.(text);
  }

  const isEditing = editingSection === sectionKey;
  const hasInlineFix = inlineFix?.sectionKey === sectionKey;
  const Tag = inline ? "span" : "div";

  if (hasInlineFix) {
    const isTyping = isEditing && typewriterContent.length < (inlineFix?.after.length ?? 0);
    const displayAfter = isEditing ? typewriterContent : (inlineFix?.after ?? "");
    return (
      <div data-section-key={sectionKey} style={{ margin: "2px 0", scrollMarginTop: "80px" }}>
        {/* Original — struck out red */}
        <div style={{
          background: "#fff5f5",
          border: "1px solid #fca5a5",
          borderRadius: "4px",
          padding: "6px 10px",
          marginBottom: "4px",
          fontSize: "inherit",
          lineHeight: "inherit",
          color: "#b91c1c",
          textDecoration: "line-through",
          opacity: 0.75,
        }}>
          {children}
        </div>
        {/* New — green, typewriting */}
        <div style={{
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "4px",
          padding: "6px 10px",
          marginBottom: "6px",
          fontSize: "inherit",
          lineHeight: "inherit",
          color: "#15803d",
        }}>
          {displayAfter}
          {isTyping && (
            <span style={{
              display: "inline-block",
              width: "2px",
              height: "1em",
              background: "#16a34a",
              marginLeft: "1px",
              verticalAlign: "text-bottom",
              animation: "lre-blink 0.8s step-end infinite",
            }} />
          )}
        </div>
        {/* Accept / Rewrite / Custom / Reject — icon-only with tooltips, shown after typing */}
        {!isTyping && (
          <>
            <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
              <button
                title="Accept (Enter)"
                aria-label="Accept"
                onClick={(e) => { e.stopPropagation(); onAcceptFix?.(); }}
                disabled={isRewriting}
                style={{
                  width: "28px", height: "26px", borderRadius: "6px",
                  background: isRewriting ? "#9ca3af" : "#16a34a",
                  color: "#fff", border: "none",
                  cursor: isRewriting ? "not-allowed" : "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  opacity: isRewriting ? 0.6 : 1,
                }}
              >
                <Check size={14} strokeWidth={2.75} />
              </button>
              {onRewriteFix && (
                <button
                  title={isRewriting ? "Generating a new version…" : "Rewrite — get a different version"}
                  aria-label="Rewrite"
                  onClick={(e) => { e.stopPropagation(); onRewriteFix(); }}
                  disabled={isRewriting}
                  style={{
                    width: "28px", height: "26px", borderRadius: "6px",
                    background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
                    cursor: isRewriting ? "wait" : "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    animation: isRewriting ? "lre-spin 0.9s linear infinite" : undefined,
                  }}>
                    <RotateCcw size={14} strokeWidth={2.25} />
                  </span>
                </button>
              )}
              {onCustomFix && (
                <button
                  title="Tell it what you want"
                  aria-label="Tell it what you want"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomInstruction((v) => (v === null ? "" : null));
                  }}
                  disabled={isRewriting}
                  style={{
                    width: "28px", height: "26px", borderRadius: "6px",
                    background: customInstruction !== null ? "#e2e8f0" : "#f1f5f9",
                    color: "#475569", border: "1px solid #e2e8f0",
                    cursor: isRewriting ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    opacity: isRewriting ? 0.6 : 1,
                  }}
                >
                  <Sparkles size={14} strokeWidth={2.25} />
                </button>
              )}
              <button
                title="Reject (Esc)"
                aria-label="Reject"
                onClick={(e) => { e.stopPropagation(); onSkipFix?.(); }}
                disabled={isRewriting}
                style={{
                  width: "28px", height: "26px", borderRadius: "6px",
                  background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca",
                  cursor: isRewriting ? "not-allowed" : "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  opacity: isRewriting ? 0.6 : 1,
                }}
              >
                <X size={14} strokeWidth={2.75} />
              </button>
            </div>
            {customInstruction !== null && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex", gap: "6px", marginBottom: "6px",
                  animation: "fadeIn 180ms ease",
                }}
              >
                <input
                  ref={customInputRef}
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); submitCustomInstruction(); }
                    else if (e.key === "Escape") { e.preventDefault(); setCustomInstruction(null); }
                  }}
                  placeholder={CUSTOM_FIX_HINTS[hintIdx]}
                  disabled={isRewriting}
                  style={{
                    flex: 1, height: "28px", padding: "0 10px",
                    fontSize: "12px", color: "#0f172a",
                    background: "#fff", border: "1px solid #cbd5e1",
                    borderRadius: "6px", outline: "none",
                  }}
                />
                <button
                  title="Apply"
                  aria-label="Apply custom instruction"
                  onClick={submitCustomInstruction}
                  disabled={isRewriting || !(customInstruction ?? "").trim()}
                  style={{
                    width: "32px", height: "28px", borderRadius: "6px",
                    background: (customInstruction ?? "").trim() ? "#0f172a" : "#cbd5e1",
                    color: "#fff", border: "none",
                    cursor: (customInstruction ?? "").trim() ? "pointer" : "not-allowed",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ArrowRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Manual-edit mode: user is typing directly in a textarea. Render that in
  // place of the usual children so they see only the editor.
  if (manualDraft !== null && onManualEdit && typeof rawText === "string") {
    return (
      <Tag
        data-section-key={sectionKey}
        style={{ display: inline ? "inline-block" : "block", width: "100%", scrollMarginTop: "80px" }}
      >
        <textarea
          ref={manualInputRef}
          value={manualDraft}
          onChange={(e) => setManualDraft(e.target.value)}
          onBlur={commitManual}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !inline) {
              // For multiline (non-inline) fields we allow Enter for newlines;
              // use Cmd/Ctrl+Enter to commit.
              if (e.metaKey || e.ctrlKey) { e.preventDefault(); commitManual(); }
              return;
            }
            if (e.key === "Enter" && inline) { e.preventDefault(); commitManual(); }
            if (e.key === "Escape") { e.preventDefault(); setManualDraft(null); }
          }}
          style={{
            width: "100%",
            minHeight: inline ? "1.4em" : "4em",
            font: "inherit",
            color: "#111",
            background: "#fffbe6",
            border: "1px solid #facc15",
            borderRadius: "4px",
            padding: "4px 6px",
            outline: "none",
            resize: "vertical",
            lineHeight: "inherit",
          }}
        />
        <div style={{ fontSize: "9px", color: "#a16207", marginTop: "2px" }}>
          {inline ? "Enter to save · Esc to cancel" : "⌘/Ctrl+Enter to save · Esc to cancel"}
        </div>
      </Tag>
    );
  }

  const canManualEdit = !!onManualEdit && typeof rawText === "string" && !isEditing;
  const showHoverActions = (canManualEdit || !!onAiEdit) && !isEditing;

  return (
    <Tag
      data-section-key={sectionKey}
      onClick={(e) => {
        e.stopPropagation();
        onSectionClick(sectionKey);
      }}
      title={`Click to edit: ${sectionKey}`}
      style={{
        position: "relative",
        borderRadius: "3px",
        cursor: "text",
        transition: "box-shadow 200ms ease",
        boxShadow: isEditing
          ? "0 0 0 2px rgba(124,106,247,0.5), 0 0 12px rgba(124,106,247,0.2)"
          : "none",
        padding: "1px 3px",
        margin: "-1px -3px",
        display: inline ? "inline" : "block",
        scrollMarginTop: "80px",
      }}
      className={showHoverActions ? "lre-manual-host" : undefined}
    >
      {isEditing ? (
        <span>
          {typewriterContent}
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "1em",
              background: "#7c6af7",
              marginLeft: "1px",
              verticalAlign: "text-bottom",
              animation: "lre-blink 0.8s step-end infinite",
            }}
          />
        </span>
      ) : (
        children
      )}
      {(canManualEdit || onAiEdit) && (
        <span
          className="lre-manual-btn"
          style={
            inline
              ? {
                  // Inline sections (bullets) — append the buttons directly
                  // after the sentence, horizontally. No absolute offset so
                  // they sit at the END of the text, regardless of wrapping.
                  display: "inline-flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "3px",
                  marginLeft: "6px",
                  verticalAlign: "middle",
                  opacity: 0,
                  transition: "opacity 140ms ease",
                  whiteSpace: "nowrap",
                }
              : {
                  // Block sections (summary) — vertical stack at the right margin.
                  position: "absolute",
                  top: "0",
                  right: "-26px",
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "3px",
                  opacity: 0,
                  transition: "opacity 140ms ease",
                }
          }
        >
          {canManualEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setManualDraft(rawText ?? ""); }}
              title="Edit text manually (no AI)"
              aria-label="Edit text manually"
              style={{
                width: "22px", height: "22px", borderRadius: "4px",
                background: "#fff", border: "1px solid #e5e7eb",
                color: "#6b7280", cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Pencil size={11} strokeWidth={2} />
            </button>
          )}
          {onAiEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAiEdit(sectionKey); }}
              disabled={isRewriting}
              title="Rewrite with AI"
              aria-label="Rewrite with AI"
              style={{
                width: "22px", height: "22px", borderRadius: "4px",
                background: "linear-gradient(135deg, #fef3c7, #fce7f3)",
                border: "1px solid #fbcfe8",
                color: "#7c3aed", cursor: isRewriting ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                opacity: isRewriting ? 0.5 : 1,
              }}
            >
              <Sparkles size={11} strokeWidth={2} />
            </button>
          )}
        </span>
      )}
    </Tag>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "22px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: "700",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "system-ui, sans-serif",
            color: "#111",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <div style={{ flex: 1, height: "1.5px", background: "#111" }} />
      </div>
      {children}
    </div>
  );
}

export default function LiveEditableResume({
  extraction,
  editingSection,
  typewriterContent,
  onSectionClick,
  inlineFix,
  onAcceptFix,
  onSkipFix,
  onRewriteFix,
  onCustomFix,
  onManualEdit,
  onAiEdit,
  isRewriting = false,
  onAddSkill,
  onRemoveSkill,
  suggestedSkills,
  onDismissSuggestion,
}: LiveEditableResumeProps) {
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [pendingSkillText, setPendingSkillText] = useState("");
  const contact = [
    extraction.email,
    extraction.phone,
    extraction.location,
    extraction.linkedin,
  ]
    .filter(Boolean)
    .join(" · ");

  const sharedProps = { editingSection, typewriterContent, onSectionClick, inlineFix, onAcceptFix, onSkipFix, onRewriteFix, onCustomFix, onManualEdit, onAiEdit, isRewriting };

  return (
    <div
      style={{
        background: "#fff",
        color: "#111",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        fontSize: "13px",
        lineHeight: "1.55",
        padding: "48px 52px",
        minHeight: "100%",
        maxWidth: "780px",
        margin: "0 auto",
      }}
    >
      <style>{`
        @keyframes lre-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes lre-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Name */}
      <h1
        style={{
          fontSize: "26px",
          fontWeight: "700",
          margin: "0 0 4px",
          letterSpacing: "-0.3px",
          color: "#000",
        }}
      >
        {extraction.name}
      </h1>

      {/* Contact */}
      {contact && (
        <p
          style={{
            fontSize: "12px",
            color: "#555",
            margin: "0 0 16px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {contact}
        </p>
      )}

      {/* Summary */}
      {extraction.summary !== undefined && (
        <>
          <hr style={{ border: "none", borderTop: "1.5px solid #111", margin: "0 0 10px" }} />
          <EditableSection sectionKey="summary" rawText={extraction.summary ?? ""} {...sharedProps}>
            <p
              style={{
                fontSize: "13px",
                color: "#333",
                margin: "0 0 18px",
                lineHeight: "1.65",
              }}
            >
              {extraction.summary}
            </p>
          </EditableSection>
        </>
      )}

      {/* Experience */}
      {(extraction.experience ?? []).length > 0 && (
        <Section title="Experience">
          {(extraction.experience ?? []).map((exp, i) => (
            <div key={i} style={{ marginBottom: "18px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "8px",
                }}
              >
                <span
                  style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}
                >
                  {exp.title}
                </span>
                <span
                  style={{
                    fontSize: "11.5px",
                    color: "#666",
                    flexShrink: 0,
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {exp.startDate} –{" "}
                  {exp.current ? "Present" : (exp.endDate ?? "Present")}
                </span>
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  fontStyle: "italic",
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                {exp.company}
              </div>
              {(exp.bullets ?? []).length > 0 && (
                <ul style={{ margin: "0", paddingLeft: "18px" }}>
                  {(exp.bullets ?? []).map((b, j) => (
                    <li
                      key={j}
                      style={{
                        marginBottom: "3px",
                        fontSize: "12.5px",
                        color: "#333",
                      }}
                    >
                      <EditableSection
                        sectionKey={`experience.${i}.bullets.${j}`}
                        inline
                        rawText={b}
                        {...sharedProps}
                      >
                        {b}
                      </EditableSection>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Education */}
      {(extraction.education ?? []).length > 0 && (
        <Section title="Education">
          {(extraction.education ?? []).map((edu, i) => (
            <div key={i} style={{ marginBottom: "12px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "8px",
                }}
              >
                <span
                  style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}
                >
                  <EditableSection sectionKey={`education.${i}`} inline {...sharedProps}>
                    {edu.degree}
                    {edu.field ? `, ${edu.field}` : ""}
                  </EditableSection>
                </span>
                <span
                  style={{
                    fontSize: "11.5px",
                    color: "#666",
                    flexShrink: 0,
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {edu.startDate}
                  {edu.endDate ? ` – ${edu.endDate}` : ""}
                </span>
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  fontStyle: "italic",
                  color: "#555",
                }}
              >
                {edu.institution}
              </div>
              {edu.gpa && (
                <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                  GPA: {edu.gpa}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Skills — chips with × to remove, + to add per category, plus suggested row */}
      {(extraction.skillGroups ?? []).length > 0 && (
        <Section title="Skills">
          <EditableSection sectionKey="skillGroups" {...sharedProps}>
            <div>
              {(extraction.skillGroups ?? []).map((group, i) => (
                <div key={i} style={{ marginBottom: "8px", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: "700", color: "#000", marginRight: "6px" }}>
                    {group.category}:
                  </span>
                  <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px", verticalAlign: "middle" }}>
                    {group.skills.map((skill) => (
                      <span
                        key={skill}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "1px 7px",
                          borderRadius: "10px",
                          background: "#f3f4f6",
                          border: "1px solid #e5e7eb",
                          fontSize: "11.5px",
                          color: "#111",
                        }}
                      >
                        {skill}
                        {onRemoveSkill && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveSkill(i, skill); }}
                            title={`Remove ${skill}`}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "0 0 0 2px",
                              color: "#9ca3af",
                              fontSize: "11px",
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {onAddSkill && (
                      addingToCategory === group.category ? (
                        <input
                          autoFocus
                          value={pendingSkillText}
                          onChange={(e) => setPendingSkillText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const s = pendingSkillText.trim();
                              if (s) onAddSkill(s, group.category);
                              setPendingSkillText("");
                              setAddingToCategory(null);
                            } else if (e.key === "Escape") {
                              setPendingSkillText("");
                              setAddingToCategory(null);
                            }
                          }}
                          onBlur={() => {
                            const s = pendingSkillText.trim();
                            if (s) onAddSkill(s, group.category);
                            setPendingSkillText("");
                            setAddingToCategory(null);
                          }}
                          placeholder="new skill"
                          style={{
                            padding: "1px 7px",
                            borderRadius: "10px",
                            border: "1px solid #a99af9",
                            fontSize: "11.5px",
                            outline: "none",
                            minWidth: "80px",
                          }}
                        />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingToCategory(group.category);
                            setPendingSkillText("");
                          }}
                          title={`Add skill to ${group.category}`}
                          style={{
                            padding: "1px 7px",
                            borderRadius: "10px",
                            background: "transparent",
                            border: "1px dashed #d1d5db",
                            fontSize: "11.5px",
                            color: "#6b7280",
                            cursor: "pointer",
                          }}
                        >
                          + Add
                        </button>
                      )
                    )}
                  </span>
                </div>
              ))}

              {/* Suggested skills row — dimmed chips with + to add */}
              {suggestedSkills && suggestedSkills.length > 0 && (
                <div style={{
                  marginTop: "10px",
                  paddingTop: "8px",
                  borderTop: "1px dashed #e5e7eb",
                  fontSize: "11px",
                }}>
                  <span style={{ color: "#6b7280", fontWeight: "600", marginRight: "6px", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "10px" }}>
                    Suggested for your target role:
                  </span>
                  <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px", verticalAlign: "middle" }}>
                    {suggestedSkills.map((s) => (
                      <span
                        key={s.skill}
                        title={s.reason}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "1px 7px",
                          borderRadius: "10px",
                          background: s.priority === "high" ? "#fef3c7" : "#f3f4f6",
                          border: `1px solid ${s.priority === "high" ? "#fde68a" : "#e5e7eb"}`,
                          fontSize: "11px",
                          color: "#6b7280",
                          fontStyle: "italic",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddSkill?.(s.skill, s.category);
                          }}
                          title={`Add ${s.skill}`}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontWeight: "700", fontSize: "12px", padding: 0, marginRight: "2px" }}
                        >
                          +
                        </button>
                        {s.skill}
                        {onDismissSuggestion && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDismissSuggestion(s.skill); }}
                            title="Dismiss"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 2px", color: "#9ca3af", fontSize: "10px", lineHeight: 1 }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </EditableSection>
        </Section>
      )}

      {/* Projects */}
      {(extraction.projects ?? []).length > 0 && (
        <Section title="Projects">
          {(extraction.projects ?? []).map((proj, i) => (
            <div key={i} style={{ marginBottom: "12px" }}>
              <div
                style={{
                  fontWeight: "700",
                  fontSize: "13.5px",
                  color: "#000",
                  marginBottom: "2px",
                }}
              >
                {proj.name}
                {(proj.tech ?? []).length > 0 && (
                  <span
                    style={{
                      fontWeight: "400",
                      fontSize: "11.5px",
                      color: "#666",
                      marginLeft: "8px",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    {proj.tech.join(", ")}
                  </span>
                )}
              </div>
              {proj.description && (
                <EditableSection sectionKey={`projects.${i}`} {...sharedProps}>
                  <p style={{ fontSize: "12.5px", color: "#333", margin: "0" }}>
                    {proj.description}
                  </p>
                </EditableSection>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {(extraction.certifications ?? []).length > 0 && (
        <Section title="Certifications">
          {(extraction.certifications ?? []).map((cert, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "8px",
                }}
              >
                <span
                  style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}
                >
                  {cert.name}
                </span>
                <span
                  style={{
                    fontSize: "11.5px",
                    color: "#666",
                    flexShrink: 0,
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {cert.date}
                </span>
              </div>
              {cert.issuer && (
                <div
                  style={{ fontSize: "12px", fontStyle: "italic", color: "#555" }}
                >
                  {cert.issuer}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Awards */}
      {(extraction.awards ?? []).length > 0 && (
        <Section title="Awards & Honours">
          {(extraction.awards ?? []).map((award, i) => (
            <EditableSection
              key={i}
              sectionKey={`awards.${i}`}
              {...sharedProps}
            >
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>{award.title}</span>
                  {award.date && <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>{award.date}</span>}
                </div>
                {award.issuer && <div style={{ fontSize: "12px", fontStyle: "italic", color: "#555" }}>{award.issuer}</div>}
              </div>
            </EditableSection>
          ))}
        </Section>
      )}

      {/* Volunteer */}
      {(extraction.volunteer ?? []).length > 0 && (
        <Section title="Volunteer">
          {(extraction.volunteer ?? []).map((v, i) => (
            <EditableSection
              key={i}
              sectionKey={`volunteer.${i}`}
              {...sharedProps}
            >
              <div style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>{v.role}</span>
                  <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>
                    {[v.startDate, v.endDate].filter(Boolean).join(" – ")}
                  </span>
                </div>
                <div style={{ fontSize: "12.5px", color: "#555", marginBottom: "2px" }}>{v.organization}</div>
                {v.description && <div style={{ fontSize: "12.5px", color: "#333" }}>{v.description}</div>}
              </div>
            </EditableSection>
          ))}
        </Section>
      )}

      {/* Publications */}
      {(extraction.publications ?? []).length > 0 && (
        <Section title="Publications">
          {(extraction.publications ?? []).map((pub, i) => (
            <EditableSection
              key={i}
              sectionKey={`publications.${i}`}
              {...sharedProps}
            >
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>
                    {pub.url ? <a href={pub.url} target="_blank" rel="noopener noreferrer" style={{ color: "#000", textDecoration: "underline" }}>{pub.title}</a> : pub.title}
                  </span>
                  {pub.date && <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>{pub.date}</span>}
                </div>
                {pub.publisher && <div style={{ fontSize: "12px", fontStyle: "italic", color: "#555" }}>{pub.publisher}</div>}
              </div>
            </EditableSection>
          ))}
        </Section>
      )}

      {/* Links */}
      {(extraction.links ?? []).length > 0 && (
        <Section title="Links">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "4px 0" }}>
            {(extraction.links ?? []).map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "12.5px",
                  color: "#1a56db",
                  background: "#eff6ff",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  textDecoration: "none",
                  border: "1px solid #bfdbfe",
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Languages */}
      {(extraction.languages ?? []).length > 0 && (
        <Section title="Languages">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", padding: "4px 0" }}>
            {(extraction.languages ?? []).map((lang, i) => (
              <span key={i} style={{ fontSize: "13px", color: "#333" }}>
                <strong>{lang.language}</strong>
                {lang.proficiency && <span style={{ color: "#666", fontSize: "12px" }}> — {lang.proficiency}</span>}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
