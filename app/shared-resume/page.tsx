"use client";

import { useEffect, useState } from "react";
import LiveEditableResume from "@/components/LiveEditableResume";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

// Read-only share page. The resume is encoded into the URL hash as base64
// so nothing is stored on a server — the link itself IS the data. Fine for
// peer-review ("what do you think of this?") but not for anything
// confidential, and the link gets long for big résumés.
export default function SharedResumePage() {
  const [extraction, setExtraction] = useState<ResumeExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (!hash.startsWith("#d=")) { setError("No resume data in this link."); return; }
      const encoded = hash.slice(3);
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const parsed = JSON.parse(decoded) as ResumeExtraction;
      setExtraction(parsed);
    } catch (err) {
      console.error("[share] decode failed", err);
      setError("This link is corrupted or uses an unsupported format.");
    }
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 px-6 text-center">
        <div>
          <p className="text-sm">{error}</p>
          <p className="text-xs text-gray-600 mt-2">Ask whoever sent the link to re-copy it from their Drive.</p>
        </div>
      </div>
    );
  }

  if (!extraction) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 text-sm">
        Loading shared resume…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-10">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-4 text-[11px] uppercase tracking-wider text-gray-600 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Read-only preview · shared via Stackle
        </div>
        <div className="bg-white rounded-xl overflow-hidden">
          <LiveEditableResume
            extraction={extraction}
            editingSection={null}
            typewriterContent=""
            onSectionClick={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
