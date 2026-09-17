import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { prisma } from "./prisma";
import { authOrigin, githubConfigured } from "./auth-config";

export const auth = betterAuth({
  appName: "World",
  baseURL: authOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [authOrigin],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: false },
  socialProviders: githubConfigured
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          mapProfileToUser: (profile) => ({ githubUsername: profile.login }),
        },
      }
    : {},
  account: {
    accountLinking: { enabled: false },
    encryptOAuthTokens: true,
  },
  user: {
    additionalFields: {
      bio: { type: "string", required: false, defaultValue: "", input: false },
      // OAuth profile mapping uses the input schema. Public profile writes are
      // restricted to name/bio, and Better Auth's generic update route is closed.
      githubUsername: { type: "string", required: false, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 120,
    customRules: { "/sign-in/social": { window: 60, max: 10 } },
  },
  advanced: {
    cookiePrefix: "world",
    // The production gateway overwrites this header. Development trusts none.
    ipAddress: {
      ipAddressHeaders: process.env.TRUST_PROXY === "1" ? ["x-real-ip"] : [],
    },
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  onAPIError: { errorURL: "/login" },
  plugins: [
    admin({ defaultRole: "user", bannedUserMessage: "此账号已被停用。" }),
  ],
});
