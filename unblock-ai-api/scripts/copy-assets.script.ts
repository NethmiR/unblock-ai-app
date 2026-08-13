import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ASSET_DIRS: readonly string[] = ["src/data/samples"];

function copyAssetDir(relativeDir: string): void {
  const source = path.join(projectRoot, relativeDir);
  if (!existsSync(source)) return;

  const destination = path.join(projectRoot, "dist", relativeDir);
  cpSync(source, destination, {
    recursive: true,
    filter: (src) => path.basename(src) !== ".gitkeep",
  });
}

for (const dir of ASSET_DIRS) {
  copyAssetDir(dir);
}
