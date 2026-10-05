/**
 * The machine's own icons for files and folders, through the host. A file
 * is keyed by its extension, so one lookup serves every `.pdf` the view
 * shows; a folder is keyed by its own path, because the system gives its
 * special folders faces of their own. A row waiting on a key wakes when
 * that key's answer arrives, and only then. Until an icon is known, a
 * file wears a coloured mark of its kind.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './kit.tsx';
import { baseName } from './words.ts';

/** The host's lookup: the system's icon of a file, or of a folder when
 *  `isDir`, as a picture address; null when the system has none. */
export type IconSource = (path: string, isDir: boolean) => Promise<string | null>;

/** How long a listing waits for its icons before it paints without the
 *  ones still out. */
const PRIME_WAIT_MS = 200;

const cache = new Map<string, string | null>();
const asking = new Map<string, Promise<string | null>>();
const watchers = new Map<string, Set<() => void>>();

/** A name's extension with its dot, lowercased; empty for a name with
 *  none, and for one that only starts with a dot. */
export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

function keyOf(path: string, isDir: boolean): string {
  return isDir ? `dir:${path}` : extensionOf(path) || 'file';
}

function ask(source: IconSource, path: string, isDir: boolean): Promise<string | null> {
  const key = keyOf(path, isDir);
  const held = asking.get(key);
  if (held) return held;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const answer = source(path, isDir)
    .catch(() => null)
    .then((icon) => {
      cache.set(key, icon);
      asking.delete(key);
      if (icon) for (const listener of watchers.get(key) ?? []) listener();
      return icon;
    });
  asking.set(key, answer);
  return answer;
}

/** Asks for the icons of a listing's entries and resolves once they are
 *  in, or once the wait runs out, so a folder opens with its rows' icons
 *  in hand and a slow answer never holds the tree back. */
export function primeIcons(
  source: IconSource,
  entries: { path: string; isDir: boolean }[],
): Promise<void> {
  const keys = new Set<string>();
  const answers: Promise<unknown>[] = [];
  for (const { path, isDir } of entries) {
    const key = keyOf(path, isDir);
    if (cache.has(key) || keys.has(key)) continue;
    keys.add(key);
    answers.push(ask(source, path, isDir));
  }
  if (!answers.length) return Promise.resolve();
  return Promise.race([
    Promise.all(answers).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, PRIME_WAIT_MS)),
  ]);
}

/** The system's icon of a file or a folder; null until it arrives, and
 *  for one the system has nothing for. */
function useFileIcon(path: string, isDir: boolean, source: IconSource): string | null {
  const key = keyOf(path, isDir);
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    const waiting = watchers.get(key) ?? new Set();
    waiting.add(listener);
    watchers.set(key, waiting);
    void ask(source, path, isDir);
    return () => {
      waiting.delete(listener);
      if (!waiting.size) watchers.delete(key);
    };
  }, [key, path, isDir, source]);
  return cache.get(key) ?? null;
}

/** A file's or a folder's system icon, with the fallback until it
 *  arrives and for one the system draws nothing for. */
export function SystemIcon({
  path,
  isDir = false,
  size,
  source,
  fallback,
}: {
  path: string;
  isDir?: boolean;
  size: number;
  source: IconSource;
  fallback: ReactNode;
}) {
  const icon = useFileIcon(path, isDir, source);
  return icon ? (
    <img className="hs-system-icon" src={icon} alt="" width={size} height={size} />
  ) : (
    <>{fallback}</>
  );
}

type FileKind =
  | 'pdf'
  | 'document'
  | 'sheet'
  | 'slides'
  | 'picture'
  | 'audio'
  | 'video'
  | 'archive'
  | 'code'
  | 'markdown'
  | 'text';

const KINDS: Record<FileKind, string[]> = {
  pdf: ['.pdf'],
  document: ['.doc', '.docx', '.odt', '.rtf', '.pages'],
  sheet: ['.xls', '.xlsx', '.ods', '.csv', '.tsv', '.numbers'],
  slides: ['.ppt', '.pptx', '.odp', '.key'],
  picture: [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.avif',
    '.bmp',
    '.ico',
    '.svg',
    '.tif',
    '.tiff',
    '.heic',
    '.psd',
  ],
  audio: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus'],
  video: ['.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv', '.avi', '.wmv'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.xz', '.bz2'],
  code: [
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.py',
    '.rs',
    '.go',
    '.java',
    '.c',
    '.h',
    '.cpp',
    '.cs',
    '.rb',
    '.php',
    '.sh',
    '.ps1',
    '.html',
    '.htm',
    '.css',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.mmd',
    '.mermaid',
    '.vega-lite',
  ],
  markdown: ['.md', '.markdown'],
  text: ['.txt', '.log'],
};

const KIND_OF = new Map(
  Object.entries(KINDS).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as FileKind] as const),
  ),
);

/** The Remix Icon each kind is marked with. */
const KIND_ICON: Record<FileKind, string> = {
  pdf: 'file-pdf-2-fill',
  document: 'file-word-fill',
  sheet: 'file-excel-fill',
  slides: 'file-ppt-fill',
  picture: 'file-image-fill',
  audio: 'file-music-fill',
  video: 'file-video-fill',
  archive: 'file-zip-fill',
  code: 'file-code-fill',
  markdown: 'markdown-fill',
  text: 'file-text-fill',
};

/** A file's kind as a mark in its kind's colour, for a file whose system
 *  icon is not known. `data-kind` names the kind, `other` for the rest. */
export function FileKindGlyph({ path, size }: { path: string; size: number }) {
  const kind = KIND_OF.get(extensionOf(path));
  return (
    <span className="hs-file-kind" data-kind={kind ?? 'other'}>
      <Icon name={kind ? KIND_ICON[kind] : 'file-fill'} size={size} />
    </span>
  );
}
