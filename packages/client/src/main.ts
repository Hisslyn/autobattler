import * as PIXI from "pixi.js";
import { LocalDriver } from "./driver.js";
import { NetDriver } from "./netDriver.js";
import { MatchScene } from "./scenes/match.js";
import { ensureAuth, fetchLeaderboard } from "./auth.js";
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

  const wrapper = document.getElementById("app")!;
  wrapper.appendChild(app.canvas);

  function resize(): void {
    const scaleX = window.innerWidth / DESIGN_W;
    const scaleY = window.innerHeight / DESIGN_H;
    const scale = Math.min(scaleX, scaleY);
    const scaledW = Math.round(DESIGN_W * scale);
    const scaledH = Math.round(DESIGN_H * scale);
    app.canvas.style.width = `${scaledW}px`;
    app.canvas.style.height = `${scaledH}px`;
    app.canvas.style.position = "absolute";
    app.canvas.style.left = `${Math.round((window.innerWidth - scaledW) / 2)}px`;
    app.canvas.style.top = `${Math.round((window.innerHeight - scaledH) / 2)}px`;
    wrapper.style.background = `#${C.bgPage.toString(16).padStart(6, "0")}`;
  }
  window.addEventListener("resize", resize);
  resize();

  let mode: "local" | "online" | "leaderboard";
  do {
    mode = await showModeSelect(app);
    if (mode === "leaderboard") await showLeaderboard(app);
  } while (mode === "leaderboard");

  let driver: LocalDriver | NetDriver;
  if (mode === "online") {
    // Auth before queueing; first launch prompts for a name
    const auth = await ensureAuth(HTTP_BASE);
    driver = new NetDriver(SERVER_URL, auth.token);
  } else {
    driver = new LocalDriver();
  }

  const scene = new MatchScene(app, driver);
  app.stage.addChild(scene.container);
  app.stage.sortableChildren = true;
}

function showModeSelect(app: PIXI.Application): Promise<"local" | "online" | "leaderboard"> {
  return new Promise((resolve) => {
    const container = new PIXI.Container();
    app.stage.addChild(container);

    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgPage);
    bg.drawRect(0, 0, DESIGN_W, DESIGN_H);
    bg.endFill();
    container.addChild(bg);

    const title = new PIXI.Text("AUTOBATTLER", {
      fontSize: 28,
      fill: C.textLabel,
      fontFamily: "monospace",
      fontWeight: "bold",
    });
    title.anchor.set(0.5);
    title.x = DESIGN_W / 2;
    title.y = DESIGN_H / 2 - 100;
    container.addChild(title);

    function makeButton(label: string, y: number, onClick: () => void): void {
      const btn = new PIXI.Graphics();
      btn.beginFill(C.bgMenuBtn);
      btn.drawRoundedRect(-120, -22, 240, 44, 8);
      btn.endFill();
      btn.x = DESIGN_W / 2;
      btn.y = y;
      btn.eventMode = "static";
      btn.cursor = "pointer";

      const txt = new PIXI.Text(label, {
        fontSize: 16,
        fill: C.textLabel,
        fontFamily: "monospace",
      });
      txt.anchor.set(0.5);
      btn.addChild(txt);
      container.addChild(btn);

      btn.on("pointerdown", () => {
        app.stage.removeChild(container);
        onClick();
      });
    }

    makeButton("Practice (local AI)", DESIGN_H / 2, () => resolve("local"));
    makeButton("Online (localhost)", DESIGN_H / 2 + 60, () => resolve("online"));
    makeButton("Leaderboard", DESIGN_H / 2 + 120, () => resolve("leaderboard"));
  });
}

function showLeaderboard(app: PIXI.Application): Promise<void> {
  return new Promise((resolve) => {
    const container = new PIXI.Container();
    app.stage.addChild(container);

    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgPage);
    bg.drawRect(0, 0, DESIGN_W, DESIGN_H);
    bg.endFill();
    container.addChild(bg);

    const title = new PIXI.Text("LEADERBOARD", {
      fontSize: 22,
      fill: C.textLabel,
      fontFamily: "monospace",
      fontWeight: "bold",
    });
    title.anchor.set(0.5, 0);
    title.x = DESIGN_W / 2;
    title.y = 40;
    container.addChild(title);

    const status = new PIXI.Text("Loading...", {
      fontSize: 12,
      fill: C.textMuted,
      fontFamily: "monospace",
    });
    status.anchor.set(0.5, 0);
    status.x = DESIGN_W / 2;
    status.y = 90;
    container.addChild(status);

    fetchLeaderboard(HTTP_BASE)
      .then((rows) => {
        status.text = rows.length === 0 ? "No players yet" : "";
        rows.slice(0, 20).forEach((p, i) => {
          const line = new PIXI.Text(
            `${String(i + 1).padStart(2)}  ${p.name.slice(0, 16).padEnd(16)} ${p.mmr}`,
            { fontSize: 12, fill: C.textPrimary, fontFamily: "monospace" }
          );
          line.x = 40;
          line.y = 100 + i * 22;
          container.addChild(line);
        });
      })
      .catch(() => {
        status.text = "Failed to load (server offline?)";
      });

    const back = new PIXI.Graphics();
    back.beginFill(C.bgMenuBtn);
    back.drawRoundedRect(-120, -22, 240, 44, 8);
    back.endFill();
    back.x = DESIGN_W / 2;
    back.y = DESIGN_H - 80;
    back.eventMode = "static";
    back.cursor = "pointer";
    const backTxt = new PIXI.Text("Back", {
      fontSize: 16,
      fill: C.textLabel,
      fontFamily: "monospace",
    });
    backTxt.anchor.set(0.5);
    back.addChild(backTxt);
    container.addChild(back);
    back.on("pointerdown", () => {
      app.stage.removeChild(container);
      resolve();
    });
  });
}

main().catch(console.error);
