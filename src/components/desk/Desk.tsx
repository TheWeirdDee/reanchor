"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, FileText, History, Radio, RotateCcw, Sparkles } from "lucide-react";
import { DEMO_CAP_USDT, INTENTS, INTENT_LABEL, validateIntention, type ConfirmedIntention, type Intent } from "@/domain/intent";
import { fmtEtOrNa } from "@/lib/format";
import { Badge, inputClass, Notice, Section, Spinner } from "../ui";
import { DecisionCard } from "./DecisionCard";
import { HistoryTable, RealizedOutcome } from "./HistoryTable";
import { ScenarioPanel } from "./ScenarioPanel";
import { CaseExplanation } from "./CaseExplanation";
import { ProvenanceList } from "./ProvenanceList";
import type { FieldSource, FormState, MetaResponse, ResearchResult } from "./types";

const EXAMPLE = "I hold $3,000 of rNVDA and want to check whether to trim";

function toNum(s: string): number | null {
  const t = s.replace(/[,\s$]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function Desk() {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<{ tone: "ok" | "warn" | "bad"; title: string; items: string[] } | null>(null);
  const [lastParse, setLastParse] = useState<{ said: string; fields: { label: string; value: string }[] } | null>(null);
  const [form, setForm] = useState<FormState>({ symbol: "", intent: "HOLD", holding: "", trade: "", limit: "" });
  const [sources, setSources] = useState<FieldSource>({});
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<"live" | "replay">("replay");
  const [replayKey, setReplayKey] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [lastRequest, setLastRequest] = useState<{ intention: ConfirmedIntention; mode: "live" | "replay"; replayKey: string | null } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const ids = { text: useId(), symbol: useId(), holding: useId(), trade: useId(), limit: useId(), replay: useId() };

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: MetaResponse) => {
        setMeta(m);
        const first = m.instruments?.[0];
        if (first) {
          setForm((f) => ({ ...f, symbol: f.symbol || first.symbol }));
          setReplayKey(first.replays.find((r) => r.primaryEligible)?.key ?? first.replays[0]?.key ?? "");
        }
        if (m.phase === "WEEKEND_BOOK") setMode("live");
      })
      .catch(() => setMetaError("The desk could not load its configuration. Reload the page."));
  }, []);

  const instrument = meta?.instruments?.find((i) => i.symbol === form.symbol) ?? null;
  const intention: ConfirmedIntention = useMemo(
    () => ({ symbol: form.symbol, intent: form.intent, holdingUsdt: toNum(form.holding), tradeUsdt: toNum(form.trade), limitPrice: toNum(form.limit) }),
    [form],
  );
  const fieldErrors = useMemo(() => {
    const syms = meta?.instruments?.map((i) => i.symbol) ?? [];
    const nanErr = (["holdingUsdt", "tradeUsdt", "limitPrice"] as const).filter((k) => Number.isNaN(intention[k])).map((k) => ({ field: k, message: "Enter a number" }));
    if (nanErr.length) return nanErr;
    return validateIntention(intention, syms);
  }, [intention, meta]);
  const errFor = (f: keyof ConfirmedIntention) => fieldErrors.find((e) => e.field === f)?.message;

  const update = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSources((s) => {
      const n = { ...s };
      for (const k of Object.keys(patch) as (keyof FormState)[]) delete n[k];
      return n;
    });
    setConfirmed(false);
  };

  async function parse() {
    setParsing(true);
    setParseNote(null);
    setLastParse(null);
    try {
      const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!j.ok) {
        setParseNote({ tone: "bad", title: "Could not read that sentence", items: [`${j.error}. Use the form below; nothing was filled in.`] });
        return;
      }
      const x = j.extraction as { symbol: string | null; intent: Intent | null; holdingUsdt: number | null; tradeUsdt: number | null; limitPrice: number | null; ambiguities: string[]; unsupportedRequest: string | null };
      const next: Partial<FormState> = {};
      const src: FieldSource = {};
      if (x.symbol) {
        next.symbol = x.symbol;
        src.symbol = "text";
      }
      if (x.intent) {
        next.intent = x.intent;
        src.intent = "text";
      }
      next.holding = x.holdingUsdt !== null ? String(x.holdingUsdt) : "";
      next.trade = x.tradeUsdt !== null ? String(x.tradeUsdt) : "";
      next.limit = x.limitPrice !== null ? String(x.limitPrice) : "";
      if (x.holdingUsdt !== null) src.holding = "text";
      if (x.tradeUsdt !== null) src.trade = "text";
      if (x.limitPrice !== null) src.limit = "text";
      setForm((f) => ({ ...f, ...next }));
      setSources(src);
      setConfirmed(false);
      const extracted = [
        { label: "Instrument", value: x.symbol ? (meta?.instruments?.find((i) => i.symbol === x.symbol)?.baseCoin ?? x.symbol) : "not identified" },
        { label: "Intent", value: x.intent ? INTENT_NAME[x.intent] : "not identified" },
        { label: "Holding", value: x.holdingUsdt !== null ? `${x.holdingUsdt.toLocaleString("en-US")} USDT` : "not stated" },
        { label: "Trade size", value: x.tradeUsdt !== null ? `${x.tradeUsdt.toLocaleString("en-US")} USDT` : "not stated" },
        { label: "Limit price", value: x.limitPrice !== null ? String(x.limitPrice) : "not stated" },
      ];
      setLastParse({ said: text.trim(), fields: extracted });
      const items = [...x.ambiguities];
      if (x.unsupportedRequest) items.unshift(x.unsupportedRequest);
      if (!x.symbol) items.push("Instrument not identified; choose one below");
      if (!x.intent) items.push("Intent not identified; choose Hold, Buy the dip or Sell into a pop");
      setParseNote(
        items.length
          ? { tone: "warn", title: "Some details are missing or ambiguous", items }
          : { tone: "ok", title: `Fields extracted by ${j.model}. Review and confirm below.`, items: [] },
      );
    } catch {
      setParseNote({ tone: "bad", title: "Parsing service unavailable", items: ["Use the structured form below."] });
    } finally {
      setParsing(false);
    }
  }

  const run = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setResult(null);
    const req = { intention, mode, replayKey: mode === "replay" ? replayKey : null };
    try {
      const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      const j = await r.json();
      if (!r.ok) {
        setRunError(j.error ?? "Research failed");
        return;
      }
      setResult(j as ResearchResult);
      setLastRequest(req);
      // Bring the start of the result (the decision) into view below the sticky header, then move focus there.
      // focus() alone only scrolls a tall element partly into view, which left the decision above the viewport.
      requestAnimationFrame(() => {
        const el = resultsRef.current;
        if (!el) return;
        el.scrollIntoView({ block: "start" });
        el.focus({ preventScroll: true });
      });
    } catch {
      setRunError("The research service did not respond. Check your connection or try a replay.");
    } finally {
      setRunning(false);
    }
  }, [intention, mode, replayKey]);

  if (metaError) return <Notice tone="bad" title="Desk unavailable">{metaError}</Notice>;
  if (!meta) return <Spinner label="Loading the desk" />;
  if (!meta.available || !meta.instruments?.length)
    return (
      <Notice tone="bad" title="No research data on this server">
        The verified dataset has not been generated. Run the ingest commands described in the README.
      </Notice>
    );

  const needsHolding = form.intent !== "BUY_DIP";
  const needsTrade = form.intent !== "HOLD";
  const canConfirm = fieldErrors.length === 0;
  const replays = instrument?.replays ?? [];
  const inWeekend = meta.phase === "WEEKEND_BOOK";
  const srcBadge = (k: keyof FormState) => (sources[k] ? <Badge tone="accent">From your text</Badge> : null);
  const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      <Notice tone={inWeekend ? "accent" : "neutral"} title={inWeekend ? "The weekend session is open" : "Outside the weekend session"}>
        {inWeekend && meta.session ? (
          <>Weekend quotes until the observed transition at {fmtEtOrNa(meta.session.transitionMs)} (inferred, not a verified cancellation time); regular US cash open {fmtEtOrNa(meta.session.reopenMs)}. Live checks use the latest closed 15-minute bar.</>
        ) : (
          <>
            Live weekend decisions run from the Friday 20:00 ET weekend start until the observed Sunday 20:00 ET transition to the overnight session.
            {meta.nextSession ? ` Next weekend session starts ${fmtEtOrNa(meta.nextSession.startMs)}.` : ""} Meanwhile, replay a completed weekend; replays are labeled historical.
          </>
        )}
      </Notice>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-5">
          <Section
            id="intent"
            step="Step 1 of 3"
            title="Describe your decision"
            description="Your own words, or skip to the form. A price you mention is your proposal, never market data."
            actions={
              meta.model.available ? (
                <Badge tone="ok">Model ready</Badge>
              ) : (
                <Badge tone="warn">Model unavailable</Badge>
              )
            }
          >
            <label htmlFor={ids.text} className="sr-only">
              Your intention
            </label>
            <textarea
              id={ids.text}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={EXAMPLE}
              className={`${inputClass} mt-0 resize-y border-line-strong`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={parse}
                disabled={!meta.model.available || parsing || text.trim().length < 3}
                className={`${btn} bg-brand-deep text-mist hover:bg-brand disabled:bg-line-strong disabled:text-ink-3`}
              >
                <Sparkles aria-hidden className="h-4 w-4" /> Extract fields
              </button>
              <button type="button" onClick={() => setText(EXAMPLE)} className="min-h-11 rounded-full px-3 text-sm text-ink-2 underline-offset-4 hover:underline">
                Use example sentence
              </button>
            </div>
            <AuthorityBoundary modelName={meta.model.available ? meta.model.model : null} />
            {parsing && (
              <div className="mt-2">
                <Spinner label="Reading your sentence" />
              </div>
            )}
            <p className="mt-2 text-xs text-ink-3">
              {meta.model.available
                ? `Model: ${meta.model.model}. It only fills the form; it never chooses the action.`
                : `Natural-language parsing is unavailable on this server (${meta.model.reason}). The structured form below works without it.`}
            </p>
            {lastParse && (
              <div className="mt-3 rounded-2xl border border-line bg-paper/60 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">You said</p>
                <p className="mt-1 text-[15px] italic text-ink">&ldquo;{lastParse.said}&rdquo;</p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Gemini extracted</p>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {lastParse.fields.map((f) => (
                    <div key={f.label} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 text-ink-3">{f.label}</dt>
                      <dd className={`min-w-0 truncate font-semibold ${f.value.startsWith("not ") ? "text-ink-3" : "text-ink"}`}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-ink-3">Check these in step 2. Nothing runs until you confirm.</p>
              </div>
            )}
            {parseNote && (
              <div className="mt-3">
                <Notice tone={parseNote.tone} title={parseNote.title}>
                  {parseNote.items.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {parseNote.items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}
                </Notice>
              </div>
            )}
          </Section>

          <Section id="confirm" step="Step 2 of 3" title="Confirm the structured intention" description="Edit any field. Research runs only on what you confirm here.">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canConfirm) setConfirmed(true);
              }}
              noValidate
              className="space-y-5"
            >
              <div>
                <label htmlFor={ids.symbol} className="flex items-center gap-2 text-sm font-medium text-ink">
                  Instrument {srcBadge("symbol")}
                </label>
                <select id={ids.symbol} value={form.symbol} onChange={(e) => update({ symbol: e.target.value })} className={`${inputClass} border-line-strong`}>
                  {meta.instruments.map((i) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.baseCoin} ({i.symbol}), underlying {i.underlying}
                    </option>
                  ))}
                </select>
                {meta.unsupported && Object.keys(meta.unsupported).length > 0 && (
                  <p className="mt-1.5 text-xs text-ink-3">
                    Not supported yet: {Object.keys(meta.unsupported).join(", ")}. Insufficient verified weekend history;{" "}
                    <a href="/method#coverage" className="text-brand underline underline-offset-2">
                      see coverage
                    </a>
                    .
                  </p>
                )}
              </div>

              <fieldset>
                <legend className="flex items-center gap-2 text-sm font-medium text-ink">Intent {srcBadge("intent")}</legend>
                <div className="mt-1.5 grid gap-2" role="radiogroup">
                  {INTENTS.map((i) => {
                    const on = form.intent === i;
                    return (
                      <label
                        key={i}
                        className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${on ? "border-brand bg-brand-soft" : "border-line-strong bg-surface hover:border-brand/50"}`}
                      >
                        <input type="radio" name="intent" value={i} checked={on} onChange={() => update({ intent: i })} className="sr-only" />
                        <span aria-hidden className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-brand-deep" : "border-line-strong"}`}>
                          {on && <span className="h-2 w-2 rounded-full bg-brand-deep" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{INTENT_NAME[i]}</span>
                          <span className="block text-xs text-ink-3">{INTENT_HINT[i]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-ink-3">{INTENT_LABEL[form.intent]}. No shorting, no trend-following entries.</p>
              </fieldset>

              {needsHolding && (
                <fieldset className="rounded-2xl border border-line bg-paper/60 p-4">
                  <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">Your position</legend>
                  <NumberField
                    id={ids.holding}
                    label="Existing holding value (USDT)"
                    value={form.holding}
                    onChange={(v) => update({ holding: v })}
                    error={errFor("holdingUsdt")}
                    badge={srcBadge("holding")}
                    hint={form.intent === "HOLD" ? "Trim modeling uses 25% of this value" : "You cannot sell more than this"}
                  />
                </fieldset>
              )}
              {needsTrade && (
                <fieldset className="space-y-4 rounded-2xl border border-line bg-paper/60 p-4">
                  <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">Proposed trade</legend>
                  <NumberField
                    id={ids.trade}
                    label={form.intent === "BUY_DIP" ? "Proposed buy size (USDT)" : "Proposed sale size (USDT)"}
                    value={form.trade}
                    onChange={(v) => update({ trade: v })}
                    error={errFor("tradeUsdt")}
                    badge={srcBadge("trade")}
                    hint={`Capped at ${DEMO_CAP_USDT.toLocaleString("en-US")} USDT in this research desk`}
                  />
                  <NumberField
                    id={ids.limit}
                    label="Proposed limit price (USDT per token)"
                    value={form.limit}
                    onChange={(v) => update({ limit: v })}
                    error={errFor("limitPrice")}
                    badge={srcBadge("limit")}
                    hint={instrument ? `Price precision ${instrument.pricePrecision} decimals; checked against the approximate band` : undefined}
                  />
                </fieldset>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!canConfirm} className={`${btn} bg-ink text-white hover:bg-ink-2 disabled:bg-line-strong disabled:text-ink-3`}>
                  <Check aria-hidden className="h-4 w-4" /> Confirm intention
                </button>
                {confirmed ? (
                  <Badge tone="ok">Confirmed</Badge>
                ) : (
                  <span className="text-xs text-ink-3">{canConfirm ? "Not yet confirmed" : `${fieldErrors.length} field${fieldErrors.length > 1 ? "s" : ""} need attention`}</span>
                )}
              </div>
            </form>
          </Section>

          <Section id="run" step="Step 3 of 3" title="Choose data and run" description="Live uses current Bitget data during the weekend session. Replay re-runs a completed weekend as of its Sunday 20:00 ET decision.">
            <fieldset>
              <legend className="sr-only">Data mode</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["live", "replay"] as const).map((m) => (
                  <label
                    key={m}
                    className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${mode === m ? "border-brand bg-brand-soft text-brand-deep" : "border-line-strong text-ink-2"}`}
                  >
                    <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                    {m === "live" ? <Radio aria-hidden className="h-4 w-4" /> : <History aria-hidden className="h-4 w-4" />}
                    {m === "live" ? "Live weekend" : "Replay a past weekend"}
                  </label>
                ))}
              </div>
            </fieldset>
            {mode === "replay" && (
              <div className="mt-4">
                <label htmlFor={ids.replay} className="text-sm font-medium text-ink">
                  Weekend to replay
                </label>
                <select id={ids.replay} value={replayKey} onChange={(e) => setReplayKey(e.target.value)} className={`${inputClass} border-line-strong`}>
                  {replays.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label} {r.primaryEligible ? "" : "(excluded from cohort)"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mode === "live" && !inWeekend && <p className="mt-3 text-sm text-ink-3">Outside the weekend session a live run returns session information and STAND DOWN.</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={run}
                disabled={!confirmed || running || (mode === "replay" && !replayKey)}
                className={`${btn} w-full bg-brand px-6 text-white hover:bg-brand-deep disabled:bg-line-strong disabled:text-ink-3`}
              >
                <FileText aria-hidden className="h-4 w-4" /> Stress-test my decision
              </button>
              {!confirmed && <span className="text-xs text-ink-3">Confirm the intention first.</span>}
              {running && <Spinner label="Computing from source data" />}
            </div>
            {runError && (
              <div className="mt-4">
                <Notice tone="bad" title="Research could not be completed">
                  {runError}
                </Notice>
              </div>
            )}
          </Section>
        </div>

        <div ref={resultsRef} tabIndex={-1} aria-live="polite" className="min-w-0 space-y-5 outline-none">
          {!result && !running && <EmptyResult />}
          {running && !result && (
            <div className="rounded-[22px] border border-line bg-surface p-8">
              <Spinner label="Computing from source data" />
            </div>
          )}
          {result && lastRequest && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-ink">Result</h2>
                <button type="button" onClick={run} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-brand hover:bg-brand-soft">
                  <RotateCcw aria-hidden className="h-4 w-4" /> Re-run
                </button>
              </div>
              <DecisionCard card={result.card} />
              <CaseExplanation key={`${JSON.stringify(lastRequest)}-${result.card.t}`} request={lastRequest} modelAvailable={meta.model.available} />
              <HistoryTable card={result.card} />
              <RealizedOutcome card={result.card} />
              <ScenarioPanel key={`${result.card.t}-${result.card.intention.intent}`} card={result.card} defaultBasis={result.basis} />
              <ProvenanceList provenance={result.provenance} card={result.card} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const INTENT_NAME: Record<Intent, string> = { HOLD: "Hold", BUY_DIP: "Buy the dip", SELL_POP: "Sell into a pop" };
const INTENT_HINT: Record<Intent, string> = {
  HOLD: "I hold it and want to know whether to trim before the reopening",
  BUY_DIP: "I want to buy after a weekend fall",
  SELL_POP: "I want to sell some of what I hold after a weekend rise",
};

/** Who does what: the model handles language; deterministic rules decide what the evidence permits. */
function AuthorityBoundary({ modelName }: { modelName: string | null }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Who decides">
      <div className="rounded-xl border border-line bg-paper/60 px-3 py-2.5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">AI {modelName ? `(${modelName})` : "(unavailable)"}</p>
        <p className="mt-1 text-sm font-semibold text-ink">Understands your sentence</p>
        <p className="mt-1 text-xs leading-snug text-ink-3">Extracts instrument, intent, holding, trade size and limit price. Explains the result afterwards.</p>
      </div>
      <div className="rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-brand-deep">Deterministic rules</p>
        <p className="mt-1 text-sm font-semibold text-ink">Decide what the evidence permits</p>
        <p className="mt-1 text-xs leading-snug text-ink-3">Select prior weekends, measure moves, apply thresholds, choose the action, size the trade.</p>
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="texture-grid-light relative overflow-hidden rounded-[22px] border border-dashed border-line-strong bg-surface/70 px-6 py-12 sm:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">Result</p>
      <p className="mt-3 max-w-md text-lg font-semibold tracking-tight text-ink">Your decision card appears here.</p>
      <ol className="mt-4 max-w-md space-y-2 text-sm text-ink-2">
        <li>One action: TRIM, FADE or STAND DOWN, with the reason.</li>
        <li>Prior reopenings it was tested against, including excluded weekends.</li>
        <li>Modeled size, Bitget&apos;s weekend order rule, scenario and sources.</li>
      </ol>
      <p className="mt-4 max-w-md text-xs text-ink-3">STAND DOWN is a full answer: it tells you the evidence does not support acting, and why.</p>
    </div>
  );
}

function NumberField({ id, label, value, onChange, error, hint, badge }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; badge?: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-ink">
        {label} {badge}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={`${id}-hint`}
        className={`num ${inputClass} ${error ? "border-bad" : "border-line-strong"}`}
      />
      <p id={`${id}-hint`} className={`mt-1.5 text-xs ${error ? "text-bad" : "text-ink-3"}`}>
        {error ?? hint}
      </p>
    </div>
  );
}
