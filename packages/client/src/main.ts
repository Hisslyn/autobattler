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

const DESIGN_W = 390;
const DESIGN_H = 844;
const SERVER_URL = "ws://localhost:3001";
const HTTP_BASE = "http://localhost:3001";

async function main(): Promise<void> {
  const app = new PIXI.Application();
  await app.init({
    width: DESIGN_W,
    height: DESIGN_H,
    backgroundColor: C.bgPage,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  app.stage.sortableChildren = true;

  const wrapper = document.getElementById("app")!;
  wrapper.appendChild(app.canvas);

  function resize(): void {
    const scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    const scaledW = Math.round(DESIGN_W * scale);
    const scaledH = Math.round(DESIGN_H * scale);
    app.canvas.style.width = `${scaledW}px`;
    app.canvas.style.height = `${scaledH}px`;
    app.canvas.style.position = "absolute";
    app.canvas.style.left = `${Math.round((window.innerWidth - scaledW) / 2)}px`;
    app.canvas.style.top = `${Math.round((window.innerHeight - scaledH) / 2)}px`;
  }
  window.addEventListener("resize", resize);
  resize();

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
      : new LocalDriver();
    scene = new MatchScene(app, driver, { settings, audio, onLeave: leaveMatch });
    app.stage.addChild(scene.container);
    ui.enterMatch(leaveMatch);
    if (mode === "local") ui.maybeShowCoachmarks();
  }

  ui.mount(wrapper);
}

main().catch(console.error);
