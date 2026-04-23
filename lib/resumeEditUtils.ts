import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

/**
 * Resolve a dot-notation section key to its current string value.
 * Returns empty string for unknown or missing keys.
 *
 * Key scheme:
 *   "summary"                     → extraction.summary
 *   "skillGroups"                 → "Category: skill1, skill2\n..."
 *   "experience.{i}.bullets.{j}" → extraction.experience[i].bullets[j]
 *   "experience.{i}"              → title + company + bullets (one per line)
 *   "education.{i}"               → degree, field at institution
 *   "projects.{i}"                → project description
 */
export function resolveSectionContent(
  extraction: ResumeExtraction,
  sectionKey: string
): string {
  if (sectionKey === "summary") {
    return extraction.summary ?? "";
  }

  if (sectionKey === "skillGroups") {
    return (extraction.skillGroups ?? [])
      .map((g) => `${g.category}: ${g.skills.join(", ")}`)
      .join("\n");
  }

  const parts = sectionKey.split(".");

  if (parts[0] === "experience") {
    const idx = parseInt(parts[1] ?? "0", 10);
    const exp = (extraction.experience ?? [])[idx];
    if (!exp) return "";
    if (parts[2] === "bullets" && parts[3] !== undefined) {
      return exp.bullets[parseInt(parts[3], 10)] ?? "";
    }
    // Whole job entry
    return [exp.title, exp.company, ...(exp.bullets ?? [])].join("\n");
  }

  if (parts[0] === "education") {
    const idx = parseInt(parts[1] ?? "0", 10);
    const edu = (extraction.education ?? [])[idx];
    if (!edu) return "";
    return `${edu.degree}${edu.field ? `, ${edu.field}` : ""} at ${edu.institution}`;
  }

  if (parts[0] === "projects") {
    const idx = parseInt(parts[1] ?? "0", 10);
    const proj = (extraction.projects ?? [])[idx];
    if (!proj) return "";
    return proj.description ?? "";
  }

  if (parts[0] === "awards") {
    const idx = parseInt(parts[1] ?? "0", 10);
    const award = (extraction.awards ?? [])[idx];
    if (!award) return "";
    return award.title ?? "";
  }

  if (parts[0] === "volunteer") {
    const idx = parseInt(parts[1] ?? "0", 10);
    const v = (extraction.volunteer ?? [])[idx];
    if (!v) return "";
    return v.description ?? "";
  }

  if (parts[0] === "publications") {
    const idx = parseInt(parts[1] ?? "0", 10);
    const pub = (extraction.publications ?? [])[idx];
    if (!pub) return "";
    return pub.title ?? "";
  }

  return "";
}

/**
 * Apply a completed edit to produce a new ResumeExtraction.
 * Returns a deep-cloned extraction with the target section updated.
 * On any parse/structure failure, returns the original extraction unchanged.
 */
export function applyEdit(
  extraction: ResumeExtraction,
  sectionKey: string,
  newContent: string
): ResumeExtraction {
  try {
    const clone = structuredClone(extraction);

    if (sectionKey === "summary") {
      clone.summary = newContent;
      return clone;
    }

    if (sectionKey === "skillGroups") {
      // Re-parse "Category: skill1, skill2" lines
      const groups = newContent
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const colonIdx = line.indexOf(":");
          if (colonIdx === -1) return { category: line.trim(), skills: [] };
          const cat = line.slice(0, colonIdx).trim();
          const skills = line
            .slice(colonIdx + 1)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          return { category: cat, skills };
        });
      clone.skillGroups = groups;
      return clone;
    }

    const parts = sectionKey.split(".");

    if (parts[0] === "experience") {
      const idx = parseInt(parts[1] ?? "0", 10);
      if (!clone.experience[idx]) return extraction; // safety
      if (parts[2] === "bullets" && parts[3] !== undefined) {
        clone.experience[idx].bullets[parseInt(parts[3], 10)] = newContent;
      } else if (!parts[2]) {
        // Whole entry: newContent is bullet lines joined by \n
        const bullets = newContent.split("\n").map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
        if (bullets.length > 0) clone.experience[idx].bullets = bullets;
      }
      return clone;
    }

    if (parts[0] === "projects") {
      const idx = parseInt(parts[1] ?? "0", 10);
      if (!clone.projects[idx]) return extraction;
      clone.projects[idx].description = newContent;
      return clone;
    }

    if (parts[0] === "awards") {
      const idx = parseInt(parts[1] ?? "0", 10);
      if (!clone.awards?.[idx]) return extraction;
      clone.awards[idx].title = newContent;
      return clone;
    }

    if (parts[0] === "volunteer") {
      const idx = parseInt(parts[1] ?? "0", 10);
      if (!clone.volunteer?.[idx]) return extraction;
      clone.volunteer[idx].description = newContent;
      return clone;
    }

    if (parts[0] === "publications") {
      const idx = parseInt(parts[1] ?? "0", 10);
      if (!clone.publications?.[idx]) return extraction;
      clone.publications[idx].title = newContent;
      return clone;
    }

    return clone;
  } catch {
    // On any failure, return original unchanged
    return extraction;
  }
}
