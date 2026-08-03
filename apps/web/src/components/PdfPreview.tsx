import { Button } from "@epiton/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** pdfjs canvas preview with page nav + zoom (iframe fallback). */
export function PdfPreview(props: { url: string; title?: string }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [status, setStatus] = useState(() => t("report.loadingPdf"));
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    async function render() {
      setFallback(false);
      setStatus(t("report.loadingPdf"));
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const loadingTask = pdfjs.getDocument({ url: props.url });
        const doc = await loadingTask.promise;
        cleanup = () => {
          void loadingTask.destroy?.();
        };
        if (cancelled) {
          cleanup();
          return;
        }
        setPageCount(doc.numPages);
        const safePage = Math.min(Math.max(1, page), doc.numPages || 1);
        const pdfPage = await doc.getPage(safePage);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        await renderTask.promise;
        setStatus(t("report.pdfPage", { page: safePage, pages: doc.numPages }));
      } catch (err) {
        setFallback(true);
        setStatus(err instanceof Error ? err.message : t("report.pdfUnavailable"));
      }
    }

    void render();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [props.url, page, scale, t]);

  if (fallback) {
    return (
      <div>
        <p className="text-sm text-[var(--epiton-muted)]" role="status">
          {status} — {t("report.browserPdfFallback")}
        </p>
        <iframe
          title={props.title ?? t("report.previewTitle")}
          src={props.url}
          sandbox=""
          className="epiton-report-preview"
          style={{ width: "100%", minHeight: "420px", border: "1px solid var(--epiton-border)" }}
        />
      </div>
    );
  }

  return (
    <div className="epiton-pdf-preview">
      <div className="epiton-toolbar">
        <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          {t("report.previousPage")}
        </Button>
        <span className="text-sm text-[var(--epiton-muted)]" role="status">
          {status}
        </span>
        <Button disabled={!pageCount || page >= pageCount} onClick={() => setPage((p) => p + 1)}>
          {t("report.nextPage")}
        </Button>
        <Button onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.15).toFixed(2))))}>
          −
        </Button>
        <Button onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))}>
          +
        </Button>
      </div>
      <div className="epiton-pdf-canvas-wrap">
        <canvas ref={canvasRef} aria-label={props.title ?? t("report.pdfPageCanvas")} />
      </div>
    </div>
  );
}
