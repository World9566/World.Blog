import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
  const healthy = Object.values(services).every((status) => status === "ok");

  return Response.json(
    { status: healthy ? "ok" : "degraded", services },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
