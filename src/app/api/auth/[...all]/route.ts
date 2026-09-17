import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { githubConfigured } from "@/lib/auth-config";
import { readSession } from "@/lib/session";
import { privateHeaders } from "@/lib/account-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = toNextJsHandler(auth);
const allowed = new Set([
  "GET /get-session",
  "POST /get-session",
  "POST /sign-in/social",
  "GET /callback/github",
  "POST /callback/github",
  "POST /sign-out",
]);

async function handle(request: Request) {
  const path = new URL(request.url).pathname.slice("/api/auth".length);
  if (!allowed.has(`${request.method} ${path}`))
    return Response.json(
      { message: "此操作不可用。" },
      { status: 404, headers: privateHeaders },
    );
  if (path === "/sign-in/social" && !githubConfigured)
    return Response.json(
      { message: "登录暂时不可用，请稍后再试。" },
      { status: 503, headers: privateHeaders },
    );
  if (path === "/get-session") await readSession(request.headers);
  const response = await (request.method === "GET"
    ? handler.GET(request)
    : handler.POST(request));
  for (const [key, value] of Object.entries(privateHeaders))
    response.headers.set(key, value);
  return response;
}
export const GET = handle;
export const POST = handle;
