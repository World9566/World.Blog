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
// Warm the article cache in the background so the first reader after a boot
// does not pay the compile cost; requests that arrive earlier load on demand.
const warm = async (attempt) => {
  const port = process.env.PORT || "3000";
  const response = await fetch(`http://127.0.0.1:${port}/api/content/refresh`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CONTENT_REFRESH_TOKEN}` },
    signal: AbortSignal.timeout(120000),
  }).catch(() => null);
  if (response && response.ok) {
    const result = await response.json().catch(() => ({}));
    console.log(`Content warmed: ${result.articles ?? "?"} articles.`);
    return;
  }
  // The listener may not be up yet on the first attempt.
  if (attempt < 5) {
    setTimeout(() => warm(attempt + 1), 2000);
    return;
  }
  if (response)
    console.error(
      `Content warm-up failed: HTTP ${response.status} ${await response.text().catch(() => "")}`,
    );
};
warm(1);
