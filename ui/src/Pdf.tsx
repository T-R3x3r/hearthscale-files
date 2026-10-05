/**
 * A PDF drawn inside the view by pdf.js: every page, one under the other,
 * as wide as the view allows, sharp at the screen's pixel density. The
 * worker is bundled into the view as a classic script, because a frame
 * with an opaque origin starts no module worker, and nothing is fetched:
 * fonts a file does not embed come from the system.
 */
import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
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

export function Pdf({ file, onFail }: { file: Blob; onFail: (reason: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let live = true;
    let opened: PDFDocumentProxy | null = null;
    GlobalWorkerOptions.workerPort = workerPort();
    void (async () => {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        opened = await getDocument({ data, useWasm: false, useWorkerFetch: false }).promise;
        if (live) setDoc(opened);
        else void opened.destroy();
      } catch (e) {
        if (live) onFail(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
      void opened?.destroy();
    };
  }, [file]);

  useEffect(() => {
    const el = box.current;
    if (!el || !doc) return;
    let drawn = -1;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      const width = Math.floor(el.clientWidth - MARGIN * 2);
      if (width <= 0 || width === drawn) return;
      drawn = width;
      const canvases = [...el.querySelectorAll('canvas')];
      void (async () => {
        for (const [i, canvas] of canvases.entries()) {
          if (drawn !== width) return;
          await drawPage(doc, i + 1, canvas, width).catch(() => {});
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
    };
  }, [doc]);

  return (
    <div ref={box} className="hs-scroll files-pdf">
      {doc && Array.from({ length: doc.numPages }, (_, i) => <canvas key={i} />)}
    </div>
  );
}
