import "server-only";

export const authOrigin = new URL(
  process.env.BETTER_AUTH_URL || "http://localhost:3000",
).origin;
export const githubConfigured = !!(
  process.env.GITHUB_CLIENT_ID?.trim() &&
  process.env.GITHUB_CLIENT_SECRET?.trim()
);
