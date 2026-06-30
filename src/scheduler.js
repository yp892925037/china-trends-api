import cron from "node-cron";
import { scrapeAll } from "./scraper.js";
import { setCache, getCache } from "./cache.js";

let running = false;

async function refresh() {
  if (running) return;
  running = true;
  try {
    const prev = getCache();
    console.log(`[${new Date().toISOString()}] Refreshing hot trends...`);
    const data = await scrapeAll();
    setCache(data);

    // Log what changed
    if (prev) {
      for (const plat of data.platforms) {
        const old = prev.platforms.find((p) => p.platform === plat.platform);
        if (old && old.list && plat.list) {
          const oldTop = old.list.slice(0, 3).map((i) => i.keyword).join(", ");
          const newTop = plat.list.slice(0, 3).map((i) => i.keyword).join(", ");
          if (oldTop !== newTop) {
            console.log(`  [${plat.name}] Top3 changed: ${newTop}`);
          }
        }
      }
    }

    const ok = data.platforms.filter((p) => !p.error).length;
    const err = data.platforms.filter((p) => p.error).length;
    console.log(`  Done: ${ok} platforms ok, ${err} failed`);
  } catch (e) {
    console.error("Refresh error:", e.message);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  // Every 30 minutes
  cron.schedule("*/30 * * * *", refresh);
  console.log("Scheduler started: every 30 minutes");

  // Delay first scrape by 10 seconds to let server start cleanly
  setTimeout(() => refresh(), 10000);
}
