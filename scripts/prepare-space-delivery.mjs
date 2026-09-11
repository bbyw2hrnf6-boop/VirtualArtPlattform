import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { adminShell } from "./lib/admin-shell.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = path.join(repositoryRoot, "functions", "generated");

await mkdir(generatedDirectory, { recursive: true });
await copyFile(
  path.join(repositoryRoot, "dist", "index.html"),
  path.join(generatedDirectory, "app-shell.html"),
);

const adminDirectory = path.join(repositoryRoot, "dist", "admin");
await mkdir(adminDirectory, { recursive: true });
await writeFile(path.join(adminDirectory, "index.html"), adminShell(
  await readFile(path.join(repositoryRoot, "dist", "index.html"), "utf8"),
));
