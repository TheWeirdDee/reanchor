import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { Desk } from "@/components/desk/Desk";
import { Container, Eyebrow } from "@/components/site/primitives";
import { getPresentation } from "@/server/presentation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: "Desk", description: "State one weekend rToken intention, confirm it, and stress-test it against prior reopenings with modeled size, Bitget's weekend order rule and sources.", path: "/desk" });

export default function DeskPage() {
  const p = getPresentation();
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-12">
          <Eyebrow>Research desk</Eyebrow>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="display-md text-ink">Weekend decision desk</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
                State one weekend intention for a supported rToken. The desk compares it with prior reopenings, sizes it against weekend turnover and quotes Bitget&apos;s rule
                for unfilled weekend limits; the exact cancellation timing is not verified. It returns one action. The decision stays yours.
              </p>
            </div>
            {p.snapshot.pulledAt && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink-3">
                <dt>Historical snapshot</dt>
                <dd className="num text-ink-2">{p.snapshot.pulledAt.slice(0, 16).replace("T", " ")} UTC</dd>
                <dt>Supported</dt>
                <dd className="text-ink-2">{p.coverage.supported.map((s) => s.baseCoin).join(", ")}</dd>
              </dl>
            )}
          </div>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <Desk />
      </Container>
    </>
  );
}
