/** Utilità DOM: costruzione di elementi senza innerHTML con dati non fidati, e un renderer Markdown sicuro. */

type Child = Node | string | null | undefined | false | (Child)[];
type Props = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      else if (k === 'dataset') for (const [dk, dv] of Object.entries(v as Record<string, string>)) el.dataset[dk] = dv;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of (children as Child[]).flat(5) as Exclude<Child, Child[]>[]) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Elemento non trovato: ${sel}`);
  return el;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true' });
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

let toastTimer: number | undefined;
export function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(t);
  }
  t.className = `toast ${kind}`;
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 3500);
}

// ---------------- Markdown (sottoinsieme, con escape) ----------------
function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(h('code', null, t.slice(1, -1)));
    else if (m[2]) out.push(h('strong', null, t.slice(2, -2)));
    else if (m[3]) out.push(h('em', null, t.slice(1, -1)));
    else {
      const lm = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(t)!;
      out.push(h('a', { href: lm[2], target: '_blank', rel: 'noopener noreferrer' }, lm[1]));
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function inlineMd(text: string): (Node | string)[] {
  return inline(text);
}

export function renderMarkdown(md: string): HTMLElement {
  const root = h('div', { class: 'md' });
  const lines = md.split('\n');
  let i = 0;
  let para: string[] = [];
  const flush = (): void => {
    if (para.length) root.append(h('p', null, inline(para.join(' '))));
    para = [];
  };
  while (i < lines.length) {
    const l = lines[i];
    const fence = /^\s*```\s*([A-Za-z0-9_+-]*)/.exec(l);
    if (fence) {
      flush();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      root.append(h('pre', { class: 'code', 'data-lang': fence[1] || null }, h('code', null, buf.join('\n'))));
      continue;
    }
    const hd = /^(#{1,6})\s+(.*)$/.exec(l);
    if (hd) {
      flush();
      const level = Math.min(hd[1].length + 1, 6) as 2 | 3 | 4 | 5 | 6;
      root.append(h(`h${level}` as 'h2', null, inline(hd[2])));
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flush();
      const cells = (s: string): string[] => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      root.append(
        h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, head.map((c) => h('th', { scope: 'col' }, inline(c))))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, inline(c)))))))),
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      flush();
      const ul = h('ul');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) ul.append(h('li', null, inline(lines[i++].replace(/^\s*[-*]\s+/, ''))));
      root.append(ul);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      flush();
      const ol = h('ol');
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) ol.append(h('li', null, inline(lines[i++].replace(/^\s*\d+\.\s+/, ''))));
      root.append(ol);
      continue;
    }
    if (/^\s*>\s?/.test(l)) {
      flush();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      root.append(h('blockquote', null, inline(buf.join(' '))));
      continue;
    }
    if (l.trim() === '') {
      flush();
      i++;
      continue;
    }
    para.push(l.trim());
    i++;
  }
  flush();
  return root;
}
