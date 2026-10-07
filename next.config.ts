import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Files read with fs at runtime (src/server/dataset.ts, evidence.ts, presentation.ts). They are not imported,
// so the tracer cannot see them; list them so serverless deployments ship them with every server route.
const RUNTIME_FILES = [
  "./data/*.json",
  "./evidence/mcp-probe-log.json",
  "./evidence/model-check.json",
  "./evidence/sources/bitget-support-12560603892041.html",
];

/**
 * Live candles come from the Bitget Agent Hub MCP server, started as a separate Node process from node_modules
 * (src/server/agent-mcp.ts). That process loads its own dependencies from disk, which the bundler never sees, so
 * ship the package and its full production dependency closure with the API routes.
 */
function packageClosure(root: string): string[] {
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const manifest = join(process.cwd(), "node_modules", ...name.split("/"), "package.json");
    if (!existsSync(manifest)) return;
    seen.add(name);
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) visit(dep);
  };
  visit(root);
  return [...seen].map((name) => `./node_modules/${name}/**`);
}

const AGENT_HUB_FILES = packageClosure("@bitget-ai/bitget-agent-mcp");

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // Every top-level page route (/, /desk, /how-it-works, /method, /about) renders from the presentation model.
    "/*": RUNTIME_FILES,
    "/api/**": [...RUNTIME_FILES, ...AGENT_HUB_FILES],
  },
  // The evidence directory is resolved dynamically, so the tracer pulls in all of it; screenshots are never read at runtime.
  outputFileTracingExcludes: {
    "/*": ["./evidence/screenshots/**"],
    "/api/**": ["./evidence/screenshots/**"],
  },
  poweredByHeader: false,
};

export default nextConfig;
