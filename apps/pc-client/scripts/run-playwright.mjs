import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const playwrightBrowsersPath = resolve(scriptDir, "../../../common/temp/playwright-browsers");

const child = spawn(process.execPath, [playwrightCli, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
