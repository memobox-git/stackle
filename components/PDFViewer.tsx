"use client";

import { useEffect, useRef, useState } from "react";

interface PDFViewerProps {
  fileUrl: string;
}

export default function PDFViewer({ fileUrl }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function renderPDF() {
      setLoading(true);
      setError(false);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfjsLib = await import("pdfjs-dist") as any;
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url
        ).toString();

        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

        if (cancelled) return;
        setNumPages(pdf.numPages);

        if (!containerRef.current) return;
        containerRef.current.innerHTML = "";

        for (let p = 1; p <= pdf.numPages; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          const scale = (window.devicePixelRatio || 1) * 1.5;
          const viewport = page.getViewport({ scale });
          const displayScale = 1.5;
          const displayViewport = page.getViewport({ scale: displayScale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${displayViewport.width}px`;
          canvas.style.height = `${displayViewport.height}px`;
          canvas.style.display = "block";
          canvas.style.marginBottom = "12px";
          canvas.style.borderRadius = "4px";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;

          if (containerRef.current && !cancelled) {
            containerRef.current.appendChild(canvas);
          }
        }
      } catch (err) {
        console.error("[PDFViewer] render error:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderPDF();
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500">
        Couldn&apos;t render PDF preview — switch to Structured view.
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="space-y-3 p-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-200 rounded" style={{ height: `${280 + i * 20}px` }} />
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className="p-4"
        style={{ display: loading ? "none" : "block" }}
      />
      {!loading && numPages > 0 && (
        <p className="text-center text-xs text-gray-500 pb-2">{numPages} page{numPages !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}
