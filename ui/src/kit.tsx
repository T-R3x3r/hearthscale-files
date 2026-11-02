/**
 * The parts the view draws, built on the kit Hearthscale loads into every
 * view: its `hs-*` classes, which give each part the look of the same part
 * in the shell, and the Remix Icon font with its `ri-*` classes.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { safeTriangle } from './safeTriangle.ts';

/** A Remix Icon by its remixicon.com name, at a size in pixels, in the
 *  colour of the text around it. */
export function Icon({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      className={`ri-${name} files-glyph${className ? ` ${className}` : ''}`}
      style={{ fontSize: size }}
    />
  );
}

/** A tip floated over the view from its mark: under it and from its right
 *  edge where there is room, else on the other side, shifted along that
 *  side so the whole tip stays inside the view. */
function FloatingTip({ anchor, title }: { anchor: HTMLElement; title: string }) {
  const floating = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    let live = true;
    const update = () => {
      void computePosition(anchor, floating.current!, {
        placement: 'bottom-end',
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (live) setPos({ left: x, top: y, visibility: 'visible' });
      });
    };
    const cleanup = autoUpdate(anchor, floating.current!, update);
    return () => {
      live = false;
      cleanup();
    };
  }, [anchor]);
  return createPortal(
    <div ref={floating} className="hs-menu-position hs-floating-tip" style={pos}>
      <span className="hs-tip hs-tooltip" data-sub="false">
        <span className="hs-tooltip-title">{title}</span>
      </span>
    </div>,
    document.documentElement,
  );
}

/** The square button of the view's toolbar, named by its tip, which the
 *  keyboard reaches and presses with Enter or Space. A press closes the
 *  tip until the pointer comes back. */
export function StripButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClick();
      }}
      onMouseEnter={(e) => setAnchor(e.currentTarget)}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && setAnchor(e.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
      onBlur={() => setAnchor(null)}
      onPointerDown={() => setAnchor(null)}
      className="hs-hovbox-ink hs-inkdim hs-panel-button"
    >
      {children}
      {anchor?.isConnected && <FloatingTip anchor={anchor} title={label} />}
    </span>
  );
}

/** The search field whose placeholder sits centred and slides left on
 *  focus. */
export function SettingsSearch({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="hs-url hs-settings-search">
      <Icon name="search-line" size={12} />
      <input
        className="hs-in hs-urlin"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span aria-hidden="true" className="hs-urlph hs-ph-icon">
        {placeholder}
      </span>
    </label>
  );
}

/** A menu on the frosted popup surface, under the element it opens from
 *  and inside the page. It stays open while the pointer is on that
 *  element, on the menu or on the way between them, and closes when the
 *  pointer is anywhere else, on Escape, and on a press outside it. */
export function MenuSurface({
  anchor,
  minWidth,
  onDismiss,
  children,
}: {
  anchor: HTMLElement;
  minWidth: number;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const close = () => dismiss.current();
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      close();
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close();
    };
    window.addEventListener('keydown', escape, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  useEffect(() => safeTriangle(anchor, () => menu.current!, close), [anchor]);
  useLayoutEffect(() => {
    const floating = menu.current!;
    let live = true;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const edge = (rect.left + rect.right) / 2 > window.innerWidth / 2 ? 'end' : 'start';
      void computePosition(anchor, floating, {
        placement: `bottom-${edge}`,
        middleware: [
          offset(6),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          size({
            padding: 8,
            apply({ availableWidth, availableHeight, elements, rects }) {
              const surface = elements.floating.firstElementChild as HTMLElement;
              const wanted = Math.max(minWidth, rects.reference.width);
              surface.style.minWidth = `${Math.max(0, Math.min(wanted, availableWidth))}px`;
              surface.style.maxWidth = `${Math.max(0, availableWidth)}px`;
              surface.style.maxHeight = `${Math.max(0, availableHeight)}px`;
            },
          }),
        ],
      }).then(({ x, y }) => {
        if (live) setPos({ left: x, top: y, visibility: 'visible' });
      });
    };
    const cleanup = autoUpdate(anchor, floating, update);
    return () => {
      live = false;
      cleanup();
    };
  }, [anchor, minWidth]);
  return createPortal(
    <div ref={menu} className="hs-menu-position" onClick={(e) => e.stopPropagation()} style={pos}>
      <div
        className="hs-menu hs-menu-surface"
        style={{ minWidth: `min(${minWidth}px, calc(100vw - var(--space) * 4))` }}
      >
        {children}
      </div>
    </div>,
    document.documentElement,
  );
}

/** One row of a menu: a mark and a label. */
export function MItem({
  icon,
  label,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      className="hs-mitem hs-menu-item-row hs-inkmut hs-hovbox-ink"
      data-sel="false"
      data-disabled="false"
      onClick={onClick}
    >
      {icon}
      <span className="hs-menu-label">
        <span className="hs-menu-title">{label}</span>
      </span>
    </div>
  );
}
