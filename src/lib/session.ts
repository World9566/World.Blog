import "server-only";
import { auth } from "./auth";
import { isBanned } from "./account-policy";
import { prisma } from "./prisma";

export async function readSession(requestHeaders: Headers) {
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (session && isBanned(session.user)) {
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    return null;
  }
  if (session?.user.banned && session.user.banExpires) {
    await prisma.user.updateMany({
      where: {
        id: session.user.id,
        banned: true,
        banExpires: { lte: new Date() },
      },
      data: { banned: false, banExpires: null, banReason: null },
    });
  }
  return session;
}
