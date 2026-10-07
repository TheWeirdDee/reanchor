import { afterEach, describe, expect, it, vi } from "vitest";
import { providerConfig, verifyModel } from "../../src/server/llm-provider";

const KEYS = ["REANCHOR_MODEL_PROVIDER", "REANCHOR_MODEL", "REANCHOR_OPENAI_BASE_URL", "REANCHOR_OPENAI_API_KEY", "GEMINI_API_KEY", "REANCHOR_LLM_DISABLED"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function clear() {
  for (const k of KEYS) delete process.env[k];
}

describe("provider configuration", () => {
  it("defaults to gemini and reports a missing credential", () => {
    clear();
    const c = providerConfig();
    expect(c.provider).toBe("gemini");
    expect(c.model).toBe("gemini-3.5-flash-lite");
    expect(c.configured).toBe(false);
    expect(c.reason).toContain("GEMINI_API_KEY");
  });

  it("requires a base URL, key and model for an openai-compatible provider", () => {
    clear();
    process.env.REANCHOR_MODEL_PROVIDER = "openai-compatible";
    expect(providerConfig().reason).toContain("REANCHOR_MODEL");
    process.env.REANCHOR_MODEL = "qwen-plus";
    expect(providerConfig().reason).toContain("REANCHOR_OPENAI_BASE_URL");
    process.env.REANCHOR_OPENAI_BASE_URL = "https://example.invalid/v1/";
    expect(providerConfig().reason).toContain("REANCHOR_OPENAI_API_KEY");
    process.env.REANCHOR_OPENAI_API_KEY = "test-key";
    expect(providerConfig()).toMatchObject({ configured: true, baseUrl: "https://example.invalid/v1" });
  });

  it("rejects unknown providers", () => {
    clear();
    process.env.REANCHOR_MODEL_PROVIDER = "somethingelse";
    expect(providerConfig().configured).toBe(false);
  });
});

describe("model verification against the provider's models endpoint", () => {
  function configureOpenAi(model: string) {
    clear();
    process.env.REANCHOR_MODEL_PROVIDER = "openai-compatible";
    process.env.REANCHOR_MODEL = model;
    process.env.REANCHOR_OPENAI_BASE_URL = "https://example.invalid/v1";
    process.env.REANCHOR_OPENAI_API_KEY = "test-key";
  }

  it("verifies a listed model and rejects an unlisted one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "qwen-plus" }, { id: "qwen-max" }] }), { status: 200 })));
    configureOpenAi("qwen-plus");
    expect((await verifyModel(true)).status).toBe("VERIFIED");
    configureOpenAi("not-a-model");
    expect((await verifyModel(true)).status).toBe("INVALID");
  });

  it("reports UNVERIFIED (not VERIFIED) when the endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    configureOpenAi("qwen-plus");
    expect((await verifyModel(true)).status).toBe("UNVERIFIED");
  });

  it("is UNVERIFIED without a credential", async () => {
    clear();
    expect((await verifyModel(true)).status).toBe("UNVERIFIED");
  });
});

describe("gemini rate limits use the existing fallbacks", () => {
  function configureGemini() {
    clear();
    process.env.REANCHOR_MODEL_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
  }

  it("maps HTTP 429 to a rate-limit error without retrying", async () => {
    configureGemini();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).endsWith(":generateContent")) return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
        return new Response(JSON.stringify({ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }), { status: 200 });
      }),
    );
    const { extractIntent } = await import("../../src/server/model");
    const r = await extractIntent("I hold 3000 of rNVDA", ["rNVDA"]);
    expect(r).toEqual({ ok: false, error: "Model rate limit reached (HTTP 429 RESOURCE_EXHAUSTED)" });
    expect(calls.filter((c) => c.endsWith(":generateContent"))).toHaveLength(1);
  });

  it("parses a structured Gemini response and ignores thought parts", async () => {
    configureGemini();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith(":generateContent"))
          return new Response(
            JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking", thought: true }, { text: '{"answer": 7}' }] } }], modelVersion: "gemini-3.5-flash-lite" }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }), { status: 200 });
      }),
    );
    const { structuredCall, verifyModel } = await import("../../src/server/llm-provider");
    await verifyModel(true);
    const { z } = await import("zod");
    expect(await structuredCall(z.object({ answer: z.number() }), "s", "u", 50)).toEqual({ ok: true, data: { answer: 7 }, model: "gemini-3.5-flash-lite" });
  });

  it("rejects a model that is not listed by the Gemini models endpoint", async () => {
    configureGemini();
    process.env.REANCHOR_MODEL = "gemini-made-up";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 })));
    expect((await verifyModel(true)).status).toBe("INVALID");
  });
});
