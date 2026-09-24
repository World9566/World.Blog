export const presetCovers = [
  "layers",
  "branches",
  "brackets",
  "search",
] as const;
export type PresetCover = (typeof presetCovers)[number];
export const isPresetCover = (cover: string): cover is PresetCover =>
  (presetCovers as readonly string[]).includes(cover);

export function isLocalCover(cover: string): boolean {
  if (!cover.startsWith("/media/")) return false;
  return /^\/media\/(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g|webp|gif|avif)$/i.test(
    cover,
  );
}

export function parseCover(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Invalid article cover");
  if (isPresetCover(value) || isLocalCover(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
  } catch {
    /* Report the supported forms below. */
  }
  throw new Error(
    "Invalid article cover: use /media/image.webp, an HTTPS URL, a preset, or omit cover",
  );
}
