# China Hot Trends API

Real-time trending topics from 5 Chinese social media platforms, monetized for AI agents via x402 micropayments ($0.01 USDC/call on Base).

## Architecture

```
                   ┌──────────────┐
                   │  AI Agent    │
                   │  (buyer)     │
                   └──────┬───────┘
                          │ 1. GET /api/trends/all
                          ▼
                   ┌──────────────┐
                   │ HTTP 402     │ ← payment required
                   │ + wallet     │
                   │ + price      │
                   └──────┬───────┘
                          │ 2. Send $0.01 USDC on Base
                          ▼
                   ┌──────────────┐
                   │  X-402-Pay   │ ← tx hash header
                   │  ment: <tx>  │
                   └──────┬───────┘
                          │ 3. Verify on-chain
                          ▼
                   ┌──────────────┐
                   │ 200 OK       │
                   │ + JSON data  │
                   └──────────────┘
```

```
                          ┌─────────────┐
                  ┌──────►│  Weibo 热搜  │
                  │       └─────────────┘
                  │       ┌─────────────┐
                  │──────►│  Baidu 热搜  │
┌──────────┐      │       └─────────────┘
│ Scheduler│──────┤       ┌─────────────┐
│ (30 min) │──────┤──────►│ Bilibili    │──► data.json ──► Express API ──► Internet
└──────────┘      │       └─────────────┘
                  │       ┌─────────────┐
                  │──────►│  Zhihu 热榜  │
                  │       └─────────────┘
                  │       ┌─────────────┐
                  └──────►│ Douyin 热搜  │
                          └─────────────┘
```

## Project Structure

```
china-trends-api/
├── src/
│   ├── index.js          # Express server, routes, x402 middleware
│   ├── scraper.js        # 5 platform scrapers
│   ├── x402.js           # x402 payment verification (Base chain)
│   ├── scheduler.js      # 30-min auto-refresh via cron
│   └── cache.js          # JSON file cache
├── mcp-server/
│   ├── index.js          # MCP server for Claude Code / Cursor
│   └── package.json
├── render.yaml           # Render Blueprint deployment
├── railway.json          # Railway deployment config
├── package.json
├── .env.example
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- A Base chain wallet (e.g. OKX Wallet, MetaMask) for receiving USDC payments

### 1. Clone & Install

```bash
git clone https://github.com/yp892925037/china-trends-api.git
cd china-trends-api
cp .env.example .env
# Edit .env — set your Base wallet address
npm install
```

### 2. Test the Scraper

```bash
node src/scraper.js
```

### 3. Run Locally

```bash
npm start
# → http://localhost:3000
```

## API Endpoints

### Free

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API documentation + payment info |
| GET | `/api/health` | Health check + cache status |
| GET | `/api/preview` | Top 3 trending from each platform |
| GET | `/.well-known/x402.json` | x402 auto-discovery |

### Paid — $0.01 USDC via x402

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trends/all` | Full data from all 5 platforms |
| GET | `/api/trends/weibo` | Weibo hot search |
| GET | `/api/trends/baidu` | Baidu hot search |
| GET | `/api/trends/bilibili` | Bilibili popular |
| GET | `/api/trends/zhihu` | Zhihu hot list |
| GET | `/api/trends/douyin` | Douyin hot search |

## x402 Payment Protocol

This API implements the [x402](https://x402.org) protocol (incubated by Coinbase).

**Payment Flow:**

1. Client requests a paid endpoint
2. Server returns `HTTP 402 Payment Required` with payment instructions in the `PAYMENT-REQUIRED` header
3. Client sends USDC to the specified address on Base chain
4. Client retries with `X-402-Payment: <transaction_hash>` header
5. Server verifies the USDC transfer on-chain, caches the valid transaction
6. Server returns `200 OK` with the requested data

**Example:**
```bash
# First request → gets payment instructions
curl https://china-trends-api.onrender.com/api/trends/all
# HTTP 402
# {"error":"Payment Required","message":"Send 0.01 USDC to 0x...",...}

# After sending 0.01 USDC on Base → retry with tx hash
curl -H "X-402-Payment: 0xabc123..." https://china-trends-api.onrender.com/api/trends/all
# HTTP 200 + full data
```

## MCP Server

Use with Claude Code, Cursor, or any MCP-compatible AI agent.

### Claude Code Setup

Add to Claude Code config:

```json
{
  "mcpServers": {
    "china-trends": {
      "command": "npx",
      "args": ["china-trends-mcp"]
    }
  }
}
```

If you can't install the MCP SDK globally, use the local server:

```json
{
  "mcpServers": {
    "china-trends": {
      "command": "node",
      "args": ["path/to/china-trends-api/mcp-server/index.js"]
    }
  }
}
```

### Available MCP Tools

| Tool | Cost | Description |
|------|------|-------------|
| `china_trends_preview` | Free | Top 3 trends from all platforms |
| `china_trends_all` | $0.01 USDC | Full data from all platforms |
| `china_trends_platform` | $0.01 USDC | Full data from one platform |
| `china_trends_payment_info` | Free | x402 payment details |

## Deployment

### Render (Free Tier)

1. Fork/clone this repo
2. Go to [dashboard.render.com/blueprints/new](https://dashboard.render.com/blueprints/new)
3. Connect the repo, Render auto-detects `render.yaml`
4. Set `WALLET_ADDRESS` environment variable to your Base wallet

### Railway

1. Push to GitHub
2. Connect repo on Railway
3. Set `WALLET_ADDRESS` environment variable

## Data Sources

| Platform | Source | Items | Refresh |
|----------|--------|-------|---------|
| 微博 | `weibo.com/ajax/side/hotSearch` | 20 | 30 min |
| 百度 | `top.baidu.com` (HTML parse) | 20 | 30 min |
| B站 | `api.bilibili.com/x/web-interface/popular` | 20 | 30 min |
| 知乎 | `www.zhihu.com/hot` (HTML parse) | 20-30 | 30 min |
| 抖音 | `douyin.com/aweme/v1/web/hot/search/list` | 20 | 30 min |

## Payment Verification

The x402 middleware (`src/x402.js`) verifies USDC transfers on-chain:

- Checks for `Transfer` events on USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- Verifies `to` address matches the configured wallet
- Verifies amount >= required price
- Caches verified transactions for 1 hour to avoid re-verification
- Unverified transactions return HTTP 402

## Register on x402 Marketplaces

Your API is auto-discoverable via `/.well-known/x402.json`.

To list on marketplaces:

```bash
# ScoutGate proxy
curl -X POST https://x402-scoutgate.onrender.com/register \
  -H "Content-Type: application/json" \
  -d '{"api_url":"YOUR_URL","wallet_address":"YOUR_WALLET","price_usd":0.01,"name":"China Hot Trends"}'

# x402 Scout catalog
curl -X POST https://x402scout.com/register \
  -H "Content-Type: application/json" \
  -d '{"name":"China Hot Trends","url":"YOUR_URL","price_usd":0.01,"category":"data",...}'
```

## License

MIT
