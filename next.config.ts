import type { NextConfig } from "next";

// Files read with fs at runtime (src/server/dataset.ts, evidence.ts, presentation.ts). They are not imported,
// so the tracer cannot see them; list them so serverless deployments ship them with every server route.
const RUNTIME_FILES = [
  "./data/*.json",
  "./evidence/mcp-probe-log.json",
  "./evidence/model-check.json",
  "./evidence/sources/bitget-support-12560603892041.html",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // Every top-level page route (/, /desk, /how-it-works, /method, /about) renders from the presentation model.
    "/*": RUNTIME_FILES,
    // API routes also launch the Bitget Agent Hub MCP server from node_modules for live candles.
    "/api/**": [...RUNTIME_FILES, "./node_modules/@bitget-ai/bitget-agent-mcp/**", "./node_modules/@bitget-ai/bitget-agent-sdk/**"],
  },
  // The evidence directory is resolved dynamically, so the tracer pulls in all of it; screenshots are never read at runtime.
  outputFileTracingExcludes: {
    "/*": ["./evidence/screenshots/**"],
    "/api/**": ["./evidence/screenshots/**"],
  },
  poweredByHeader: false,
};

export default nextConfig;
