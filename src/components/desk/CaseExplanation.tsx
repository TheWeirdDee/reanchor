"use client";

import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import type { ConfirmedIntention } from "@/domain/intent";
import { Notice, Section, Spinner } from "../ui";

const FALLBACK = "Case unavailable. Computed results remain available.";

type State = { kind: "loading" } | { kind: "ok"; sentences: string[]; model: string; cached: boolean } | { kind: "fallback"; reason: string };

/** Mounted with a key per request, so each request starts in the loading state. */
export function CaseExplanation({ request, modelAvailable }: { request: { intention: ConfirmedIntention; mode: "live" | "replay"; replayKey: string | null }; modelAvailable: boolean }) {
  const [state, setState] = useState<State>(modelAvailable ? { kind: "loading" } : { kind: "fallback", reason: "No model is configured on this server" });
  const reqKey = JSON.stringify(request);

  useEffect(() => {
    if (!modelAvailable) return;
    let cancelled = false;
    fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: reqKey })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setState({ kind: "ok", sentences: j.sentences, model: j.model, cached: j.cached });
        else setState({ kind: "fallback", reason: j.error ?? "Explanation unavailable" });
      })
      .catch(() => !cancelled && setState({ kind: "fallback", reason: "Explanation service unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [reqKey, modelAvailable]);

  return (
    <Section id="case" title="Case explanation" description="Written by a language model from the computed card only. It cannot change the action or the size.">
      {state.kind === "loading" && <Spinner label="Writing the explanation" />}
      {state.kind === "ok" && (
        <div>
          <p className="flex gap-2 text-sm leading-relaxed text-ink">
            <MessageSquareText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
            <span>{state.sentences.join(" ")}</span>
          </p>
          <p className="mt-2 text-xs text-ink-3">
            Model: {state.model}
            {state.cached ? " (cached)" : ""}. Every number was checked against the card before display.
          </p>
        </div>
      )}
      {state.kind === "fallback" && (
        <Notice tone="neutral" title={FALLBACK}>
          <span className="text-xs">{state.reason}.</span>
        </Notice>
      )}
    </Section>
  );
}
