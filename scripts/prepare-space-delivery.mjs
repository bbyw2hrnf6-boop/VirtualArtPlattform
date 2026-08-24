import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = path.join(repositoryRoot, "functions", "generated");

await mkdir(generatedDirectory, { recursive: true });
await copyFile(
  path.join(repositoryRoot, "dist", "index.html"),
  path.join(generatedDirectory, "app-shell.html"),
);

