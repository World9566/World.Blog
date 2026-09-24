import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { isLocalCover } from "./article-cover";

const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export async function inspectCoverFile(directory: string, cover: string) {
  if (!isLocalCover(cover)) throw new Error("Invalid local cover path");
  let filename = path.resolve(directory, "..");
  const segments = cover.slice(1).split("/");
  for (const [index, segment] of segments.entries()) {
    filename = path.join(filename, segment);
    const info = await lstat(filename);
    if (
      info.isSymbolicLink() ||
      (index < segments.length - 1 ? !info.isDirectory() : !info.isFile())
    )
      throw new Error(`Cover must be a regular file inside media/: ${cover}`);
    if (
      index === segments.length - 1 &&
      (info.size === 0 || info.size > 10 * 1024 * 1024)
    )
      throw new Error(`Cover must be between 1 byte and 10 MB: ${cover}`);
  }
  const file = await open(filename, "r");
  const header = Buffer.alloc(32);
  try {
    await file.read(header, 0, header.length, 0);
  } finally {
    await file.close();
  }
  const extension = path.extname(filename).toLowerCase();
  const valid =
    extension === ".png"
      ? header
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : [".jpg", ".jpeg"].includes(extension)
        ? header[0] === 255 && header[1] === 216 && header[2] === 255
        : extension === ".gif"
          ? /^GIF8[79]a/.test(header.toString("ascii", 0, 6))
          : extension === ".webp"
            ? header.toString("ascii", 0, 4) === "RIFF" &&
              header.toString("ascii", 8, 12) === "WEBP"
            : header.toString("ascii", 4, 8) === "ftyp" &&
              /avif|avis/.test(header.toString("ascii", 8));
  if (!valid)
    throw new Error(`Cover bytes do not match the image extension: ${cover}`);
  return { filename, contentType: types[extension] };
}

// Include content-owned metadata and image edits in the runtime/dev change detector.
export async function contentExtrasFingerprint(
  directory: string,
): Promise<string> {
  const root = path.resolve(directory, "..");
  const parts: string[] = [];
  async function visit(relative: string) {
    const info = await lstat(path.join(root, relative)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!info) return;
    parts.push(`${relative}:${info.mtimeMs}:${info.size}`);
    if (info.isDirectory() && !info.isSymbolicLink())
      for (const name of (await readdir(path.join(root, relative))).sort())
        await visit(path.join(relative, name));
  }
  await visit("topics.json");
  await visit("media");
  return parts.join("|");
}
