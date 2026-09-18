import { db } from "@/lib/db";
import { contentStatus, getArticles } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await getArticles();
  const content = contentStatus();
  const checks = await Promise.allSettled([
    db.query("SELECT 1"),
    (async () => {
      if (!process.env.MEILI_HOST || !process.env.MEILI_MASTER_KEY) {
        throw new Error("Search configuration is missing");
      }
      const response = await fetch(
        new URL("/version", process.env.MEILI_HOST),
        {
          headers: { Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok) throw new Error("Search health check failed");
    })(),
  ]);

  const services = {
    postgres: checks[0].status === "fulfilled" ? "ok" : "unavailable",
    meilisearch: checks[1].status === "fulfilled" ? "ok" : "unavailable",
  };
  // An article set that failed to load with no known-good snapshot to fall
  // back to means the content mount or the release itself is broken; a stale
  // snapshot after a later failure is degraded but still serving.
  const contentHealthy = !content.loadError || content.articles > 0;
  const healthy =
    Object.values(services).every((status) => status === "ok") &&
    contentHealthy;

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      services,
      content: {
        status: contentHealthy ? "ok" : "unavailable",
        articles: content.articles,
        ...(content.loadError ? { error: content.loadError } : {}),
      },
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
