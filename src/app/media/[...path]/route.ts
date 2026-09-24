import { readPublishedCover } from "@/lib/content";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const cover = await readPublishedCover(`/media/${path.join("/")}`).catch(
    () => null,
  );
  if (!cover)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(new Uint8Array(cover.bytes), {
    headers: {
      "Content-Type": cover.contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // A content release can replace or unpublish this URL without an image rebuild.
      "Cache-Control": "no-store",
    },
  });
}
