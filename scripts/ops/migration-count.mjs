import { readdirSync } from "node:fs";
console.log(
  readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  ).length,
);
