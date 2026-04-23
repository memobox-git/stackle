export const ACCEPTED_EXTENSIONS = ".pdf,.doc,.docx,.txt,.md,.json,.csv,.rtf,.pages";

export interface ParseFileResult {
  text: string;
  html?: string;
}

export async function parseFile(file: File): Promise<ParseFileResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/parse-file", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error ?? "Failed to read file");
  }

  if (!data.text || data.text.trim().length === 0) {
    throw new Error("We couldn't read your file. Try saving it in a different format and uploading again.");
  }

  console.log(`[parseFile] Got ${data.text.length} chars for ${file.name}`);
  return { text: data.text, html: data.html };
}
