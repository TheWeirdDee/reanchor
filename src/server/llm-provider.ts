import { z } from "zod";
import { installDnsFallback } from "./net";

installDnsFallback();

/**
 * Configurable model provider.
 *  - gemini (default): Google Gemini API (generativelanguage.googleapis.com, v1beta), structured JSON output via
 *    responseJsonSchema. Credential: GEMINI_API_KEY (server-side only).
 *  - openai-compatible: any server exposing GET {base}/models and POST {base}/chat/completions with JSON-schema
 *    response_format. Credential: REANCHOR_OPENAI_API_KEY; base: REANCHOR_OPENAI_BASE_URL.
 * The configured model ID is verified against the provider's own models endpoint before any job runs.
 * Rate limits (HTTP 429) are not retried: callers fall back to the structured form or the case fallback text.
 */
export type ProviderName = "gemini" | "openai-compatible";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Stable model with a free tier on Google's pricing page (read 2026-10-06) and listed for the configured key. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  configured: boolean;
  reason: string | null;
  baseUrl: string | null;
}

export function providerConfig(): ProviderConfig {
  const provider = (process.env.REANCHOR_MODEL_PROVIDER || "gemini") as ProviderName;
  const model = process.env.REANCHOR_MODEL || (provider === "gemini" ? DEFAULT_GEMINI_MODEL : "");
  if (process.env.REANCHOR_LLM_DISABLED === "1") return { provider, model, configured: false, reason: "Disabled by REANCHOR_LLM_DISABLED", baseUrl: null };
  if (provider !== "gemini" && provider !== "openai-compatible") return { provider, model, configured: false, reason: `Unknown provider ${provider}`, baseUrl: null };
  if (!model) return { provider, model, configured: false, reason: "REANCHOR_MODEL is not set", baseUrl: null };
  if (provider === "gemini") {
    const has = !!process.env.GEMINI_API_KEY;
    return { provider, model, configured: has, reason: has ? null : "GEMINI_API_KEY is not set on the server", baseUrl: GEMINI_BASE };
  }
  const baseUrl = (process.env.REANCHOR_OPENAI_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) return { provider, model, configured: false, reason: "REANCHOR_OPENAI_BASE_URL is not set", baseUrl: null };
  const has = !!process.env.REANCHOR_OPENAI_API_KEY;
  return { provider, model, configured: has, reason: has ? null : "REANCHOR_OPENAI_API_KEY is not set", baseUrl };
}

export type Verification = { status: "VERIFIED" | "INVALID" | "UNVERIFIED"; detail: string; checkedAt: string };

let verification: { at: number; key: string; v: Verification } | null = null;
const VERIFY_TTL_MS = 60 * 60_000;

const geminiHeaders = () => ({ "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" });

/** Verify the configured model against the provider's models endpoint. Cached for an hour. */
export async function verifyModel(force = false): Promise<Verification> {
  const cfg = providerConfig();
  const key = `${cfg.provider}:${cfg.baseUrl}:${cfg.model}`;
  if (!force && verification && verification.key === key && Date.now() - verification.at < VERIFY_TTL_MS) return verification.v;
  const checkedAt = new Date().toISOString();
  let v: Verification;
  if (!cfg.configured) v = { status: "UNVERIFIED", detail: cfg.reason ?? "Not configured", checkedAt };
  else if (cfg.provider === "gemini") {
    try {
      const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}`, { headers: geminiHeaders(), signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) v = { status: "INVALID", detail: `Gemini models endpoint does not list ${cfg.model}`, checkedAt };
      else if (!res.ok) v = { status: "UNVERIFIED", detail: `Gemini models endpoint returned HTTP ${res.status}`, checkedAt };
      else {
        const body = z.object({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() }).safeParse(await res.json());
        if (!body.success) v = { status: "UNVERIFIED", detail: "Unexpected Gemini model response", checkedAt };
        else if (!(body.data.supportedGenerationMethods ?? []).includes("generateContent")) v = { status: "INVALID", detail: `${cfg.model} does not support generateContent`, checkedAt };
        else v = { status: "VERIFIED", detail: `Gemini models endpoint returned ${body.data.name}`, checkedAt };
      }
    } catch {
      v = { status: "UNVERIFIED", detail: "Gemini models endpoint unreachable", checkedAt };
    }
  } else {
    try {
      const res = await fetch(`${cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${process.env.REANCHOR_OPENAI_API_KEY}` }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) v = { status: "UNVERIFIED", detail: `GET /models returned HTTP ${res.status}`, checkedAt };
      else {
        const body = z.object({ data: z.array(z.object({ id: z.string() })) }).safeParse(await res.json());
        if (!body.success) v = { status: "UNVERIFIED", detail: "Unexpected /models response shape", checkedAt };
        else v = body.data.data.some((d) => d.id === cfg.model) ? { status: "VERIFIED", detail: `/models lists ${cfg.model}`, checkedAt } : { status: "INVALID", detail: `/models does not list ${cfg.model}`, checkedAt };
      }
    } catch {
      v = { status: "UNVERIFIED", detail: "Provider /models unreachable", checkedAt };
    }
  }
  // Cache only definitive answers; UNVERIFIED (missing credential, network or server error) is retried next time.
  if (v.status !== "UNVERIFIED") verification = { at: Date.now(), key, v };
  return v;
}

export type StructuredResult<T> = { ok: true; data: T; model: string } | { ok: false; error: string; rateLimited?: boolean };

/** JSON Schema for the provider: drop the $schema marker some APIs reject. */
function jsonSchemaFor(schema: z.ZodTypeAny): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

const GeminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  modelVersion: z.string().optional(),
});

/** One structured-output call through the configured provider. The caller validates the result again. */
export async function structuredCall<S extends z.ZodTypeAny>(schema: S, system: string, user: string, maxTokens: number): Promise<StructuredResult<z.infer<S>>> {
  const cfg = providerConfig();
  if (!cfg.configured) return { ok: false, error: cfg.reason ?? "Model not configured" };
  const v = await verifyModel();
  if (v.status !== "VERIFIED") return { ok: false, error: `Model not verified: ${v.detail}` };
  try {
    if (cfg.provider === "gemini") {
      const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: "POST",
        headers: geminiHeaders(),
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: jsonSchemaFor(schema), maxOutputTokens: maxTokens, temperature: 0 },
        }),
      });
      if (res.status === 429) return { ok: false, error: "Model rate limit reached (HTTP 429 RESOURCE_EXHAUSTED)", rateLimited: true };
      if (!res.ok) return { ok: false, error: `Model API error ${res.status}` };
      const body = GeminiResponse.safeParse(await res.json());
      if (!body.success) return { ok: false, error: "Unexpected Gemini response" };
      if (body.data.promptFeedback?.blockReason) return { ok: false, error: `The model blocked this request (${body.data.promptFeedback.blockReason})` };
      const cand = body.data.candidates?.[0];
      if (!cand || (cand.finishReason && cand.finishReason !== "STOP")) return { ok: false, error: `Model did not finish (${cand?.finishReason ?? "no candidate"})` };
      const text = (cand.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
      const parsed = schema.safeParse(JSON.parse(text));
      return parsed.success ? { ok: true, data: parsed.data, model: body.data.modelVersion ?? cfg.model } : { ok: false, error: "Model output did not match the schema" };
    }
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.REANCHOR_OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema: jsonSchemaFor(schema) } },
      }),
    });
    if (res.status === 429) return { ok: false, error: "Model rate limit reached (HTTP 429)", rateLimited: true };
    if (!res.ok) return { ok: false, error: `Model API error ${res.status}` };
    const body = z.object({ model: z.string().optional(), choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1) }).safeParse(await res.json());
    if (!body.success || !body.data.choices[0].message.content) return { ok: false, error: "Unexpected chat completion response" };
    const parsed = schema.safeParse(JSON.parse(body.data.choices[0].message.content));
    return parsed.success ? { ok: true, data: parsed.data, model: body.data.model ?? cfg.model } : { ok: false, error: "Model output did not match the schema" };
  } catch (e) {
    return { ok: false, error: e instanceof SyntaxError ? "Model returned invalid JSON" : "Model request failed" };
  }
}
