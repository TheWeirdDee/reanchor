import type { Card } from "@/domain/decision";
import { fmtEtOrNa } from "@/lib/format";
import { Badge, Section } from "../ui";
import type { Provenance } from "./types";

function StatusBadge({ status }: { status: Provenance["status"] }) {
  return <Badge tone={status === "OK" ? "ok" : status === "FAILED" ? "bad" : "neutral"}>{status === "SNAPSHOT" ? "Snapshot" : status === "OK" ? "Live" : "Failed"}</Badge>;
}

export function ProvenanceList({ provenance, card }: { provenance: Provenance[]; card: Card }) {
  return (
    <Section id="sources" title="Sources and timestamps" description={`Engine ${card.engine}. Decision time ${fmtEtOrNa(card.t)}. Data retrieved ${card.dataRetrievedAt}.`}>
      <ul className="space-y-2 md:hidden" aria-label="Sources">
        {provenance.map((p) => (
          <li key={`${p.label}-${p.source}`} className="rounded-xl border border-line bg-paper/60 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{p.label}</p>
              <StatusBadge status={p.status} />
            </div>
            <p className="mt-1 text-xs text-ink-3">Retrieved (UTC): {p.retrievedAt ?? "n/a"}</p>
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-brand">
                Source and detail <span aria-hidden className="chev">+</span>
              </summary>
              <p className="mt-1 break-words text-xs text-ink-2">{p.source}</p>
              <p className="mt-1 break-words text-xs text-ink-2">{p.detail}</p>
            </details>
          </li>
        ))}
      </ul>
      <div className="table-wrap hidden md:block" role="region" aria-label="Sources table" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Status</th>
              <th scope="col">Source</th>
              <th scope="col">Retrieved (UTC)</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {provenance.map((p) => (
              <tr key={`${p.label}-${p.source}`}>
                <td>{p.label}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td className="wrap">{p.source}</td>
                <td>{p.retrievedAt ?? "n/a"}</td>
                <td className="wrap">{p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Snapshot rows come from saved receipts in the repository data directory. A failed live source is shown as failed; it is never replaced with a token or
        perpetual price.
      </p>
    </Section>
  );
}
