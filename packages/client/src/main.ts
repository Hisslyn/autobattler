import * as PIXI from "pixi.js";
import { LocalDriver } from "./driver.js";
import { NetDriver } from "./netDriver.js";
import { MatchScene } from "./scenes/match.js";
import { C } from "./theme.js";

const DESIGN_W = 390;
const DESIGN_H = 844;
const SERVER_URL = "ws://localhost:3001";

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

  const mode = await showModeSelect(app);

  let driver: LocalDriver | NetDriver;
  if (mode === "online") {
    driver = new NetDriver(SERVER_URL);
  } else {
    driver = new LocalDriver();
  }

  const scene = new MatchScene(app, driver);
  app.stage.addChild(scene.container);
  app.stage.sortableChildren = true;
}

function showModeSelect(app: PIXI.Application): Promise<"local" | "online"> {
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
  });
}

main().catch(console.error);
