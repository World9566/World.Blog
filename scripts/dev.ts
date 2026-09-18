import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { validateContent } from "./content";
import { syncSearch } from "./search-sync";

async function fingerprint() {
  const hash = createHash("sha256");
  for (const name of (await readdir("content/posts"))
    .filter((name) => name.endsWith(".mdx"))
    .sort()) {
    hash.update(name).update(await readFile(`content/posts/${name}`));
  }
  return hash.digest("hex");
}

async function main() {
  let last = await fingerprint();
  let retrySearch = false;
  let busy = false;
  async function rebuild() {
    const articles = await validateContent();
    try {
      await syncSearch(articles);
      retrySearch = false;
    } catch (error) {
      retrySearch = true;
      console.warn(
        "Search sync failed; local search remains available.",
        error instanceof Error ? error.message : "",
      );
    }
  }
  await rebuild();
  const server = spawn(
    "pnpm",
    ["exec", "next", "dev", "--webpack", "--hostname", "0.0.0.0"],
    { stdio: "inherit" },
  );
  let ticks = 0;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const current = await fingerprint();
      if (current !== last || (retrySearch && ++ticks % 30 === 0)) {
        last = current;
        await rebuild();
      }
    } catch (error) {
      console.error(
        "Content update failed:",
        error instanceof Error ? error.message : "",
      );
    } finally {
      busy = false;
    }
  }, 1000);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      clearInterval(timer);
      server.kill(signal);
    });
  server.on("exit", (code) => {
    clearInterval(timer);
    process.exit(code ?? 0);
  });
  server.on("error", (error) => {
    clearInterval(timer);
    console.error(error.message);
    process.exit(1);
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
