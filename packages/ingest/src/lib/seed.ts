import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

export const parseSeedList = (contents: string) =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const getDefaultSeedPath = () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "..", "benchmarks", "seed-universe.txt");
};

export const loadSeedUniverse = (filePath = getDefaultSeedPath()) => {
  const contents = readFileSync(filePath, "utf-8");
  return parseSeedList(contents);
};
