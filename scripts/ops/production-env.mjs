export function checkProductionEnv(env, build) {
  const missing = [
    "SITE_URL",
    "BETTER_AUTH_URL",
    "DATABASE_URL",
    "MEILI_HOST",
    "MEILI_MASTER_KEY",
    "BETTER_AUTH_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ].filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(`Missing production settings: ${missing.join(", ")}`);
  const site = new URL(env.SITE_URL);
  if (
    site.protocol !== "https:" ||
    site.origin !== env.SITE_URL ||
    site.username ||
    site.password
  )
    throw new Error("SITE_URL must be a canonical HTTPS origin.");
  if (env.BETTER_AUTH_URL !== env.SITE_URL)
    throw new Error("BETTER_AUTH_URL must match SITE_URL.");
  if (build.siteUrl !== env.SITE_URL)
    throw new Error(
      "Runtime SITE_URL differs from the image. Rebuild for this domain.",
    );
  if (env.APP_REVISION !== build.revision)
    throw new Error("Image revision differs from the requested release.");
  if (env.BETTER_AUTH_SECRET.length < 32 || env.MEILI_MASTER_KEY.length < 32)
    throw new Error("Production secrets must contain at least 32 characters.");
  if (!/^(postgres|postgresql):$/.test(new URL(env.DATABASE_URL).protocol))
    throw new Error("DATABASE_URL must use PostgreSQL.");
  if (!/^https?:$/.test(new URL(env.MEILI_HOST).protocol))
    throw new Error("MEILI_HOST must use HTTP or HTTPS.");
}
