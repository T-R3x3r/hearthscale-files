/**
 * The Files view: a folder's tree on the right, a preview on the left,
 * read through the platform inside the folders the person gave the app.
 * The view starts in the folder the person gave last, or at the file the
 * window opened it at, selected in its folder with its preview; the
 * pointer's back and forward walk the folders it came through. A folder
 * opens with its rows' system icons in hand. A read the platform refused
 * says why.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { wordsOf, type Host, type Listing, type Mount } from './host.ts';
import { Icon, MItem, MenuSurface, SettingsSearch, StripButton, Tip } from './kit.tsx';
import { FileKindGlyph, SystemIcon, primeIcons, type IconSource } from './kinds.tsx';
import { PreviewBody, readPreview, type Preview } from './Preview.tsx';
import { baseName, folderOf, holds, joinPath } from './words.ts';

/** The path broken into the pieces a breadcrumb can walk back through. */
function crumbs(path: string, root: string): { label: string; path: string }[] {
  const rest = path.slice(root.length).split(/[\\/]/).filter(Boolean);
  const out = [{ label: root.replace(/[\\/]+$/, '') || root, path: root }];
  let at = root;
  for (const segment of rest) {
    at = joinPath(at, segment);
    out.push({ label: segment, path: at });
  }
  return out;
}

/** The rows a folder mounts before its first measure, which are also the
 *  folders whose icons a listing asks for before it paints. */
const FIRST_ROWS = 60;
const ROW_MARGIN = 12;

/** The span of rows worth mounting, with a margin either side so a scroll
 *  lands on rows that already exist. Changing `at` returns to the top. */
function useRowWindow(at: string) {
  const box = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState({ from: 0, to: FIRST_ROWS });
  const metric = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    const sample = metric.current;
    if (!el || !sample) return;
    el.scrollTop = 0;
    const measure = () => {
      const height = sample.getBoundingClientRect().height;
      if (height <= 0) return;
      setRowHeight(height);
      const from = Math.max(0, Math.floor(el.scrollTop / height) - ROW_MARGIN);
      const to = from + Math.ceil(el.clientHeight / height) + ROW_MARGIN * 2;
      setSpan((span) => (span.from === from && span.to === to ? span : { from, to }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    sizes.observe(sample);
    return () => {
      el.removeEventListener('scroll', measure);
      sizes.disconnect();
    };
  }, [at]);

  return [box, span, metric, rowHeight] as const;
}

function TreeRow({
  icon,
  name,
  selected = false,
  onClick,
  onMenu,
}: {
  icon: ReactNode;
  name: string;
  /** The row of the file the preview shows. */
  selected?: boolean;
  onClick: () => void;
  onMenu?: (e: ReactMouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={`hs-hovbox-ink hs-file-row${selected ? ' hs-boxsel' : ''}`}
      onClick={onClick}
      onContextMenu={onMenu}
    >
      {icon}
      <span className="hs-file-entry-name">{name}</span>
    </div>
  );
}

/** The folder the view starts in: the last one the person gave the app,
 *  not the app's own data folder. */
const startOf = (mounts: Mount[]): string | null =>
  mounts.filter((m) => m.handle !== 'data').at(-1)?.path ?? null;

/** The view before the person has given the app a folder. */
function NoFolder({ onPick }: { onPick: () => void }) {
  return (
    <div className="hs-empty-view">
      <Icon name="folder-line" size={30} />
      <button
        type="button"
        className="hs-button"
        data-variant="secondary"
        data-size="sm"
        onClick={onPick}
      >
        <Icon name="folder-open-line" size={14} />
        Choose a folder
      </button>
    </div>
  );
}

export function Files({ host }: { host: Host }) {
  const [mounts, setMounts] = useState<Mount[] | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [listRefusal, setListRefusal] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [menu, setMenu] = useState<{ path: string; anchor: HTMLElement } | null>(null);
  // Only the newest request of each kind may say what the view shows.
  const listingAsk = useRef(0);
  const previewAsk = useRef(0);
  // The folders walked through, and where in them the tree stands. A
  // folder opened any way but a step drops the folders ahead, as a
  // browser drops the pages it had gone forward to.
  const walked = useRef<string[]>([]);
  const stood = useRef(-1);
  const icons = useCallback<IconSource>((path, isDir) => host.icon(path, isDir), [host]);

  /** Opens a folder in the tree; answers its listing, or null when the
   *  read was refused or a newer one took its place. */
  const load = async (path: string, remember = true): Promise<Listing | null> => {
    const mine = ++listingAsk.current;
    let next: Listing;
    try {
      next = await host.list(path);
    } catch (e) {
      if (mine === listingAsk.current) setListRefusal(wordsOf(e));
      return null;
    }
    await primeIcons(icons, [
      ...next.dirs.slice(0, FIRST_ROWS).map((name) => ({
        path: joinPath(next.path, name),
        isDir: true,
      })),
      ...next.files.map((name) => ({ path: joinPath(next.path, name), isDir: false })),
    ]);
    if (mine !== listingAsk.current) return null;
    if (remember && walked.current[stood.current] !== next.path) {
      walked.current = [...walked.current.slice(0, stood.current + 1), next.path];
      stood.current = walked.current.length - 1;
    }
    setFilter('');
    setListRefusal(null);
    setListing(next);
    return next;
  };

  const walk = (by: number) => {
    const to = stood.current + by;
    const path = walked.current[to];
    if (path === undefined) return;
    stood.current = to;
    void load(path, false);
  };
  const walkRef = useRef(walk);
  walkRef.current = walk;

  // The pointer's back and forward buttons walk the folders.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      walkRef.current(e.button === 3 ? -1 : 1);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const show = async (path: string) => {
    const mine = ++previewAsk.current;
    const next = await readPreview(host, path);
    if (mine === previewAsk.current) setPreview(next);
  };

  const open = async (path: string) => {
    try {
      await host.open(path);
    } catch (e) {
      setPreview({ path, show: 'refused', reason: wordsOf(e) });
    }
  };

  /** Adds a file to the context of the chats on screen, beside what the
   *  view added before and the person kept. */
  const attach = async (path: string) => {
    let block: Record<string, unknown> & { type: string };
    const head = await host.read(path).catch(() => null);
    if (head?.text !== undefined && new TextEncoder().encode(head.text).length >= head.size) {
      block = { type: 'resource', resource: { uri: fileUri(path), text: head.text } };
    } else {
      const file = await host.raw(path).catch(() => null);
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      block = {
        type: 'resource',
        resource: { uri: fileUri(path), blob: btoa(binary), mimeType: file.type },
      };
    }
    block._meta = { 'openai/title': baseName(path) };
    const kept = host.held().filter((b) => (b.resource as { uri?: string })?.uri !== fileUri(path));
    await host.context([...kept, block]);
  };

  /** The row the tree scrolls to once its folder shows. */
  const [focus, setFocus] = useState<string | null>(null);

  /** Shows a file the window opened the view at: its folder, read with
   *  the folders the app was given since, and the file selected with its
   *  preview. */
  const reveal = async (path: string) => {
    setMounts(await host.mounts());
    const shown = await load(folderOf(path));
    if (!shown) return;
    const file = joinPath(shown.path, baseName(path));
    setFocus(file);
    void show(file);
  };
  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  const begin = (all: Mount[]) => {
    setMounts(all);
    const opened = host.revealed();
    if (opened !== null) {
      void revealRef.current(opened);
      return;
    }
    const start = startOf(all);
    if (start) void load(start);
  };

  useEffect(() => {
    host.onRevealed((path) => void revealRef.current(path));
    void host.mounts().then(begin, () => begin([]));
  }, []);

  const pick = async () => {
    const mount = await host.pick();
    if (!mount) return;
    setMounts(await host.mounts());
    void load(mount.path);
  };

  /** Whether a path lies inside a folder the person gave the app. */
  const given = (path: string) => (mounts ?? []).some((m) => holds(m.path, path));
  const trail = listing ? crumbs(listing.path, listing.root) : [];
  const parent =
    trail.length > 1 && given(trail[trail.length - 2]!.path) ? trail[trail.length - 2]! : null;

  const entries = useMemo(() => {
    const match = (name: string) => name.toLowerCase().includes(filter.toLowerCase());
    if (!listing) return [];
    return [
      ...listing.dirs.filter(match).map((name) => ({ name, dir: true })),
      ...listing.files.filter(match).map((name) => ({ name, dir: false })),
    ];
  }, [listing, filter]);
  const [treeBox, span, rowMetric, rowHeight] = useRowWindow(`${listing?.path ?? ''}\0${filter}`);

  // The crumbs end at the folder the tree shows, so it stays in sight
  // however wide the tile grows or shrinks.
  const crumbBox = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = crumbBox.current;
    if (!el) return;
    const toEnd = () => {
      el.scrollLeft = el.scrollWidth;
    };
    toEnd();
    const sizes = new ResizeObserver(toEnd);
    sizes.observe(el);
    return () => sizes.disconnect();
  }, [listing?.path, typing]);

  // The revealed file's row is scrolled to the middle of the tree.
  useEffect(() => {
    const box = treeBox.current;
    if (focus === null || !listing || !box || rowHeight <= 0) return;
    const at = entries.findIndex((entry) => joinPath(listing.path, entry.name) === focus);
    if (at >= 0) {
      box.scrollTop = Math.max(0, (at + (parent ? 1 : 0)) * rowHeight - box.clientHeight / 2);
    }
    setFocus(null);
  }, [focus, entries, rowHeight]);

  if (mounts === null) return null;
  if (!startOf(mounts) && !listing) return <NoFolder onPick={() => void pick()} />;

  return (
    <>
      <div className="hs-files-toolbar">
        {typing !== null ? (
          <input
            className="hs-in hs-panel-field hs-panel-path"
            autoFocus
            value={typing}
            onChange={(e) => setTyping(e.target.value)}
            onBlur={() => setTyping(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const typed = typing.trim();
                if (typed) void load(typed);
                setTyping(null);
              } else if (e.key === 'Escape') setTyping(null);
            }}
          />
        ) : (
          <div
            ref={crumbBox}
            className="hs-tabscroll hs-file-breadcrumbs"
            onClick={() => setTyping(listing?.path ?? '')}
          >
            {trail.map((crumb, i) => (
              <span className="hs-file-breadcrumb" key={crumb.path}>
                {i > 0 && <span className="hs-file-path-separator">›</span>}
                {given(crumb.path) ? (
                  <span
                    className="hs-hovbox-ink hs-path-segment"
                    onClick={(e) => {
                      e.stopPropagation();
                      void load(crumb.path);
                    }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <span className="hs-path-segment">{crumb.label}</span>
                )}
              </span>
            ))}
            <span className="hs-file-path-tail" />
          </div>
        )}
        {preview && preview.show !== 'refused' && (
          <StripButton onClick={() => void attach(preview.path)}>
            <Icon name="add-fill" size={14} />
            <Tip style={{ top: 'calc(var(--space) * 8)', right: 0 }} title="Add to chat" />
          </StripButton>
        )}
        {preview && (
          <StripButton onClick={() => void open(preview.path)}>
            <Icon name="arrow-right-up-line" size={13} />
            <Tip style={{ top: 'calc(var(--space) * 8)', right: 0 }} title="Open" />
          </StripButton>
        )}
        <StripButton onClick={() => void pick()}>
          <Icon name="folder-add-line" size={14} />
          <Tip style={{ top: 'calc(var(--space) * 8)', right: 0 }} title="Choose a folder" />
        </StripButton>
      </div>
      <div className="hs-rview hs-file-view">
        <div className="hs-file-preview">
          {preview ? (
            <PreviewBody
              preview={preview}
              host={host}
              icons={icons}
              onOpen={(path) => void open(path)}
            />
          ) : (
            <div className="hs-file-preview-message">
              <div className="hs-panel-empty-content">
                <Icon name="folder-line" size={36} className="hs-panel-dim-icon" />
                <span className="hs-panel-empty-title">Open file</span>
                <span className="hs-panel-empty-sub">Select a file from the tree</span>
              </div>
            </div>
          )}
        </div>
        <div className="hs-file-tree">
          <div className="hs-file-search-wrap">
            <SettingsSearch value={filter} placeholder="Filter files…" onChange={setFilter} />
          </div>
          {listRefusal && (
            <div className="hs-panel-refusal-text hs-file-refusal">{listRefusal}</div>
          )}
          <div ref={treeBox} className="hs-scroll hs-file-tree-scroll">
            <div ref={rowMetric} className="hs-file-row hs-file-row-metric" aria-hidden="true" />
            {parent && (
              <TreeRow
                icon={<Icon name="arrow-right-s-line" size={16} className="hs-file-parent-icon" />}
                name={parent.label}
                onClick={() => void load(parent.path)}
              />
            )}
            <div className="hs-file-list-spacer" style={{ height: span.from * rowHeight }} />
            {listing &&
              entries.slice(span.from, span.to).map((entry) => {
                const path = joinPath(listing.path, entry.name);
                return (
                  <TreeRow
                    key={entry.name}
                    icon={
                      <SystemIcon
                        path={path}
                        isDir={entry.dir}
                        size={16}
                        source={icons}
                        fallback={
                          entry.dir ? (
                            <Icon name="folder-line" size={16} className="hs-panel-dim-icon" />
                          ) : (
                            <FileKindGlyph path={path} size={16} />
                          )
                        }
                      />
                    }
                    name={entry.name}
                    selected={!entry.dir && preview?.path === path}
                    onClick={() => void (entry.dir ? load(path) : show(path))}
                    {...(!entry.dir && {
                      onMenu: (e: ReactMouseEvent<HTMLElement>) => {
                        e.preventDefault();
                        setMenu({ path, anchor: e.currentTarget });
                      },
                    })}
                  />
                );
              })}
            <div
              className="hs-file-list-spacer"
              style={{ height: Math.max(0, entries.length - span.to) * rowHeight }}
            />
          </div>
        </div>
      </div>
      {menu && (
        <MenuSurface anchor={menu.anchor} minWidth={170} onDismiss={() => setMenu(null)}>
          <MItem
            icon={<Icon name="add-fill" size={14} />}
            label="Add to chat"
            onClick={() => {
              setMenu(null);
              void attach(menu.path);
            }}
          />
        </MenuSurface>
      )}
    </>
  );
}

/** A file's address in the context a chat receives. */
function fileUri(path: string): string {
  return `file:///${path.replace(/\\/g, '/').replace(/^\//, '')}`;
}
