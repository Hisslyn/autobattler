// DOM/CSS meta-shell over the Pixi canvas: screen manager + screens (Main Menu,
// Play, Profile, Leaderboard, How to Play, Settings) plus the in-match pause
// panel and coachmark trigger. Holds no authoritative game state; gameplay runs
// in the Pixi match scene driven by IDriver.
import { mmrToRank } from "@autobattler/data";
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

export class UiApp {
  private menuRoot: HTMLElement;
  private content: HTMLElement;
  private matchOverlay: HTMLElement;
  private stack: ScreenId[] = ["main"];
  private leaveHandler: (() => void) | null = null;

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

  private mainMenu(): HTMLElement {
    return el("div", { class: "ui-screen" }, [
      el("div", { class: "ui-title ui-wordmark", text: "AUTOBATTLER" }),
      el("div", { class: "ui-subtitle", text: this.auth ? `Signed in as ${this.auth.profile.name}` : "Offline — Practice only" }),
      button("Play", () => this.navigate("play"), "ui-btn ui-btn-primary"),
      button("Profile", () => this.navigate("profile"), "ui-btn"),
      button("Leaderboard", () => this.navigate("leaderboard"), "ui-btn"),
      button("How to Play", () => this.navigate("howto"), "ui-btn"),
      button("Settings", () => this.navigate("settings"), "ui-btn"),
    ]);
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
    const practice = this.playCard("Practice", "Play offline against AI bots.", () => this.opts.onStartMatch("local"));
    const online = this.playCard("Online", "Ranked lobby on the server.", () => this.opts.onStartMatch("online"), !this.auth);
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
      const prev = button("‹ Prev", () => { if (page > 0) { page--; renderPage(); } }, "ui-btn-back");
      const next = button("Next ›", () => { if (page < HELP_PAGES.length - 1) { page++; renderPage(); } }, "ui-btn-back");
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

  /** Switch to the match view: hide menus, show the pause button. */
  enterMatch(onLeave: () => void): void {
    this.leaveHandler = onLeave;
    this.menuRoot.classList.add("hidden");
    this.matchOverlay.classList.remove("hidden");
    clear(this.matchOverlay);
    this.matchOverlay.appendChild(button("☰", () => this.openPausePanel(), "match-pause-btn"));
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

  private openPausePanel(): void {
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

  /** First-Practice-match coachmarks (gated by the seen flag). */
  maybeShowCoachmarks(): void {
    if (!shouldShowCoachmarks(localStorage)) return;
    markCoachmarksSeen(localStorage);
    new Coachmarks(this.matchOverlay, this.opts.canvas, COACHMARK_STEPS, () => {}).start();
  }
}
