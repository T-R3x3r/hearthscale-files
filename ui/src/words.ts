/**
 * Paths and sizes in the words a person reads.
 */

/** A path's last segment. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** The folder a path lies in. */
export function folderOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '');
}

/** A size in bytes, in the unit that reads best. */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Joins a segment onto a path without doubling the separator at a drive
 *  root, where the path already ends in one. */
export function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${sep}${name}`;
}

/** Whether `path` is `root` or lies inside it, as Windows paths compare
 *  when either holds a backslash. */
export function holds(root: string, path: string): boolean {
  const windows = root.includes('\\') || path.includes('\\');
  const form = (p: string) => {
    const bare = p.replace(/[\\/]+/g, '/').replace(/\/$/, '');
    return windows ? bare.toLowerCase() : bare;
  };
  const r = form(root);
  const p = form(path);
  return p === r || p.startsWith(`${r}/`);
}
