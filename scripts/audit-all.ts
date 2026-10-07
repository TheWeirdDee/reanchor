/**
 * Gate-by-gate audit runner. Re-executes every reproducible check in order and records, per gate,
 * the command, exit code, duration and whether it needs the network. Writes evidence/audit-run.json.
 * Network steps: agent:crosscheck (Bitget Agent Hub MCP, public read-only), model:check (one tiny Gemini call),
 * mcp:probe (one Bitget AI data-MCP availability probe). Everything else runs against saved data.
 * Usage: npm run audit:all            (all steps)
 *        npm run audit:all -- --offline (skip network steps; they are reported as SKIPPED)
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, log, readJsonIfExists, writeJsonAtomic } from "./lib/fsx";

interface Step {
  gate: string;
  name: string;
  command: string;
  network: boolean;
  env?: Record<string, string>;
}

const STEPS: Step[] = [
  { gate: "G1", name: "Typecheck", command: "npm run typecheck", network: false },
  { gate: "G1", name: "Lint", command: "npm run lint", network: false },
  { gate: "G1/G3/G4/G6", name: "Unit and adapter tests", command: "npm test", network: false },
  // Network steps that write receipts run before validation, so the manifest hashes their latest output.
  { gate: "G5", name: "Bitget Agent Hub MCP real calls and cross-check", command: "npm run agent:crosscheck", network: true },
  { gate: "G5 (disclosure)", name: "Bitget AI data-MCP availability probe (single attempt)", command: "npm run mcp:probe", network: true, env: { PROBE_ATTEMPTS: "1", PROBE_GAP_MS: "0" } },
  { gate: "G6", name: "Gemini model verification and one real call", command: "npm run model:check", network: true },
  { gate: "G2", name: "Dataset validation and manifest", command: "npm run data:validate", network: false },
  { gate: "G4/G8", name: "Chronological replay", command: "npm run data:replay", network: false },
  { gate: "G2/G3", name: "G2/G3 episode audit and sensitivity", command: "npm run audit:g2g3", network: false },
  { gate: "G1/G7", name: "Production build", command: "npm run build", network: false },
  { gate: "G9", name: "Evidence verification", command: "npm run evidence:verify", network: false },
  { gate: "G7", name: "Browser flows at 1280, 768, 390 px", command: "npm run test:e2e", network: true },
];

function main() {
  const offline = process.argv.includes("--offline");
  const startedAt = new Date().toISOString();
  const results = STEPS.map((s) => {
    if (offline && s.network) {
      log(`SKIP  [${s.gate}] ${s.name} (network step, --offline)`);
      return { ...s, status: "SKIPPED", exitCode: null as number | null, durationMs: 0, tail: "" };
    }
    const t0 = Date.now();
    const r = spawnSync(s.command, { cwd: ROOT, shell: true, encoding: "utf8", env: { ...process.env, ...(s.env ?? {}) }, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const status = r.status === 0 ? "PASS" : "FAIL";
    log(`${status}  [${s.gate}] ${s.name} (${Math.round((Date.now() - t0) / 1000)} s)`);
    // Keep only a short, credential-free tail for the record.
    const tail = out.split("\n").filter((l) => l.trim()).slice(-6).join("\n").replace(/(AIza|AQ\.Ab)[0-9A-Za-z_.-]+/g, "[redacted]");
    return { ...s, status, exitCode: r.status, durationMs: Date.now() - t0, tail };
  });
  // The data-MCP probe exits 0 even when the service returns 503: "PASS" there means the probe ran, not that the
  // data MCP works. Record its actual outcome explicitly so the audit cannot read it as a working integration.
  const probeLog = readJsonIfExists<{ attempts: { at: string; connected: boolean; guide?: string; doQuery?: { outcome: string; statusCode: number | null } }[] }>(join(ROOT, "evidence", "mcp-probe-log.json"));
  const lastProbe = probeLog?.attempts.at(-1) ?? null;
  const dataMcp = {
    note: "Disclosure only. G5 passes on the Bitget Agent Hub MCP; the data MCP is the corporate-action source and is reported separately.",
    lastProbeAt: lastProbe?.at ?? null,
    connected: lastProbe?.connected ?? null,
    catalogCall: lastProbe?.guide ?? null,
    researchQuery: lastProbe?.doQuery ?? null,
    researchWorking: lastProbe?.doQuery?.outcome === "OK",
  };
  writeJsonAtomic(join(ROOT, "evidence", "audit-run.json"), { startedAt, finishedAt: new Date().toISOString(), offline, results, dataMcp });
  log(`Bitget AI data MCP research query: ${dataMcp.researchQuery ? `${dataMcp.researchQuery.outcome} ${dataMcp.researchQuery.statusCode ?? ""}` : "not probed"} (disclosure; corporate actions use the labeled fallback)`);
  const failed = results.filter((r) => r.status === "FAIL");
  log(failed.length ? `${failed.length} step(s) failed: ${failed.map((f) => f.name).join(", ")}` : "All executed steps passed.");
  if (failed.length) process.exitCode = 1;
}

main();
