import { defineConfig } from "vite";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// Map bare specifiers to absolute .ts file paths.
// Uses a plugin so longer matches take precedence over shorter ones.
const workspaceMap: Record<string, string> = {
  "@autobattler/data": `${ROOT}/data/src/loader.ts`,
  "@autobattler/data/asset-manifest": `${ROOT}/data/src/assetManifest.ts`,
  "@autobattler/sim": `${ROOT}/sim/src/engine.ts`,
  "@autobattler/sim/src/prng.js": `${ROOT}/sim/src/prng.ts`,
  "@autobattler/sim/src/types.js": `${ROOT}/sim/src/types.ts`,
  "@autobattler/sim/src/hex.js": `${ROOT}/sim/src/hex.ts`,
  "@autobattler/sim/src/fixed.js": `${ROOT}/sim/src/fixed.ts`,
  "@autobattler/rules": `${ROOT}/rules/src/match.ts`,
  "@autobattler/rules/src/match.js": `${ROOT}/rules/src/match.ts`,
  "@autobattler/rules/src/commands.js": `${ROOT}/rules/src/commands.ts`,
  "@autobattler/rules/src/state.js": `${ROOT}/rules/src/state.ts`,
  "@autobattler/rules/src/economy.js": `${ROOT}/rules/src/economy.ts`,
  "@autobattler/rules/src/rounds.js": `${ROOT}/rules/src/rounds.ts`,
  "@autobattler/rules/src/pool.js": `${ROOT}/rules/src/pool.ts`,
  "@autobattler/rules/src/shop.js": `${ROOT}/rules/src/shop.ts`,
  "@autobattler/rules/src/ai.js": `${ROOT}/rules/src/ai.ts`,
};

export default defineConfig({
  plugins: [
    {
      name: "workspace-resolver",
      resolveId(id) {
        if (id in workspaceMap) return workspaceMap[id];
        return null;
      },
    },
  ],
});
