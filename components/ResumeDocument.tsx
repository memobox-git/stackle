"use client";

import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

export default function ResumeDocument({ extraction }: { extraction: ResumeExtraction }) {
  const contact = [extraction.email, extraction.phone, extraction.location, extraction.linkedin]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{
      background: "#fff",
      color: "#111",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: "13px",
      lineHeight: "1.55",
      padding: "48px 52px",
      minHeight: "100%",
      maxWidth: "780px",
      margin: "0 auto",
    }}>
      {/* Name */}
      <h1 style={{ fontSize: "26px", fontWeight: "700", margin: "0 0 4px", letterSpacing: "-0.3px", color: "#000" }}>
        {extraction.name}
      </h1>

      {/* Contact */}
      {contact && (
        <p style={{ fontSize: "12px", color: "#555", margin: "0 0 16px", fontFamily: "system-ui, sans-serif" }}>
          {contact}
        </p>
      )}

      {/* Summary */}
      {extraction.summary && (
        <>
          <hr style={{ border: "none", borderTop: "1.5px solid #111", margin: "0 0 10px" }} />
          <p style={{ fontSize: "13px", color: "#333", margin: "0 0 18px", lineHeight: "1.65" }}>
            {extraction.summary}
          </p>
        </>
      )}

      {/* Experience */}
      {extraction.experience?.length > 0 && (
        <Section title="Experience">
          {extraction.experience.map((exp, i) => (
            <div key={i} style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>{exp.title}</span>
                <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>
                  {exp.startDate} – {exp.current ? "Present" : (exp.endDate ?? "Present")}
                </span>
              </div>
              <div style={{ fontSize: "12.5px", fontStyle: "italic", color: "#555", marginBottom: "6px" }}>
                {exp.company}
              </div>
              {exp.bullets?.length > 0 && (
                <ul style={{ margin: "0", paddingLeft: "18px" }}>
                  {exp.bullets.map((b, j) => (
                    <li key={j} style={{ marginBottom: "3px", fontSize: "12.5px", color: "#333" }}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Education */}
      {extraction.education?.length > 0 && (
        <Section title="Education">
          {extraction.education.map((edu, i) => (
            <div key={i} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>
                  {edu.degree}{edu.field ? `, ${edu.field}` : ""}
                </span>
                <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>
                  {edu.startDate}{edu.endDate ? ` – ${edu.endDate}` : ""}
                </span>
              </div>
              <div style={{ fontSize: "12.5px", fontStyle: "italic", color: "#555" }}>{edu.institution}</div>
              {edu.gpa && (
                <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>GPA: {edu.gpa}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {extraction.skillGroups?.length > 0 && (
        <Section title="Skills">
          {extraction.skillGroups.map((group, i) => (
            <div key={i} style={{ marginBottom: "6px", fontSize: "12.5px", color: "#333" }}>
              <span style={{ fontWeight: "700", color: "#000" }}>{group.category}:</span>{" "}
              {group.skills.join(", ")}
            </div>
          ))}
        </Section>
      )}

      {/* Projects */}
      {extraction.projects?.length > 0 && (
        <Section title="Projects">
          {extraction.projects.map((proj, i) => (
            <div key={i} style={{ marginBottom: "12px" }}>
              <div style={{ fontWeight: "700", fontSize: "13.5px", color: "#000", marginBottom: "2px" }}>
                {proj.name}
                {proj.tech?.length > 0 && (
                  <span style={{ fontWeight: "400", fontSize: "11.5px", color: "#666", marginLeft: "8px", fontFamily: "system-ui, sans-serif" }}>
                    {proj.tech.join(", ")}
                  </span>
                )}
              </div>
              {proj.description && (
                <p style={{ fontSize: "12.5px", color: "#333", margin: "0" }}>{proj.description}</p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {extraction.certifications?.length > 0 && (
        <Section title="Certifications">
          {extraction.certifications.map((cert, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>{cert.name}</span>
                <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>{cert.date}</span>
              </div>
              {cert.issuer && (
                <div style={{ fontSize: "12px", fontStyle: "italic", color: "#555" }}>{cert.issuer}</div>
              )}
            </div>
          ))}
        </Section>
      )}
      {/* Awards */}
      {extraction.awards?.length > 0 && (
        <Section title="Awards & Honours">
          {extraction.awards.map((award, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>{award.title}</span>
                {award.date && <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>{award.date}</span>}
              </div>
              {award.issuer && <div style={{ fontSize: "12px", fontStyle: "italic", color: "#555" }}>{award.issuer}</div>}
            </div>
          ))}
        </Section>
      )}

      {/* Volunteer */}
      {extraction.volunteer?.length > 0 && (
        <Section title="Volunteer">
          {extraction.volunteer.map((v, i) => (
            <div key={i} style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>{v.role}</span>
                <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>
                  {[v.startDate, v.endDate].filter(Boolean).join(" – ")}
                </span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#555", marginBottom: "2px" }}>{v.organization}</div>
              {v.description && <div style={{ fontSize: "12.5px", color: "#333" }}>{v.description}</div>}
            </div>
          ))}
        </Section>
      )}

      {/* Publications */}
      {extraction.publications?.length > 0 && (
        <Section title="Publications">
          {extraction.publications.map((pub, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#000" }}>
                  {pub.url ? <a href={pub.url} target="_blank" rel="noopener noreferrer" style={{ color: "#000", textDecoration: "underline" }}>{pub.title}</a> : pub.title}
                </span>
                {pub.date && <span style={{ fontSize: "11.5px", color: "#666", flexShrink: 0, fontFamily: "system-ui, sans-serif" }}>{pub.date}</span>}
              </div>
              {pub.publisher && <div style={{ fontSize: "12px", fontStyle: "italic", color: "#555" }}>{pub.publisher}</div>}
            </div>
          ))}
        </Section>
      )}

      {/* Links */}
      {extraction.links?.length > 0 && (
        <Section title="Links">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {extraction.links.map((link, i) => (
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
      {extraction.languages?.length > 0 && (
        <Section title="Languages">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            {extraction.languages.map((lang, i) => (
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <span style={{
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: "system-ui, sans-serif",
          color: "#111",
          whiteSpace: "nowrap",
        }}>{title}</span>
        <div style={{ flex: 1, height: "1.5px", background: "#111" }} />
      </div>
      {children}
    </div>
  );
}
