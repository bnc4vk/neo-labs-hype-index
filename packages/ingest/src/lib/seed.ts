import { readFileSync } from "fs";
import { resolve } from "path";

export const parseSeedList = (contents: string): string[] =>
  contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#"));

export const loadSeedList = (filePath?: string): string[] => {
  const resolved = filePath ?? resolve(process.cwd(), "seed-list.txt");
  const contents = readFileSync(resolved, "utf-8");
  return parseSeedList(contents);
};
