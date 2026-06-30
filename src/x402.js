import { ethers } from "ethers";

// USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Minimal USDC ERC-20 ABI for Transfer event
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

/**
 * x402 Payment Required middleware.
 *
 * Flow:
 *  1. Client calls endpoint
 *  2. Server returns HTTP 402 + PAYMENT-REQUIRED header with payment instructions
 *  3. Client sends USDC tx on Base, retries with X-402-Payment: <txHash>
 *  4. Server verifies on-chain, returns 200 with data
 */
export function createX402({ walletAddress, price, network, facilitatorUrl }) {
  const provider = new ethers.JsonRpcProvider(
    process.env.BASE_RPC_URL || "https://mainnet.base.org"
  );
  const usdc = new ethers.Contract(USDC_BASE, USDC_ABI, provider);

  // In-memory cache of verified tx hashes
  const verifiedTxs = new Map();

  // Clean old entries every hour
  setInterval(() => {
    const cutoff = Date.now() - 3600_000;
    for (const [hash, ts] of verifiedTxs) {
      if (ts < cutoff) verifiedTxs.delete(hash);
    }
  }, 3600_000);

  async function verifyPayment(txHash, expectedAmount) {
    if (verifiedTxs.has(txHash)) return true;

    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) return false; // tx not confirmed yet

      // Parse USDC Transfer events
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== USDC_BASE.toLowerCase()) continue;
        try {
          const parsed = usdc.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
          if (
            parsed.name === "Transfer" &&
            parsed.args.to.toLowerCase() === walletAddress.toLowerCase()
          ) {
            const amount = Number(ethers.formatUnits(parsed.args.value, 6));
            if (amount >= expectedAmount) {
              verifiedTxs.set(txHash, Date.now());
              return true;
            }
          }
        } catch {
          // skip unparseable logs
        }
      }
      return false;
    } catch {
      return false; // RPC error
    }
  }

  function paymentRequired(res) {
    const body = {
      scheme: "exact",
      network,
      payTo: walletAddress,
      price: `$${price.toFixed(4)}`,
      currency: "USDC",
      facilitator: facilitatorUrl,
    };
    res.set("PAYMENT-REQUIRED", JSON.stringify(body));
    res.set("X-402-Version", "1.0");
    res.status(402).json({
      error: "Payment Required",
      message: `Send ${price} USDC to ${walletAddress} on ${network}`,
      payment: body,
    });
  }

  function middleware() {
    return async (req, res, next) => {
      const paymentHeader =
        req.headers["x-402-payment"] || req.headers["x-402-signature"];

      if (!paymentHeader) {
        return paymentRequired(res);
      }

      const txHash = Array.isArray(paymentHeader)
        ? paymentHeader[0]
        : paymentHeader;

      const paid = await verifyPayment(txHash, price);

      if (!paid) {
        return res.status(402).json({
          error: "Payment verification failed",
          message:
            "Transaction not found or insufficient USDC. Please send payment and retry with X-402-Payment header.",
        });
      }

      // Payment verified — proceed
      req.x402txHash = txHash;
      next();
    };
  }

  return { middleware, paymentRequired, verifyPayment };
}
