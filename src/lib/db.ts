import { Pool } from "pg";

const globalDatabase = globalThis as unknown as { blogPool?: Pool };

export const db =
  globalDatabase.blogPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.blogPool = db;
}
