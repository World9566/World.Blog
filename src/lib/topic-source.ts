import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Topic } from "./topics";
import { isPresetCover, parseCover } from "./article-cover";

export async function readTopics(
  directory: string,
): Promise<Map<string, Topic>> {
  const source = await readFile(
    path.join(directory, "..", "topics.json"),
    "utf8",
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "[]";
    throw error;
  });
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error("topics.json must contain valid JSON");
  }
  if (!Array.isArray(data))
    throw new Error("topics.json must contain an array of topics");
  const topics = new Map<string, Topic>();
  for (const item of data) {
    if (
      !item ||
      typeof item.slug !== "string" ||
      item.slug.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)
    )
      throw new Error("Invalid topic slug in topics.json");
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 60
    )
      throw new Error(`Invalid topic name: ${item.slug}`);
    if (
      item.description !== undefined &&
      (typeof item.description !== "string" || item.description.length > 240)
    )
      throw new Error(`Invalid topic description: ${item.slug}`);
    if (topics.has(item.slug))
      throw new Error(`Duplicate topic slug: ${item.slug}`);
    let cover: string | null;
    try {
      cover = parseCover(item.cover);
      if (cover && isPresetCover(cover)) throw new Error("Expected an image");
    } catch {
      throw new Error(
        `Invalid topic cover (${item.slug}): use /media/image.webp, an HTTPS URL, or omit cover`,
      );
    }
    topics.set(item.slug, {
      slug: item.slug,
      name: item.name.trim(),
      description: item.description?.trim() ?? "",
      cover,
    });
  }
  return topics;
}
