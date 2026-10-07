/**
 * Model configuration check. Calls only the configured provider: its models endpoint, then one minimal
 * structured generation to prove the model answers on this key. Never prints credentials.
 * Run with the server env loaded: `npm run model:check` (uses .env.local if present).
 * Output: evidence/model-check.json
 */
import { join } from "node:path";
import { z } from "zod";
import { providerConfig, structuredCall, verifyModel } from "../src/server/llm-provider";
import { ROOT, log, writeJsonAtomic } from "./lib/fsx";

async function main() {
  const cfg = providerConfig();
  const v = await verifyModel(true);
  let realCall: { ok: boolean; model?: string; detail: string; at: string } | null = null;
  if (v.status === "VERIFIED") {
    const started = Date.now();
    const r = await structuredCall(z.object({ answer: z.number() }), "Reply with JSON only.", "What is 2 + 5? Put the number in answer.", 50);
    realCall = r.ok
      ? { ok: r.data.answer === 7, model: r.model, detail: `answer=${r.data.answer} in ${Date.now() - started} ms`, at: new Date().toISOString() }
      : { ok: false, detail: r.error, at: new Date().toISOString() };
  }
  const out = {
    checkedAt: new Date().toISOString(),
    provider: cfg.provider,
    model: cfg.model,
    credentialPresent: cfg.configured,
    configReason: cfg.reason,
    verification: v,
    realCall,
    documentation: {
      models: "https://ai.google.dev/gemini-api/docs/models (read 2026-10-06): gemini-3.5-flash-lite listed as stable",
      pricing: "https://ai.google.dev/gemini-api/docs/pricing (read 2026-10-06): gemini-3.5-flash-lite free of charge on the free tier",
      billing: "Billing was not enabled by this build. Whether the key's project has billing is not visible to the API response.",
    },
  };
  writeJsonAtomic(join(ROOT, "evidence", "model-check.json"), out);
  log(`provider=${cfg.provider} model=${cfg.model} credential=${cfg.configured ? "present" : "absent"} verification=${v.status} (${v.detail}) realCall=${realCall ? `${realCall.ok ? "OK" : "FAILED"} ${realCall.detail}` : "skipped"}`);
  if (!realCall?.ok) process.exitCode = 1;
}

main();
