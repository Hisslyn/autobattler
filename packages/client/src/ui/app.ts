// DOM/CSS meta-shell over the Pixi canvas: screen manager + screens (Main Menu,
// Play, Profile, Leaderboard, How to Play, Settings) plus the in-match pause
// panel and coachmark trigger. Holds no authoritative game state; gameplay runs
// in the Pixi match scene driven by IDriver.
import { mmrToRank, RANK_BANDS } from "@autobattler/data";
import { cssVar, rankCssVar, traitColorCss } from "../theme.js";
import type { RankBand } from "@autobattler/data";
import type { SettingsStore, Settings } from "../settings.js";
import type { AudioManager } from "../audio/manager.js";
import type { AuthState, MatchHistoryEntry } from "../auth.js";
import { fetchLeaderboard, fetchProfile, fetchHistory, patchName } from "../auth.js";
import { shouldShowCoachmarks, markCoachmarksSeen, COACHMARK_STEPS } from "../onboarding.js";
import { Coachmarks } from "./coachmarks.js";
import { HELP_PAGES } from "./content.js";
import { injectStyles } from "./styles.js";
import { el, button, clear } from "./dom.js";
import { PLAYER_1_AVATAR_NUM, avatarUrl } from "../avatars.js";

export type PlayMode = "local" | "online";

export interface UiAppOptions {
  httpBase: string;
  settings: SettingsStore;
  audio: AudioManager;
  auth: AuthState | null;
  canvas: HTMLCanvasElement;
  onStartMatch: (mode: PlayMode) => void;
}

type ScreenId = "main" | "play" | "profile" | "leaderboard" | "howto" | "settings";

/** Minimal inline-SVG line icons for the main-menu chrome (no emoji, no webfont —
 * mirrors the canvas glyph system's "draw it ourselves" approach, but in DOM).
 * Strokes use currentColor so CSS controls tint via cssVar(...), never a literal. */
type IconName = "person" | "book" | "bell" | "gear" | "coin" | "trophy" | "arrowRight" | "ticket";

const ICON_PATHS: Record<IconName, string> = {
  person: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.6 3.2-6.5 7-6.5s7 2.9 7 6.5",
  book: "M5 4.5h6.5A2.5 2.5 0 0 1 14 7v13a2 2 0 0 0-2-2H5V4.5Zm14 0h-6.5A2.5 2.5 0 0 0 10 7v13a2 2 0 0 1 2-2h7V4.5Z",
  bell: "M12 4a5 5 0 0 0-5 5v3.5L5 16h14l-2-3.5V9a5 5 0 0 0-5-5Zm-2.2 14a2.2 2.2 0 0 0 4.4 0",
  gear: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM12 2.8l1 2.4 2.5-.8 1 2.4-2 1.7v2.6l2 1.7-1 2.4-2.5-.8-1 2.4h-2.4l-1-2.4-2.5.8-1-2.4 2-1.7v-2.6l-2-1.7 1-2.4 2.5.8 1-2.4h2.4Z",
  coin: "M12 19.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0-11v7m-2.4-5.2c0 1 .9 1.4 2.4 1.7 1.9.4 2.6 1 2.6 2.1 0 1.2-1.1 2-2.6 2-1.2 0-2.1-.5-2.5-1.4",
  trophy: "M7 4.5h10v3.5a5 5 0 0 1-10 0V4.5ZM7 6H4v1.5A3.5 3.5 0 0 0 7 11M17 6h3v1.5A3.5 3.5 0 0 1 17 11M10.5 14.5h3v2.5h-3z M8.5 19.5h7l-.7-2.5h-5.6Z",
  arrowRight: "M5 12h13.5M13 6.5 18.5 12 13 17.5",
  ticket: "M4.5 9a2 2 0 0 0 0 6v2a1.5 1.5 0 0 0 1.5 1.5h12A1.5 1.5 0 0 0 19.5 17v-2a2 2 0 0 1 0-6V7A1.5 1.5 0 0 0 18 5.5H6A1.5 1.5 0 0 0 4.5 7v2Zm6.5-2.5v11",
};

/** Build a small inline SVG icon (stroke = currentColor; tint via CSS). */
function icon(name: IconName, size = 18): HTMLElement {
  const wrap = el("span", { class: "ui-icon" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICON_PATHS[name]);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  wrap.appendChild(svg);
  return wrap;
}

export class UiApp {
  private menuRoot: HTMLElement;
  private content: HTMLElement;
  private matchOverlay: HTMLElement;
  private stack: ScreenId[] = ["main"];
  private leaveHandler: (() => void) | null = null;

  /** Currently-selected match mode for the main-menu play cluster (defaults to
   * offline Practice). Set by the mode picker; read by the PLAY button. */
  private playMode: PlayMode = "local";

  auth: AuthState | null;

  constructor(private opts: UiAppOptions) {
    this.auth = opts.auth;
    this.content = el("div");
    this.menuRoot = el("div", { attrs: { id: "ui-root" } }, [this.content]);
    this.matchOverlay = el("div", { attrs: { id: "match-overlay" } });
    this.matchOverlay.classList.add("hidden");

    // One delegated listener: resume audio + tap feedback on any button press.
    this.menuRoot.addEventListener("click", (e) => {
      this.opts.audio.resume();
      if ((e.target as HTMLElement).tagName === "BUTTON") this.opts.audio.play("tap");
    });
  }

  mount(parent: HTMLElement): void {
    injectStyles();
    parent.appendChild(this.menuRoot);
    parent.appendChild(this.matchOverlay);
    this.render();
    void this.opts.audio.setMusicState("menu");
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  private navigate(id: ScreenId): void {
    this.stack.push(id);
    this.render();
  }

  private back(): void {
    if (this.stack.length > 1) this.stack.pop();
    this.render();
  }

  private render(): void {
    clear(this.content);
    const id = this.stack[this.stack.length - 1]!;
    this.content.appendChild(this.screen(id));
  }

  private screen(id: ScreenId): HTMLElement {
    switch (id) {
      case "main": return this.mainMenu();
      case "play": return this.playMenu();
      case "profile": return this.profileScreen();
      case "leaderboard": return this.leaderboardScreen();
      case "howto": return this.howToScreen();
      case "settings": return this.settingsScreen();
    }
  }

  private wrap(children: (HTMLElement | null)[], withBack = true): HTMLElement {
    return el("div", { class: "ui-screen" }, [
      withBack ? button("‹ Back", () => this.back(), "ui-btn-back") : null,
      ...children,
    ]);
  }

  // ─── Screens ───────────────────────────────────────────────────────────────

  /**
   * Landscape-first main menu shell: top utility bar, left vertical nav,
   * center-right key-art stage (placeholder art slots), bottom-left promo
   * banner, bottom-right play cluster. Pure DOM/CSS chrome over the canvas —
   * see references/main-menu.md for the full spec this implements 1:1.
   */
  private mainMenu(): HTMLElement {
    return el("div", { class: "ui-mainmenu" }, [
      this.mmTopBar(),
      this.mmLeftNav(),
      this.mmKeyArtStage(),
      this.mmPromoBanner(),
      this.mmPlayCluster(),
    ]);
  }

  // ── 2.1 Top utility bar ────────────────────────────────────────────────────

  /**
   * Player 1's identity-cluster portrait. Renders the registry avatar (a bundled
   * PNG that already carries its rarity ring) as a cover background clipped by the
   * existing circular `.mm-avatar-glyph` frame; falls back to the person glyph
   * when the registry has no entry. Cosmetic only — no Pixi in the DOM layer.
   */
  private mmAvatarPortrait(): HTMLElement {
    const frame = el("span", { class: "mm-avatar-glyph" });
    const url = avatarUrl(PLAYER_1_AVATAR_NUM);
    if (url) {
      frame.style.backgroundImage = `url("${url}")`;
      frame.style.backgroundSize = "cover";
      frame.style.backgroundPosition = "center";
    } else {
      frame.appendChild(icon("person", 20)); // graceful fallback
    }
    return frame;
  }

  private mmTopBar(): HTMLElement {
    const name = this.auth?.profile.name ?? "Guest";
    const rank = this.auth ? mmrToRank(this.auth.profile.mmr) : null;

    const identity = el("button", { class: "mm-identity", attrs: { type: "button", "aria-label": "Profile" } }, [
      el("span", { class: "mm-avatar-frame" }, [
        this.mmAvatarPortrait(),
        // slot:levelBadge — stub: no account-level system yet; static placeholder.
        el("span", { class: "mm-level-badge", text: "1" }),
      ]),
      el("span", { class: "mm-identity-text" }, [
        el("span", { class: "mm-player-name", text: name }),
        rank ? this.rankBadge(rank) : null,
      ]),
    ]);
    identity.addEventListener("click", () => this.navigate("profile"));

    const currency = button("", () => this.onTapCurrency(), "mm-currency-chip");
    currency.appendChild(icon("coin", 16));
    currency.appendChild(el("span", { class: "mm-currency-val", text: "0" }));

    const utilityProfile = el("button", { class: "mm-util-btn", attrs: { type: "button", "aria-label": "Profile" } }, [icon("person", 18)]);
    utilityProfile.addEventListener("click", () => this.navigate("profile"));

    const utilityCollection = el("button", { class: "mm-util-btn", attrs: { type: "button", "aria-label": "Collection" } }, [icon("book", 18)]);
    utilityCollection.addEventListener("click", () => this.onOpenCollection());

    const notifBtn = el("button", { class: "mm-util-btn mm-util-notif", attrs: { type: "button", "aria-label": "Notifications" } }, [
      icon("bell", 18),
      el("span", { class: "mm-notif-dot hidden" }),
    ]);
    notifBtn.addEventListener("click", () => this.onOpenNotifications());

    const utilitySettings = el("button", { class: "mm-util-btn", attrs: { type: "button", "aria-label": "Settings" } }, [icon("gear", 18)]);
    utilitySettings.addEventListener("click", () => this.navigate("settings"));

    const rightCluster = el("div", { class: "mm-topbar-right" }, [
      currency, utilityProfile, utilityCollection, notifBtn, utilitySettings,
    ]);

    return el("div", { class: "mm-topbar" }, [identity, rightCluster]);
  }

  // ── 2.2 Left vertical nav ──────────────────────────────────────────────────

  private mmLeftNav(): HTMLElement {
    const rank = this.auth ? mmrToRank(this.auth.profile.mmr) : RANK_BANDS[0]!;
    const next = this.nextRankBand(rank);
    const cur = this.auth?.profile.mmr ?? rank.minMmr;
    const span = next ? Math.max(1, next.minMmr - rank.minMmr) : 1;
    const into = next ? Math.min(span, Math.max(0, cur - rank.minMmr)) : span;
    const pct = next ? Math.round((into / span) * 100) : 100;

    const primary = el("button", { class: "mm-nav-row mm-nav-active", attrs: { type: "button" } }, [
      el("span", { class: "mm-nav-icon mm-nav-medallion" }, [icon("trophy", 20)]),
      el("div", { class: "mm-nav-col" }, [
        el("span", { class: "mm-nav-label", text: "Leaderboard" }),
        el("div", { class: "mm-nav-subblock" }, [
          el("span", { class: "mm-nav-sub-text", text: rank.name }),
          el("span", { class: "mm-nav-sub-text", text: next ? `${into} / ${span}` : "Max rank" }),
          (() => {
            const bar = el("div", { class: "mm-nav-progress-track" }, [el("div", { class: "mm-nav-progress-fill" })]);
            (bar.firstChild as HTMLElement).style.width = `${pct}%`;
            return bar;
          })(),
        ]),
      ]),
    ]);
    primary.addEventListener("click", () => this.navigate("leaderboard"));

    const secondary = el("button", { class: "mm-nav-row", attrs: { type: "button" } }, [
      el("span", { class: "mm-nav-icon" }, [icon("book", 20)]),
      el("div", { class: "mm-nav-col" }, [el("span", { class: "mm-nav-label", text: "How to Play" })]),
    ]);
    secondary.addEventListener("click", () => this.navigate("howto"));

    const tertiary = el("button", { class: "mm-nav-row", attrs: { type: "button" } }, [
      el("span", { class: "mm-nav-icon" }, [icon("ticket", 20)]),
      el("div", { class: "mm-nav-col" }, [el("span", { class: "mm-nav-label", text: "Play" })]),
    ]);
    tertiary.addEventListener("click", () => this.navigate("play"));

    return el("div", { class: "mm-leftnav" }, [primary, secondary, tertiary]);
  }

  /** Next rank band above `rank`, or null if `rank` is the top band. */
  private nextRankBand(rank: RankBand): RankBand | null {
    const idx = RANK_BANDS.findIndex((b) => b.id === rank.id);
    return idx >= 0 && idx < RANK_BANDS.length - 1 ? RANK_BANDS[idx + 1]! : null;
  }

  // ── 2.3 Center-right key-art stage ─────────────────────────────────────────

  private mmKeyArtStage(): HTMLElement {
    return el("div", { class: "mm-keyart-stage" }, [
      el("div", { class: "mm-keyart-bg", text: "keyArtBackground" }),
      el("div", { class: "mm-keyart-ambient", text: "keyArtAmbientAccent" }),
      el("div", { class: "mm-keyart-hero", text: "keyArtHero" }),
    ]);
  }

  // ── 2.4 Bottom-left promo banner ───────────────────────────────────────────

  private mmPromoBanner(): HTMLElement {
    const card = el("button", { class: "mm-promo-card", attrs: { type: "button" } }, [
      el("span", { class: "mm-promo-thumb" }, [icon("ticket", 18)]),
      el("span", { class: "mm-promo-text" }, [
        el("span", { class: "mm-promo-title", text: "Season Pass" }),
        el("span", { class: "mm-promo-subtitle", text: "Coming soon" }),
      ]),
    ]);
    card.addEventListener("click", () => this.onOpenPromo());
    return card;
  }

  // ── 2.5 Bottom-right play cluster ──────────────────────────────────────────

  private mmPlayCluster(): HTMLElement {
    const modeChip = el("button", { class: "mm-mode-chip", attrs: { type: "button" } }, [
      el("span", { class: "mm-mode-icon" }, [icon("ticket", 14)]),
      el("span", { class: "mm-mode-label", text: this.playMode === "local" ? "Practice" : "Online" }),
    ]);
    modeChip.addEventListener("click", () => this.onOpenModePicker(modeChip));

    const playBtn = el("button", { class: "mm-play-btn", attrs: { type: "button" } }, [
      el("span", { class: "mm-play-label", text: "PLAY" }),
      icon("arrowRight", 20),
    ]);
    playBtn.addEventListener("click", () => this.opts.onStartMatch(this.playMode));

    return el("div", { class: "mm-play-cluster" }, [modeChip, playBtn]);
  }

  // ── Main-menu stub handlers (NEW slots — no underlying feature yet) ───────

  // stub: premium currency does not exist; no-op until an economy is designed.
  private onTapCurrency(): void { /* stub: no premium currency yet */ }

  // stub: no collection/roster browser screen exists yet.
  private onOpenCollection(): void { /* stub: route to a future collection browser */ }

  // stub: no notification system exists yet.
  private onOpenNotifications(): void { /* stub: no-op until notifications exist */ }

  // stub: no battle-pass/season system exists yet.
  private onOpenPromo(): void { /* stub: no-op until a season-pass feature exists */ }

  /**
   * stub: opens the mode picker (Practice/Online). Wire to reuse the existing
   * playMenu()'s Practice/Online cards or a compact inline popover; on
   * selection set `this.playMode` and re-render. Left as a no-op landing on
   * the existing Play screen for now so the destination still works end to end.
   */
  private onOpenModePicker(_anchor: HTMLElement): void {
    this.navigate("play");
  }

  /** Title + subtitle tap-card (Play submenu). */
  private playCard(title: string, desc: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const b = button("", onClick, "ui-btn ui-playcard");
    b.appendChild(el("span", { class: "pc-title", text: title }));
    b.appendChild(el("span", { class: "pc-desc", text: desc }));
    b.disabled = disabled;
    return b;
  }

  private playMenu(): HTMLElement {
    const practice = this.playCard("Practice", "Play offline against AI bots.", () => { this.playMode = "local"; this.opts.onStartMatch("local"); });
    const online = this.playCard("Online", "Ranked lobby on the server.", () => { this.playMode = "online"; this.opts.onStartMatch("online"); }, !this.auth);
    if (!this.auth) online.title = "Server unreachable";
    return this.wrap([
      el("div", { class: "ui-title", text: "Play" }),
      practice,
      online,
      this.auth ? null : el("div", { class: "ui-muted", text: "Online requires a reachable server." }),
    ]);
  }

  /** Rank pill colored from the rank-band data (shared with the canvas palette). */
  private rankBadge(rank: RankBand): HTMLElement {
    const badge = el("span", { class: "ui-rank-badge", text: rank.name });
    badge.style.setProperty("--rank", rankCssVar(rank.id));
    return badge;
  }

  /** Diamond chip (rotated square) tinted to `colorCss` — mirrors canvas chips. */
  private diamond(colorCss: string): HTMLElement {
    const d = el("div", { class: "ui-diamond" });
    d.style.setProperty("--dia", colorCss);
    return d;
  }

  /** Per-page visual motif reusing the canvas diamond + tier-color language. */
  private howToMotif(title: string): HTMLElement | null {
    if (title === "Combat & Traits") {
      const traits: [string, string][] = [
        ["holy", "Holy"], ["frost", "Frost"], ["dragon", "Dragon"], ["knight", "Knight"], ["ranger", "Ranger"],
      ];
      return el("div", { class: "ui-trait-legend" }, traits.map(([id, name]) => {
        const chip = el("div", { class: "ui-trait-chip" }, [this.diamond(traitColorCss(id)), el("span", { text: name })]);
        chip.style.setProperty("--dia", traitColorCss(id));
        return chip;
      }));
    }
    if (title === "Leveling & Shop Odds") {
      return el("div", { class: "ui-tier-legend" }, [1, 2, 3, 4, 5].map((t) =>
        el("div", { class: "ui-tier-chip" }, [this.diamond(cssVar(`tier${t}` as Parameters<typeof cssVar>[0])), el("span", { text: `Tier ${t}` })])
      ));
    }
    return null;
  }

  private profileScreen(): HTMLElement {
    const screen = this.wrap([el("div", { class: "ui-title", text: "Profile" })]);
    if (!this.auth) {
      screen.appendChild(el("div", { class: "ui-muted", text: "Connect to a server to view your profile." }));
      return screen;
    }
    const body = el("div", { class: "ui-card", text: "Loading…" });
    screen.appendChild(body);

    const token = this.auth.token;
    Promise.all([
      fetchProfile(this.opts.httpBase, token),
      fetchHistory(this.opts.httpBase, token, 20),
    ])
      .then(([profile, history]) => {
        this.auth = { ...this.auth!, profile };
        clear(body);
        const rank = mmrToRank(profile.mmr);
        body.appendChild(el("div", { class: "ui-row" }, [
          el("div", { text: profile.name }),
          this.rankBadge(rank),
        ]));
        body.appendChild(el("div", { class: "ui-bigmmr", text: `${profile.mmr} MMR` }));

        screen.appendChild(el("div", { class: "ui-section-title", text: "Placements" }));
        screen.appendChild(this.placementDistribution(history));

        screen.appendChild(el("div", { class: "ui-section-title", text: "Recent matches" }));
        screen.appendChild(this.historyList(history));
      })
      .catch(() => {
        clear(body);
        body.appendChild(el("div", { class: "ui-muted", text: "Failed to load profile (server offline?)" }));
      });
    return screen;
  }

  private placementDistribution(history: MatchHistoryEntry[]): HTMLElement {
    const counts = new Array(8).fill(0) as number[];
    for (const h of history) if (h.placement >= 1 && h.placement <= 8) counts[h.placement - 1]!++;
    const max = Math.max(1, ...counts);
    return el("div", { class: "ui-dist" }, counts.map((c, i) =>
      el("div", { class: `ui-dist-col${i < 4 ? " top" : ""}` }, [
        el("div", { class: "ui-val", text: c > 0 ? String(c) : "" }),
        (() => { const bar = el("div", { class: "ui-dist-bar" }); bar.style.height = `${Math.round((c / max) * 100)}%`; return bar; })(),
        el("div", { class: "ui-dist-label", text: `${i + 1}` }),
      ])
    ));
  }

  private historyList(history: MatchHistoryEntry[]): HTMLElement {
    if (history.length === 0) return el("div", { class: "ui-muted", text: "No matches yet." });
    return el("div", { class: "ui-list" }, history.map((h) => {
      const delta = h.mmrAfter !== null && h.mmrBefore !== null ? h.mmrAfter - h.mmrBefore : null;
      const date = new Date(h.endedAt).toLocaleDateString();
      const deltaStr = delta === null ? "" : `${delta >= 0 ? "+" : ""}${delta}`;
      return el("div", { class: "ui-list-row" }, [
        el("div", { class: `pos ${h.placement <= 4 ? "ui-pos-good" : "ui-pos-bad"}`, text: `#${h.placement}` }),
        el("div", { class: "name", text: date }),
        el("div", { class: delta !== null && delta >= 0 ? "ui-pos-good" : "ui-pos-bad", text: deltaStr }),
      ]);
    }));
  }

  private leaderboardScreen(): HTMLElement {
    const screen = this.wrap([el("div", { class: "ui-title", text: "Leaderboard" })]);
    const list = el("div", { class: "ui-card", text: "Loading…" });
    screen.appendChild(list);
    fetchLeaderboard(this.opts.httpBase, 50)
      .then((rows) => {
        clear(list);
        if (rows.length === 0) { list.appendChild(el("div", { class: "ui-muted", text: "No players yet." })); return; }
        rows.forEach((p, i) => {
          const me = this.auth?.accountId === p.accountId;
          list.appendChild(el("div", { class: `ui-list-row${me ? " me" : ""}` }, [
            el("div", { class: "pos", text: `${i + 1}` }),
            el("div", { class: "name", text: p.name }),
            this.rankBadge(mmrToRank(p.mmr)),
            el("div", { class: "ui-mmr-col", text: `${p.mmr}` }),
          ]));
        });
      })
      .catch(() => { clear(list); list.appendChild(el("div", { class: "ui-muted", text: "Failed to load (server offline?)" })); });
    return screen;
  }

  private howToScreen(): HTMLElement {
    let page = 0;
    const screen = this.wrap([el("div", { class: "ui-title", text: "How to Play" })]);
    const body = el("div", { class: "ui-howto-body" });
    const nav = el("div", { class: "ui-howto-nav" });
    screen.appendChild(body);
    screen.appendChild(nav);
    const renderPage = (): void => {
      const p = HELP_PAGES[page]!;
      clear(body);
      body.appendChild(el("h3", { text: p.title }));
      for (const para of p.paragraphs) body.appendChild(el("p", { text: para }));
      const motif = this.howToMotif(p.title);
      if (motif) body.appendChild(motif);
      clear(nav);
      const prev = button("‹ Prev", () => { if (page > 0) { page--; renderPage(); } }, "ui-btn-nav");
      const next = button("Next ›", () => { if (page < HELP_PAGES.length - 1) { page++; renderPage(); } }, "ui-btn-nav");
      prev.disabled = page === 0;
      next.disabled = page === HELP_PAGES.length - 1;
      nav.appendChild(prev);
      nav.appendChild(el("div", { class: "ui-muted", text: `${page + 1} / ${HELP_PAGES.length}` }));
      nav.appendChild(next);
    };
    renderPage();
    return screen;
  }

  private settingsScreen(): HTMLElement {
    const s = this.opts.settings;
    return this.wrap([
      el("div", { class: "ui-title", text: "Settings" }),
      this.volumeCard(s),
      this.prefsCard(s),
      this.nameCard(),
    ]);
  }

  private volumeCard(s: SettingsStore): HTMLElement {
    const slider = (label: string, key: "masterVolume" | "sfxVolume" | "musicVolume"): HTMLElement => {
      const val = el("div", { class: "ui-val", text: `${Math.round(s.get()[key] * 100)}` });
      const input = el("input", { attrs: { type: "range", min: "0", max: "100", value: `${Math.round(s.get()[key] * 100)}` } }) as HTMLInputElement;
      input.addEventListener("input", () => {
        const v = Number(input.value) / 100;
        s.update({ [key]: v } as Partial<Settings>);
        val.textContent = `${input.value}`;
      });
      return el("div", { class: "ui-row" }, [el("label", { text: label }), input, val]);
    };
    return el("div", { class: "ui-card" }, [
      el("div", { class: "ui-section-title", text: "Audio" }),
      slider("Master", "masterVolume"),
      slider("SFX", "sfxVolume"),
      slider("Music", "musicVolume"),
      this.toggleRow("Music", () => s.get().musicEnabled, (on) => s.update({ musicEnabled: on }), this.opts.audio),
      this.toggleRow("Mute", () => s.get().muted, (on) => s.update({ muted: on }), this.opts.audio),
    ]);
  }

  private prefsCard(s: SettingsStore): HTMLElement {
    const speedBtn = button(`${s.get().defaultSpeed}x`, () => {
      const next = s.get().defaultSpeed === 1 ? 2 : 1;
      s.update({ defaultSpeed: next });
      speedBtn.textContent = `${next}x`;
    }, "ui-btn-back");
    return el("div", { class: "ui-card" }, [
      el("div", { class: "ui-section-title", text: "Gameplay" }),
      el("div", { class: "ui-row" }, [el("label", { text: "Default combat speed" }), speedBtn]),
      this.toggleRow("Reduced motion", () => s.get().reducedMotion, (on) => s.update({ reducedMotion: on })),
    ]);
  }

  private toggleRow(label: string, get: () => boolean, set: (on: boolean) => void, audio?: AudioManager): HTMLElement {
    const t = el("span", { class: "ui-toggle", text: get() ? "On" : "Off", attrs: { "data-on": String(get()) } });
    t.addEventListener("click", () => {
      const on = !(t.getAttribute("data-on") === "true");
      set(on);
      t.setAttribute("data-on", String(on));
      t.textContent = on ? "On" : "Off";
      audio?.resume();
    });
    return el("div", { class: "ui-row" }, [el("label", { text: label }), t]);
  }

  private nameCard(): HTMLElement {
    const card = el("div", { class: "ui-card" }, [el("div", { class: "ui-section-title", text: "Player name" })]);
    if (!this.auth) {
      card.appendChild(el("div", { class: "ui-muted", text: "Sign in (online) to change your name." }));
      return card;
    }
    const input = el("input", { attrs: { type: "text", maxlength: "16", value: this.auth.profile.name } }) as HTMLInputElement;
    const toast = el("div", { class: "ui-toast" });
    const save = button("Save", () => {
      save.disabled = true;
      patchName(this.opts.httpBase, this.auth!.token, input.value.trim())
        .then((profile) => {
          this.auth = { ...this.auth!, profile };
          toast.textContent = "Saved";
          toast.className = "ui-toast ui-pos-good";
        })
        .catch((err: Error) => {
          toast.textContent = err.message === "INVALID_NAME" ? "Name must be 2–16 letters, digits, space, _ or -" : "Failed to save";
          toast.className = "ui-toast ui-pos-bad";
        })
        .finally(() => { save.disabled = false; });
    }, "ui-btn-back");
    card.appendChild(el("div", { class: "ui-row" }, [input, save]));
    card.appendChild(toast);
    return card;
  }

  // ─── In-match shell ─────────────────────────────────────────────────────────

  /** Switch to the match view: hide menus. The ☰ pause button lives in the Pixi
   * HUD layer (so it scales with the viewport); the shell only owns the modal. */
  enterMatch(onLeave: () => void): void {
    this.leaveHandler = onLeave;
    this.menuRoot.classList.add("hidden");
    this.matchOverlay.classList.remove("hidden");
    clear(this.matchOverlay);
    void this.opts.audio.setMusicState("planning");
  }

  /** Return from a match to the main menu. */
  showMenu(): void {
    this.leaveHandler = null;
    this.matchOverlay.classList.add("hidden");
    clear(this.matchOverlay);
    this.menuRoot.classList.remove("hidden");
    this.stack = ["main"];
    this.render();
    void this.opts.audio.setMusicState("menu");
  }

  /** Open the in-match pause modal (triggered by the Pixi HUD ☰ button). */
  openPausePanel(): void {
    this.opts.audio.resume();
    const s = this.opts.settings;
    const close = (): void => { if (modal.parentNode) modal.parentNode.removeChild(modal); };

    const masterVal = el("div", { class: "ui-val", text: `${Math.round(s.get().masterVolume * 100)}` });
    const master = el("input", { attrs: { type: "range", min: "0", max: "100", value: `${Math.round(s.get().masterVolume * 100)}` } }) as HTMLInputElement;
    master.addEventListener("input", () => { s.update({ masterVolume: Number(master.value) / 100 }); masterVal.textContent = master.value; });

    const speedBtn = button(`${s.get().defaultSpeed}x`, () => {
      const next = s.get().defaultSpeed === 1 ? 2 : 1;
      s.update({ defaultSpeed: next });
      speedBtn.textContent = `${next}x`;
    }, "ui-btn-back");

    const card = el("div", { class: "ui-card" }, [
      el("div", { class: "ui-section-title", text: "Paused" }),
      el("div", { class: "ui-row" }, [el("label", { text: "Master volume" }), master, masterVal]),
      el("div", { class: "ui-row" }, [el("label", { text: "Default combat speed" }), speedBtn]),
      button("Resume", () => close(), "ui-btn-wide ui-btn-primary"),
      button("Leave Match", () => { close(); this.leaveHandler?.(); }, "ui-btn-wide ui-btn-danger"),
    ]);
    const modal = el("div", { class: "match-modal" }, [card]);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    this.matchOverlay.appendChild(modal);
  }

  /**
   * First-Practice-match coachmarks (gated by the seen flag). `getDesignH`
   * supplies the LIVE portrait design height so the rings track the
   * height-driven layout (defaults to the canonical 844 when omitted).
   */
  maybeShowCoachmarks(getDesignH?: () => number): void {
    if (!shouldShowCoachmarks(localStorage)) return;
    markCoachmarksSeen(localStorage);
    new Coachmarks(this.matchOverlay, this.opts.canvas, COACHMARK_STEPS, () => {}, getDesignH).start();
  }
}
