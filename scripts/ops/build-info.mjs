import { writeFileSync } from "node:fs";
const value = process.env.SITE_URL;
if (!value) throw new Error("SITE_URL build argument is required.");
const url = new URL(value);
if (
  url.protocol !== "https:" ||
  url.origin !== value ||
  url.username ||
  url.password
)
  throw new Error(
    "SITE_URL must be a canonical HTTPS origin without a trailing slash.",
  );
writeFileSync(
  "build-info.json",
  JSON.stringify({ siteUrl: value, revision: process.env.REVISION || "local" }),
);
