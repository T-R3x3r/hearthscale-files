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
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';

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

/** Hover tip content box; the parent carries `hs-tipwrap` and its place.
 *  A press closes it until the pointer leaves. */
export function Tip({ style, title }: { style?: CSSProperties; title: string }) {
  const tip = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const wrap = tip.current?.parentElement;
    if (!wrap) return;
    const close = () => {
      wrap.dataset.tipClosed = 'true';
    };
    const open = () => {
      delete wrap.dataset.tipClosed;
    };
    const blur = () => {
      if (wrap.matches(':hover')) close();
    };
    wrap.addEventListener('pointerdown', close);
    wrap.addEventListener('mouseleave', open);
    window.addEventListener('blur', blur);
    return () => {
      wrap.removeEventListener('pointerdown', close);
      wrap.removeEventListener('mouseleave', open);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return (
    <span ref={tip} className="hs-tip hs-tooltip" data-sub="false" style={style}>
      <span className="hs-tooltip-title">{title}</span>
    </span>
  );
}

/** The square button of the view's toolbar. */
export function StripButton({
  onClick,
  children,
}: {
  onClick: (e: ReactMouseEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  return (
    <span onClick={onClick} className="hs-hovbox-ink hs-tipwrap hs-inkdim hs-panel-button">
      {children}
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
 *  and inside the page. It closes when the pointer leaves it, on Escape,
 *  and on a press outside it. */
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
    <div
      ref={menu}
      className="hs-menu-position"
      onMouseLeave={close}
      onClick={(e) => e.stopPropagation()}
      style={pos}
    >
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
