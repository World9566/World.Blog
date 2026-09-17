import { readFileSync } from "node:fs";
import { checkProductionEnv } from "./production-env.mjs";
checkProductionEnv(
  process.env,
  JSON.parse(readFileSync("build-info.json", "utf8")),
);
console.log("Production environment matches the image.");
