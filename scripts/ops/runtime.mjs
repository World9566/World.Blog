import { readFileSync } from "node:fs";
import { checkProductionEnv } from "./production-env.mjs";
try {
  checkProductionEnv(
    process.env,
    JSON.parse(
      readFileSync(new URL("../build-info.json", import.meta.url), "utf8"),
    ),
  );
} catch (error) {
  console.error(`Startup configuration error: ${error.message}`);
  process.exit(1);
}
await import("../server.js");
