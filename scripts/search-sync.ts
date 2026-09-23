import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Article } from "../src/lib/article-types";
import { validateContent } from "./content";
import { publicationDay } from "../src/lib/publication-date";

const base = "blog_articles";

export interface SearchPreparation {
  temporary: string;
}

function configuration(): { host: string; key: string } {
  const host = process.env.MEILI_HOST;
  const key = process.env.MEILI_MASTER_KEY;
  if (!host || !key) throw new Error("Search configuration is missing");
  return { host, key };
}

async function request(
  route: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const { host, key } = configuration();
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
      throw Object.assign(
        new Error(
          `Search task ${result.status}: ${result.error?.code ?? "unknown"}`,
        ),
        { code: result.error?.code },
      );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Search indexing timed out");
}

// Building the temporary index is the slow part. Deploy scripts run it before
// switching the live release so an import failure leaves the site untouched.
export async function prepareSearch(
  articles: Article[],
): Promise<SearchPreparation> {
  const temporary = `${base}_build_${randomBytes(8).toString("hex")}`;
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
        filterableAttributes: ["topic", "publishedDay"],
        pagination: { maxTotalHits: Math.max(1000, articles.length) },
      }),
    );
    if (articles.length)
      await wait(
        await request(
          `/indexes/${temporary}/documents`,
          "POST",
          articles.map((article) => ({
            ...article,
            publishedDay: publicationDay(article.publishedAt),
          })),
        ),
      );
    // Crashes between prepare and swap can orphan build indexes.
    await cleanupOrphans(temporary);
    return { temporary };
  } catch (error) {
    if (created)
      await wait(await request(`/indexes/${temporary}`, "DELETE")).catch(
        () => {},
      );
    throw error;
  }
}

async function cleanupOrphans(keep: string) {
  const { host, key } = configuration();
  const response = await fetch(new URL("/indexes?limit=1000", host), {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Search index listing failed: HTTP ${response.status}`);
  const { results } = (await response.json()) as {
    results: { uid: string; createdAt: string }[];
  };
  const stale = Date.now() - 60 * 60 * 1000;
  for (const index of results) {
    if (
      index.uid !== keep &&
      index.uid.startsWith(`${base}_build_`) &&
      Date.parse(index.createdAt) < stale
    )
      await wait(await request(`/indexes/${index.uid}`, "DELETE"));
  }
}

// The swap itself is a single atomic task, so the visible index always points
// at exactly one release of the content. On failure the temporary index is
// retained until verification. After an ambiguous failure, recovery rebuilds
// from a known release rather than repeating a potentially completed swap.
export async function swapSearch(
  preparation: SearchPreparation,
): Promise<void> {
  const { host, key } = configuration();
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
    await request("/swap-indexes", "POST", [
      { indexes: [base, preparation.temporary] },
    ]),
  );
  console.log(`Swapped search index to release: ${preparation.temporary}`);
}

export async function syncSearch(articles: Article[]): Promise<void> {
  const preparation = await prepareSearch(articles);
  await swapSearch(preparation);
  await discardSearch(preparation);
}

export async function discardSearch({
  temporary,
}: SearchPreparation): Promise<void> {
  if (!/^blog_articles_build_[a-f0-9]{16}$/.test(temporary))
    throw new Error("Invalid temporary search index");
  const { host, key } = configuration();
  const response = await fetch(new URL(`/indexes/${temporary}`, host), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  // Recovery may repeat cleanup after the index has already been removed.
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Search cleanup HTTP ${response.status}`);
  await wait(await response.json()).catch((error: unknown) => {
    // Meilisearch also reports missing indexes through an accepted async
    // deletion task, not only through an immediate HTTP 404.
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "index_not_found"
    )
      throw error;
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (mode === "prepare") {
    validateContent({ includeFuture: true })
      .then((articles) =>
        prepareSearch(
          articles.map(({ filename, draft, ...article }) => article),
        ),
      )
      .then((preparation) => console.log(`PREPARED ${preparation.temporary}`))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  } else if (mode === "swap" || mode === "discard") {
    const temporary = process.argv[3];
    if (!temporary || !/^blog_articles_build_[a-f0-9]{16}$/.test(temporary)) {
      console.error("Usage: search-sync.ts swap|discard <temporary index>");
      process.exitCode = 1;
    } else {
      (mode === "swap" ? swapSearch : discardSearch)({ temporary }).catch(
        (error) => {
          console.error(error.message);
          process.exitCode = 1;
        },
      );
    }
  } else if (mode === undefined) {
    validateContent({ includeFuture: true })
      .then((articles) =>
        syncSearch(articles.map(({ filename, draft, ...article }) => article)),
      )
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  } else {
    console.error(
      "Usage: search-sync.ts [prepare|swap <index>|discard <index>]",
    );
    process.exitCode = 1;
  }
}
