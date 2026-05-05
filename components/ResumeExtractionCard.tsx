"use client";

import { useState } from "react";
import { ChevronDown, User, Mail, Phone, MapPin, Briefcase } from "lucide-react";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

interface ResumeExtractionCardProps {
  extraction: ResumeExtraction;
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-300">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function ResumeExtractionCard({ extraction }: ResumeExtractionCardProps) {
  const mostRecentRole = extraction.experience[0];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-6">
      <div className="bg-gray-100 border border-gray-300 rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-4 bg-gray-100 border-b border-gray-300">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded bg-white flex items-center justify-center flex-shrink-0">
              <User className="w-3 h-3 text-black" strokeWidth={2.5} />
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Resume Extracted</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-0.5">{extraction.name}</h2>
          {mostRecentRole && (
            <p className="text-sm text-gray-500">{mostRecentRole.title} · {mostRecentRole.company}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {extraction.location && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600">
                <MapPin className="w-3 h-3" /> {extraction.location}
              </span>
            )}
            {extraction.totalYearsExperience !== null && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600">
                <Briefcase className="w-3 h-3" /> {extraction.totalYearsExperience} yrs exp
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {extraction.email && (
              <a href={`mailto:${extraction.email}`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-900">
                <Mail className="w-3 h-3" /> {extraction.email}
              </a>
            )}
            {extraction.phone && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Phone className="w-3 h-3" /> {extraction.phone}
              </span>
            )}
          </div>
          {extraction.summary && (
            <p className="mt-3 text-sm text-gray-700 leading-relaxed border-t border-gray-300 pt-3">{extraction.summary}</p>
          )}
        </div>

        {/* Experience */}
        {extraction.experience.length > 0 && (
          <Section title={`Experience (${extraction.experience.length})`} defaultOpen={true}>
            <div className="space-y-4">
              {extraction.experience.map((job, i) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{job.title}</p>
                      <p className="text-xs text-gray-500">{job.company}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-600">{job.startDate} – {job.current ? "Present" : job.endDate}</p>
                      {job.current && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10a37f]/15 border border-[#10a37f]/30 text-[#10a37f]">Current</span>}
                    </div>
                  </div>
                  {job.bullets.length > 0 && (
                    <ul className="space-y-1 mt-1.5">
                      {job.bullets.map((b, j) => (
                        <li key={j} className="flex gap-2 text-xs text-gray-600">
                          <span className="text-gray-700 flex-shrink-0">–</span>{b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Education */}
        {extraction.education.length > 0 && (
          <Section title={`Education (${extraction.education.length})`}>
            <div className="space-y-3">
              {extraction.education.map((edu, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                    <p className="text-xs text-gray-500">{edu.institution}</p>
                    {edu.gpa && <p className="text-xs text-gray-600">GPA: {edu.gpa}</p>}
                  </div>
                  <p className="text-xs text-gray-600 flex-shrink-0">{edu.startDate} – {edu.endDate}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Skills */}
        {extraction.skillGroups.filter(g => g.skills.length > 0).length > 0 && (
          <Section title="Skills" defaultOpen={true}>
            <div className="space-y-3">
              {extraction.skillGroups.filter(g => g.skills.length > 0).map((group, i) => (
                <div key={i}>
                  <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5">{group.category}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.skills.map((skill, j) => (
                      <span key={j} className="text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-700">{skill}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Projects */}
        {extraction.projects.length > 0 && (
          <Section title={`Projects (${extraction.projects.length})`}>
            <div className="space-y-4">
              {extraction.projects.map((proj, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">{proj.name}</p>
                  <p className="text-xs text-gray-500 mb-1.5">{proj.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {proj.tech.map((t, j) => (
                      <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-[#1a2a3f] border border-blue-900/40 text-blue-300">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Certifications */}
        {extraction.certifications.length > 0 && (
          <Section title={`Certifications (${extraction.certifications.length})`}>
            <ul className="space-y-2">
              {extraction.certifications.map((cert, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-900">{cert.name}</p>
                    <p className="text-xs text-gray-600">{cert.issuer}</p>
                  </div>
                  <span className="text-xs text-gray-600 flex-shrink-0">{cert.date}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

      </div>
    </div>
  );
}
