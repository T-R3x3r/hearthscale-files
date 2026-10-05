/**
 * The files the view draws from their text, as a reply in a conversation
 * draws them: GitHub-flavoured Markdown, where a fence tagged `mermaid`
 * draws a diagram, a fence tagged `vega-lite` draws a chart and every other
 * fence is a code block; a Mermaid diagram; a Vega-Lite chart.
 *
 * A file's text is of unknown origin. Mermaid runs at `securityLevel:
 * 'strict'` and its SVG is sanitised before it reaches the page; Vega
 * draws through its own DOM API with `vega-interpreter` evaluating the
 * specification's expressions, so nothing needs `'unsafe-eval'`. Text that
 * does not parse shows in a code block with the reason.
 */
import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Config } from 'vega';
import type { TopLevelSpec } from 'vega-lite';
import { Icon } from './kit.tsx';

/** Fenced code: a bordered block with the language and a copy control in
 *  its header bar, and the reason it shows as text when there is one. */
export function CodeBlock({
  code,
  language,
  reason,
}: {
  code: string;
  language?: string;
  reason?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code.replace(/\n$/, '')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    });
  };
  return (
    <div className="hs-code-block">
      <div className="hs-code-head">
        <span className="hs-code-language">{language ?? 'code'}</span>
        {reason && <span className="hs-code-reason">{reason}</span>}
        <button type="button" onClick={copy} className="hs-code-copy">
          <Icon name="file-copy-line" size={11} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="hs-code-pre">{code}</pre>
    </div>
  );
}

let counter = 0;

/** A Mermaid diagram drawn from its source. */
export function Diagram({ source }: { source: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let live = true;
    setSvg(null);
    setReason(null);
    const token = (name: string) => getComputedStyle(element).getPropertyValue(name).trim();
    void (async () => {
      try {
        const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([
          import('mermaid'),
          import('dompurify'),
        ]);
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          // Labels are SVG text, not HTML in a `foreignObject`: the sanitiser
          // allows the SVG vocabulary only, and drops HTML inside SVG whole.
          htmlLabels: false,
          theme: 'base',
          fontFamily: token('--font-app'),
          themeVariables: {
            background: token('--card'),
            primaryColor: token('--win'),
            primaryTextColor: token('--text'),
            primaryBorderColor: token('--cardb'),
            secondaryColor: token('--hov'),
            tertiaryColor: token('--card'),
            lineColor: token('--mut'),
            textColor: token('--text'),
          },
        });
        counter += 1;
        const rendered = await mermaid.render(`files-diagram-${counter}`, source);
        if (!live) return;
        setSvg(
          DOMPurify.sanitize(rendered.svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_ATTR: ['dominant-baseline'],
          }),
        );
      } catch (error) {
        if (live) setReason(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
    };
  }, [source]);

  if (reason !== null) return <CodeBlock code={source} language="mermaid" reason={reason} />;
  // Mermaid hands back a string, so the sanitised result is set as markup.
  return (
    <div
      ref={host}
      className="hs-diagram"
      dangerouslySetInnerHTML={svg === null ? undefined : { __html: svg }}
    />
  );
}

/** The chart's frame, its type, axes and legend, in the tokens of the scope
 *  it is drawn in. The marks keep Vega's own palette, which carries data. */
function chrome(element: HTMLElement): Config {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const ink = token('--mut');
  const line = token('--cardb');
  const font = token('--font-app');
  return {
    title: { color: token('--text'), subtitleColor: ink, font, subtitleFont: font },
    axis: {
      domainColor: line,
      gridColor: token('--line'),
      tickColor: line,
      labelColor: ink,
      titleColor: ink,
    },
    legend: { labelColor: ink, titleColor: ink },
    style: { 'guide-label': { font }, 'guide-title': { font } },
  };
}

/** A chart drawn from a Vega-Lite specification. */
export function Chart({ spec }: { spec: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let live = true;
    let view: { finalize: () => void } | null = null;
    setReason(null);
    void (async () => {
      try {
        const [vega, vegaLite, { expressionInterpreter }] = await Promise.all([
          import('vega'),
          import('vega-lite'),
          import('vega-interpreter'),
        ]);
        const compiled = vegaLite.compile(JSON.parse(spec) as TopLevelSpec).spec;
        if (!live) return;
        // `ast: true` is what the interpreter evaluates; without it Vega
        // compiles its expressions to code the interpreter cannot read.
        const runtime = vega.parse(compiled, chrome(element), { ast: true });
        const created = new vega.View(runtime, {
          renderer: 'svg',
          container: element,
          expr: expressionInterpreter,
        });
        created.background('transparent');
        await created.runAsync();
        if (!live) {
          created.finalize();
          return;
        }
        view = created;
      } catch (error) {
        if (live) setReason(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
      view?.finalize();
      element.replaceChildren();
    };
  }, [spec]);

  if (reason !== null) return <CodeBlock code={spec} language="vega-lite" reason={reason} />;
  return <div ref={host} className="hs-chart" />;
}

/** The file name a relative target names. */
function nameOf(target: string): string {
  try {
    return decodeURIComponent(target.replace(/^\.\//, ''));
  } catch {
    return target;
  }
}

type FenceCode = ReactElement<{ className?: string; children?: ReactNode }>;

function fenceText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' ? child : ''))
    .join('')
    .replace(/\n$/, '');
}

const FENCES: Components = {
  pre({ children }) {
    const code = Children.toArray(children).find(isValidElement) as FenceCode | undefined;
    if (!code) return null;
    const source = fenceText(code.props.children);
    const language = /language-([\w-]+)/.exec(code.props.className ?? '')?.[1];
    if (language === 'mermaid') return <Diagram source={source} />;
    if (language === 'vega-lite') return <Chart spec={source} />;
    return <CodeBlock code={source} {...(language && { language })} />;
  },
};

/** A Markdown file as a reply draws it. A web link opens in the person's
 *  browser; a link or a picture that names a file is words, since the
 *  view reads no file it was not shown. */
export function Markdown({
  children,
  onLink,
}: {
  children: string;
  onLink: (href: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      ...FENCES,
      a({ href, children: words }) {
        const target = href ?? '';
        if (!/^https?:\/\//i.test(target)) return <>{words}</>;
        return (
          <a
            href={target}
            className="hs-md-link"
            onClick={(event) => {
              event.preventDefault();
              onLink(target);
            }}
          >
            {words}
          </a>
        );
      },
      img({ src, alt }) {
        const target = typeof src === 'string' ? src : '';
        return <span className="hs-md-missing">{alt || nameOf(target)}</span>;
      },
    }),
    [onLink],
  );
  return (
    <div className="hs-md hs-assistant-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
