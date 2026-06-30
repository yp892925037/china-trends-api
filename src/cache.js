import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, "data.json");

let cache = null;

export function getCache() {
  if (cache) return cache;
  if (existsSync(DATA_FILE)) {
    try {
      cache = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
      return cache;
    } catch {
      // corrupted file, ignore
    }
  }
  return null;
}

export function setCache(data) {
  cache = data;
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getAge() {
  if (!cache?.updatedAt) return Infinity;
  return Date.now() - new Date(cache.updatedAt).getTime();
}
