#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.CHINA_TRENDS_API || "https://china-trends-api.onrender.com";

const server = new Server(
  { name: "china-trends-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "china_trends_preview",
      description:
        "Get a free preview of trending topics from Chinese social media (Weibo, Baidu, Bilibili, Zhihu, Douyin). Shows top 3 from each platform. No payment required.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "china_trends_all",
      description:
        "Get FULL trending data from ALL 5 Chinese social media platforms (20-30 items each). Costs $0.01 USDC via x402 protocol. After calling, you will receive payment instructions. Send USDC to the provided address on Base chain, then retry with the transaction hash.",
      inputSchema: {
        type: "object",
        properties: {
          txHash: {
            type: "string",
            description:
              "Optional: Base chain USDC transaction hash as payment proof. Omit on first call to get payment instructions.",
          },
        },
      },
    },
    {
      name: "china_trends_platform",
      description:
        "Get trending data from a specific Chinese platform. Costs $0.01 USDC via x402. Available platforms: weibo, baidu, bilibili, zhihu, douyin.",
      inputSchema: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["weibo", "baidu", "bilibili", "zhihu", "douyin"],
            description: "Platform to fetch trends from",
          },
          txHash: {
            type: "string",
            description: "Optional: Base chain USDC transaction hash as payment proof.",
          },
        },
        required: ["platform"],
      },
    },
    {
      name: "china_trends_payment_info",
      description:
        "Get x402 payment information for accessing full China Hot Trends data. Returns wallet address, price, network details.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

async function apiCall(path, txHash) {
  const headers = { Accept: "application/json" };
  if (txHash) headers["X-402-Payment"] = txHash;

  const res = await fetch(`${API_BASE}${path}`, { headers });
  const body = await res.json();

  if (res.status === 402) return { paid: false, payment: body.payment || body, status: 402 };
  if (!res.ok) return { error: body.error || `HTTP ${res.status}`, status: res.status };
  return { paid: true, data: body, status: 200 };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "china_trends_preview": {
      const result = await apiCall("/api/preview");
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data || result, null, 2) },
        ],
      };
    }

    case "china_trends_all": {
      const result = await apiCall("/api/trends/all", args?.txHash);

      if (!result.paid && result.status === 402) {
        const p = result.payment;
        return {
          content: [
            {
              type: "text",
              text: [
                `PAYMENT REQUIRED — $0.01 USDC`,
                ``,
                `Send exactly $0.01 USDC to:`,
                `  ${p.payTo}`,
                ``,
                `Network: ${p.network} (Base)`,
                `Currency: USDC`,
                ``,
                `After sending, call china_trends_all again with:`,
                `  txHash: "<your transaction hash>"`,
                ``,
                `The API will verify your payment on-chain and return the full data.`,
              ].join("\n"),
            },
          ],
        };
      }

      if (result.error) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }

    case "china_trends_platform": {
      const platform = args?.platform || "weibo";
      const result = await apiCall(`/api/trends/${platform}`, args?.txHash);

      if (!result.paid && result.status === 402) {
        const p = result.payment;
        return {
          content: [
            {
              type: "text",
              text: `PAYMENT REQUIRED — $0.01 USDC. Send to ${p.payTo} on ${p.network}. Then retry with txHash.`,
            },
          ],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(result.data || result, null, 2) },
        ],
      };
    }

    case "china_trends_payment_info": {
      const result = await apiCall("/");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data?.payment || result, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
