/**
 * What the view asks of Hearthscale, typed: the folders and files the
 * person gave the app (`roots`), and reads inside them, each one the
 * platform confines to those folders and refuses in words; a file opened
 * in the system's app (`files.open`); and the blocks the view adds to the
 * context of the chats on screen, which show as removable chips.
 */
import { App, McpUiMessageResultSchema } from '@modelcontextprotocol/ext-apps';

/** A folder or file the person gave the app, by its handle. */
export interface Mount {
  handle: string;
  path: string;
  mode: 'read' | 'read-write';
}

export interface Listing {
  path: string;
  /** The drive or volume the path sits on. */
  root: string;
  dirs: string[];
  files: string[];
}

/** A file's size, and its head as text unless it is binary. */
export interface Head {
  path: string;
  size: number;
  binary: boolean;
  text?: string;
}

/** One MCP content block of the view's context. */
export type ContextBlock = Record<string, unknown> & { type: string };

/** The largest file the platform hands the view whole, in bytes. */
export const RAW_BYTES = 64 * 1024 * 1024;

/** The file an address names, `/?path=<absolute path>`; null for an
 *  address without one. */
function pathOf(link: unknown): string | null {
  const url = (link as { url?: unknown } | undefined)?.url;
  if (typeof url !== 'string') return null;
  return new URL(url, 'https://files.invalid').searchParams.get('path');
}

export class Host {
  constructor(private readonly app: App) {}

  /** One request of the host, its result whole; a refusal rejects with
   *  the SDK's error, whose words `wordsOf` reads. */
  private call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const request = this.app.request.bind(this.app) as (
      message: { method: string; params: Record<string, unknown> },
      schema: typeof McpUiMessageResultSchema,
    ) => Promise<unknown>;
    return request({ method, params }, McpUiMessageResultSchema) as Promise<T>;
  }

  async mounts(): Promise<Mount[]> {
    return (await this.call<{ mounts: Mount[] }>('hearthscale/roots/list')).mounts;
  }

  /** The system's picker, on the person's click; null when they cancel. */
  async pick(): Promise<Mount | null> {
    return (
      await this.call<{ mount: Mount | null }>('hearthscale/roots/request', {
        purpose: 'Choose a folder to browse in Files',
        shape: 'folder',
        mode: 'read',
      })
    ).mount;
  }

  list(path: string): Promise<Listing> {
    return this.call('hearthscale/fs/list', { path });
  }

  read(path: string): Promise<Head> {
    return this.call('hearthscale/fs/read', { path });
  }

  /** A whole file of at most `RAW_BYTES` as a blob of its media type. */
  async raw(path: string): Promise<Blob> {
    const { data, mediaType } = await this.call<{ data: string; mediaType: string }>(
      'hearthscale/fs/raw',
      { path },
    );
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: mediaType });
  }

  /** The system's icon of a file's kind or of a folder, as a picture
   *  address; null where it draws none. */
  async icon(path: string, folder: boolean): Promise<string | null> {
    return (await this.call<{ icon: string | null }>('hearthscale/fs/icon', { path, folder })).icon;
  }

  /** Opens a file in the system's app, on the person's click. */
  async open(path: string): Promise<void> {
    await this.call('openai/files/open', { path });
  }

  /** Opens a web address in the person's browser. */
  async link(url: string): Promise<void> {
    await this.app.openLink({ url });
  }

  /** Replaces the blocks the view adds to the context of the chats on
   *  screen, on the person's click. */
  async context(blocks: ContextBlock[]): Promise<void> {
    await this.app.updateModelContext({ content: blocks as never });
  }

  /** The view's blocks the chats still hold: none once the person removed
   *  them or a message took them. */
  held(): ContextBlock[] {
    const state = this.app.getHostContext()?.['openai/modelContext'] as
      { content?: ContextBlock[] } | null | undefined;
    return state?.content ?? [];
  }

  /** The file the window opened the view at, such as a file a turn
   *  changed; null when it opened on none. */
  revealed(): string | null {
    return pathOf(this.app.getHostContext()?.['openai/deepLink']);
  }

  /** Calls `fn` with each file the window opens the view at while it
   *  shows. */
  onRevealed(fn: (path: string) => void): void {
    this.app.onhostcontextchanged = (changed) => {
      const path = pathOf(changed['openai/deepLink']);
      if (path !== null) fn(path);
    };
  }
}

/** A refusal's words, as the view shows them: the host's words, without
 *  the "MCP error <code>: " that the MCP SDK puts before the message of a
 *  refused request. */
export const wordsOf = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^MCP error -?\d+: /, '');
