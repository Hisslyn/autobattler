import * as PIXI from "pixi.js";
import { LocalDriver } from "./driver.js";
import type { IDriver } from "./driver.js";
import { NetDriver } from "./netDriver.js";
import { MatchScene } from "./scenes/match.js";
import { bootAuth } from "./auth.js";
import { SettingsStore } from "./settings.js";
import { AudioManager } from "./audio/manager.js";
import { UiApp } from "./ui/app.js";
import type { PlayMode } from "./ui/app.js";
import { C } from "./theme.js";
import { resolveLayout } from "./layout.js";
import type { MatchLayout, SafeInsets } from "./layout.js";

const SERVER_URL = "ws://localhost:3001";
const HTTP_BASE = "http://localhost:3001";

/** Read env(safe-area-inset-*) via the hidden probe element's computed padding. */
function readSafeInsets(): SafeInsets {
  const probe = document.getElementById("safe-probe");
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(probe);
  const px = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}

async function main(): Promise<void> {
  // The orientation/scale-aware layout is the single source for design dims.
  let activeLayout: MatchLayout = resolveLayout({
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    safe: readSafeInsets(),
  });

  const app = new PIXI.Application();
  await app.init({
    width: activeLayout.designW,
    height: activeLayout.designH,
    backgroundColor: C.bgPage,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  app.stage.sortableChildren = true;

  const wrapper = document.getElementById("app")!;
  wrapper.appendChild(app.canvas);

  // FUTURE (Capacitor native shell): lock the device to landscape-primary here,
  // gated on Capacitor.isNativePlatform():
  //   if (Capacitor.isNativePlatform()) {
  //     await ScreenOrientation.lock({ type: "landscape-primary" });
  //   }
  // Web stays orientation-responsive (resolveLayout flips on aspect), so this is
  // intentionally NOT implemented here — it belongs in the native wrapper only.

  function resize(): void {
    activeLayout = resolveLayout({
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      safe: readSafeInsets(),
    });
    // Pixi v8 dynamic resize to the (possibly flipped) design dimensions.
    app.renderer.resize(activeLayout.designW, activeLayout.designH);
    const scaledW = Math.round(activeLayout.designW * activeLayout.scale);
    const scaledH = Math.round(activeLayout.designH * activeLayout.scale);
    app.canvas.style.position = "absolute";
    app.canvas.style.width = `${scaledW}px`;
    app.canvas.style.height = `${scaledH}px`;
    app.canvas.style.left = `${Math.round(activeLayout.canvasOffsetX)}px`;
    app.canvas.style.top = `${Math.round(activeLayout.canvasOffsetY)}px`;
    if (scene) scene.onLayoutChange(activeLayout);
  }
  window.addEventListener("resize", resize);
  // iOS reports stale viewport dims at the orientationchange moment — re-resolve
  // a tick later once the rotation has settled.
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));

  // Client preferences + audio (procedural SFX; music drop-in slot).
  const settings = new SettingsStore();
  const audio = new AudioManager(settings);
  const applyReducedMotion = (on: boolean): void => {
    document.documentElement.classList.toggle("reduced-motion", on);
  };
  applyReducedMotion(settings.get().reducedMotion);
  settings.subscribe((s) => applyReducedMotion(s.reducedMotion));

  // Boot flow: auth (tolerant of an offline server) → Main Menu.
  const auth = await bootAuth(HTTP_BASE);

  let scene: MatchScene | null = null;
  let driver: IDriver | null = null;

  // Initial sizing now that `scene` is in scope for resize()'s onLayoutChange.
  resize();

  const ui = new UiApp({
    httpBase: HTTP_BASE,
    settings,
    audio,
    auth,
    canvas: app.canvas,
    onStartMatch: (mode: PlayMode) => startMatch(mode),
  });

  function leaveMatch(): void {
    if (scene) scene.destroy();
    if (driver) driver.dispose();
    scene = null;
    driver = null;
    ui.showMenu();
  }

  function startMatch(mode: PlayMode): void {
    audio.resume();
    driver = mode === "online"
      ? new NetDriver(SERVER_URL, ui.auth?.token)
      : new LocalDriver(undefined, ui.auth?.profile.name);
    scene = new MatchScene(app, driver, {
      settings, audio, onLeave: leaveMatch, layout: activeLayout,
      onShopPanelToggle: (open) => ui.setMenuButtonHidden(open),
    });
    app.stage.addChild(scene.container);
    ui.enterMatch(leaveMatch);
    if (mode === "local") {
      // Supply the LIVE portrait design height so coachmark rings track the
      // height-driven layout (portraitDesignH), not a hardcoded 844.
      ui.maybeShowCoachmarks(() => activeLayout.portraitDesignH ?? activeLayout.designH);
    }
  }

  ui.mount(wrapper);
}

main().catch(console.error);
