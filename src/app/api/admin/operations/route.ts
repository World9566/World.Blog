import { requireAdminRequest } from "@/lib/admin";
import { communityJson, communityResponse } from "@/lib/community";
import { readOperations } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return communityResponse(async () => {
    await requireAdminRequest(request);
    return communityJson(await readOperations());
  });
}
