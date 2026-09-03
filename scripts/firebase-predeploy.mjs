import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const task = process.argv[2];
if (task !== "build" && task !== "functions-check")
  throw new Error("Firebase predeploy task must be build or functions-check.");

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (process.env.LIEUVA_SKIP_FIREBASE_PREDEPLOY)
  throw new Error(
    "Predeploy skipping is forbidden. Immutable release bundles remove predeploy hooks instead.",
  );
const argumentsByTask = {
  build: ["run", "build"],
  "functions-check": ["--prefix", "functions", "run", "check"],
};
execFileSync(npm, argumentsByTask[task], {
  cwd: projectRoot,
  stdio: "inherit",
});
