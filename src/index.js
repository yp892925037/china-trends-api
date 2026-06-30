import "dotenv/config";
import express from "express";
import { createX402 } from "./x402.js";
import { getCache, getAge } from "./cache.js";
import { startScheduler } from "./scheduler.js";

const PORT = process.env.PORT || 3000;
const WALLET = process.env.WALLET_ADDRESS;

if (!WALLET) {
  console.error("FATAL: WALLET_ADDRESS not set in .env");
  process.exit(1);
}

const PRICE_USD = 0.01;
const NETWORK = "eip155:8453"; // Base mainnet
const FACILITATOR = process.env.FACILITATOR_URL || "https://x402.org/facilitator";

const x402 = createX402({
  walletAddress: WALLET,
  price: PRICE_USD,
  network: NETWORK,
  facilitatorUrl: FACILITATOR,
});

const app = express();
app.use(express.json());

// ===== Free endpoints =====

app.get("/", (req, res) => {
  const cache = getCache();
  res.json({
    service: "China Hot Trends API",
    version: "1.0.0",
    description:
      "Real-time trending topics from Chinese social media platforms, packaged for AI agents with x402 micropayments.",
    platforms: cache
      ? cache.platforms.map((p) => ({ name: p.name, count: p.list?.length || 0, hasError: !!p.error }))
      : [],
    endpoints: {
      free: ["GET /", "GET /api/health", "GET /api/preview"],
      paid: [
        `GET /api/trends/all  —  $${PRICE_USD}  (all platforms)`,
        `GET /api/trends/weibo  —  $${PRICE_USD}  (Weibo only)`,
        `GET /api/trends/baidu  —  $${PRICE_USD}  (Baidu only)`,
        `GET /api/trends/bilibili  —  $${PRICE_USD}  (Bilibili only)`,
        `GET /api/trends/zhihu  —  $${PRICE_USD}  (Zhihu only)`,
      ],
    },
    payment: {
      protocol: "x402",
      network: NETWORK,
      price: `$${PRICE_USD} USDC`,
      payTo: WALLET,
      howTo:
        "Send USDC to the address above on Base chain. Include X-402-Payment: <tx_hash> header in your request.",
    },
  });
});

app.get("/api/health", (req, res) => {
  const cache = getCache();
  res.json({
    status: "ok",
    cached: !!cache,
    ageSeconds: cache ? Math.round(getAge() / 1000) : null,
    updatedAt: cache?.updatedAt || null,
  });
});

// Preview: only show top 3 per platform, no payment required
app.get("/api/preview", (req, res) => {
  const cache = getCache();
  if (!cache) {
    return res.status(503).json({ error: "Data not yet available, please retry in a moment." });
  }
  const preview = {
    updatedAt: cache.updatedAt,
    platforms: cache.platforms.map((p) => ({
      platform: p.platform,
      name: p.name,
      top3: p.list ? p.list.slice(0, 3).map((i) => i.keyword) : [],
      total: p.list?.length || 0,
      error: p.error || null,
    })),
    hint: `Full data costs $${PRICE_USD} USDC. See / for payment instructions.`,
  };
  res.json(preview);
});

// ===== x402-protected paid endpoints =====

const paywall = x402.middleware();

app.get("/api/trends/all", paywall, (req, res) => {
  const cache = getCache();
  if (!cache) return res.status(503).json({ error: "Data not available yet." });
  res.json(cache);
});

app.get("/api/trends/:platform", paywall, (req, res) => {
  const cache = getCache();
  if (!cache) return res.status(503).json({ error: "Data not available yet." });

  const platform = req.params.platform.toLowerCase();
  const data = cache.platforms.find((p) => p.platform === platform);

  if (!data) {
    const names = cache.platforms.map((p) => p.platform).join(", ");
    return res.status(404).json({ error: `Unknown platform: ${platform}`, available: names });
  }

  res.json(data);
});

// ===== Global error handler =====
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ===== Start =====

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  China Hot Trends API running on http://localhost:${PORT}`);
  console.log(`  Wallet: ${WALLET.slice(0, 10)}...${WALLET.slice(-6)}`);
  console.log(`  Price:  $${PRICE_USD} USDC/call on Base\n`);

  // Only start scraping on production (not on manual scrape runs)
  if (process.env.NO_SCHEDULER !== "1") {
    startScheduler();
  }
});
