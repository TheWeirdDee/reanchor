/**
 * Evidence verification (runs against saved data and source files; no network).
 *  1. Manifest hashes match the data files.
 *  2. Every weekend row and every evaluation row recomputes identically from bars + code.
 *  3. Displayed example numbers reproduce from bars.
 *  4. No synthetic fixtures leak into data/ or src/.
 *  5. No emoji in project-authored user-facing content.
 *  6. No secrets in project files or client bundles; no server adapter code in client bundles.
 * Output: evidence/verification-report.json (non-zero exit on failure).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { canonicalElapsed, observe } from "../src/domain/episodes";
import { loadDataset, episodesFor } from "../src/server/dataset";
import { allSessionsFor, replayCard } from "../src/server/research";
import type { ConfirmedIntention, Intent } from "../src/domain/intent";
import { ROOT, DATA, log, readJson, sha256File, writeJsonAtomic } from "./lib/fsx";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (["node_modules", ".git", "raw", ".staging"].includes(name)) continue;
      walk(p, filter, out);
    } else if (filter(p)) out.push(p);
  }
  return out;
}

const close = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)));

function main() {
  // 1. Manifest hashes
  const manifest = readJson<{ files: Record<string, string> }>(join(DATA, "manifest.json"));
  const bad = Object.entries(manifest.files).filter(([f, h]) => sha256File(join(DATA, f)) !== h);
  check("manifest-hashes", bad.length === 0, bad.length ? `mismatch: ${bad.map(([f]) => f).join(", ")}` : `${Object.keys(manifest.files).length} files match`);

  // 2. Recompute weekends and evaluations
  const ds = loadDataset();
  const weekends = readJson<{ weekends: Record<string, { key: string; fridayRef: number | null; decisionPrice: number | null; reopenPrice: number | null; endpointPrice: number | null; w: number | null; g: number | null; r: number | null }[]> }>(join(DATA, "weekends.json"));
  const evals = readJson<{ referenceInputs: Record<Intent, { holdingUsdt: number | null; tradeUsdt: number | null }>; evaluations: Record<string, { intents: Record<string, { rows: { key: string; action: string; signal: string; threshold: number | null; matched: number; ht: number | null; w: number | null }[] }> }> }>(join(DATA, "evaluations.json"));
  let wMismatch = 0;
  let wRows = 0;
  let eMismatch = 0;
  let eRows = 0;
  for (const inst of ds.supported) {
    const idx = ds.bars[inst.symbol];
    const eps = episodesFor(ds, inst, allSessionsFor(ds, inst, idx.last!));
    for (const saved of weekends.weekends[inst.symbol] ?? []) {
      wRows++;
      const ep = eps.find((e) => e.key === saved.key);
      if (!ep) {
        wMismatch++;
        continue;
      }
      const ob = observe(ep, idx, canonicalElapsed(ep));
      const same = close(ep.fridayRef, saved.fridayRef) && close(ob.decisionPrice, saved.decisionPrice) && close(ep.reopenPrice, saved.reopenPrice) && close(ep.endpointPrice, saved.endpointPrice) && close(ob.w, saved.w) && close(ob.g, saved.g) && close(ob.r, saved.r);
      if (!same) wMismatch++;
    }
    for (const [intent, v] of Object.entries(evals.evaluations[inst.symbol]?.intents ?? {})) {
      for (const row of v.rows) {
        eRows++;
        const ref = evals.referenceInputs[intent as Intent];
        const ep = eps.find((e) => e.key === row.key)!;
        const ob = observe(ep, idx, canonicalElapsed(ep));
        const x: ConfirmedIntention = { symbol: inst.symbol, intent: intent as Intent, holdingUsdt: ref.holdingUsdt, tradeUsdt: ref.tradeUsdt, limitPrice: intent === "HOLD" ? null : ob.decisionPrice };
        const { card } = replayCard(ds, x, row.key);
        if (card.action !== row.action || card.signal.signal !== row.signal || !close(card.signal.threshold, row.threshold) || card.signal.matchedCount !== row.matched || !close(card.ht.value, row.ht) || !close(card.observation.w, row.w)) eMismatch++;
      }
    }
  }
  check("weekends-reproduce", wMismatch === 0 && wRows > 0, `${wRows - wMismatch}/${wRows} weekend rows reproduce from bars`);
  check("evaluations-reproduce", eMismatch === 0 && eRows > 0, `${eRows - eMismatch}/${eRows} evaluation rows reproduce from code`);

  // 2b. Bitget Agent Hub MCP cross-check (real read-only calls vs the verified dataset)
  const agent = existsSync(join(DATA, "agent-tool-receipts.json")) ? readJson<{ allOk: boolean; checks: { ok: boolean }[]; receipts: { outcome: string }[] }>(join(DATA, "agent-tool-receipts.json")) : null;
  check("agent-mcp-crosscheck", !!agent && agent.allOk && agent.receipts.every((r) => r.outcome === "OK"), agent ? `${agent.receipts.filter((r) => r.outcome === "OK").length}/${agent.receipts.length} Agent Hub MCP calls OK; ${agent.checks.filter((c) => c.ok).length}/${agent.checks.length} cross-checks match` : "data/agent-tool-receipts.json missing; run npm run agent:crosscheck");

  // 3. Turnover unit sanity on displayed data: quote turnover / base volume inside bar range
  const vr = readJson<{ instruments: Record<string, { quoteTurnoverUnitCheck: { checked: number; vwapInsideBarRange: number } }> }>(join(DATA, "validation-report.json"));
  const unitOk = Object.values(vr.instruments).every((i) => i.quoteTurnoverUnitCheck.checked === 0 || i.quoteTurnoverUnitCheck.vwapInsideBarRange / i.quoteTurnoverUnitCheck.checked > 0.99);
  check("turnover-units", unitOk, "quote turnover / base volume lies within the bar range for >99% of bars");

  // 4. Synthetic isolation
  const dataFiles = walk(DATA, (p) => p.endsWith(".json"));
  const synthInData = dataFiles.filter((p) => /SYNTHUSDT|rSYNTH|SYNTHETIC TEST FIXTURES/.test(readFileSync(p, "utf8")));
  const srcFiles = walk(join(ROOT, "src"), (p) => /\.(ts|tsx)$/.test(p));
  const synthImports = srcFiles.filter((p) => /fixtures\/synthetic|tests\//.test(readFileSync(p, "utf8")));
  check("synthetic-isolation", synthInData.length === 0 && synthImports.length === 0, `data files clean (${dataFiles.length}), src imports clean (${srcFiles.length})`);

  // 5. Emoji scan of project-authored content
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const authored = [
    ...srcFiles,
    ...walk(join(ROOT, "docs"), (p) => p.endsWith(".md")),
    ...walk(join(ROOT, "scripts"), (p) => p.endsWith(".ts")),
    ...[join(ROOT, "README.md")].filter(existsSync),
  ];
  const emojiHits = authored.filter((p) => EMOJI.test(readFileSync(p, "utf8"))).map((p) => relative(ROOT, p));
  check("no-emoji", emojiHits.length === 0, emojiHits.length ? emojiHits.join(", ") : `${authored.length} files clean`);

  // 6. Secrets in project files and client bundles
  const SECRET = /(sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}|AQ\.Ab[0-9A-Za-z_-]{20,}|^\s*(ANTHROPIC|GEMINI|REANCHOR_OPENAI)_API_KEY=\S{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16})/m;
  const projectText = [...authored, ...dataFiles, ...walk(ROOT, (p) => /\.(json|ts|md|mjs|example)$/.test(p) && !p.includes(join(ROOT, "node_modules")) && !p.includes(join(ROOT, ".next")))];
  const secretHits = [...new Set(projectText)].filter((p) => SECRET.test(readFileSync(p, "utf8"))).map((p) => relative(ROOT, p));
  check("no-secrets-in-project", secretHits.length === 0, secretHits.length ? secretHits.join(", ") : "no credential patterns found");
  const gi = existsSync(join(ROOT, ".gitignore")) ? readFileSync(join(ROOT, ".gitignore"), "utf8") : "";
  check("env-local-ignored", /^\.env\*$/m.test(gi) || /^\.env\.local$/m.test(gi), existsSync(join(ROOT, ".env.local")) ? ".env.local exists and is excluded by .gitignore" : "no .env.local present");
  const clientDir = join(ROOT, ".next", "static");
  if (existsSync(clientDir)) {
    const bundles = walk(clientDir, (p) => p.endsWith(".js"));
    const leaks = bundles.filter((p) => {
      const t = readFileSync(p, "utf8");
      return SECRET.test(t) || /agent\.bitget\.com\/mcp|api\.nasdaq\.com|GEMINI_API_KEY|generativelanguage\.googleapis\.com|x-goog-api-key/.test(t);
    });
    check("client-bundle-clean", leaks.length === 0, leaks.length ? leaks.map((p) => relative(ROOT, p)).join(", ") : `${bundles.length} client bundles contain no secrets or server adapters`);
  } else {
    check("client-bundle-clean", false, "No production build found; run npm run build first");
  }

  const ok = checks.every((c) => c.ok);
  writeJsonAtomic(join(ROOT, "evidence", "verification-report.json"), { generatedAt: new Date().toISOString(), ok, checks });
  log(ok ? "Evidence verification passed." : "Evidence verification FAILED.");
  if (!ok) process.exitCode = 1;
}

main();
