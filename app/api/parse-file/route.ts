import { NextRequest, NextResponse } from "next/server";

async function extractPdfTextColumnAware(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const content = await page.getTextContent();

    interface TextItem {
      str: string;
      transform: number[];
      width: number;
      height: number;
    }

    const items: TextItem[] = (content.items as TextItem[]).filter(
      (item) => item.str && item.str.trim().length > 0
    );

    if (items.length === 0) {
      pageTexts.push("");
      continue;
    }

    // Get x positions of all items
    const xPositions = items.map((item) => item.transform[4]);
    const sortedX = [...xPositions].sort((a, b) => a - b);

    // Find column boundaries: look for gaps > 15% of page width
    const gapThreshold = pageWidth * 0.15;
    const columnBoundaries: number[] = [0];

    for (let i = 1; i < sortedX.length; i++) {
      if (sortedX[i] - sortedX[i - 1] > gapThreshold) {
        columnBoundaries.push((sortedX[i] + sortedX[i - 1]) / 2);
      }
    }
    columnBoundaries.push(pageWidth + 1);

    // Assign each item to a column
    const assignColumn = (x: number) => {
      for (let c = 0; c < columnBoundaries.length - 1; c++) {
        if (x >= columnBoundaries[c] && x < columnBoundaries[c + 1]) return c;
      }
      return 0;
    };

    // Sort items: column first, then y descending (PDF y is bottom-up), then x ascending
    const LINE_TOLERANCE = 5;
    const sorted = [...items].sort((a, b) => {
      const colA = assignColumn(a.transform[4]);
      const colB = assignColumn(b.transform[4]);
      if (colA !== colB) return colA - colB;
      const yA = a.transform[5];
      const yB = b.transform[5];
      if (Math.abs(yA - yB) > LINE_TOLERANCE) return yB - yA; // higher y = earlier line
      return a.transform[4] - b.transform[4]; // same line: left to right
    });

    // Group into lines (items within LINE_TOLERANCE y of each other, same column)
    const lines: string[] = [];
    let currentLine: string[] = [];
    let lastY: number | null = null;
    let lastCol: number | null = null;

    for (const item of sorted) {
      const col = assignColumn(item.transform[4]);
      const y = item.transform[5];

      if (
        lastY === null ||
        lastCol !== col ||
        Math.abs(y - lastY) > LINE_TOLERANCE
      ) {
        if (currentLine.length > 0) lines.push(currentLine.join(" "));
        currentLine = [item.str];
      } else {
        currentLine.push(item.str);
      }
      lastY = y;
      lastCol = col;
    }
    if (currentLine.length > 0) lines.push(currentLine.join(" "));

    pageTexts.push(lines.join("\n"));
  }

  return pageTexts.join("\n\n").trim();
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    if (name.endsWith(".pdf")) {
      let text = "";

      // Primary: pdfjs-dist column-aware extraction
      try {
        text = await extractPdfTextColumnAware(buffer);
      } catch (primaryErr) {
        console.warn("[parse-file] pdfjs column-aware failed, trying pdf-parse:", primaryErr);
      }

      // Fallback: pdf-parse
      if (!text) {
        try {
          const pdfParse = (await import("pdf-parse")).default;
          const result = await pdfParse(buffer);
          text = result.text?.trim() ?? "";
        } catch (fallbackErr) {
          console.warn("[parse-file] pdf-parse failed, trying unpdf:", fallbackErr);
        }
      }

      // Last resort: unpdf
      if (!text) {
        try {
          const { extractText } = await import("unpdf");
          const result = await extractText(new Uint8Array(buffer));
          text = result.text.join("\n").trim();
        } catch (lastErr) {
          console.warn("[parse-file] unpdf also failed:", lastErr);
        }
      }

      if (!text || text.length < 50) {
        return NextResponse.json(
          { error: "We had trouble reading your PDF. Please try saving it as a plain PDF and uploading again. Or paste your resume text directly in the chat." },
          { status: 422 }
        );
      }

      if (text.length < 500) {
        console.warn(`[parse-file] PDF text suspiciously short: ${text.length} chars — may be incomplete`);
      }

      return NextResponse.json({ text });
    }

    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const [textResult, htmlResult] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({ buffer }),
      ]);
      const text = textResult.value.trim();
      const html = htmlResult.value.trim();
      return NextResponse.json({ text, html });
    }

    const text = buffer.toString("utf-8").trim();
    return NextResponse.json({ text });

  } catch (err) {
    console.error("[parse-file] Error:", err);
    return NextResponse.json(
      { error: "Failed to parse file. Please try a different format." },
      { status: 500 }
    );
  }
}
