# China Hot Trends API

Real-time trending topics from Chinese social media platforms, packaged for AI agents with x402 micropayments.

**API Base:** `https://china-trends-api.onrender.com`

## Platforms Covered

| Platform | Name | Updates |
|----------|------|---------|
| weibo | 微博热搜 | Every 30 min |
| baidu | 百度热搜 | Every 30 min |
| bilibili | B站热门 | Every 30 min |
| zhihu | 知乎热榜 | Every 30 min |
| douyin | 抖音热搜 | Every 30 min |

## Endpoints

### Free
- `GET /` — API documentation & payment info
- `GET /api/health` — Health check
- `GET /api/preview` — Top 3 from each platform

### Paid ($0.01 USDC each, via x402)
- `GET /api/trends/all` — Full data from all platforms
- `GET /api/trends/{platform}` — Full data from one platform

## x402 Payment Flow

1. Call a paid endpoint → receive `HTTP 402 Payment Required`
2. Send `$0.01 USDC` to the provided address on **Base** chain
3. Retry with header `X-402-Payment: <txHash>`
4. Server verifies on-chain → returns data

## MCP Server

Use directly with Claude Code, Cursor, or any MCP-compatible AI tool.

### Install

```bash
npx china-trends-mcp
```

### Claude Code Config

Add to `~/.claude/.claude.json`:

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

### Available Tools

| Tool | Cost | Description |
|------|------|-------------|
| `china_trends_preview` | Free | Top 3 from all 5 platforms |
| `china_trends_all` | $0.01 | Full data from all platforms |
| `china_trends_platform` | $0.01 | Full data from one platform |
| `china_trends_payment_info` | Free | x402 payment details |
