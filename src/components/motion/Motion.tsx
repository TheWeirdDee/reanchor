"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const NO_PREF = "(prefers-reduced-motion: no-preference)";

/**
 * Section reveal: children marked [data-reveal] fade and rise once when the block enters the viewport.
 * Elements are rendered visible on the server; animation only runs "from" a hidden state, and is skipped entirely
 * when the visitor prefers reduced motion. All tweens and ScrollTriggers are reverted on unmount by useGSAP.
 */
export function Reveal({ children, className, as: Tag = "div", stagger = 0.07, id, "aria-labelledby": labelledBy }: { children: ReactNode; className?: string; as?: ElementType; stagger?: number; id?: string; "aria-labelledby"?: string }) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_PREF, () => {
        const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", ref.current);
        if (!items.length) return;
        gsap.from(items, {
          opacity: 0,
          y: 18,
          duration: 0.6,
          ease: "power2.out",
          stagger,
          clearProps: "opacity,transform",
          scrollTrigger: { trigger: ref.current, start: "top 82%", once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={className} id={id} aria-labelledby={labelledBy}>
      {children}
    </Tag>
  );
}

/** Hero entrance: [data-hero] items in order, then the product preview, then technical lines drawn in. */
export function HeroMotion({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_PREF, () => {
        const q = gsap.utils.selector(ref);
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        if (q("[data-hero]").length) tl.from(q("[data-hero]"), { opacity: 0, y: 22, duration: 0.7, stagger: 0.08, clearProps: "opacity,transform" });
        if (q("[data-hero-preview]").length)
          tl.from(q("[data-hero-preview]"), { opacity: 0, y: 36, scale: 0.985, duration: 0.85, clearProps: "opacity,transform" }, "-=0.45");
        if (q("[data-draw]").length) tl.from(q("[data-draw]"), { strokeDashoffset: 1, duration: 1.1, ease: "power2.inOut", stagger: 0.12 }, "-=0.6");
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Timeline reveal: [data-segment] bars grow from the left and [data-marker] items follow, once. */
export function TimelineMotion({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_PREF, () => {
        const q = gsap.utils.selector(ref);
        const tl = gsap.timeline({ scrollTrigger: { trigger: ref.current, start: "top 78%", once: true } });
        if (q("[data-segment]").length)
          tl.from(q("[data-segment]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.7, stagger: 0.15, ease: "power2.out", clearProps: "transform" });
        if (q("[data-marker]").length)
          tl.from(q("[data-marker]"), { opacity: 0, y: 10, duration: 0.45, stagger: 0.08, ease: "power2.out", clearProps: "opacity,transform" }, "-=0.4");
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
