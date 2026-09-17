import { articles } from "@/lib/content";
import { site, getSiteUrl } from "@/lib/site";
export const dynamic = "force-static";
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
export function GET() {
  const base = getSiteUrl();
  const items = articles
    .map(
      (article) =>
        `<item><title>${xml(article.title)}</title><link>${xml(new URL(`/articles/${article.slug}`, base).href)}</link><guid isPermaLink="false">${xml(article.id)}</guid><description>${xml(article.description)}</description><pubDate>${new Date(`${article.publishedAt}T00:00:00+08:00`).toUTCString()}</pubDate></item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.title)}</title><link>${xml(base.href)}</link><description>${xml(site.description)}</description><language>zh-CN</language>${items}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
}
