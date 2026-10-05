/**
 * What the view shows of one file. A picture, a sound, a video, a PDF and
 * a page are drawn from the file's bytes, each on the backdrop Chromium's
 * own viewer gives it; a page shows without its scripts. Markdown, a CSV,
 * a Mermaid diagram and a Vega-Lite chart are drawn from the file's text;
 * other text shows as it is written. A file with no preview, or one too
 * large to read whole, names its kind and size and opens in the system's
 * app.
 */
import { useEffect, useMemo, useState } from 'react';
import { Chart, Diagram, Markdown } from './Drawn.tsx';
import { RAW_BYTES, wordsOf, type Head, type Host } from './host.ts';
import { Icon } from './kit.tsx';
import { FileKindGlyph, SystemIcon, extensionOf, type IconSource } from './kinds.tsx';
import { Pdf } from './Pdf.tsx';
import { baseName, sizeWords } from './words.ts';

type Drawn = 'markdown' | 'table' | 'diagram' | 'chart';

/** How a file the view draws from its bytes shows. */
type Whole = 'picture' | 'audio' | 'video' | 'pdf' | 'page';

/** One file's preview, as the view holds it. */
export type Preview = { path: string } & (
  | { show: 'refused'; reason: string }
  | { show: 'whole'; whole: Whole; file: Blob }
  | { show: 'drawn'; drawn: Drawn; text: string; partial: boolean }
  | { show: 'text'; text: string; partial: boolean }
  | { show: 'open'; size: number }
);

/** The files the view draws from their bytes, by extension. */
const WHOLE: Record<string, Whole> = {
  '.pdf': 'pdf',
  '.png': 'picture',
  '.jpg': 'picture',
  '.jpeg': 'picture',
  '.gif': 'picture',
  '.webp': 'picture',
  '.avif': 'picture',
  '.bmp': 'picture',
  '.ico': 'picture',
  '.svg': 'picture',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.oga': 'audio',
  '.m4a': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.mp4': 'video',
  '.m4v': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.ogv': 'video',
  '.html': 'page',
  '.htm': 'page',
};

const DRAWN: Record<string, Drawn> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.csv': 'table',
  '.mmd': 'diagram',
  '.mermaid': 'diagram',
  '.vega-lite': 'chart',
};

/** What a file is, in the words a person uses for it. */
const KIND_WORDS: Record<string, string> = {
  '.ppt': 'PowerPoint presentation',
  '.pptx': 'PowerPoint presentation',
  '.key': 'Keynote presentation',
  '.odp': 'OpenDocument presentation',
  '.doc': 'Word document',
  '.docx': 'Word document',
  '.rtf': 'Rich text document',
  '.odt': 'OpenDocument text',
  '.xls': 'Excel workbook',
  '.xlsx': 'Excel workbook',
  '.ods': 'OpenDocument spreadsheet',
  '.zip': 'ZIP archive',
  '.rar': 'RAR archive',
  '.7z': '7-Zip archive',
  '.tar': 'TAR archive',
  '.gz': 'Gzip archive',
  '.xz': 'XZ archive',
  '.bz2': 'Bzip2 archive',
  '.exe': 'Application',
  '.msi': 'Windows installer',
  '.dll': 'Dynamic link library',
  '.app': 'Application',
  '.deb': 'Debian package',
  '.rpm': 'RPM package',
  '.appimage': 'AppImage',
  '.iso': 'Disc image',
  '.dmg': 'Disk image',
  '.psd': 'Photoshop document',
  '.ai': 'Illustrator artwork',
  '.sketch': 'Sketch document',
  '.xcf': 'GIMP image',
  '.tif': 'TIFF image',
  '.tiff': 'TIFF image',
  '.heic': 'HEIF image',
  '.raw': 'Camera raw image',
  '.ttf': 'TrueType font',
  '.otf': 'OpenType font',
  '.woff': 'Web font',
  '.woff2': 'Web font',
  '.db': 'Database',
  '.sqlite': 'SQLite database',
  '.sqlite3': 'SQLite database',
  '.blend': 'Blender scene',
  '.obj': '3D model',
  '.fbx': '3D model',
  '.gltf': '3D model',
  '.glb': '3D model',
  '.stl': '3D model',
  '.mkv': 'Matroska video',
  '.avi': 'AVI video',
  '.wmv': 'Windows Media video',
  '.opus': 'Opus audio',
  '.safetensors': 'Model weights',
  '.gguf': 'Model weights',
  '.onnx': 'Model weights',
  '.pt': 'Model weights',
  '.bin': 'Binary',
  '.dat': 'Data file',
  '.pyc': 'Compiled Python',
  '.class': 'Compiled Java',
  '.wasm': 'WebAssembly module',
};

/** A file's kind in words; an unlisted one is named by its extension. */
function kindWords(path: string): string {
  const extension = extensionOf(path);
  return KIND_WORDS[extension] ?? (extension ? `${extension.slice(1).toUpperCase()} file` : 'File');
}

/** Reads what a file's preview needs: the head the platform returns, which
 *  also says whether the platform refuses the file, and for a file the
 *  view draws from its bytes, the whole file, read only once the platform
 *  reads the head. */
export async function readPreview(host: Host, path: string): Promise<Preview> {
  let read: Head;
  try {
    read = await host.read(path);
  } catch (e) {
    return { path, show: 'refused', reason: wordsOf(e) };
  }
  const whole = WHOLE[extensionOf(path)];
  if (whole && read.size <= RAW_BYTES) {
    try {
      return { path, show: 'whole', whole, file: await host.raw(path) };
    } catch (e) {
      return { path, show: 'refused', reason: wordsOf(e) };
    }
  }
  if (read.text === undefined) return { path, show: 'open', size: read.size };
  const drawn = DRAWN[extensionOf(path)];
  // The platform answers the head of a long file.
  const partial = new TextEncoder().encode(read.text).length < read.size;
  return drawn
    ? { path, show: 'drawn', drawn, text: read.text, partial }
    : { path, show: 'text', text: read.text, partial };
}

/** A CSV's rows, with quoted fields kept whole and the doubled quote inside
 *  one read as a single character. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [[]];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      rows[rows.length - 1]!.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      rows[rows.length - 1]!.push(field);
      field = '';
      rows.push([]);
    } else field += ch;
  }
  rows[rows.length - 1]!.push(field);
  return rows.filter((row) => row.some((cell) => cell !== ''));
}

/** A CSV as the table it is, in the look of a Markdown table: the first
 *  row is the header. */
function CsvTable({ text }: { text: string }) {
  const [head, ...body] = useMemo(() => csvRows(text), [text]);
  if (!head) return null;
  return (
    <table>
      <thead>
        <tr>
          {head.map((name, i) => (
            <th key={i}>{name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {head.map((_, c) => (
              <td key={c}>{row[c] ?? ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DrawnPreview({ drawn, text, host }: { drawn: Drawn; text: string; host: Host }) {
  return (
    <div className="hs-scroll hs-document-view">
      {drawn === 'markdown' ? (
        <Markdown onLink={(href) => void host.link(href)}>{text}</Markdown>
      ) : drawn === 'table' ? (
        <div className="hs-md">
          <CsvTable text={text} />
        </div>
      ) : drawn === 'diagram' ? (
        <Diagram source={text} />
      ) : (
        <Chart spec={text} />
      )}
    </div>
  );
}

/** A file the platform would not read, or the view could not draw. */
function RefusedRead({ path, reason }: { path: string; reason: string }) {
  return (
    <div className="hs-document-refusal">
      <div className="hs-document-refusal-content">
        <Icon name="lock-fill" size={20} className="hs-panel-muted-icon" />
        <span className="hs-document-refusal-title">{baseName(path)}</span>
        <span className="hs-panel-refusal-text">{reason}</span>
      </div>
    </div>
  );
}

/** A blob's address for as long as it shows. */
function useAddress(file: Blob): string {
  const address = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(address), [address]);
  return address;
}

/** A file drawn from its bytes. */
function WholePreview({ whole, file, path }: { whole: Whole; file: Blob; path: string }) {
  const address = useAddress(file);
  const [failed, setFailed] = useState<string | null>(null);
  const [page, setPage] = useState<string | null>(null);
  useEffect(() => {
    if (whole !== 'page') return;
    let live = true;
    void file.text().then((text) => live && setPage(text));
    return () => {
      live = false;
    };
  }, [whole, file]);
  if (failed !== null) return <RefusedRead path={path} reason={failed} />;
  switch (whole) {
    case 'picture':
      return (
        <div className="files-picture">
          <img src={address} alt="" />
        </div>
      );
    case 'audio':
    case 'video':
      return (
        <div className="files-media">
          {whole === 'audio' ? <audio src={address} controls /> : <video src={address} controls />}
        </div>
      );
    case 'pdf':
      return <Pdf file={file} onFail={setFailed} />;
    case 'page':
      // A page's own scripts and forms never run: the frame allows none.
      return page === null ? null : <iframe className="files-page" sandbox="" srcDoc={page} />;
  }
}

export function PreviewBody({
  preview,
  host,
  icons,
  onOpen,
}: {
  preview: Preview;
  host: Host;
  icons: IconSource;
  /** Opens the file in the system's app. */
  onOpen: (path: string) => void;
}) {
  switch (preview.show) {
    case 'refused':
      return <RefusedRead path={preview.path} reason={preview.reason} />;
    case 'whole':
      return (
        <WholePreview
          key={preview.path}
          whole={preview.whole}
          file={preview.file}
          path={preview.path}
        />
      );
    case 'drawn':
    case 'text':
      return (
        <>
          {preview.partial && (
            <span className="hs-file-partial">
              This file is long, and only its first part shows here.
            </span>
          )}
          {preview.show === 'drawn' ? (
            <DrawnPreview drawn={preview.drawn} text={preview.text} host={host} />
          ) : (
            <pre className="hs-scroll hs-file-source">{preview.text}</pre>
          )}
        </>
      );
    case 'open':
      return (
        <div className="hs-file-preview-message">
          <div className="hs-file-preview-content">
            <span className="hs-panel-empty-sub">
              {kindWords(preview.path)}, {sizeWords(preview.size)}
            </span>
            <button className="hs-glassbtn hs-preview-open" onClick={() => onOpen(preview.path)}>
              <SystemIcon
                path={preview.path}
                size={16}
                source={icons}
                fallback={<FileKindGlyph path={preview.path} size={16} />}
              />
              Open
            </button>
          </div>
        </div>
      );
  }
}
