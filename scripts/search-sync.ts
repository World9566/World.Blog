import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Article } from "../src/lib/article-types";
import { generateContent } from "./content";

export async function syncSearch(articles: Article[]) {
  const host = process.env.MEILI_HOST;
  const key = process.env.MEILI_MASTER_KEY;
  if (!host || !key) throw new Error("Search configuration is missing");
  const base = "blog_articles";
  const temporary = `${base}_build_${randomBytes(8).toString("hex")}`;
  async function request(route: string, method = "GET", body?: unknown) {
    const response = await fetch(new URL(route, host), {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`Search HTTP ${response.status} on ${route}`);
    return response.json();
  }
  async function wait(task: { taskUid: number }) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const result = await request(`/tasks/${task.taskUid}`);
      if (result.status === "succeeded") return;
      if (result.status === "failed" || result.status === "canceled")
        throw new Error(
          `Search task ${result.status}: ${result.error?.code ?? "unknown"}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Search indexing timed out");
  }
  let created = false;
  try {
    await wait(
      await request("/indexes", "POST", { uid: temporary, primaryKey: "id" }),
    );
    created = true;
    await wait(
      await request(`/indexes/${temporary}/settings`, "PATCH", {
        searchableAttributes: ["title", "description", "tags", "text"],
        displayedAttributes: ["id"],
        filterableAttributes: ["topic"],
        pagination: { maxTotalHits: Math.max(1000, articles.length) },
      }),
    );
    if (articles.length)
      await wait(
        await request(`/indexes/${temporary}/documents`, "POST", articles),
      );
    const existing = await fetch(new URL(`/indexes/${base}`, host), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (existing.status === 404)
      await wait(
        await request("/indexes", "POST", { uid: base, primaryKey: "id" }),
      );
    else if (!existing.ok)
      throw new Error(`Search index check failed: HTTP ${existing.status}`);
    await wait(
      await request("/swap-indexes", "POST", [{ indexes: [base, temporary] }]),
    );
    console.log(`Indexed ${articles.length} published articles.`);
  } finally {
    if (created) await wait(await request(`/indexes/${temporary}`, "DELETE"));
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  generateContent()
    .then(syncSearch)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
