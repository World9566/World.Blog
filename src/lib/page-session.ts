import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "./session";

export async function requireSession() {
  const session = await readSession(await headers());
  if (!session) redirect("/login?next=%2Faccount");
  return session;
}

export async function requireAdmin() {
  const session = await readSession(await headers());
  if (!session) redirect("/login?next=%2Fadmin");
  if (session.user.role !== "admin") redirect("/account");
  return session;
}
