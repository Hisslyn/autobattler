// Tiny DOM helpers for the meta-screen layer. No game logic; styling comes from
// CSS classes bound to theme tokens (see styles.ts).

type Attrs = Record<string, string>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { class?: string; text?: string; attrs?: Attrs } = {},
  children: (HTMLElement | null)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

export function button(label: string, onClick: () => void, cls = "ui-btn"): HTMLButtonElement {
  const b = el("button", { class: cls, text: label });
  b.addEventListener("click", onClick);
  return b;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
