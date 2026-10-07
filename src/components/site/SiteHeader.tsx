"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { NAV } from "@/lib/site";
import { Wordmark } from "./Logo";

gsap.registerPlugin(useGSAP);

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const onDesk = pathname === "/desk";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  // Close on route change without stealing focus.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useGSAP(
    () => {
      if (!open || !panelRef.current) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(panelRef.current, { opacity: 0, y: -8, duration: 0.22, ease: "power2.out" });
        gsap.from(panelRef.current!.querySelectorAll("[data-menu-item]"), { opacity: 0, y: -6, duration: 0.2, stagger: 0.03, delay: 0.04, ease: "power2.out" });
      });
      return () => mm.revert();
    },
    { dependencies: [open], scope: panelRef },
  );

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200 ${
        scrolled || open ? "border-line bg-paper/90 shadow-[0_1px_0_rgb(23_44_49/0.03)] backdrop-blur-md" : "border-transparent bg-paper/70 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex h-[var(--header-h)] max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Reanchor home" className="rounded-lg">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`relative rounded-full px-3.5 py-2 text-[15px] transition-colors ${
                isActive(n.href) ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-surface/70 hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!onDesk && (
            <Link
              href="/desk"
              className="hidden items-center gap-1.5 rounded-full bg-brand-deep px-4 py-2.5 text-sm font-semibold text-mist transition-colors hover:bg-brand sm:inline-flex"
            >
              Open desk <ArrowUpRight aria-hidden className="h-4 w-4" />
            </Link>
          )}
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => (open ? close() : setOpen(true))}
          >
            {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div ref={panelRef} id="mobile-menu" className="border-t border-line bg-paper md:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-3">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-menu-item
                aria-current={isActive(n.href) ? "page" : undefined}
                onClick={() => close(false)}
                className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-base ${isActive(n.href) ? "bg-surface font-semibold text-ink" : "text-ink-2"}`}
              >
                {n.label}
                {isActive(n.href) && <span className="text-xs font-medium text-brand">Current</span>}
              </Link>
            ))}
            {!onDesk && (
              <Link
                href="/desk"
                data-menu-item
                onClick={() => close(false)}
                className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-deep text-base font-semibold text-mist"
              >
                Open desk <ArrowUpRight aria-hidden className="h-4 w-4" />
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
