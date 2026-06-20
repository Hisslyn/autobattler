# Path & purpose

`packages/client/src/ui/dom.ts` -- tiny, generic DOM-construction helpers used throughout the meta-screen layer (`ui/app.ts`, `ui/coachmarks.ts`) to build elements declaratively instead of via verbose imperative `document.createElement`/`appendChild` chains.

# Responsibility

Owns three primitives: a generic typed element builder (`el`), a button-with-click-handler shortcut (`button`), and a children-clearing utility (`clear`). No game logic, no styling decisions (styling is entirely class-name-based, deferring to `styles.ts`'s CSS, itself theme-token-driven).

# Exports

- `function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: {class?, text?, attrs?}, children?: (HTMLElement|null)[]): HTMLElementTagNameMap[K]` -- creates a `document.createElement(tag)`, optionally sets `className`, `textContent`, and arbitrary attributes (via `setAttribute` for each key/value in `attrs`), then appends each non-null entry of `children` (the `| null` in the children array type lets callers conditionally include/exclude a child via a ternary without needing to filter the array themselves, e.g. `[a, condition ? b : null, c]`). Generic over the tag name `K` so the return type is correctly narrowed (e.g. `el("input", ...)` returns `HTMLInputElement`, not generic `HTMLElement`) -- callers needing the narrow type (e.g. to read `.value`) still need an explicit cast in practice since `opts`/`children` don't carry tag-specific typing, but the return value itself is correctly typed by tag.
- `function button(label: string, onClick: () => void, cls = "ui-btn"): HTMLButtonElement` -- shortcut: `el("button", {class: cls, text: label})` + `addEventListener("click", onClick)`.
- `function clear(node: HTMLElement): void` -- removes all children of `node` via a `while (node.firstChild) removeChild` loop (the standard fast DOM-clearing idiom, faster than `innerHTML = ""` for elements with attached listeners since it avoids re-parsing).

# Key behavior

`el`'s children array accepting `null` entries is the one notable ergonomic feature -- it lets every screen-building call site in `ui/app.ts` write conditional children inline (`this.auth ? null : el(...)`) rather than building an array imperatively with pushes. `el` filters nulls out at append time (`for (const c of children) if (c) node.appendChild(c)`).

# Invariants & constraints

- **No inline styles or hardcoded colors are set by these helpers** -- by design, all visual styling flows through the `class` option referencing classes defined in `styles.ts`'s injected stylesheet (which itself reads `theme.ts`'s CSS variables) -- this file's only job is structure, never appearance. (Some callers in `ui/app.ts`/`ui/coachmarks.ts` DO set `.style.X` directly for computed positioning, e.g. coachmark ring placement -- that's a different concern (layout/position, not theme color) and doesn't violate this file's own scope.)
- `el`'s `attrs` are applied via `setAttribute`, NOT property assignment -- this matters for some HTML attributes/properties that differ (e.g. `value` as an attribute sets the DEFAULT value, not necessarily the live value for inputs after user interaction) -- callers needing live property semantics (e.g. reading `input.value` after the user types) work directly with the returned typed element rather than through `attrs`.
- `clear`'s while-loop approach correctly removes event listeners attached to descendants (since the nodes themselves are removed, not just their markup replaced) -- this matters because `ui/app.ts` repeatedly tears down and rebuilds entire screen subtrees on every navigation.

# Depends on

Nothing -- zero imports beyond ambient DOM types (`document`, `HTMLElementTagNameMap`).

# Used by

`packages/client/src/ui/app.ts` and `packages/client/src/ui/coachmarks.ts` -- both import `el`/`button`/`clear` as their sole DOM-construction primitives; every screen, card, row, and modal in the meta-shell is built from these three functions.

# Notes

- This is a minimal, intentionally un-clever DOM helper layer -- there's no framework here (no reactivity, no diffing, no component lifecycle) by design, consistent with `ui/app.ts`'s "framework-free, hand-rolled" screen manager approach noted in its own doc.
- A reader looking for "how does this codebase build UI" should understand this file fully explains the LOWEST level of that stack; everything above it (screens, cards, modals) is just composition of these three calls.
