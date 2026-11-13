/**
 * A PDF drawn inside the view by pdf.js: every page, one under the other,
 * as wide as the view allows, sharp at the screen's pixel density, from
 * the page the view was opened at where it names one. The
 * worker is bundled into the view as a classic script, because a frame
 * with an opaque origin starts no module worker, and nothing is fetched:
 * fonts a file does not embed come from the system.
 */
import { useEffect, useRef, useState } from 'react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';

/** The room around and between the pages, in CSS pixels. */
const MARGIN = 12;
/** How long a resize settles before the pages are drawn again. */
const SETTLE_MS = 120;

let worker: Worker | null = null;
function workerPort(): Worker {
  worker ??= new PdfWorker();
  return worker;
}

/** The end of the last document's teardown: pdf.js refuses a new document
 *  on the shared worker while one is still being destroyed. */
let destroyed: Promise<void> = Promise.resolve();

async function drawPage(
  doc: PDFDocumentProxy,
  number: number,
  canvas: HTMLCanvasElement,
  width: number,
) {
  const page = await doc.getPage(number);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = width / unscaled.width;
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: scale * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
  await page.render({ canvas, viewport }).promise;
}

export function Pdf({
  file,
  page,
  onFail,
}: {
  file: Blob;
  /** From 1; null shows the document from its first page. */
  page: number | null;
  onFail: (reason: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let live = true;
    let loading: PDFDocumentLoadingTask | null = null;
    GlobalWorkerOptions.workerPort = workerPort();
    void (async () => {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        await destroyed;
        if (!live) return;
        loading = getDocument({ data, useWasm: false, useWorkerFetch: false });
        const opened = await loading.promise;
        if (live) setDoc(opened);
      } catch (e) {
        if (live) onFail(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
      if (loading) destroyed = loading.destroy().catch(() => {});
    };
  }, [file]);

  useEffect(() => {
    const el = box.current;
    if (!el || !doc) return;
    let drawn = -1;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // The pages above the one asked for are drawn first, so once it is
    // drawn its place in the column is final for that width; the pages
    // below it still grow the column the scroll is bounded by, so each page
    // drawn after it scrolls to it again, at each new width, until the
    // person scrolls.
    let jump = page === null ? null : Math.min(page, doc.numPages);
    const keep = () => {
      jump = null;
    };
    el.addEventListener('wheel', keep, { passive: true });
    el.addEventListener('pointerdown', keep);
    el.addEventListener('keydown', keep);
    const draw = () => {
      const width = Math.floor(el.clientWidth - MARGIN * 2);
      if (width <= 0 || width === drawn) return;
      drawn = width;
      const canvases = [...el.querySelectorAll('canvas')];
      void (async () => {
        for (const [i, canvas] of canvases.entries()) {
          if (drawn !== width) return;
          await drawPage(doc, i + 1, canvas, width).catch(() => {});
          const target = jump === null || i + 1 < jump ? null : canvases[jump - 1]!;
          if (target) {
            el.scrollTop +=
              target.getBoundingClientRect().top - el.getBoundingClientRect().top - MARGIN;
          }
        }
      })();
    };
    draw();
    const sizes = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, SETTLE_MS);
    });
    sizes.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      sizes.disconnect();
      el.removeEventListener('wheel', keep);
      el.removeEventListener('pointerdown', keep);
      el.removeEventListener('keydown', keep);
    };
  }, [doc, page]);

  return (
    <div ref={box} className="hs-scroll files-pdf">
      {doc && Array.from({ length: doc.numPages }, (_, i) => <canvas key={i} />)}
    </div>
  );
}
