import "server-only";
import { open } from "node:fs/promises";
import path from "node:path";
import type { OperationsReport } from "./operations-types";

const checkIds = [
  "containers",
  "origin",
  "public",
  "disk",
  "backup_age",
  "backup_job",
] as const;
const statuses = ["ok", "pending", "firing", "disabled"] as const;
type CheckId = (typeof checkIds)[number];
type Status = (typeof statuses)[number];
type Check = { id: CheckId; status: Status; failures: number; since: number };
type Event = { check: CheckId; status: Status; at: string };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

export function parseOperations(
  value: unknown,
  now = Date.now(),
): OperationsReport {
  if (
    !record(value) ||
    value.version !== 1 ||
    !isoDate(value.checkedAt) ||
    !Array.isArray(value.checks) ||
    value.checks.length !== checkIds.length ||
    !Array.isArray(value.events) ||
    value.events.length > 200
  )
    throw new Error("Invalid operations report");
  const checks: Check[] = value.checks.map((check) => {
    if (
      !record(check) ||
      !checkIds.includes(check.id as CheckId) ||
      !statuses.includes(check.status as Status) ||
      !Number.isSafeInteger(check.failures) ||
      Number(check.failures) < 0 ||
      Number(check.failures) > 999999 ||
      !Number.isSafeInteger(check.since) ||
      Number(check.since) < 0
    )
      throw new Error("Invalid operations check");
    return {
      id: check.id as CheckId,
      status: check.status as Status,
      failures: Number(check.failures),
      since: Number(check.since),
    };
  });
  if (new Set(checks.map((check) => check.id)).size !== checkIds.length)
    throw new Error("Duplicate operations check");
  const events: Event[] = value.events.map((event) => {
    if (
      !record(event) ||
      !checkIds.includes(event.check as CheckId) ||
      !statuses.includes(event.status as Status) ||
      !isoDate(event.at)
    )
      throw new Error("Invalid operations event");
    return {
      check: event.check as CheckId,
      status: event.status as Status,
      at: event.at,
    };
  });
  const age = now - Date.parse(value.checkedAt);
  return {
    status:
      age < -60000 || age > 5 * 60000
        ? "stale"
        : checks.some(
              (check) =>
                check.status === "firing" || check.status === "pending",
            )
          ? "degraded"
          : "ok",
    checkedAt: value.checkedAt,
    checks,
    events,
  };
}

export async function readOperations(): Promise<OperationsReport> {
  const directory =
    process.env.OPERATIONS_STATUS_DIR ||
    path.join(process.cwd(), ".deploy", "blog-dev", "operations");
  try {
    const file = await open(path.join(directory, "status.json"), "r");
    try {
      if ((await file.stat()).size > 128 * 1024)
        throw new Error("Report too large");
      return parseOperations(JSON.parse(await file.readFile("utf8")));
    } finally {
      await file.close();
    }
  } catch {
    // Never serialize filesystem paths, configuration or parser errors.
    return { status: "unavailable", checkedAt: null, checks: [], events: [] };
  }
}
