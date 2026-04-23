"use client";

interface DocxViewerProps {
  html: string;
}

export default function DocxViewer({ html }: DocxViewerProps) {
  return (
    <div className="p-6">
      <style>{`
        .docx-preview { font-family: 'Georgia', serif; font-size: 13px; line-height: 1.7; color: #111; background: #fff; border-radius: 6px; padding: 40px 48px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); max-width: 780px; margin: 0 auto; }
        .docx-preview h1 { font-size: 20px; font-weight: 700; margin: 0 0 10px; }
        .docx-preview h2 { font-size: 16px; font-weight: 700; margin: 16px 0 6px; }
        .docx-preview h3 { font-size: 14px; font-weight: 700; margin: 12px 0 4px; }
        .docx-preview p { margin: 0 0 6px; }
        .docx-preview ul, .docx-preview ol { margin: 4px 0 8px 20px; padding: 0; }
        .docx-preview li { margin-bottom: 3px; }
        .docx-preview strong { font-weight: 700; }
        .docx-preview em { font-style: italic; }
        .docx-preview table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .docx-preview td, .docx-preview th { border: 1px solid #ddd; padding: 4px 8px; font-size: 12px; }
      `}</style>
      <div
        className="docx-preview"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
