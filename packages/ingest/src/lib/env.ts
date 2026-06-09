import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";

export const requireEnv = (key: string) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
};

export const loadDotEnv = () => {
  let currentDir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const envPath = resolve(currentDir, ".env");
    if (existsSync(envPath)) {
      const contents = readFileSync(envPath, "utf-8");
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) {
          continue;
        }
        const key = trimmed.slice(0, eqIdx).trim();
        const rawValue = trimmed.slice(eqIdx + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return envPath;
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
};
